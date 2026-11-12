import { createRgbaImage, type RgbaImage } from '../domain/image';
import { SPECIES_LIST, type SpeciesId } from '../domain/species';
import { getSpeciesTemplateMask } from '../domain/templates';
import { applyHomography, computeHomography, type Matrix3, type QuadCorners } from './homography';
import { SHEET_LAYOUT, type Point2D } from './sheetLayout';

export type ScanFailureReason = 'markers_not_found' | 'barcode_unreadable';

export type ScanResult =
  | {
      readonly ok: true;
      readonly speciesId: SpeciesId;
      readonly texture: RgbaImage;
      readonly detectedCorners: QuadCorners;
    }
  | {
      readonly ok: false;
      readonly reason: ScanFailureReason;
    };

function fillRect(
  img: RgbaImage,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: readonly [number, number, number, number],
): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.ceil(x + w));
  const y1 = Math.min(img.height, Math.ceil(y + h));
  const [r, g, b, a] = rgba;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const idx = (py * img.width + px) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = a;
    }
  }
}

function drawFinderMarker(img: RgbaImage, center: Point2D, size: number): void {
  const mod = size / SHEET_LAYOUT.markerModuleRatio;
  const x0 = center.x - size / 2;
  const y0 = center.y - size / 2;
  fillRect(img, x0, y0, size, size, [15, 18, 22, 255]);
  fillRect(img, x0 + mod, y0 + mod, size - 2 * mod, size - 2 * mod, [255, 255, 255, 255]);
  fillRect(img, x0 + 2 * mod, y0 + 2 * mod, size - 4 * mod, size - 4 * mod, [15, 18, 22, 255]);
}

/**
 * Generates the canonical 512x512 Coloring Sheet scan region containing the
 * 4 finder markers, top species barcode, and crisp species line-art template.
 */
export function createColoringSheet(speciesId: SpeciesId): RgbaImage {
  const size = SHEET_LAYOUT.canonicalSize;
  const img = createRgbaImage(size, size, [255, 255, 255, 255]);

  drawFinderMarker(img, SHEET_LAYOUT.markers.tl, SHEET_LAYOUT.markerSize);
  drawFinderMarker(img, SHEET_LAYOUT.markers.tr, SHEET_LAYOUT.markerSize);
  drawFinderMarker(img, SHEET_LAYOUT.markers.br, SHEET_LAYOUT.markerSize);
  drawFinderMarker(img, SHEET_LAYOUT.markers.bl, SHEET_LAYOUT.markerSize);

  const spec = SPECIES_LIST.find((s) => s.id === speciesId);
  if (!spec) {
    throw new Error(`Unknown species: ${speciesId}`);
  }
  const bits: readonly number[] = [
    ...SHEET_LAYOUT.barcode.startSync,
    ...spec.barcodeBits,
    ...SHEET_LAYOUT.barcode.endSync,
  ];
  const cellW = SHEET_LAYOUT.barcode.width / SHEET_LAYOUT.barcode.cellCount;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 1) {
      fillRect(
        img,
        SHEET_LAYOUT.barcode.x + i * cellW + 1,
        SHEET_LAYOUT.barcode.y,
        cellW - 2,
        SHEET_LAYOUT.barcode.height,
        [15, 18, 22, 255],
      );
    }
  }

  const tpl = getSpeciesTemplateMask(speciesId);
  const bx = SHEET_LAYOUT.templateBox.x;
  const by = SHEET_LAYOUT.templateBox.y;
  for (let y = 0; y < tpl.size; y++) {
    for (let x = 0; x < tpl.size; x++) {
      const alpha = tpl.outlineAlpha[y * tpl.size + x]!;
      if (alpha === 0) continue;
      const dstIdx = ((by + y) * size + (bx + x)) * 4;
      const inv = 255 - alpha;
      img.data[dstIdx] = inv;
      img.data[dstIdx + 1] = inv;
      img.data[dstIdx + 2] = inv;
      img.data[dstIdx + 3] = 255;
    }
  }

  return img;
}

