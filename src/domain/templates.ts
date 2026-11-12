import templateMasksRaw from './generated/templateMasks.json';
import type { SpeciesId } from './species';

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SpeciesTemplateMask {
  readonly size: number;
  readonly cropRect: CropRect;
  readonly mask: Uint8Array;
  readonly outlineAlpha: Uint8Array;
}

interface RawTemplateMaskEntry {
  readonly size: number;
  readonly cropRect: readonly number[];
  readonly maskRle: readonly number[];
  readonly outlineRle: readonly number[];
}

const rawCatalog = templateMasksRaw as unknown as Record<SpeciesId, RawTemplateMaskEntry>;
const cache = new Map<SpeciesId, SpeciesTemplateMask>();

function decodeRle(rle: readonly number[], length: number, scale = 1): Uint8Array {
  const out = new Uint8Array(length);
  let offset = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const val = (rle[i] ?? 0) * scale;
    const count = rle[i + 1] ?? 0;
    const end = Math.min(length, offset + count);
    out.fill(val, offset, end);
    offset = end;
  }
  return out;
}

export function getSpeciesTemplateMask(speciesId: SpeciesId): SpeciesTemplateMask {
  const cached = cache.get(speciesId);
  if (cached) {
    return cached;
  }
  const raw = rawCatalog[speciesId];
  const length = raw.size * raw.size;
  const [x = 0, y = 0, width = 0, height = 0] = raw.cropRect;
  const entry: SpeciesTemplateMask = {
    size: raw.size,
    cropRect: { x, y, width, height },
    mask: decodeRle(raw.maskRle, length, 1),
    outlineAlpha: decodeRle(raw.outlineRle, length, 85),
  };
  cache.set(speciesId, entry);
  return entry;
}
