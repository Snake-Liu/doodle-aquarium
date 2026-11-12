import {
  clampCapacity,
  DEFAULT_ACTIVE_CAPACITY,
  type MarineCreature,
} from '../aquarium/collectionStore';

export interface PersistedAquariumState {
  readonly creatures: readonly MarineCreature[];
  readonly activeCapacity: number;
  readonly demoCleared: boolean;
}

export interface CollectionRepository {
  loadState(): Promise<PersistedAquariumState>;
  saveState(state: PersistedAquariumState): Promise<void>;
}

const DEFAULT_DB_NAME = 'doodle-aquarium-db';
const STORE_NAME = 'aquarium';
const STATE_KEY = 'singleton';

function createDefaultState(): PersistedAquariumState {
  return {
    creatures: [],
    activeCapacity: DEFAULT_ACTIVE_CAPACITY,
    demoCleared: false,
  };
}

export function createIndexedDbRepository(
  idbFactory?: IDBFactory,
  dbName = DEFAULT_DB_NAME,
): CollectionRepository {
  const factory = idbFactory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  let memoryFallback = createDefaultState();

  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!factory) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = factory.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    });
  }

  return {
    async loadState(): Promise<PersistedAquariumState> {
      if (!factory) {
        return memoryFallback;
      }
      try {
        const db = await openDb();
        return await new Promise<PersistedAquariumState>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(STATE_KEY);
          req.onsuccess = () => {
            const raw = req.result as Partial<PersistedAquariumState> | undefined;
            if (!raw) {
              resolve(createDefaultState());
              return;
            }
            resolve({
              creatures: Array.isArray(raw.creatures) ? raw.creatures.filter((c) => !c.isDemo) : [],
              activeCapacity: clampCapacity(raw.activeCapacity ?? DEFAULT_ACTIVE_CAPACITY),
              demoCleared: Boolean(raw.demoCleared),
            });
          };
          req.onerror = () => reject(req.error ?? new Error('Failed to read state'));
          tx.oncomplete = () => db.close();
        });
      } catch {
        return memoryFallback;
      }
    },

    async saveState(state: PersistedAquariumState): Promise<void> {
      const sanitized: PersistedAquariumState = {
        creatures: state.creatures.filter((c) => !c.isDemo),
        activeCapacity: clampCapacity(state.activeCapacity),
        demoCleared: state.demoCleared,
      };
      memoryFallback = sanitized;
      if (!factory) {
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(sanitized, STATE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save state'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      });
    },
  };
}