function sampleBilinearRgb(img: RgbaImage, fx: number, fy: number): [number, number, number] {
  const x = Math.max(0, Math.min(img.width - 1.001, fx));
  const y = Math.max(0, Math.min(img.height - 1.001, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const i00 = (y0 * img.width + x0) * 4;
  const i10 = (y0 * img.width + x1) * 4;
  const i01 = (y1 * img.width + x0) * 4;
  const i11 = (y1 * img.width + x1) * 4;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  const r =
    img.data[i00]! * w00 +
    img.data[i10]! * w10 +
    img.data[i01]! * w01 +
    img.data[i11]! * w11;
  const g =
    img.data[i00 + 1]! * w00 +
    img.data[i10 + 1]! * w10 +
    img.data[i01 + 1]! * w01 +
    img.data[i11 + 1]! * w11;
  const b =
    img.data[i00 + 2]! * w00 +
    img.data[i10 + 2]! * w10 +
    img.data[i01 + 2]! * w01 +
    img.data[i11 + 2]! * w11;
  return [r, g, b];
}

function sampleLuma(img: RgbaImage, fx: number, fy: number): number {
  const [r, g, b] = sampleBilinearRgb(img, fx, fy);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function buildAdaptiveBinary(img: RgbaImage): Uint8Array {
  const w = img.width;
  const h = img.height;
  const gray = new Uint8Array(w * h);
  const sat = new Int32Array((w + 1) * (h + 1));

  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const lum = (77 * img.data[idx]! + 150 * img.data[idx + 1]! + 29 * img.data[idx + 2]!) >> 8;
      gray[y * w + x] = lum;
      rowSum += lum;
      sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)]! + rowSum;
    }
  }

  const radius = Math.max(12, Math.min(48, Math.round(Math.min(w, h) / 14)));
  const binary = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        sat[(y1 + 1) * (w + 1) + (x1 + 1)]! -
        sat[y0 * (w + 1) + (x1 + 1)]! -
        sat[(y1 + 1) * (w + 1) + x0]! +
        sat[y0 * (w + 1) + x0]!;
      const mean = sum / area;
      const lum = gray[y * w + x]!;
      if (lum < mean - 16 && lum < 180) {
        binary[y * w + x] = 1;
      }
    }
  }
  return binary;
}

function matchesFinderRatio(runs: readonly [number, number, number, number, number]): boolean {
  const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
  if (total < 14) return false;
  const unit = total / 7;
  const maxVar = unit * 0.6;
  return (
    Math.abs(runs[0] - unit) <= maxVar &&
    Math.abs(runs[1] - unit) <= maxVar &&
    Math.abs(runs[2] - 3 * unit) <= maxVar * 1.4 &&
    Math.abs(runs[3] - unit) <= maxVar &&
    Math.abs(runs[4] - unit) <= maxVar
  );
}

function checkVerticalFinder(
  binary: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  horizTotal: number,
): number | null {
  const x = Math.round(cx);
  const yStart = Math.round(cy);
  if (x < 0 || x >= w || yStart < 0 || yStart >= h || binary[yStart * w + x] !== 1) {
    return null;
  }

  let top = yStart;
  while (top > 0 && binary[(top - 1) * w + x] === 1) top--;
  let bottom = yStart;
  while (bottom < h - 1 && binary[(bottom + 1) * w + x] === 1) bottom++;
  const bCenter = bottom - top + 1;

  let y = top - 1;
  let w1 = 0;
  while (y >= 0 && binary[y * w + x] === 0 && w1 < horizTotal) {
    w1++;
    y--;
  }
  let b1 = 0;
  while (y >= 0 && binary[y * w + x] === 1 && b1 < horizTotal) {
    b1++;
    y--;
  }

  y = bottom + 1;
  let w2 = 0;
  while (y < h && binary[y * w + x] === 0 && w2 < horizTotal) {
    w2++;
    y++;
  }
  let b2 = 0;
  while (y < h && binary[y * w + x] === 1 && b2 < horizTotal) {
    b2++;
    y++;
  }

  if (!matchesFinderRatio([b1, w1, bCenter, w2, b2])) {
    return null;
  }
  const vTotal = b1 + w1 + bCenter + w2 + b2;
  const ratio = vTotal / horizTotal;
  if (ratio < 0.6 || ratio > 1.65) {
    return null;
  }
  return (top + bottom) / 2;
}

