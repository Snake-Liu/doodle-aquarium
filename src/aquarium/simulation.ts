import { getSpeciesSpec, type SpeciesId } from '../domain/species';
import type { MarineCreature } from './collectionStore';

export interface CreatureActor {
  readonly id: string;
  readonly speciesId: SpeciesId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetVx: number;
  targetVy: number;
  facingSign: 1 | -1;
  phase: number;
  wanderTimer: number;
  reactionTimer: number;
  entryTimer: number;
}

export interface FeedPellet {
  readonly id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  readonly maxAge: number;
}

export interface AquariumSimulation {
  width: number;
  height: number;
  actors: CreatureActor[];
  pellets: FeedPellet[];
  nextPelletId: number;
}

export interface SimulationStepEvents {
  readonly eatenCount: number;
  readonly eatenPositions: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

const MAX_PELLETS = 24;
const FEED_ATTRACT_RADIUS = 340;
const FEED_EAT_RADIUS = 32;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getHabitatBounds(speciesId: SpeciesId, width: number, height: number) {
  const padX = Math.min(72, width * 0.12);
  const minX = padX;
  const maxX = Math.max(padX + 10, width - padX);
  const seabedTop = height * 0.81;
  const seabedBottom = height * 0.91;

  switch (speciesId) {
    case 'crab':
      return { minX, maxX, minY: height * 0.83, maxY: height * 0.91 };
    case 'dolphin':
      return { minX, maxX, minY: height * 0.14, maxY: Math.min(seabedTop - 20, height * 0.54) };
    case 'turtle':
      return { minX, maxX, minY: height * 0.2, maxY: Math.min(seabedTop - 20, height * 0.72) };
    case 'clownfish':
      return { minX, maxX, minY: height * 0.24, maxY: Math.min(seabedTop - 16, height * 0.76) };
    case 'jellyfish':
    case 'squid':
      return { minX, maxX, minY: height * 0.14, maxY: Math.min(seabedBottom - 30, height * 0.76) };
  }
}

function randomWanderVelocity(speciesId: SpeciesId): { vx: number; vy: number; duration: number } {
  const dir = Math.random() < 0.5 ? -1 : 1;
  switch (speciesId) {
    case 'dolphin':
      return { vx: dir * (78 + Math.random() * 44), vy: (Math.random() - 0.5) * 28, duration: 2.5 + Math.random() * 2.5 };
    case 'turtle':
      return { vx: dir * (38 + Math.random() * 22), vy: (Math.random() - 0.5) * 18, duration: 3 + Math.random() * 3 };
    case 'clownfish':
      return { vx: dir * (56 + Math.random() * 36), vy: (Math.random() - 0.5) * 32, duration: 1.8 + Math.random() * 2 };
    case 'crab': {
      const pause = Math.random() < 0.25;
      return { vx: pause ? 0 : dir * (34 + Math.random() * 24), vy: 0, duration: pause ? 0.9 + Math.random() : 2 + Math.random() * 2 };
    }
    case 'jellyfish':
      return { vx: dir * (14 + Math.random() * 14), vy: -18, duration: 2.5 + Math.random() * 2 };
    case 'squid':
      return { vx: dir * (32 + Math.random() * 30), vy: (Math.random() - 0.5) * 28, duration: 1.6 + Math.random() * 1.8 };
  }
}

export function createAquariumSimulation(width: number, height: number): AquariumSimulation {
  return {
    width: Math.max(200, width),
    height: Math.max(200, height),
    actors: [],
    pellets: [],
    nextPelletId: 1,
  };
}

export function syncSimulationCreatures(
  sim: AquariumSimulation,
  activeCreatures: readonly MarineCreature[],
): void {
  const existingById = new Map(sim.actors.map((a) => [a.id, a]));
  const nextActors: CreatureActor[] = [];

  for (const creature of activeCreatures) {
    const existing = existingById.get(creature.id);
    if (existing) {
      nextActors.push(existing);
      continue;
    }

    const bounds = getHabitatBounds(creature.speciesId, sim.width, sim.height);
    const wander = randomWanderVelocity(creature.speciesId);
    const spec = getSpeciesSpec(creature.speciesId);
    const initialX = bounds.minX + Math.random() * Math.max(10, bounds.maxX - bounds.minX);
    const initialY = creature.isDemo
      ? bounds.minY + Math.random() * Math.max(10, bounds.maxY - bounds.minY)
      : Math.min(bounds.maxY, sim.height * 0.14);

    nextActors.push({
      id: creature.id,
      speciesId: creature.speciesId,
      x: initialX,
      y: initialY,
      vx: wander.vx,
      vy: creature.isDemo ? wander.vy : 45,
      targetVx: wander.vx,
      targetVy: wander.vy,
      facingSign:
        wander.vx !== 0
          ? wander.vx > 0
            ? 1
            : -1
          : spec.defaultFacing === 'right'
            ? 1
            : -1,
      phase: Math.random() * Math.PI * 2,
      wanderTimer: wander.duration,
      reactionTimer: 0,
      entryTimer: creature.isDemo ? 0 : 1.4,
    });
  }

  sim.actors = nextActors;
}

export function dropFeed(sim: AquariumSimulation, x: number, y: number, count = 3): void {
  const clampedX = clamp(x, 20, sim.width - 20);
  const clampedY = clamp(y, 20, sim.height * 0.85);
  for (let i = 0; i < count; i++) {
    if (sim.pellets.length >= MAX_PELLETS) {
      sim.pellets.shift();
    }
    sim.pellets.push({
      id: sim.nextPelletId++,
      x: clamp(clampedX + (Math.random() - 0.5) * 26, 16, sim.width - 16),
      y: clamp(clampedY + (Math.random() - 0.5) * 14, 16, sim.height * 0.88),
      vx: (Math.random() - 0.5) * 10,
      vy: 28 + Math.random() * 14,
      age: 0,
      maxAge: 10,
    });
  }
}

export function tapCreature(sim: AquariumSimulation, creatureId: string): CreatureActor | null {
  const actor = sim.actors.find((a) => a.id === creatureId);
  if (!actor) return null;
  actor.reactionTimer = 1.25;
  const dir = actor.vx >= 0 ? 1 : -1;
  if (actor.speciesId === 'crab') {
    actor.targetVx = -dir * 115;
    actor.vx = actor.targetVx;
  } else if (actor.speciesId === 'jellyfish' || actor.speciesId === 'squid') {
    actor.targetVy = -95;
    actor.vy = -110;
  } else {
    actor.targetVx = dir * 165;
    actor.vx = actor.targetVx;
    actor.vy = -38;
  }
  return actor;
}

export function stepAquariumSimulation(sim: AquariumSimulation, dtRaw: number): SimulationStepEvents {
  const dt = Math.min(0.05, Math.max(0.001, dtRaw));
  const seabedLimit = sim.height * 0.91;

  // Update Fish Feed pellets
  const survivingPellets: FeedPellet[] = [];
  for (const pellet of sim.pellets) {
    pellet.age += dt;
    pellet.x = clamp(pellet.x + pellet.vx * dt, 10, sim.width - 10);
    pellet.y = Math.min(seabedLimit, pellet.y + pellet.vy * dt);
    pellet.vx *= 0.96;
    if (pellet.age < pellet.maxAge) {
      survivingPellets.push(pellet);
    }
  }
  sim.pellets = survivingPellets;

  const eatenIds = new Set<number>();
  const eatenPositions: Array<{ x: number; y: number }> = [];

  for (const actor of sim.actors) {
    const bounds = getHabitatBounds(actor.speciesId, sim.width, sim.height);
    actor.entryTimer = Math.max(0, actor.entryTimer - dt);
    actor.reactionTimer = Math.max(0, actor.reactionTimer - dt);

    const speedBoost = actor.reactionTimer > 0 ? 1.55 : 1;
    actor.phase += dt * (actor.speciesId === 'dolphin' || actor.speciesId === 'clownfish' ? 5.8 : 3.6) * speedBoost;

    // Look for nearest reachable Fish Feed
    let nearestPellet: FeedPellet | null = null;
    let nearestDist = FEED_ATTRACT_RADIUS;
    for (const pellet of sim.pellets) {
      if (eatenIds.has(pellet.id)) continue;
      if (actor.speciesId === 'crab' && pellet.y < sim.height * 0.72) continue;
      const dist = Math.hypot(pellet.x - actor.x, pellet.y - actor.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestPellet = pellet;
      }
    }

    if (actor.entryTimer > 0) {
      const targetEntryY = (bounds.minY + bounds.maxY) * 0.5;
      actor.targetVy = (targetEntryY - actor.y) / Math.max(0.18, actor.entryTimer);
    } else if (nearestPellet) {
      if (nearestDist <= FEED_EAT_RADIUS) {
        eatenIds.add(nearestPellet.id);
        eatenPositions.push({ x: nearestPellet.x, y: nearestPellet.y });
        actor.reactionTimer = Math.max(actor.reactionTimer, 0.5);
      } else {
        const dx = nearestPellet.x - actor.x;
        const dy = nearestPellet.y - actor.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const chaseSpeed = actor.speciesId === 'crab' ? 76 : actor.speciesId === 'jellyfish' ? 55 : 120;
        actor.targetVx = (dx / len) * chaseSpeed;
        actor.targetVy = actor.speciesId === 'crab' ? 0 : (dy / len) * chaseSpeed;
      }
    } else {
      actor.wanderTimer -= dt;
      if (actor.wanderTimer <= 0) {
        const w = randomWanderVelocity(actor.speciesId);
        actor.targetVx = w.vx;
        actor.targetVy = w.vy;
        actor.wanderTimer = w.duration;
      }

      if (actor.speciesId === 'jellyfish') {
        const pulse = Math.sin(actor.phase * 0.75);
        actor.targetVy = pulse > 0.25 ? -38 * pulse : 18;
      } else if (actor.speciesId === 'squid') {
        const jet = Math.max(0, Math.sin(actor.phase * 0.9));
        actor.targetVy = jet > 0.4 ? -45 : 14;
      }
    }

    const blend = Math.min(1, dt * 3.5);
    actor.vx += (actor.targetVx - actor.vx) * blend;
    actor.vy += (actor.targetVy - actor.vy) * blend;

    actor.x += actor.vx * dt;
    actor.y += actor.vy * dt;

    if (actor.x < bounds.minX) {
      actor.x = bounds.minX;
      actor.vx = Math.abs(actor.vx);
      actor.targetVx = Math.abs(actor.targetVx);
    } else if (actor.x > bounds.maxX) {
      actor.x = bounds.maxX;
      actor.vx = -Math.abs(actor.vx);
      actor.targetVx = -Math.abs(actor.targetVx);
    }

    if (actor.entryTimer <= 0) {
      if (actor.y < bounds.minY) {
        actor.y = bounds.minY;
        actor.vy = Math.abs(actor.vy) * 0.5;
        actor.targetVy = Math.abs(actor.targetVy);
      } else if (actor.y > bounds.maxY) {
        actor.y = bounds.maxY;
        actor.vy = -Math.abs(actor.vy) * 0.5;
        actor.targetVy = -Math.abs(actor.targetVy);
      }
    } else {
      actor.y = clamp(actor.y, 0, bounds.maxY);
    }

    if (Math.abs(actor.vx) > 4) {
      actor.facingSign = actor.vx >= 0 ? 1 : -1;
    }
  }

  if (eatenIds.size > 0) {
    sim.pellets = sim.pellets.filter((p) => !eatenIds.has(p.id));
  }

  return {
    eatenCount: eatenIds.size,
    eatenPositions,
  };
}
