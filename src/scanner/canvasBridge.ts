import type { RgbaImage } from '../domain/image';
import { getSpeciesSpec, type SpeciesId } from '../domain/species';
import type { MarineCreature } from '../aquarium/collectionStore';
import { SHEET_LAYOUT } from '../scanner/sheetLayout';

const MAX_STORED_TEXTURE_DIM = 288;

export function rgbaImageToDataUrl(img: RgbaImage): string {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) {
    throw new Error('2D canvas context unavailable');
  }
  const imageData = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  srcCtx.putImageData(imageData, 0, 0);

  const scale = Math.min(1, MAX_STORED_TEXTURE_DIM / Math.max(img.width, img.height));
  let targetCanvas = srcCanvas;
  if (scale < 1) {
    targetCanvas = document.createElement('canvas');
    targetCanvas.width = Math.max(1, Math.round(img.width * scale));
    targetCanvas.height = Math.max(1, Math.round(img.height * scale));
    const dstCtx = targetCanvas.getContext('2d');
    if (dstCtx) {
      dstCtx.imageSmoothingEnabled = true;
      dstCtx.imageSmoothingQuality = 'high';
      dstCtx.drawImage(srcCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
    } else {
      targetCanvas = srcCanvas;
    }
  }

  const webpUrl = targetCanvas.toDataURL('image/webp', 0.86);
  if (webpUrl.startsWith('data:image/webp')) {
    return webpUrl;
  }
  return targetCanvas.toDataURL('image/png');
}

export function extractRgbaFromSource(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  maxDimension = 720,
): RgbaImage {
  const srcW =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source instanceof HTMLImageElement
        ? source.naturalWidth
        : source.width;
  const srcH =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source instanceof HTMLImageElement
        ? source.naturalHeight
        : source.height;

  if (srcW <= 0 || srcH <= 0) {
    throw new Error('Source media has zero dimensions');
  }

  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  };
}

export async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function drawMarkerOnCtx(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const mod = size / SHEET_LAYOUT.markerModuleRatio;
  const x0 = cx - size / 2;
  const y0 = cy - size / 2;
  ctx.fillStyle = '#0f1216';
  ctx.fillRect(x0, y0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0 + mod, y0 + mod, size - 2 * mod, size - 2 * mod);
  ctx.fillStyle = '#0f1216';
  ctx.fillRect(x0 + 2 * mod, y0 + 2 * mod, size - 4 * mod, size - 4 * mod);
}

/**
 * Renders a crisp A4 printable Coloring Sheet (1240 x 1754) using the exact
 * shared SHEET_LAYOUT coordinates and high-resolution outline PNG.
 */
export async function renderPrintableSheetCanvas(speciesId: SpeciesId): Promise<HTMLCanvasElement> {
  const spec = getSpeciesSpec(speciesId);
  const outlineImg = await loadHtmlImage(spec.outlineUrl);
  const { width, height, scanFrameX, scanFrameY, scanFrameSize } = SHEET_LAYOUT.printPage;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Friendly header above the scan frame
  ctx.fillStyle = '#0c4a6e';
  ctx.font = 'bold 54px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`塗鴉水族箱 專用圖紙 — ${spec.name}`, width / 2, 150);

  ctx.fillStyle = '#475569';
  ctx.font = '30px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText('請在線稿裡自由塗上喜歡的顏色，四個黑色「回」字框與條碼請留白喔！', width / 2, 225);

  // Subtle dashed outer guide frame outside the scan box
  ctx.save();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(scanFrameX - 16, scanFrameY - 16, scanFrameSize + 32, scanFrameSize + 32);
  ctx.restore();

  // Draw canonical scan box scaled cleanly to scanFrameSize
  const s = scanFrameSize / SHEET_LAYOUT.canonicalSize;
  ctx.save();
  ctx.translate(scanFrameX, scanFrameY);

  for (const marker of Object.values(SHEET_LAYOUT.markers)) {
    drawMarkerOnCtx(ctx, marker.x * s, marker.y * s, SHEET_LAYOUT.markerSize * s);
  }

  const bits: readonly number[] = [
    ...SHEET_LAYOUT.barcode.startSync,
    ...spec.barcodeBits,
    ...SHEET_LAYOUT.barcode.endSync,
  ];
  const cellW = (SHEET_LAYOUT.barcode.width * s) / SHEET_LAYOUT.barcode.cellCount;
  ctx.fillStyle = '#0f1216';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 1) {
      ctx.fillRect(
        SHEET_LAYOUT.barcode.x * s + i * cellW + 2,
        SHEET_LAYOUT.barcode.y * s,
        cellW - 4,
        SHEET_LAYOUT.barcode.height * s,
      );
    }
  }

  ctx.drawImage(
    outlineImg,
    SHEET_LAYOUT.templateBox.x * s,
    SHEET_LAYOUT.templateBox.y * s,
    SHEET_LAYOUT.templateBox.size * s,
    SHEET_LAYOUT.templateBox.size * s,
  );

  ctx.restore();

  // Footer note
  ctx.fillStyle = '#64748b';
  ctx.font = '26px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('畫完後打開手機「塗鴉水族箱」按下「掃描塗鴉」，讓牠游進你的水族箱吧！', width / 2, 1550);

  return canvas;
}

/**
 * Renders a shareable PNG souvenir postcard for a Marine Creature in the Collection.
 */
export async function renderSouvenirCardDataUrl(creature: MarineCreature): Promise<string> {
  const spec = getSpeciesSpec(creature.speciesId);
  const creatureImg = await loadHtmlImage(creature.textureUrl);

  const w = 720;
  const h = 540;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0ea5e9');
  grad.addColorStop(0.55, '#0369a1');
  grad.addColorStop(1, '#082f49');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Soft seabed sand strip
  ctx.fillStyle = '#e7c98f';
  ctx.beginPath();
  ctx.moveTo(0, h - 65);
  ctx.quadraticCurveTo(w * 0.3, h - 92, w * 0.65, h - 68);
  ctx.quadraticCurveTo(w * 0.85, h - 55, w, h - 75);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Decorative bubbles
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 3;
  for (const [bx, by, br] of [
    [110, 120, 18],
    [145, 84, 11],
    [590, 140, 22],
    [625, 96, 12],
    [540, 210, 9],
  ] as const) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw creature centered
  const maxBoxW = 420;
  const maxBoxH = 260;
  const scale = Math.min(maxBoxW / creatureImg.naturalWidth, maxBoxH / creatureImg.naturalHeight);
  const dw = creatureImg.naturalWidth * scale;
  const dh = creatureImg.naturalHeight * scale;
  ctx.drawImage(creatureImg, (w - dw) / 2, (h - 70 - dh) / 2 + 12, dw, dh);

  // Card text badge
  ctx.fillStyle = 'rgba(6, 36, 61, 0.72)';
  ctx.beginPath();
  ctx.roundRect(140, h - 118, w - 280, 74, 20);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(creature.name, w / 2, h - 78);

  ctx.fillStyle = '#bae6fd';
  ctx.font = '18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText(`${spec.name} · 塗鴉水族箱`, w / 2, h - 52);

  return canvas.toDataURL('image/png');
}