interface MarkerCandidate {
  x: number;
  y: number;
  size: number;
  hits: number;
}

const FINDER_STATE = {
  WAIT_DARK: 0,
  BLK_OUTER_1: 1,
  WHT_INNER_1: 2,
  BLK_CENTER: 3,
  WHT_INNER_2: 4,
  BLK_OUTER_2: 5,
} as const;

type FinderState = (typeof FINDER_STATE)[keyof typeof FINDER_STATE];

function detectFinderCandidates(binary: Uint8Array, w: number, h: number): MarkerCandidate[] {
  const clusters: MarkerCandidate[] = [];
  const rowStep = w > 700 ? 2 : 1;

  for (let y = 0; y < h; y += rowStep) {
    const runs: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let state: FinderState = FINDER_STATE.WAIT_DARK;

    for (let x = 0; x <= w; x++) {
      const bit = x < w ? binary[y * w + x]! : 0;
      if (state === FINDER_STATE.WAIT_DARK) {
        if (bit === 1) {
          runs[0] = 1;
          state = FINDER_STATE.BLK_OUTER_1;
        }
      } else if (state === FINDER_STATE.BLK_OUTER_1) {
        if (bit === 1) runs[0]++;
        else {
          runs[1] = 1;
          state = FINDER_STATE.WHT_INNER_1;
        }
      } else if (state === FINDER_STATE.WHT_INNER_1) {
        if (bit === 0) runs[1]++;
        else {
          runs[2] = 1;
          state = FINDER_STATE.BLK_CENTER;
        }
      } else if (state === FINDER_STATE.BLK_CENTER) {
        if (bit === 1) runs[2]++;
        else {
          runs[3] = 1;
          state = FINDER_STATE.WHT_INNER_2;
        }
      } else if (state === FINDER_STATE.WHT_INNER_2) {
        if (bit === 0) runs[3]++;
        else {
          runs[4] = 1;
          state = FINDER_STATE.BLK_OUTER_2;
        }
      } else {
        if (bit === 1 && x < w) {
          runs[4]++;
        } else {
          const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
          if (matchesFinderRatio(runs) && total <= Math.min(w, h) * 0.35) {
            const cx = x - runs[4] - runs[3] - runs[2] / 2;
            const cy = checkVerticalFinder(binary, w, h, cx, y, total);
            if (cy !== null) {
              const mergeDist = Math.max(14, total * 0.6);
              let merged = false;
              for (const c of clusters) {
                if (Math.hypot(c.x - cx, c.y - cy) <= mergeDist) {
                  const n = c.hits + 1;
                  c.x = (c.x * c.hits + cx) / n;
                  c.y = (c.y * c.hits + cy) / n;
                  c.size = (c.size * c.hits + total) / n;
                  c.hits = n;
                  merged = true;
                  break;
                }
              }
              if (!merged) {
                clusters.push({ x: cx, y: cy, size: total, hits: 1 });
              }
            }
          }
          if (bit === 0) {
            runs[0] = runs[2];
            runs[1] = runs[3];
            runs[2] = runs[4];
            runs[3] = 1;
            runs[4] = 0;
            state = FINDER_STATE.WHT_INNER_2;
          } else {
            state = FINDER_STATE.WAIT_DARK;
          }
        }
      }
    }
  }

  return clusters.filter((c) => c.hits >= 2).sort((a, b) => b.hits - a.hits);
}

function orderCornersClockwise(pts: QuadCorners): QuadCorners {
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  return [sorted[0]!, sorted[1]!, sorted[2]!, sorted[3]!];
}

