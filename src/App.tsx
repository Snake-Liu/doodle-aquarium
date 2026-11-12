import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AquariumCanvas } from './aquarium/AquariumCanvas';
import {
  createAquariumStore,
  DEFAULT_ACTIVE_CAPACITY,
  type AquariumStore,
  type DemoCreatureSeed,
  type MarineCreature,
} from './aquarium/collectionStore';
import { soundEngine } from './audio/soundEffects';
import { CollectionModal } from './components/CollectionModal';
import { ScannerModal } from './components/ScannerModal';
import { SettingsModal } from './components/SettingsModal';
import { SheetsModal } from './components/SheetsModal';
import { SPECIES_LIST, type SpeciesId } from './domain/species';
import { createIndexedDbRepository } from './storage/collectionRepository';

type ActiveModal = 'none' | 'scanner' | 'collection' | 'sheets' | 'settings';

const DEMO_SEEDS: readonly DemoCreatureSeed[] = [
  {
    id: 'demo-clownfish',
    speciesId: 'clownfish',
    name: '橘橘',
    textureUrl: './demos/demo-clownfish.png',
  },
  {
    id: 'demo-turtle',
    speciesId: 'turtle',
    name: '慢慢',
    textureUrl: './demos/demo-turtle.png',
  },
  {
    id: 'demo-jellyfish',
    speciesId: 'jellyfish',
    name: 'QQ',
    textureUrl: './demos/demo-jellyfish.png',
  },
];

interface StoreSnapshot {
  readonly activeCreatures: readonly MarineCreature[];
  readonly collectionCreatures: readonly MarineCreature[];
  readonly collectedSpecies: readonly SpeciesId[];
  readonly activeCapacity: number;
}

function readSnapshot(store: AquariumStore): StoreSnapshot {
  return {
    activeCreatures: store.getActiveCreatures(),
    collectionCreatures: store.getCollectionCreatures(),
    collectedSpecies: store.getCollectedSpecies(),
    activeCapacity: store.getActiveCapacity(),
  };
}

export function App() {
  const repo = useMemo(() => createIndexedDbRepository(), []);
  const storeRef = useRef<AquariumStore | null>(null);
  const demoClearedRef = useRef(false);

  const [snapshot, setSnapshot] = useState<StoreSnapshot>({
    activeCreatures: [],
    collectionCreatures: [],
    collectedSpecies: [],
    activeCapacity: DEFAULT_ACTIVE_CAPACITY,
  });
  const [modal, setModal] = useState<ActiveModal>('none');
  const [muted, setMuted] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(false), 7500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void repo.loadState().then((saved) => {
      if (cancelled) return;
      demoClearedRef.current = saved.demoCleared;
      const shouldSeedDemos = !saved.demoCleared && saved.creatures.length === 0;
      const store = createAquariumStore({
        activeCapacity: saved.activeCapacity,
        initialCreatures: saved.creatures,
        demoCreatures: shouldSeedDemos ? DEMO_SEEDS : undefined,
      });
      storeRef.current = store;
      setSnapshot(readSnapshot(store));
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const commitStoreChange = useCallback(
    (mutate: (store: AquariumStore) => void) => {
      const store = storeRef.current;
      if (!store) return;
      mutate(store);
      const next = readSnapshot(store);
      setSnapshot(next);
      void repo
        .saveState({
          creatures: next.collectionCreatures,
          activeCapacity: next.activeCapacity,
          demoCleared: demoClearedRef.current,
        })
        .then((res) => {
          if (res.quotaExceeded) {
            setStorageWarning('本機儲存空間已滿，部分新變更未能寫入，建議刪除部分舊作品後重試。');
          } else {
            setStorageWarning(null);
          }
        });
    },
    [repo],
  );

  const handleConfirmCreature = (speciesId: SpeciesId, name: string, textureUrl: string) => {
    commitStoreChange((store) => {
      store.addScannedCreature({ speciesId, name, textureUrl });
    });
    setModal('none');
  };

  const handleToggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    soundEngine.setMuted(nextMuted);
    if (!nextMuted) {
      soundEngine.playBubble(580);
    }
  };

  const demoCount = snapshot.activeCreatures.filter((c) => c.isDemo).length;

  return (
    <div className="app-shell">
      <AquariumCanvas creatures={snapshot.activeCreatures} />

      <header className="hud-top no-print">
        <div className="hud-pill">
          <span>🐠 塗鴉水族箱</span>
          <span style={{ color: '#7dd3fc', fontSize: 13 }}>
            {snapshot.activeCreatures.length}/{snapshot.activeCapacity} · 徽章{' '}
            {snapshot.collectedSpecies.length}/{SPECIES_LIST.length}
          </span>
        </div>

        <div className="hud-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={muted ? '開啟音效' : '靜音'}
            onClick={handleToggleMute}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="設定"
            onClick={() => setModal('settings')}
          >
            ⚙️
          </button>
        </div>
      </header>

      {storageWarning && (
        <div
          className="hint-banner no-print"
          style={{ top: 70, background: 'rgba(153, 27, 27, 0.92)', cursor: 'pointer' }}
          onClick={() => setStorageWarning(null)}
        >
          {storageWarning}（點擊關閉）
        </div>
      )}

      {showHint && !storageWarning && modal === 'none' && (
        <div className="hint-banner no-print">
          點空白水域撒魚飼料 · 點海洋生物或海星貝殼有驚喜 ✨
        </div>
      )}

      <nav className="hud-bottom no-print" aria-label="主要功能">
        <button type="button" className="nav-btn primary" onClick={() => setModal('scanner')}>
          📷 掃描塗鴉
        </button>
        <button type="button" className="nav-btn" onClick={() => setModal('collection')}>
          📖 圖鑑 ({snapshot.collectionCreatures.length})
        </button>
        <button type="button" className="nav-btn" onClick={() => setModal('sheets')}>
          🖨️ 圖紙
        </button>
      </nav>

      {modal === 'scanner' && (
        <ScannerModal
          onClose={() => setModal('none')}
          onConfirmCreature={handleConfirmCreature}
        />
      )}

      {modal === 'collection' && (
        <CollectionModal
          creatures={snapshot.collectionCreatures}
          collectedSpecies={snapshot.collectedSpecies}
          activeCapacity={snapshot.activeCapacity}
          onToggleActive={(id) => commitStoreChange((s) => s.toggleActive(id))}
          onRename={(id, nextName) => commitStoreChange((s) => s.renameCreature(id, nextName))}
          onDelete={(id) => commitStoreChange((s) => s.deleteCreature(id))}
          onClose={() => setModal('none')}
        />
      )}

      {modal === 'sheets' && <SheetsModal onClose={() => setModal('none')} />}

      {modal === 'settings' && (
        <SettingsModal
          activeCapacity={snapshot.activeCapacity}
          demoCount={demoCount}
          onChangeCapacity={(cap) => commitStoreChange((s) => s.setActiveCapacity(cap))}
          onClearDemos={() => {
            demoClearedRef.current = true;
            commitStoreChange((s) => s.clearDemoCreatures());
          }}
          onClose={() => setModal('none')}
        />
      )}
    </div>
  );
}
