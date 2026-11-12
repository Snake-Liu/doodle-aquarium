import { describe, expect, it } from 'vitest';
import { createAquariumStore, type DemoCreatureSeed } from './collectionStore';

const DEMO_SEEDS: readonly DemoCreatureSeed[] = [
  { id: 'demo-1', speciesId: 'clownfish', name: '範例小丑魚', textureUrl: './demos/demo-clownfish.png' },
  { id: 'demo-2', speciesId: 'turtle', name: '範例海龜', textureUrl: './demos/demo-turtle.png' },
];

describe('Collection & Active Tank Capacity seam', () => {
  it('excludes demo creatures from collection badges and vacates demo then oldest real creature when over capacity', () => {
    const store = createAquariumStore({
      activeCapacity: 8,
      demoCreatures: DEMO_SEEDS,
    });

    // Cold start has 2 active demo creatures, 0 in collection, 0 badges
    expect(store.getActiveCreatures()).toHaveLength(2);
    expect(store.getCollectionCreatures()).toHaveLength(0);
    expect(store.getCollectedSpecies()).toEqual([]);

    // Scan 8 real creatures -> total slots = 8, so the 2 demo creatures should vacate first,
    // and all 8 real creatures remain active with none pushed to rest yet
    for (let i = 1; i <= 8; i++) {
      store.addScannedCreature({
        speciesId: i % 2 === 0 ? 'dolphin' : 'crab',
        name: `作品${i}`,
        textureUrl: `blob:tex-${i}`,
        createdAt: 1000 + i,
      });
    }

    expect(store.getActiveCreatures()).toHaveLength(8);
    expect(store.getActiveCreatures().every((c) => !c.isDemo)).toBe(true);
    expect(store.getCollectionCreatures()).toHaveLength(8);
    expect([...store.getCollectedSpecies()].sort()).toEqual(['crab', 'dolphin']);

    // Scan 9th creature -> oldest real creature ("作品1") automatically rests in Collection, never deleted
    store.addScannedCreature({
      speciesId: 'squid',
      name: '作品9',
      textureUrl: 'blob:tex-9',
      createdAt: 1009,
    });

    const active = store.getActiveCreatures();
    const collection = store.getCollectionCreatures();
    expect(active).toHaveLength(8);
    expect(active.some((c) => c.name === '作品1')).toBe(false);
    expect(active.some((c) => c.name === '作品9')).toBe(true);

    expect(collection).toHaveLength(9);
    const rested = collection.find((c) => c.name === '作品1');
    expect(rested?.isActive).toBe(false);
  });

  it('supports toggling resting creatures back into aquarium, renaming, deleting, clearing demos, and shrinking capacity', () => {
    const store = createAquariumStore({
      activeCapacity: 10,
      demoCreatures: DEMO_SEEDS,
    });

    // Clear demo creatures explicitly
    store.clearDemoCreatures();
    expect(store.getActiveCreatures()).toHaveLength(0);

    // Default naming when name is omitted or blank
    const first = store.addScannedCreature({ speciesId: 'jellyfish', name: '   ', textureUrl: 'blob:j1', createdAt: 100 });
    expect(first.name).toBe('水母 #1');

    store.renameCreature(first.id, '小粉水母');
    expect(store.getCollectionCreatures().find((c) => c.id === first.id)?.name).toBe('小粉水母');

    // Empty rename is ignored
    store.renameCreature(first.id, '  ');
    expect(store.getCollectionCreatures().find((c) => c.id === first.id)?.name).toBe('小粉水母');

    // Fill up to 9 more creatures (total 10 active)
    for (let i = 2; i <= 10; i++) {
      store.addScannedCreature({ speciesId: 'clownfish', name: `魚${i}`, textureUrl: `blob:f${i}`, createdAt: 100 + i });
    }
    expect(store.getActiveCreatures()).toHaveLength(10);

    // Shrink capacity below 8 clamps to 8 and moves 2 oldest active ("小粉水母", "魚2") to rest
    store.setActiveCapacity(3);
    expect(store.getActiveCapacity()).toBe(8);
    expect(store.getActiveCreatures()).toHaveLength(8);
    expect(store.getActiveCreatures().some((c) => c.id === first.id)).toBe(false);

    // Toggle "小粉水母" back active -> displaces oldest remaining ("魚3") to rest
    store.toggleActive(first.id);
    const activeIds = new Set(store.getActiveCreatures().map((c) => c.id));
    expect(activeIds.has(first.id)).toBe(true);
    expect(store.getActiveCreatures().some((c) => c.name === '魚3')).toBe(false);
    expect(store.getCollectionCreatures()).toHaveLength(10);

    // Delete removes permanently
    store.deleteCreature(first.id);
    expect(store.getCollectionCreatures()).toHaveLength(9);
    expect(store.getActiveCreatures()).toHaveLength(7);
  });

  it('maintains oldest-active eviction order when restored from initialCreatures', () => {
    const now = Date.now();
    const store = createAquariumStore({
      activeCapacity: 8,
      initialCreatures: Array.from({ length: 8 }, (_, idx) => ({
        id: `saved-${idx + 1}`,
        speciesId: 'dolphin' as const,
        name: `海豚${idx + 1}`,
        textureUrl: `blob:${idx + 1}`,
        createdAt: now + idx,
        // Simulate saved activatedAt slightly ahead of clock from rapid scanning
        activatedAt: now + 500 + idx,
        isActive: true,
        isDemo: false,
      })),
    });

    const ninth = store.addScannedCreature({
      speciesId: 'crab',
      name: '新螃蟹',
      textureUrl: 'blob:9',
    });

    const active = store.getActiveCreatures();
    expect(active).toHaveLength(8);
    expect(active.some((c) => c.id === ninth.id)).toBe(true);
    expect(active.some((c) => c.id === 'saved-1')).toBe(false);

    // Adding a 10th creature must evict saved-2, NOT the just-added ninth!
    const tenth = store.addScannedCreature({
      speciesId: 'turtle',
      name: '新海龜',
      textureUrl: 'blob:10',
    });
    const activeAfterTenth = store.getActiveCreatures();
    expect(activeAfterTenth.some((c) => c.id === ninth.id)).toBe(true);
    expect(activeAfterTenth.some((c) => c.id === tenth.id)).toBe(true);
    expect(activeAfterTenth.some((c) => c.id === 'saved-2')).toBe(false);
  });
});