function quadArea(pts: QuadCorners): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % 4]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function decodeBarcodeAndSpecies(img: RgbaImage, invH: Matrix3): SpeciesId | null {
  // Sample dark reference from the 4 marker centers and white reference from guard bands
  const markerCenters = [
    SHEET_LAYOUT.markers.tl,
    SHEET_LAYOUT.markers.tr,
    SHEET_LAYOUT.markers.br,
    SHEET_LAYOUT.markers.bl,
  ];
  let darkSum = 0;
  for (const mc of markerCenters) {
    const p = applyHomography(invH, mc.x, mc.y);
    darkSum += sampleLuma(img, p.x, p.y);
  }
  const darkRef = darkSum / 4;

  let lightSum = 0;
  let lightCount = 0;
  for (let i = 0; i < 8; i++) {
    const cx = SHEET_LAYOUT.barcode.x + ((i + 0.5) * SHEET_LAYOUT.barcode.width) / 8;
    for (const cy of [10, 58]) {
      const p = applyHomography(invH, cx, cy);
      lightSum += sampleLuma(img, p.x, p.y);
      lightCount++;
    }
  }
  const lightRef = lightSum / lightCount;
  if (lightRef - darkRef < 25) {
    return null;
  }
  const threshold = darkRef + (lightRef - darkRef) * 0.55;

  const cellW = SHEET_LAYOUT.barcode.width / SHEET_LAYOUT.barcode.cellCount;
  const readBits: number[] = [];
  for (let c = 0; c < SHEET_LAYOUT.barcode.cellCount; c++) {
    const cellX = SHEET_LAYOUT.barcode.x + (c + 0.5) * cellW;
    const cellY = SHEET_LAYOUT.barcode.y + SHEET_LAYOUT.barcode.height / 2;
    let sum = 0;
    let samples = 0;
    for (const dy of [-5, 0, 5]) {
      for (const dx of [-5, 0, 5]) {
        const p = applyHomography(invH, cellX + dx, cellY + dy);
        sum += sampleLuma(img, p.x, p.y);
        samples++;
      }
    }
    readBits.push(sum / samples < threshold ? 1 : 0);
  }

  const syncErrors =
    (readBits[0] !== SHEET_LAYOUT.barcode.startSync[0] ? 1 : 0) +
    (readBits[1] !== SHEET_LAYOUT.barcode.startSync[1] ? 1 : 0) +
    (readBits[8] !== SHEET_LAYOUT.barcode.endSync[0] ? 1 : 0) +
    (readBits[9] !== SHEET_LAYOUT.barcode.endSync[1] ? 1 : 0);
  if (syncErrors > 1) {
    return null;
  }

  let bestSpecies: SpeciesId | null = null;
  let bestDist = 99;
  for (const spec of SPECIES_LIST) {
    let dist = 0;
    for (let i = 0; i < 6; i++) {
      if (readBits[2 + i] !== spec.barcodeBits[i]) {
        dist++;
      }
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestSpecies = spec.id;
    }
  }

  const maxDataErrors = syncErrors === 0 ? 1 : 0;
  return bestDist <= maxDataErrors ? bestSpecies : null;
}

const CANONICAL_CORNERS: QuadCorners = [
  SHEET_LAYOUT.markers.tl,
  SHEET_LAYOUT.markers.tr,
  SHEET_LAYOUT.markers.br,
  SHEET_LAYOUT.markers.bl,
];

/**
 * Manual fallback and shared texture extraction seam: warps the region bounded
 * by `corners` (TL, TR, BR, BL marker centers), normalizes lighting against paper
 * white, masks exterior transparent, and composites crisp black line-art on top.
 */
