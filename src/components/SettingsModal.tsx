import { MAX_ACTIVE_CAPACITY, MIN_ACTIVE_CAPACITY } from '../aquarium/collectionStore';

interface SettingsModalProps {
  readonly activeCapacity: number;
  readonly demoCount: number;
  readonly onChangeCapacity: (cap: number) => void;
  readonly onClearDemos: () => void;
  readonly onClose: () => void;
}

export function SettingsModal({
  activeCapacity,
  demoCount,
  onChangeCapacity,
  onClearDemos,
  onClose,
}: SettingsModalProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="水族箱設定">
      <div className="modal-card" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>⚙️ 水族箱設定</h2>
          <button type="button" className="btn" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 8,
                fontSize: 15,
              }}
            >
              <span>水族箱在場上限</span>
              <strong>{activeCapacity} 隻</strong>
            </div>
            <input
              type="range"
              min={MIN_ACTIVE_CAPACITY}
              max={MAX_ACTIVE_CAPACITY}
              value={activeCapacity}
              onChange={(e) => onChangeCapacity(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              同時在畫面游動的最大數量（{MIN_ACTIVE_CAPACITY}～{MAX_ACTIVE_CAPACITY} 隻）。超過時最舊的生物會自動回到圖鑑休息，不會刪除任何作品。
            </p>
          </div>

          <div
            style={{
              paddingTop: 14,
              borderTop: '1px solid rgba(186, 230, 253, 0.14)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>範例示範生物</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {demoCount > 0 ? `目前水中有 ${demoCount} 隻示範生物` : '已清空所有示範生物'}
              </div>
            </div>
            <button
              type="button"
              className="btn danger"
              disabled={demoCount === 0}
              onClick={onClearDemos}
            >
              一鍵清空範例
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
