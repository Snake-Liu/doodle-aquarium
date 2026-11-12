import { getSpeciesSpec, type SpeciesId } from '../domain/species';

export const MIN_ACTIVE_CAPACITY = 8;
export const MAX_ACTIVE_CAPACITY = 20;
export const DEFAULT_ACTIVE_CAPACITY = 12;

export interface MarineCreature {
  readonly id: string;
  readonly speciesId: SpeciesId;
  readonly name: string;
  readonly textureUrl: string;
  readonly createdAt: number;
  readonly activatedAt: number;
  readonly isActive: boolean;
  readonly isDemo: boolean;
}

export interface DemoCreatureSeed {
  readonly id: string;
  readonly speciesId: SpeciesId;
  readonly name: string;
  readonly textureUrl: string;
}

export interface NewScannedCreatureInput {
  readonly id?: string;
  readonly speciesId: SpeciesId;
  readonly name?: string;
  readonly textureUrl: string;
  readonly createdAt?: number;
}

export interface AquariumStoreOptions {
  readonly activeCapacity?: number;
  readonly demoCreatures?: readonly DemoCreatureSeed[];
  readonly initialCreatures?: readonly MarineCreature[];
}

export interface AquariumStore {
  getActiveCapacity(): number;
  setActiveCapacity(capacity: number): void;
  getActiveCreatures(): readonly MarineCreature[];
  getCollectionCreatures(): readonly MarineCreature[];
  getCollectedSpecies(): readonly SpeciesId[];
  addScannedCreature(input: NewScannedCreatureInput): MarineCreature;
  toggleActive(id: string): void;
  renameCreature(id: string, name: string): void;
  deleteCreature(id: string): void;
  clearDemoCreatures(): void;
}

export function clampCapacity(capacity: number): number {
  return Math.max(MIN_ACTIVE_CAPACITY, Math.min(MAX_ACTIVE_CAPACITY, Math.round(capacity)));
}

export function createAquariumStore(options: AquariumStoreOptions = {}): AquariumStore {
  let capacity = clampCapacity(options.activeCapacity ?? DEFAULT_ACTIVE_CAPACITY);
  let creatures: MarineCreature[] = [];
  if (options.initialCreatures) {
    creatures = options.initialCreatures.map((c) => ({ ...c }));
  }
  let stampCounter = creatures.reduce((max, c) => Math.max(max, c.activatedAt), Date.now());
  if (options.demoCreatures) {
    for (const demo of options.demoCreatures) {
      stampCounter++;
      creatures.push({
        id: demo.id,
        speciesId: demo.speciesId,
        name: demo.name,
        textureUrl: demo.textureUrl,
        createdAt: stampCounter,
        activatedAt: stampCounter,
        isActive: true,
        isDemo: true,
      });
    }
  }

  function nextActivationStamp(): number {
    stampCounter = Math.max(stampCounter + 1, Date.now());
    return stampCounter;
  }

  function enforceCapacity(protectedId?: string): void {
    while (creatures.filter((c) => c.isActive).length > capacity) {
      const demoIndex = creatures.findIndex(
        (c) => c.isActive && c.isDemo && c.id !== protectedId,
      );
      if (demoIndex !== -1) {
        creatures.splice(demoIndex, 1);
        continue;
      }

      let oldestIdx = -1;
      let oldestStamp = Infinity;
      for (let i = 0; i < creatures.length; i++) {
        const item = creatures[i]!;
        if (item.isActive && !item.isDemo && item.id !== protectedId) {
          if (item.activatedAt < oldestStamp) {
            oldestStamp = item.activatedAt;
            oldestIdx = i;
          }
        }
      }
      if (oldestIdx === -1) break;
      const target = creatures[oldestIdx]!;
      creatures[oldestIdx] = { ...target, isActive: false };
    }
  }

  enforceCapacity();

  return {
    getActiveCapacity: () => capacity,
    setActiveCapacity(nextCap: number) {
      capacity = clampCapacity(nextCap);
      enforceCapacity();
    },
    getActiveCreatures: () => creatures.filter((c) => c.isActive),
    getCollectionCreatures: () =>
      creatures.filter((c) => !c.isDemo).sort((a, b) => b.createdAt - a.createdAt),
    getCollectedSpecies: () => {
      const seen = new Set<SpeciesId>();
      for (const c of creatures) {
        if (!c.isDemo) seen.add(c.speciesId);
      }
      return [...seen];
    },
    addScannedCreature(input: NewScannedCreatureInput): MarineCreature {
      const spec = getSpeciesSpec(input.speciesId);
      const countOfSpecies = creatures.filter((c) => !c.isDemo && c.speciesId === input.speciesId).length;
      const trimmedName = input.name?.trim();
      const stamp = nextActivationStamp();
      const creature: MarineCreature = {
        id: input.id ?? `creature-${stamp}-${Math.random().toString(36).slice(2, 7)}`,
        speciesId: input.speciesId,
        name: trimmedName && trimmedName.length > 0 ? trimmedName : `${spec.name} #${countOfSpecies + 1}`,
        textureUrl: input.textureUrl,
        createdAt: input.createdAt ?? Date.now(),
        activatedAt: stamp,
        isActive: true,
        isDemo: false,
      };
      creatures.push(creature);
      enforceCapacity(creature.id);
      return creature;
    },
    toggleActive(id: string) {
      const idx = creatures.findIndex((c) => c.id === id && !c.isDemo);
      if (idx === -1) return;
      const current = creatures[idx]!;
      if (current.isActive) {
        creatures[idx] = { ...current, isActive: false };
      } else {
        creatures[idx] = {
          ...current,
          isActive: true,
          activatedAt: nextActivationStamp(),
        };
        enforceCapacity(current.id);
      }
    },
    renameCreature(id: string, name: string) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const idx = creatures.findIndex((c) => c.id === id && !c.isDemo);
      if (idx === -1) return;
      creatures[idx] = { ...creatures[idx]!, name: trimmed };
    },
    deleteCreature(id: string) {
      creatures = creatures.filter((c) => c.id !== id);
    },
    clearDemoCreatures() {
      creatures = creatures.filter((c) => !c.isDemo);
    },
  };
}