export function extractDoodleTexture(
  input: RgbaImage,
  corners: QuadCorners,
  speciesId: SpeciesId,
): RgbaImage {
  const invH = computeHomography(CANONICAL_CORNERS, corners);
  if (!invH) {
    throw new Error('Invalid corner coordinates for homography');
  }

  const tpl = getSpeciesTemplateMask(speciesId);
  const { x: bx, y: by, size: tplSize } = SHEET_LAYOUT.templateBox;
  const warped = new Uint8ClampedArray(tplSize * tplSize * 4);

  const paperR: number[] = [];
  const paperG: number[] = [];
  const paperB: number[] = [];

  for (let y = 0; y < tplSize; y++) {
    for (let x = 0; x < tplSize; x++) {
      const p = applyHomography(invH, bx + x, by + y);
      const [r, g, b] = sampleBilinearRgb(input, p.x, p.y);
      const idx = (y * tplSize + x) * 4;
      warped[idx] = Math.round(r);
      warped[idx + 1] = Math.round(g);
      warped[idx + 2] = Math.round(b);
      warped[idx + 3] = 255;

      // Sample paper background outside creature mask (near outer margin where kids rarely scribble)
      if (
        tpl.mask[y * tplSize + x] === 0 &&
        (x < 24 || x >= tplSize - 24 || y < 24 || y >= tplSize - 24) &&
        (x + y) % 4 === 0
      ) {
        paperR.push(r);
        paperG.push(g);
        paperB.push(b);
      }
    }
  }

  const percentile80 = (vals: number[]): number => {
    if (vals.length === 0) return 255;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.8)]!;
  };
  const whiteR = Math.max(120, percentile80(paperR));
  const whiteG = Math.max(120, percentile80(paperG));
  const whiteB = Math.max(120, percentile80(paperB));
  const gainR = 252 / whiteR;
  const gainG = 252 / whiteG;
  const gainB = 252 / whiteB;

  const { x: cx, y: cy, width: cw, height: ch } = tpl.cropRect;
  const output = createRgbaImage(cw, ch);

  for (let dy = 0; dy < ch; dy++) {
    const sy = cy + dy;
    for (let dx = 0; dx < cw; dx++) {
      const sx = cx + dx;
      const tIdx = sy * tplSize + sx;
      if (tpl.mask[tIdx] === 0) {
        continue;
      }
      const sIdx = tIdx * 4;
      const nr = Math.min(255, Math.round(warped[sIdx]! * gainR));
      const ng = Math.min(255, Math.round(warped[sIdx + 1]! * gainG));
      const nb = Math.min(255, Math.round(warped[sIdx + 2]! * gainB));

      // Composite crisp smoothed original black outline on top
      const lineAlpha = tpl.outlineAlpha[tIdx]! / 255;
      const keep = 1 - lineAlpha;
      const outIdx = (dy * cw + dx) * 4;
      output.data[outIdx] = Math.round(nr * keep);
      output.data[outIdx + 1] = Math.round(ng * keep);
      output.data[outIdx + 2] = Math.round(nb * keep);
      output.data[outIdx + 3] = 255;
    }
  }

  return output;
}

/**
 * Auto-detects the 4 corner finder markers, resolves sheet rotation and species
 * barcode, and returns the masked, white-balanced Doodle Texture.
 */
export function scanColoringSheet(input: RgbaImage): ScanResult {
  const binary = buildAdaptiveBinary(input);
  const candidates = detectFinderCandidates(binary, input.width, input.height);
  if (candidates.length < 4) {
    return { ok: false, reason: 'markers_not_found' };
  }

  const top = candidates.slice(0, Math.min(8, candidates.length));
  const minArea = input.width * input.height * 0.05;
  let bestQuad: QuadCorners | null = null;
  let bestScore = -1;

  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      for (let k = j + 1; k < top.length; k++) {
        for (let l = k + 1; l < top.length; l++) {
          const ordered = orderCornersClockwise([top[i]!, top[j]!, top[k]!, top[l]!]);
          const area = quadArea(ordered);
          if (area < minArea) continue;
          const hitSum = top[i]!.hits + top[j]!.hits + top[k]!.hits + top[l]!.hits;
          const score = hitSum * Math.sqrt(area);
          if (score > bestScore) {
            bestScore = score;
            bestQuad = ordered;
          }
        }
      }
    }
  }

  if (!bestQuad) {
    return { ok: false, reason: 'markers_not_found' };
  }

  for (let shift = 0; shift < 4; shift++) {
    const rotated: QuadCorners = [
      bestQuad[shift % 4]!,
      bestQuad[(shift + 1) % 4]!,
      bestQuad[(shift + 2) % 4]!,
      bestQuad[(shift + 3) % 4]!,
    ];
    const invH = computeHomography(CANONICAL_CORNERS, rotated);
    if (!invH) continue;
    const speciesId = decodeBarcodeAndSpecies(input, invH);
    if (speciesId) {
      return {
        ok: true,
        speciesId,
        texture: extractDoodleTexture(input, rotated, speciesId),
        detectedCorners: rotated,
      };
    }
  }

  return { ok: false, reason: 'barcode_unreadable' };
}
