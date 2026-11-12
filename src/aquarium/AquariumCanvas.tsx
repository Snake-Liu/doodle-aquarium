import { useEffect, useRef } from 'react';
import {
  Application,
  Container,
  Graphics,
  MeshPlane,
  Text,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';
import { getSpeciesSpec } from '../domain/species';
import { soundEngine } from '../audio/soundEffects';
import { loadHtmlImage } from '../scanner/canvasBridge';
import type { MarineCreature } from './collectionStore';
import { deformSpeciesMesh } from './meshDeformer';
import {
  createAquariumSimulation,
  dropFeed,
  stepAquariumSimulation,
  syncSimulationCreatures,
  tapCreature,
} from './simulation';

interface AquariumCanvasProps {
  readonly creatures: readonly MarineCreature[];
}

interface CreatureVisual {
  readonly id: string;
  readonly isDemo: boolean;
  readonly container: Container;
  readonly plane: MeshPlane;
  readonly texWidth: number;
  readonly texHeight: number;
  readonly baseScale: number;
  readonly nameTag: Text;
  tagTimer: number;
}

interface BubbleParticle {
  readonly gfx: Graphics;
  x: number;
  y: number;
  vy: number;
  wobblePhase: number;
  life: number;
  maxLife: number;
}

interface RippleFx {
  readonly gfx: Graphics;
  radius: number;
  alpha: number;
}

interface SeaweedItem {
  readonly gfx: Graphics;
  baseX: number;
  baseY: number;
  height: number;
  hue: number;
  phase: number;
  exciteTimer: number;
}

export function AquariumCanvas({ creatures }: AquariumCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const creaturesRef = useRef<readonly MarineCreature[]>(creatures);
  creaturesRef.current = creatures;
  const syncTriggerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    syncTriggerRef.current?.();
  }, [creatures]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    const app = new Application();
    const textureCache = new Map<string, Texture>();
    const loadingUrls = new Set<string>();
    const visuals = new Map<string, CreatureVisual>();
    const bubbles: BubbleParticle[] = [];
    const ripples: RippleFx[] = [];
    const seaweeds: SeaweedItem[] = [];
    const caustics: Graphics[] = [];

    let starfishGfx: Graphics | null = null;
    let starfishSpin = 0;
    let shellContainer: Container | null = null;
    let shellTopGfx: Graphics | null = null;
    let shellPearlGfx: Graphics | null = null;
    let shellOpenTimer = 0;

    const sim = createAquariumSimulation(host.clientWidth || 390, host.clientHeight || 700);

    const backdropLayer = new Container();
    const decorLayer = new Container();
    const feedLayer = new Container();
    const creatureLayer = new Container();
    const fxLayer = new Container();

    const waterBackdropGfx = new Graphics();
    const feedGfx = new Graphics();
    feedLayer.addChild(feedGfx);

    function spawnBubble(
      x: number,
      y: number,
      radius = 4 + Math.random() * 5,
      speed = 42,
      tintColor = 0xe0f2fe,
    ): void {
      if (bubbles.length > 72) return;
      const g = new Graphics();
      if (tintColor === 0x1e293b) {
        // Ink cloud puff for tapped squid
        g.circle(0, 0, radius).fill({ color: 0x0f172a, alpha: 0.45 });
      } else {
        g.circle(0, 0, radius).stroke({ width: 1.5, color: tintColor, alpha: 0.78 });
        g.circle(-radius * 0.3, -radius * 0.3, Math.max(1.2, radius * 0.28)).fill({
          color: 0xffffff,
          alpha: 0.65,
        });
      }
      g.position.set(x, y);
      fxLayer.addChild(g);
      bubbles.push({
        gfx: g,
        x,
        y,
        vy: speed + Math.random() * 24,
        wobblePhase: Math.random() * Math.PI * 2,
        life: 0,
        maxLife: 2.5 + Math.random() * 3.5,
      });
    }

    function spawnRipple(x: number, y: number): void {
      const g = new Graphics();
      g.position.set(x, y);
      fxLayer.addChild(g);
      ripples.push({ gfx: g, radius: 6, alpha: 0.9 });
    }

    function drawStarfish(g: Graphics, radius: number, color: number): void {
      g.clear();
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? radius : radius * 0.44;
        pts.push(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      g.poly(pts).fill(color).stroke({ width: 2, color: 0x9a3412, alpha: 0.6 });
      g.circle(-4, -3, 2).fill(0x1e293b);
      g.circle(4, -3, 2).fill(0x1e293b);
    }

    function drawCoral(g: Graphics, scale: number): void {
      g.clear();
      const branches = [
        [0, 0, -14, -46],
        [-8, -22, -26, -42],
        [4, -18, 22, -48],
        [12, -32, 28, -32],
      ] as const;
      for (const [x0, y0, x1, y1] of branches) {
        g.moveTo(x0 * scale, y0 * scale)
          .lineTo(x1 * scale, y1 * scale)
          .stroke({ width: 10 * scale, color: 0xfb7185, cap: 'round' });
      }
    }

    function rebuildDecor(w: number, h: number): void {
      waterBackdropGfx.clear();
      caustics.forEach((c) => c.destroy());
      caustics.length = 0;
      seaweeds.forEach((s) => s.gfx.destroy());
      seaweeds.length = 0;
      decorLayer.removeChildren();

      // Water backdrop gradient layers
      const steps = 6;
      const colors = [0x0ea5e9, 0x0284c7, 0x0369a1, 0x075985, 0x0c4a6e, 0x082f49];
      for (let i = 0; i < steps; i++) {
        waterBackdropGfx
          .rect(0, (h * i) / steps, w, h / steps + 2)
          .fill({ color: colors[i]!, alpha: 0.92 });
      }

      // Shimmering caustic light beams from surface
      for (let i = 0; i < 4; i++) {
        const beam = new Graphics();
        const bx = w * (0.12 + i * 0.24);
        beam
          .poly([bx, 0, bx + 64, 0, bx + 150, h * 0.85, bx - 25, h * 0.85])
          .fill({ color: 0xe0f2fe, alpha: 0.065 });
        backdropLayer.addChild(beam);
        caustics.push(beam);
      }

      // Sandy seabed
      const sandY = h * 0.86;
      waterBackdropGfx
        .moveTo(0, sandY + 12)
        .bezierCurveTo(w * 0.25, sandY - 14, w * 0.65, sandY + 16, w, sandY - 6)
        .lineTo(w, h)
        .lineTo(0, h)
        .closePath()
        .fill(0xd6b06b);

      waterBackdropGfx
        .moveTo(0, sandY + 26)
        .bezierCurveTo(w * 0.35, sandY + 10, w * 0.72, sandY + 32, w, sandY + 18)
        .lineTo(w, h)
        .lineTo(0, h)
        .closePath()
        .fill(0xe4c588);

      // Subtle pebbles
      for (let i = 0; i < 7; i++) {
        const px = w * (0.08 + i * 0.14);
        const py = sandY + 24 + (i % 3) * 10;
        waterBackdropGfx.ellipse(px, py, 10 + (i % 3) * 4, 5).fill({ color: 0xb08b4f, alpha: 0.55 });
      }

      // Coral clusters
      for (const cx of [w * 0.14, w * 0.86]) {
        const coral = new Graphics();
        drawCoral(coral, Math.max(0.75, Math.min(1.15, w / 600)));
        coral.position.set(cx, sandY + 18);
        decorLayer.addChild(coral);
      }

      // Swaying Seaweeds (clickable)
      const weedPositions = [0.06, 0.1, 0.28, 0.72, 0.91, 0.95];
      for (let i = 0; i < weedPositions.length; i++) {
        const g = new Graphics();
        g.eventMode = 'static';
        g.cursor = 'pointer';
        const item: SeaweedItem = {
          gfx: g,
          baseX: w * weedPositions[i]!,
          baseY: sandY + 20,
          height: (68 + (i % 3) * 28) * Math.max(0.75, Math.min(1.2, h / 650)),
          hue: i % 2 === 0 ? 0x22c55e : 0x10b981,
          phase: i * 1.1,
          exciteTimer: 0,
        };
        g.on('pointertap', (e: FederatedPointerEvent) => {
          e.stopPropagation();
          item.exciteTimer = 1.4;
          soundEngine.playBubble(560);
          for (let b = 0; b < 4; b++) {
            spawnBubble(item.baseX + (Math.random() - 0.5) * 18, item.baseY - item.height * 0.6);
          }
        });
        decorLayer.addChild(g);
        seaweeds.push(item);
      }

      // Interactive Starfish
      const star = new Graphics();
      drawStarfish(star, 22, 0xf97316);
      star.position.set(w * 0.38, sandY + 30);
      star.eventMode = 'static';
      star.cursor = 'pointer';
      star.on('pointertap', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        starfishSpin = Math.PI * 2;
        soundEngine.playBubble(660);
        spawnBubble(star.x, star.y - 14, 6);
      });
      decorLayer.addChild(star);
      starfishGfx = star;

      // Interactive Clamshell with Pearl
      const shell = new Container();
      shell.position.set(w * 0.64, sandY + 28);
      shell.eventMode = 'static';
      shell.cursor = 'pointer';
      const baseShell = new Graphics();
      baseShell.ellipse(0, 4, 24, 10).fill(0xfde68a).stroke({ width: 2, color: 0xb45309, alpha: 0.5 });
      const pearl = new Graphics();
      pearl.circle(0, -3, 6).fill(0xf8fafc).stroke({ width: 1.5, color: 0xbae6fd });
      pearl.visible = false;
      const topShell = new Graphics();
      topShell
        .arc(0, 2, 22, Math.PI, 0)
        .closePath()
        .fill(0xfbbf24)
        .stroke({ width: 2, color: 0xb45309, alpha: 0.6 });
      shell.addChild(baseShell, pearl, topShell);
      shell.on('pointertap', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        shellOpenTimer = 2.0;
        soundEngine.playBubble(780);
        for (let b = 0; b < 5; b++) {
          spawnBubble(shell.x + (Math.random() - 0.5) * 16, shell.y - 12, 4 + b);
        }
      });
      decorLayer.addChild(shell);
      shellContainer = shell;
      shellTopGfx = topShell;
      shellPearlGfx = pearl;
    }

    async function ensureCreatureVisual(creature: MarineCreature): Promise<void> {
      if (destroyed || visuals.has(creature.id)) return;
      let tex = textureCache.get(creature.textureUrl);
      if (!tex) {
        if (loadingUrls.has(creature.textureUrl)) return;
        loadingUrls.add(creature.textureUrl);
        try {
          const img = await loadHtmlImage(creature.textureUrl);
          if (destroyed) return;
          tex = Texture.from(img);
          textureCache.set(creature.textureUrl, tex);
        } catch {
          loadingUrls.delete(creature.textureUrl);
          return;
        }
        loadingUrls.delete(creature.textureUrl);
      }

      if (destroyed || visuals.has(creature.id)) return;
      const stillActive = creaturesRef.current.some((c) => c.id === creature.id);
      if (!stillActive) return;

      const spec = getSpeciesSpec(creature.speciesId);
      const texW = tex.width;
      const texH = tex.height;
      const responsiveFactor = Math.max(0.68, Math.min(1.05, Math.min(sim.width, sim.height) / 560));
      const baseScale = (spec.baseDisplayWidth * responsiveFactor) / texW;

      const container = new Container();
      const plane = new MeshPlane({
        texture: tex,
        verticesX: 14,
        verticesY: 10,
      });
      plane.position.set(-texW / 2, -texH / 2);

      const nameTag = new Text({
        text: creature.isDemo ? `${creature.name} (範例)` : creature.name,
        style: {
          fontFamily: '"Noto Sans TC", sans-serif',
          fontSize: 13,
          fontWeight: '700',
          fill: 0xf8fafc,
          stroke: { color: 0x082f49, width: 3 },
        },
      });
      nameTag.anchor.set(0.5, 1);
      nameTag.position.set(0, -(texH * baseScale) / 2 - 8);
      nameTag.visible = creature.isDemo;
      nameTag.alpha = creature.isDemo ? 0.82 : 0;

      container.addChild(plane);
      container.addChild(nameTag);
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.on('pointertap', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        const tapped = tapCreature(sim, creature.id);
        soundEngine.playCreatureTap();
        const vis = visuals.get(creature.id);
        if (vis) {
          vis.tagTimer = 2.4;
          const cx = vis.container.x;
          const cy = vis.container.y;
          if (tapped?.reactionKind === 'ink-dash') {
            for (let i = 0; i < 6; i++) {
              spawnBubble(cx + (Math.random() - 0.5) * 34, cy + 8, 6 + Math.random() * 5, 26, 0x1e293b);
            }
            for (let i = 0; i < 3; i++) {
              spawnBubble(cx + (Math.random() - 0.5) * 26, cy - 12, 4, 52);
            }
          } else if (tapped?.reactionKind === 'leap' || tapped?.reactionKind === 'glow') {
            spawnRipple(cx, cy);
            const tint = tapped.reactionKind === 'glow' ? 0x7dd3fc : 0xe0f2fe;
            for (let i = 0; i < 6; i++) {
              spawnBubble(cx + (Math.random() - 0.5) * 34, cy - 10, 5 + Math.random() * 3, 56, tint);
            }
          } else {
            for (let i = 0; i < 5; i++) {
              spawnBubble(cx + (Math.random() - 0.5) * 30, cy - 10, 4.5);
            }
          }
        }
      });

      const actor = sim.actors.find((a) => a.id === creature.id);
      if (actor && !creature.isDemo && actor.entryTimer > 0) {
        spawnRipple(actor.x, actor.y);
        for (let i = 0; i < 8; i++) {
          spawnBubble(actor.x + (Math.random() - 0.5) * 44, actor.y + (Math.random() - 0.5) * 18, 4 + Math.random() * 4, 52);
        }
      }

      creatureLayer.addChild(container);
      visuals.set(creature.id, {
        id: creature.id,
        isDemo: creature.isDemo,
        container,
        plane,
        texWidth: texW,
        texHeight: texH,
        baseScale,
        nameTag,
        tagTimer: creature.isDemo ? 0 : 2.6,
      });
    }

    function syncVisualsWithStore(): void {
      const active = creaturesRef.current;
      syncSimulationCreatures(sim, active);
      const activeIds = new Set(active.map((c) => c.id));

      for (const [id, vis] of visuals.entries()) {
        if (!activeIds.has(id)) {
          creatureLayer.removeChild(vis.container);
          vis.container.destroy({ children: true });
          visuals.delete(id);
        }
      }

      for (const creature of active) {
        if (!visuals.has(creature.id)) {
          void ensureCreatureVisual(creature);
        }
      }
    }

    syncTriggerRef.current = syncVisualsWithStore;

    let resizeObserver: ResizeObserver | null = null;
    let ambientBubbleTimer = 0;

    void app
      .init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        backdropLayer.addChild(waterBackdropGfx);
        app.stage.addChild(backdropLayer, decorLayer, feedLayer, creatureLayer, fxLayer);

        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.on('pointertap', (e: FederatedPointerEvent) => {
          const p = e.global;
          dropFeed(sim, p.x, p.y, 3);
          spawnRipple(p.x, p.y);
          soundEngine.playFeedDrop();
        });

        sim.width = app.screen.width;
        sim.height = app.screen.height;
        rebuildDecor(sim.width, sim.height);
        syncVisualsWithStore();

        resizeObserver = new ResizeObserver(() => {
          if (destroyed) return;
          app.resize();
          sim.width = app.screen.width;
          sim.height = app.screen.height;
          app.stage.hitArea = app.screen;
          rebuildDecor(sim.width, sim.height);
        });
        resizeObserver.observe(host);

        app.ticker.add((ticker) => {
          if (destroyed) return;
          const dt = ticker.deltaMS / 1000;
          const elapsed = ticker.lastTime / 1000;

          const events = stepAquariumSimulation(sim, dt);
          for (const pos of events.eatenPositions) {
            spawnBubble(pos.x, pos.y, 5, 55);
            soundEngine.playBubble(690);
          }

          // Animate caustics
          for (let i = 0; i < caustics.length; i++) {
            const beam = caustics[i]!;
            beam.alpha = 0.6 + 0.4 * Math.sin(elapsed * 0.9 + i * 1.4);
          }

          // Animate seaweeds
          for (const sw of seaweeds) {
            sw.exciteTimer = Math.max(0, sw.exciteTimer - dt);
            const speed = sw.exciteTimer > 0 ? 5.5 : 1.7;
            const amp = sw.exciteTimer > 0 ? 22 : 11;
            const g = sw.gfx;
            g.clear();
            const segs = 6;
            const segH = sw.height / segs;
            let px = sw.baseX;
            let py = sw.baseY;
            g.moveTo(px, py);
            for (let s = 1; s <= segs; s++) {
              const t = s / segs;
              const sway = Math.sin(elapsed * speed + sw.phase + t * 2.2) * amp * t;
              px = sw.baseX + sway;
              py = sw.baseY - s * segH;
              g.lineTo(px, py);
            }
            g.stroke({ width: 11, color: sw.hue, cap: 'round', join: 'round' });
          }

          // Animate starfish & clamshell
          if (starfishGfx && starfishSpin > 0) {
            const stepSpin = Math.min(starfishSpin, dt * 11);
            starfishGfx.rotation += stepSpin;
            starfishSpin -= stepSpin;
          }
          if (shellContainer && shellTopGfx && shellPearlGfx) {
            shellOpenTimer = Math.max(0, shellOpenTimer - dt);
            const openAmt = shellOpenTimer > 0 ? Math.sin(Math.min(1, shellOpenTimer) * Math.PI * 0.5) : 0;
            shellTopGfx.y = -openAmt * 10;
            shellTopGfx.rotation = -openAmt * 0.25;
            shellPearlGfx.visible = openAmt > 0.15;
          }

          // Ambient bubbles
          ambientBubbleTimer -= dt;
          if (ambientBubbleTimer <= 0) {
            ambientBubbleTimer = 0.65 + Math.random() * 0.9;
            spawnBubble(Math.random() * sim.width, sim.height * 0.86, 3 + Math.random() * 4, 34);
          }

          // Update bubble particles
          for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i]!;
            b.life += dt;
            b.y -= b.vy * dt;
            b.x += Math.sin(elapsed * 3 + b.wobblePhase) * 14 * dt;
            b.gfx.position.set(b.x, b.y);
            b.gfx.alpha = Math.max(0, 1 - b.life / b.maxLife);
            if (b.life >= b.maxLife || b.y < -16) {
              fxLayer.removeChild(b.gfx);
              b.gfx.destroy();
              bubbles.splice(i, 1);
            }
          }

          // Update water ripples
          for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i]!;
            r.radius += dt * 75;
            r.alpha -= dt * 1.8;
            r.gfx.clear();
            r.gfx.circle(0, 0, r.radius).stroke({ width: 2, color: 0xbae6fd, alpha: Math.max(0, r.alpha) });
            if (r.alpha <= 0) {
              fxLayer.removeChild(r.gfx);
              r.gfx.destroy();
              ripples.splice(i, 1);
            }
          }

          // Render Fish Feed pellets
          feedGfx.clear();
          for (const pellet of sim.pellets) {
            const fade = pellet.age > pellet.maxAge - 1.5 ? Math.max(0, (pellet.maxAge - pellet.age) / 1.5) : 1;
            feedGfx.circle(pellet.x, pellet.y, 5).fill({ color: 0xfbbf24, alpha: fade });
            feedGfx.circle(pellet.x - 1.5, pellet.y - 1.5, 1.8).fill({ color: 0xfef3c7, alpha: fade });
          }

          // Update creature MeshPlane deformations & transforms
          for (const actor of sim.actors) {
            const vis = visuals.get(actor.id);
            if (!vis) continue;

            const spec = getSpeciesSpec(actor.speciesId);
            vis.container.position.set(actor.x, actor.y);

            let flipX = 1;
            if (spec.defaultFacing === 'left') {
              flipX = actor.facingSign > 0 ? -1 : 1;
            } else if (spec.defaultFacing === 'right') {
              flipX = actor.facingSign < 0 ? -1 : 1;
            }

            const entryScale =
              actor.entryTimer > 0
                ? 1 + Math.sin((1 - actor.entryTimer / 1.4) * Math.PI) * 0.22
                : 1;
            const reactPulse = actor.reactionTimer > 0 ? 1 + Math.sin(actor.reactionTimer * 18) * 0.08 : 1;

            vis.plane.scale.set(flipX * vis.baseScale * entryScale * reactPulse, vis.baseScale * entryScale * reactPulse);
            vis.plane.position.set(
              (-flipX * vis.texWidth * vis.baseScale * entryScale * reactPulse) / 2,
              (-vis.texHeight * vis.baseScale * entryScale * reactPulse) / 2,
            );

            let baseRot: number;
            if (spec.defaultFacing === 'front') {
              baseRot = Math.max(-0.18, Math.min(0.18, actor.vx * 0.0022));
            } else {
              const tilt = Math.max(-0.24, Math.min(0.24, actor.vy * 0.0028));
              baseRot = actor.facingSign > 0 ? tilt : -tilt;
            }
            if (actor.reactionTimer > 0 && actor.reactionKind === 'leap') {
              const spinProgress = 1 - Math.min(1, actor.reactionTimer / 1.3);
              vis.container.rotation = baseRot + spinProgress * Math.PI * 2 * actor.facingSign;
            } else {
              vis.container.rotation = baseRot;
            }

            if (actor.reactionTimer > 0 && actor.reactionKind === 'glow') {
              vis.plane.tint = Math.sin(actor.reactionTimer * 16) > 0 ? 0xa5f3fc : 0xfbcfe8;
            } else if (vis.plane.tint !== 0xffffff) {
              vis.plane.tint = 0xffffff;
            }

            const posAttr = vis.plane.geometry.getAttribute('aPosition');
            if (posAttr?.buffer?.data instanceof Float32Array) {
              deformSpeciesMesh(
                posAttr.buffer.data,
                {
                  verticesX: 14,
                  verticesY: 10,
                  baseWidth: vis.texWidth,
                  baseHeight: vis.texHeight,
                },
                actor.speciesId,
                actor.phase,
                actor.reactionTimer > 0,
              );
              posAttr.buffer.update();
            }

            if (vis.tagTimer > 0) {
              vis.tagTimer = Math.max(0, vis.tagTimer - dt);
              vis.nameTag.visible = vis.isDemo || vis.tagTimer > 0;
              vis.nameTag.alpha = vis.isDemo ? Math.max(0.82, Math.min(1, vis.tagTimer)) : Math.min(1, vis.tagTimer);
            } else {
              vis.nameTag.visible = vis.isDemo;
              vis.nameTag.alpha = vis.isDemo ? 0.82 : 0;
            }
          }
        });
      });

    return () => {
      destroyed = true;
      syncTriggerRef.current = null;
      resizeObserver?.disconnect();
      for (const tex of textureCache.values()) {
        tex.destroy(true);
      }
      textureCache.clear();
      app.destroy(true, { children: true });
    };
  }, []);

  return <div ref={hostRef} className="aquarium-stage no-print" />;
}
