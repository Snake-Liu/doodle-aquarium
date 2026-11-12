import { useState } from 'react';
import type { MarineCreature } from '../aquarium/collectionStore';
import { getSpeciesSpec, SPECIES_LIST, type SpeciesId } from '../domain/species';
import { renderSouvenirCardDataUrl } from '../scanner/canvasBridge';

interface CollectionModalProps {
  readonly creatures: readonly MarineCreature[];
  readonly collectedSpecies: readonly SpeciesId[];
  readonly activeCapacity: number;
  readonly onToggleActive: (id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onClose: () => void;
}

export function CollectionModal({
  creatures,
  collectedSpecies,
  activeCapacity,
  onToggleActive,
  onRename,
  onDelete,
  onClose,
}: CollectionModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const collectedSet = new Set(collectedSpecies);
  const activeCount = creatures.filter((c) => c.isActive).length;

  const handleSaveCard = async (creature: MarineCreature) => {
    setExportingId(creature.id);
    try {
      const dataUrl = await renderSouvenirCardDataUrl(creature);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `塗鴉水族箱-${creature.name}.png`;
      a.click();
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="我的圖鑑">
      <div className="modal-card" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h2>📖 我的圖鑑（{creatures.length} 隻）</h2>
          <button type="button" className="btn" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 6 Species Completion Badges */}
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              background: 'rgba(14, 165, 233, 0.14)',
              border: '1px solid rgba(125, 211, 252, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                color: '#bae6fd',
                marginBottom: 8,
              }}
            >
              <span>六大海洋生物收集徽章</span>
              <strong>
                {collectedSet.size} / {SPECIES_LIST.length}
              </strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
              {SPECIES_LIST.map((sp) => {
                const unlocked = collectedSet.has(sp.id);
                return (
                  <div
                    key={sp.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: 6,
                      borderRadius: 10,
                      background: unlocked ? 'rgba(56, 189, 248, 0.28)' : 'rgba(2, 23, 38, 0.45)',
                      opacity: unlocked ? 1 : 0.45,
                      border: unlocked ? '1px solid #38bdf8' : '1px solid transparent',
                    }}
                  >
                    <img
                      src={sp.outlineUrl}
                      alt={sp.name}
                      style={{
                        width: 36,
                        height: 36,
                        objectFit: 'contain',
                        filter: 'invert(1)',
                      }}
                    />
                    <span style={{ fontSize: 11, marginTop: 2 }}>{sp.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#bae6fd' }}>
            水族箱目前在場：{activeCount} / {activeCapacity} 隻（滿額時會自動讓最舊的生物回圖鑑休息，不會刪除作品）
          </div>

          {creatures.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>
              還沒掃描任何塗鴉圖紙喔！點選下方「掃描塗鴉」加入你的第一隻海洋生物吧。
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: 12,
              }}
            >
              {creatures.map((c) => {
                const spec = getSpeciesSpec(c.speciesId);
                const isEditing = editingId === c.id;
                const isConfirmDelete = confirmDeleteId === c.id;
                return (
                  <div
                    key={c.id}
                    style={{
                      borderRadius: 14,
                      background: 'rgba(6, 36, 61, 0.85)',
                      border: c.isActive
                        ? '1px solid rgba(56, 189, 248, 0.55)'
                        : '1px solid rgba(148, 163, 184, 0.25)',
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        height: 110,
                        borderRadius: 10,
                        background: 'linear-gradient(180deg, #0284c7 0%, #082f49 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        padding: 8,
                      }}
                    >
                      <img
                        src={c.textureUrl}
                        alt={c.name}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: c.isActive ? '#0ea5e9' : 'rgba(15, 23, 42, 0.75)',
                          color: '#ffffff',
                        }}
                      >
                        {c.isActive ? '游動中' : '休息中'}
                      </span>
                    </div>

                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          value={draftName}
                          maxLength={20}
                          onChange={(e) => setDraftName(e.target.value)}
                          style={{
                            flex: 1,
                            padding: '4px 8px',
                            borderRadius: 8,
                            border: '1px solid #38bdf8',
                            background: '#041d33',
                            color: '#ffffff',
                            fontSize: 13,
                          }}
                        />
                        <button
                          type="button"
                          className="btn primary"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => {
                            onRename(c.id, draftName);
                            setEditingId(null);
                          }}
                        >
                          存
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            {spec.name} · {new Date(c.createdAt).toLocaleDateString('zh-TW')}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => {
                            setEditingId(c.id);
                            setDraftName(c.name);
                          }}
                        >
                          改名
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className={`btn ${c.isActive ? '' : 'primary'}`}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                        onClick={() => onToggleActive(c.id)}
                      >
                        {c.isActive ? '收回休息' : '出來游'}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '6px 8px', fontSize: 12 }}
                        disabled={exportingId === c.id}
                        onClick={() => void handleSaveCard(c)}
                      >
                        {exportingId === c.id ? '製作中…' : '紀念小卡'}
                      </button>
                      {isConfirmDelete ? (
                        <button
                          type="button"
                          className="btn danger"
                          style={{ padding: '6px 8px', fontSize: 12 }}
                          onClick={() => {
                            onDelete(c.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          確定刪除
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn danger"
                          style={{ padding: '6px 8px', fontSize: 12 }}
                          onClick={() => setConfirmDeleteId(c.id)}
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
