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
    const fish = sim.actors[0]!;
    fish.x = 200;
    fish.y = 300;

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

    // Pellet dropped far from any fish expires after ~10s
    fish.x = 50;
    fish.y = 50;
    dropFeed(sim, 760, 100, 1);
    expect(sim.pellets).toHaveLength(1);
    for (let i = 0; i < 360; i++) {
      stepAquariumSimulation(sim, 1 / 30);
    }
    expect(sim.pellets).toHaveLength(0);
  });

  it('triggers tap reaction and gives newly synced creatures an entry animation', () => {
    const sim = createAquariumSimulation(600, 500);
    syncSimulationCreatures(sim, [makeCreature('d1', 'dolphin')]);
    const dolphin = sim.actors[0]!;
    expect(dolphin.entryTimer).toBeGreaterThan(0);

    tapCreature(sim, 'd1');
    expect(dolphin.reactionTimer).toBeGreaterThan(0);

    for (let i = 0; i < 90; i++) {
      stepAquariumSimulation(sim, 1 / 30);
    }
    expect(dolphin.entryTimer).toBe(0);
    expect(dolphin.reactionTimer).toBe(0);
  });
});
