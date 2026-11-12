import { getSpeciesSpec, type HabitatZone, type SpeciesId } from '../domain/species';
import type { MarineCreature } from './collectionStore';

export type TapReactionKind = 'leap' | 'glow' | 'ink-dash' | 'scuttle' | 'dart';

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
  reactionKind: TapReactionKind;
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

const HABITAT_BANDS: Record<
  HabitatZone,
  { readonly minYRatio: number; readonly maxYRatio: number; readonly capAboveSeabed: boolean }
> = {
  'upper-mid': { minYRatio: 0.14, maxYRatio: 0.54, capAboveSeabed: true },
  'mid-water': { minYRatio: 0.22, maxYRatio: 0.74, capAboveSeabed: true },
  'all-water': { minYRatio: 0.14, maxYRatio: 0.76, capAboveSeabed: false },
  seabed: { minYRatio: 0.83, maxYRatio: 0.91, capAboveSeabed: false },
};

interface SpeciesBehaviorSpec {
  readonly baseSpeed: number;
  readonly speedJitter: number;
  readonly verticalRange: number;
  readonly durationMin: number;
  readonly durationJitter: number;
  readonly phaseSpeed: number;
  readonly chaseSpeed: number;
  readonly seabedOnly: boolean;
  readonly pauseChance: number;
  readonly bobMode: 'none' | 'jellyfish' | 'squid';
  readonly tapReaction: TapReactionKind;
  readonly tapVxScale: number;
  readonly tapVy: number;
  readonly tapReactionDuration: number;
}

const SPECIES_BEHAVIOR: Record<SpeciesId, SpeciesBehaviorSpec> = {
  dolphin: {
    baseSpeed: 78,
    speedJitter: 44,
    verticalRange: 28,
    durationMin: 2.5,
    durationJitter: 2.5,
    phaseSpeed: 5.8,
    chaseSpeed: 120,
    seabedOnly: false,
    pauseChance: 0,
    bobMode: 'none',
    tapReaction: 'leap',
    tapVxScale: 185,
    tapVy: -145,
    tapReactionDuration: 1.3,
  },
  turtle: {
    baseSpeed: 38,
    speedJitter: 22,
    verticalRange: 18,
    durationMin: 3,
    durationJitter: 3,
    phaseSpeed: 3.6,
    chaseSpeed: 110,
    seabedOnly: false,
    pauseChance: 0,
    bobMode: 'none',
    tapReaction: 'dart',
    tapVxScale: 125,
    tapVy: -42,
    tapReactionDuration: 1.2,
  },
  clownfish: {
    baseSpeed: 56,
    speedJitter: 36,
    verticalRange: 32,
    durationMin: 1.8,
    durationJitter: 2,
    phaseSpeed: 5.8,
    chaseSpeed: 128,
    seabedOnly: false,
    pauseChance: 0,
    bobMode: 'none',
    tapReaction: 'dart',
    tapVxScale: 190,
    tapVy: -52,
    tapReactionDuration: 1.15,
  },
  crab: {
    baseSpeed: 34,
    speedJitter: 24,
    verticalRange: 0,
    durationMin: 2,
    durationJitter: 2,
    phaseSpeed: 3.6,
    chaseSpeed: 76,
    seabedOnly: true,
    pauseChance: 0.25,
    bobMode: 'none',
    tapReaction: 'scuttle',
    tapVxScale: -145,
    tapVy: 0,
    tapReactionDuration: 1.15,
  },
  jellyfish: {
    baseSpeed: 14,
    speedJitter: 14,
    verticalRange: 0,
    durationMin: 2.5,
    durationJitter: 2,
    phaseSpeed: 3.6,
    chaseSpeed: 55,
    seabedOnly: false,
    pauseChance: 0,
    bobMode: 'jellyfish',
    tapReaction: 'glow',
    tapVxScale: 45,
    tapVy: -125,
    tapReactionDuration: 1.4,
  },
  squid: {
    baseSpeed: 32,
    speedJitter: 30,
    verticalRange: 28,
    durationMin: 1.6,
    durationJitter: 1.8,
    phaseSpeed: 3.6,
    chaseSpeed: 120,
    seabedOnly: false,
    pauseChance: 0,
    bobMode: 'squid',
    tapReaction: 'ink-dash',
    tapVxScale: -165,
    tapVy: -135,
    tapReactionDuration: 1.25,
  },
};

