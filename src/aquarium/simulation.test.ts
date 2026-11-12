import { describe, expect, it } from 'vitest';
import {
  createAquariumSimulation,
  dropFeed,
  stepAquariumSimulation,
  syncSimulationCreatures,
  tapCreature,
} from './simulation';
import type { MarineCreature } from './collectionStore';

function makeCreature(id: string, speciesId: MarineCreature['speciesId']): MarineCreature {
  return {
    id,
    speciesId,
    name: id,
    textureUrl: `blob:${id}`,
    createdAt: 1,
    activatedAt: 1,
    isActive: true,
    isDemo: false,
  };
}

describe('Aquarium simulation seam', () => {
  it('keeps crab constrained to seabed and all creatures inside portrait & landscape bounds', () => {
    const sim = createAquariumSimulation(390, 844);
    syncSimulationCreatures(sim, [
      makeCreature('c1', 'crab'),
      makeCreature('d1', 'dolphin'),
      makeCreature('j1', 'jellyfish'),
      makeCreature('s1', 'squid'),
      makeCreature('t1', 'turtle'),
      makeCreature('f1', 'clownfish'),
    ]);

    for (let step = 0; step < 300; step++) {
      stepAquariumSimulation(sim, 1 / 30);
      const crab = sim.actors.find((a) => a.id === 'c1')!;
      if (crab.entryTimer === 0) {
        expect(crab.y).toBeGreaterThanOrEqual(sim.height * 0.78);
      }
      expect(crab.y).toBeLessThanOrEqual(sim.height);

      for (const actor of sim.actors) {
        expect(actor.x).toBeGreaterThanOrEqual(0);
        expect(actor.x).toBeLessThanOrEqual(sim.width);
        expect(actor.y).toBeGreaterThanOrEqual(0);
        expect(actor.y).toBeLessThanOrEqual(sim.height);
      }
    }

    // Resize to landscape and step again
    sim.width = 844;
    sim.height = 390;
    for (let step = 0; step < 120; step++) {
      stepAquariumSimulation(sim, 1 / 30);
    }
    const crabAfter = sim.actors.find((a) => a.id === 'c1')!;
    expect(crabAfter.y).toBeGreaterThanOrEqual(390 * 0.78);
    expect(crabAfter.x).toBeLessThanOrEqual(844);
  });

  it('attracts nearby creatures to fish feed, consumes eaten pellets, and expires uneaten ones', () => {
    const sim = createAquariumSimulation(800, 600);
    syncSimulationCreatures(sim, [makeCreature('f1', 'clownfish')]);
    const clownfish = sim.actors[0]!;
    clownfish.x = 200;
    clownfish.y = 300;

    dropFeed(sim, 310, 300, 1);
    expect(sim.pellets).toHaveLength(1);

    let eaten = 0;
    for (let i = 0; i < 180; i++) {
      const events = stepAquariumSimulation(sim, 1 / 30);
      eaten += events.eatenCount;
      if (sim.pellets.length === 0) break;
    }

    expect(eaten).toBe(1);
    expect(sim.pellets).toHaveLength(0);

    // Pellet dropped far from any creature expires after ~10s
    clownfish.x = 50;
    clownfish.y = 50;
    dropFeed(sim, 760, 100, 1);
    expect(sim.pellets).toHaveLength(1);
    for (let i = 0; i < 360; i++) {
      stepAquariumSimulation(sim, 1 / 30);
    }
    expect(sim.pellets).toHaveLength(0);
  });

  it('triggers distinct species tap reactions and gives newly synced creatures an entry animation', () => {
    const sim = createAquariumSimulation(600, 500);
    syncSimulationCreatures(sim, [
      makeCreature('d1', 'dolphin'),
      makeCreature('j1', 'jellyfish'),
      makeCreature('s1', 'squid'),
      makeCreature('c1', 'crab'),
      makeCreature('f1', 'clownfish'),
    ]);
    const dolphin = sim.actors.find((a) => a.id === 'd1')!;
    expect(dolphin.entryTimer).toBeGreaterThan(0);

    const tappedDolphin = tapCreature(sim, 'd1')!;
    const tappedJellyfish = tapCreature(sim, 'j1')!;
    const tappedSquid = tapCreature(sim, 's1')!;
    const tappedCrab = tapCreature(sim, 'c1')!;
    const tappedClownfish = tapCreature(sim, 'f1')!;

    expect(tappedDolphin.reactionKind).toBe('leap');
    expect(tappedDolphin.vy).toBeLessThan(-100);
    expect(tappedJellyfish.reactionKind).toBe('glow');
    expect(tappedSquid.reactionKind).toBe('ink-dash');
    expect(tappedCrab.reactionKind).toBe('scuttle');
    expect(tappedCrab.vy).toBe(0);
    expect(tappedClownfish.reactionKind).toBe('dart');

    for (let i = 0; i < 90; i++) {
      stepAquariumSimulation(sim, 1 / 30);
    }
    expect(dolphin.entryTimer).toBe(0);
    expect(dolphin.reactionTimer).toBe(0);
  });
});
