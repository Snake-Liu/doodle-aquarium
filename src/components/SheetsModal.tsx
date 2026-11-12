import { useState } from 'react';
import { SPECIES_LIST, type SpeciesId } from '../domain/species';
import { renderPrintableSheetCanvas } from '../scanner/canvasBridge';

interface SheetsModalProps {
  readonly onClose: () => void;
}

export function SheetsModal({ onClose }: SheetsModalProps) {
  const [busyId, setBusyId] = useState<SpeciesId | 'all' | null>(null);
  const [printDataUrls, setPrintDataUrls] = useState<readonly string[] | null>(null);

  const handleDownloadOne = async (speciesId: SpeciesId, name: string) => {
    setBusyId(speciesId);
    try {
      const canvas = await renderPrintableSheetCanvas(speciesId);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `塗鴉水族箱-專用圖紙-${name}.png`;
      a.click();
    } finally {
      setBusyId(null);
    }
  };

  const handlePrintOneOrAll = async (targets: readonly SpeciesId[]) => {
    setBusyId(targets.length > 1 ? 'all' : targets[0]!);
    try {
      const urls: string[] = [];
      for (const id of targets) {
        const canvas = await renderPrintableSheetCanvas(id);
        urls.push(canvas.toDataURL('image/png'));
      }
      setPrintDataUrls(urls);
      // Wait for images to paint in print container before opening print dialog
      window.setTimeout(() => {
        window.print();
      }, 250);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="modal-backdrop no-print" role="dialog" aria-modal="true" aria-label="下載專用圖紙">
        <div className="modal-card" style={{ maxWidth: 660 }}>
          <div className="modal-header">
            <h2>🖨️ 列印／下載專用圖紙</h2>
            <button type="button" className="btn" onClick={onClose}>
              關閉
            </button>
          </div>

          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: 'rgba(14, 165, 233, 0.16)',
                color: '#e0f2fe',
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              每張圖紙皆附帶四角「回」字定位框與上方物種條碼，印在 A4 白紙上讓小朋友用蠟筆或彩色筆著色即可掃描！（建議：勿塗蓋四角黑框與上方條碼）
            </div>

            <button
              type="button"
              className="btn primary"
              disabled={busyId !== null}
              onClick={() => void handlePrintOneOrAll(SPECIES_LIST.map((s) => s.id))}
            >
              {busyId === 'all' ? '正在產生 6 張合輯…' : '📄 一次列印／匯出全部 6 張圖紙（A4 PDF）'}
            </button>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                gap: 12,
              }}
            >
              {SPECIES_LIST.map((sp) => (
                <div
                  key={sp.id}
                  style={{
                    borderRadius: 14,
                    background: 'rgba(6, 36, 61, 0.85)',
                    border: '1px solid rgba(186, 230, 253, 0.2)',
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: 110,
                      borderRadius: 10,
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 8,
                    }}
                  >
                    <img
                      src={sp.outlineUrl}
                      alt={sp.name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <strong style={{ fontSize: 15 }}>{sp.name}</strong>
                  <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                    <button
                      type="button"
                      className="btn primary"
                      style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                      disabled={busyId !== null}
                      onClick={() => void handleDownloadOne(sp.id, sp.name)}
                    >
                      {busyId === sp.id ? '處理中…' : '下載圖紙'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '6px 8px', fontSize: 12 }}
                      disabled={busyId !== null}
                      onClick={() => void handlePrintOneOrAll([sp.id])}
                    >
                      列印
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {printDataUrls && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#ffffff',
            zIndex: 100,
            overflow: 'auto',
          }}
        >
          <div
            className="no-print"
            style={{
              position: 'sticky',
              top: 0,
              padding: 12,
              background: '#082f49',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>列印預覽（若未自動跳出列印視窗，請點右側按鈕）</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn primary" onClick={() => window.print()}>
                列印 / 存成 PDF
              </button>
              <button type="button" className="btn" onClick={() => setPrintDataUrls(null)}>
                返回
              </button>
            </div>
          </div>
          {printDataUrls.map((url, idx) => (
            <div
              key={idx}
              style={{
                pageBreakAfter: idx < printDataUrls.length - 1 ? 'always' : 'auto',
                display: 'flex',
                justifyContent: 'center',
                padding: '10px 0',
              }}
            >
              <img src={url} alt={`圖紙 ${idx + 1}`} style={{ maxWidth: '100%', height: 'auto' }} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
