import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEffects';
import type { RgbaImage } from '../domain/image';
import { getSpeciesSpec, SPECIES_LIST, type SpeciesId } from '../domain/species';
import { extractRgbaFromSource, rgbaImageToDataUrl } from '../scanner/canvasBridge';
import type { QuadCorners } from '../scanner/homography';
import { extractDoodleTexture, scanColoringSheet } from '../scanner/scanColoringSheet';
import type { Point2D } from '../scanner/sheetLayout';

interface ScannerModalProps {
  readonly onClose: () => void;
  readonly onConfirmCreature: (speciesId: SpeciesId, name: string, textureUrl: string) => void;
}

type Step = 'capture' | 'manual' | 'preview';

export function ScannerModal({ onClose, onConfirmCreature }: ScannerModalProps) {
  const [step, setStep] = useState<Step>('capture');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState('請把專用圖紙的四個黑色「回」字框放進鏡頭內');
  const [showManualOption, setShowManualOption] = useState(false);

  const [capturedImage, setCapturedImage] = useState<RgbaImage | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [manualCorners, setManualCorners] = useState<QuadCorners>([
    { x: 0.12, y: 0.12 },
    { x: 0.88, y: 0.12 },
    { x: 0.88, y: 0.88 },
    { x: 0.12, y: 0.88 },
  ]);
  const [manualSpecies, setManualSpecies] = useState<SpeciesId>('clownfish');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const [detectedSpecies, setDetectedSpecies] = useState<SpeciesId>('clownfish');
  const [previewTextureUrl, setPreviewTextureUrl] = useState<string | null>(null);
  const [creatureName, setCreatureName] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const manualContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  const handleScanSuccess = useCallback(
    (speciesId: SpeciesId, texture: RgbaImage) => {
      stopCamera();
      const url = rgbaImageToDataUrl(texture);
      setDetectedSpecies(speciesId);
      setPreviewTextureUrl(url);
      setCreatureName('');
      soundEngine.playBubble(640);
      setStep('preview');
    },
    [stopCamera],
  );

  // Start rear camera when on capture step
  useEffect(() => {
    if (step !== 'capture') return;
    let cancelled = false;
    setShowManualOption(false);

    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        setShowManualOption(true);
      }
    }, 4500);

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('此瀏覽器不支援即時相機，請使用下方「相簿選圖 / 拍照匯入」。');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraError(null);
      } catch {
        if (!cancelled) {
          setCameraError(
            '無法開啟即時相機（可能未授權或非 HTTPS 連線），請改用下方「相簿選圖 / 拍照匯入」。',
          );
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      stopCamera();
    };
  }, [step, stopCamera]);

  // Auto-scan live video feed periodically
  useEffect(() => {
    if (step !== 'capture' || cameraError) return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      try {
        const frame = extractRgbaFromSource(video, 680);
        const res = scanColoringSheet(frame);
        if (res.ok) {
          handleScanSuccess(res.speciesId, res.texture);
        } else if (res.reason === 'barcode_unreadable') {
          setStatusHint('找到四個定位框了！請讓上方條碼保持清晰與均勻光線…');
        } else {
          setStatusHint('請將整張圖紙的四個黑色「回」字框完整放進鏡頭內');
        }
      } catch {
        // Ignore transient frame read errors
      }
    }, 380);
    return () => window.clearInterval(timer);
  }, [step, cameraError, handleScanSuccess]);

  const enterManualFromRgba = (img: RgbaImage) => {
    stopCamera();
    setCapturedImage(img);
    setCapturedUrl(rgbaImageToDataUrl(img));
    setManualCorners([
      { x: 0.14, y: 0.18 },
      { x: 0.86, y: 0.18 },
      { x: 0.86, y: 0.84 },
      { x: 0.14, y: 0.84 },
    ]);
    setStep('manual');
  };

  const handleSnapNow = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const frame = extractRgbaFromSource(video, 760);
    const res = scanColoringSheet(frame);
    if (res.ok) {
      handleScanSuccess(res.speciesId, res.texture);
    } else {
      enterManualFromRgba(frame);
    }
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const rgba = extractRgbaFromSource(img, 800);
        const res = scanColoringSheet(rgba);
        if (res.ok) {
          handleScanSuccess(res.speciesId, res.texture);
        } else {
          setShowManualOption(true);
          enterManualFromRgba(rgba);
        }
      } catch {
        setStatusHint('讀取圖片失敗，請換一張照片再試一次');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setStatusHint('無法解析該圖片格式');
    };
    img.src = url;
    e.target.value = '';
  };

  const handleManualPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingIdx === null || !manualContainerRef.current) return;
    const rect = manualContainerRef.current.getBoundingClientRect();
    const nx = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
    setManualCorners((prev) => {
      const next = [...prev] as [Point2D, Point2D, Point2D, Point2D];
      next[draggingIdx] = { x: nx, y: ny };
      return next;
    });
  };

  const handleExtractManual = () => {
    if (!capturedImage) return;
    const pixelCorners: QuadCorners = [
      { x: manualCorners[0].x * capturedImage.width, y: manualCorners[0].y * capturedImage.height },
      { x: manualCorners[1].x * capturedImage.width, y: manualCorners[1].y * capturedImage.height },
      { x: manualCorners[2].x * capturedImage.width, y: manualCorners[2].y * capturedImage.height },
      { x: manualCorners[3].x * capturedImage.width, y: manualCorners[3].y * capturedImage.height },
    ];
    const tex = extractDoodleTexture(capturedImage, pixelCorners, manualSpecies);
    handleScanSuccess(manualSpecies, tex);
  };

  const spec = getSpeciesSpec(detectedSpecies);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="掃描塗鴉">
      <div className="modal-card">
        <div className="modal-header">
          <h2>
            {step === 'capture' && '📷 掃描塗鴉圖紙'}
            {step === 'manual' && '✂️ 手動對準四角與物種'}
            {step === 'preview' && `✨ 誕生了一隻${spec.name}！`}
          </h2>
          <button type="button" className="btn" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="modal-body">
          {step === 'capture' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '3 / 4',
                  maxHeight: '52vh',
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: '#041726',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {!cameraError ? (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: '12%',
                        border: '2px dashed rgba(125, 211, 252, 0.85)',
                        borderRadius: 14,
                        pointerEvents: 'none',
                        boxShadow: '0 0 0 999px rgba(4, 23, 38, 0.25)',
                      }}
                    />
                  </>
                ) : (
                  <p style={{ padding: 20, textAlign: 'center', color: '#bae6fd', lineHeight: 1.6 }}>
                    {cameraError}
                  </p>
                )}
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(14, 165, 233, 0.16)',
                  color: '#e0f2fe',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                {statusHint}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {!cameraError && (
                  <button type="button" className="btn primary" style={{ flex: 1 }} onClick={handleSnapNow}>
                    📸 立即拍攝
                  </button>
                )}
                <button
                  type="button"
                  className="btn primary"
                  style={{ flex: 1 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  🖼️ 相簿選圖 / 拍照匯入
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFilePicked}
                />
              </div>

              {showManualOption && !cameraError && (
                <button type="button" className="btn" onClick={handleSnapNow}>
                  自動抓不到嗎？點此拍照並手動調整四角
                </button>
              )}
            </div>
          )}

          {step === 'manual' && capturedUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#bae6fd' }}>
                拖曳四個藍點對準圖紙四角「回」字標記中心，並選擇圖紙上的海洋生物：
              </p>

              <div
                ref={manualContainerRef}
                onPointerMove={handleManualPointerMove}
                onPointerUp={() => setDraggingIdx(null)}
                onPointerLeave={() => setDraggingIdx(null)}
                style={{
                  position: 'relative',
                  width: '100%',
                  touchAction: 'none',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#02111d',
                }}
              >
                <img
                  src={capturedUrl}
                  alt="待校正塗鴉"
                  draggable={false}
                  style={{ width: '100%', display: 'block' }}
                />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  }}
                >
                  <polygon
                    points={manualCorners.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill="rgba(56, 189, 248, 0.14)"
                    stroke="#38bdf8"
                    strokeWidth="0.8"
                  />
                </svg>
                {manualCorners.map((pt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`角落 ${idx + 1}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDraggingIdx(idx);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${pt.x * 100}%`,
                      top: `${pt.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '3px solid #ffffff',
                      background: '#0284c7',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'grab',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {SPECIES_LIST.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    className={`btn ${manualSpecies === sp.id ? 'primary' : ''}`}
                    style={{ padding: '8px 6px', fontSize: 13 }}
                    onClick={() => setManualSpecies(sp.id)}
                  >
                    {sp.name}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn" onClick={() => setStep('capture')}>
                  重新掃描
                </button>
                <button
                  type="button"
                  className="btn primary"
                  style={{ flex: 1 }}
                  onClick={handleExtractManual}
                >
                  擷取塗鴉貼圖
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && previewTextureUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
              <div
                style={{
                  width: '100%',
                  padding: 20,
                  borderRadius: 16,
                  background: 'linear-gradient(180deg, #0ea5e9 0%, #0369a1 100%)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <img
                  src={previewTextureUrl}
                  alt={spec.name}
                  style={{ maxWidth: '75%', maxHeight: 210, objectFit: 'contain' }}
                />
              </div>

              <div style={{ width: '100%' }}>
                <label
                  htmlFor="creature-name-input"
                  style={{ display: 'block', fontSize: 13, color: '#bae6fd', marginBottom: 6 }}
                >
                  幫這隻{spec.name}取個名字（可留空使用預設名）：
                </label>
                <input
                  id="creature-name-input"
                  type="text"
                  maxLength={20}
                  value={creatureName}
                  onChange={(e) => setCreatureName(e.target.value)}
                  placeholder={`例如：彩虹${spec.name}`}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(186, 230, 253, 0.35)',
                    background: 'rgba(4, 23, 38, 0.6)',
                    color: '#ffffff',
                    fontSize: 15,
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                <button type="button" className="btn" onClick={() => setStep('capture')}>
                  重拍一張
                </button>
                <button
                  type="button"
                  className="btn primary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    soundEngine.playEntrySplash();
                    onConfirmCreature(detectedSpecies, creatureName, previewTextureUrl);
                  }}
                >
                  🌊 放進水族箱！
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