function getHabitatBounds(speciesId: SpeciesId, width: number, height: number) {
  const padX = Math.min(72, width * 0.12);
  const minX = padX;
  const maxX = Math.max(padX + 10, width - padX);
  const seabedTop = height * 0.81;
  const seabedBottom = height * 0.91;
  const band = HABITAT_BANDS[getSpeciesSpec(speciesId).habitat];
  const rawMaxY = height * band.maxYRatio;
  return {
    minX,
    maxX,
    minY: height * band.minYRatio,
    maxY: band.capAboveSeabed ? Math.min(seabedTop - 20, rawMaxY) : Math.min(seabedBottom, rawMaxY),
  };
}

function randomWanderVelocity(speciesId: SpeciesId): { vx: number; vy: number; duration: number } {
  const b = SPECIES_BEHAVIOR[speciesId];
  const dir = Math.random() < 0.5 ? -1 : 1;
  if (b.pauseChance > 0 && Math.random() < b.pauseChance) {
    return { vx: 0, vy: 0, duration: 0.9 + Math.random() };
  }
  return {
    vx: dir * (b.baseSpeed + Math.random() * b.speedJitter),
    vy: b.bobMode === 'jellyfish' ? -18 : (Math.random() - 0.5) * b.verticalRange,
    duration: b.durationMin + Math.random() * b.durationJitter,
  };
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
    const behavior = SPECIES_BEHAVIOR[creature.speciesId];
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
      reactionKind: behavior.tapReaction,
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
  const behavior = SPECIES_BEHAVIOR[actor.speciesId];
  const dir = actor.vx >= 0 ? 1 : -1;
  actor.reactionKind = behavior.tapReaction;
  actor.reactionTimer = behavior.tapReactionDuration;
  actor.targetVx = dir * behavior.tapVxScale;
  actor.vx = actor.targetVx;
  actor.vy = behavior.tapVy;
  actor.targetVy = behavior.seabedOnly ? 0 : behavior.tapVy * 0.65;
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
    const behavior = SPECIES_BEHAVIOR[actor.speciesId];
    const bounds = getHabitatBounds(actor.speciesId, sim.width, sim.height);
    actor.entryTimer = Math.max(0, actor.entryTimer - dt);
    actor.reactionTimer = Math.max(0, actor.reactionTimer - dt);

    const speedBoost = actor.reactionTimer > 0 ? 1.55 : 1;
    actor.phase += dt * behavior.phaseSpeed * speedBoost;

    // Look for nearest reachable Fish Feed
    let nearestPellet: FeedPellet | null = null;
    let nearestDist = FEED_ATTRACT_RADIUS;
    for (const pellet of sim.pellets) {
      if (eatenIds.has(pellet.id)) continue;
      if (behavior.seabedOnly && pellet.y < sim.height * 0.72) continue;
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
        actor.targetVx = (dx / len) * behavior.chaseSpeed;
        actor.targetVy = behavior.seabedOnly ? 0 : (dy / len) * behavior.chaseSpeed;
      }
    } else {
      actor.wanderTimer -= dt;
      if (actor.wanderTimer <= 0) {
        const w = randomWanderVelocity(actor.speciesId);
        actor.targetVx = w.vx;
        actor.targetVy = w.vy;
        actor.wanderTimer = w.duration;
      }

      if (behavior.bobMode === 'jellyfish') {
        const pulse = Math.sin(actor.phase * 0.75);
        actor.targetVy = pulse > 0.25 ? -38 * pulse : 18;
      } else if (behavior.bobMode === 'squid') {
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
