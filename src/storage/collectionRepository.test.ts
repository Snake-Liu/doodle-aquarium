import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbRepository } from './collectionRepository';
import { DEFAULT_ACTIVE_CAPACITY } from '../aquarium/collectionStore';

describe('CollectionRepository IndexedDB seam', () => {
  it('returns default empty state on first run and persists creatures, capacity, and demoCleared across reloads', async () => {
    const idb = new IDBFactory();
    const repo1 = createIndexedDbRepository(idb, 'test-doodle-aquarium');

    const initial = await repo1.loadState();
    expect(initial).toEqual({
      creatures: [],
      activeCapacity: DEFAULT_ACTIVE_CAPACITY,
      demoCleared: false,
    });

    await repo1.saveState({
      activeCapacity: 15,
      demoCleared: true,
      creatures: [
        {
          id: 'c-1',
          speciesId: 'dolphin',
          name: '藍海豚',
          textureUrl: 'data:image/png;base64,iVBORw0KGgo=',
          createdAt: 1700000000000,
          activatedAt: 1700000000000,
          isActive: true,
          isDemo: false,
        },
        {
          id: 'c-2',
          speciesId: 'crab',
          name: '紅螃蟹',
          textureUrl: 'data:image/png;base64,AAAA',
          createdAt: 1700000001000,
          activatedAt: 1700000001000,
          isActive: false,
          isDemo: false,
        },
      ],
    });

    // Simulate page reload with a fresh repository instance pointing to same IndexedDB
    const repo2 = createIndexedDbRepository(idb, 'test-doodle-aquarium');
    const reloaded = await repo2.loadState();

    expect(reloaded.activeCapacity).toBe(15);
    expect(reloaded.demoCleared).toBe(true);
    expect(reloaded.creatures).toHaveLength(2);
    expect(reloaded.creatures[0]?.name).toBe('藍海豚');
    expect(reloaded.creatures[1]?.isActive).toBe(false);
  });
});
