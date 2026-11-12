import { describe, expect, it } from 'vitest';
import {
  createColoringSheet,
  extractDoodleTexture,
  scanColoringSheet,
} from './scanColoringSheet';
import { applyHomography, computeHomography, type QuadCorners } from './homography';
import { createRgbaImage, type RgbaImage } from '../domain/image';
import { SPECIES_IDS } from '../domain/species';
import { getSpeciesTemplateMask } from '../domain/templates';
import { SHEET_LAYOUT } from './sheetLayout';

function paintDisk(
  img: RgbaImage,
  cx: number,
  cy: number,
  radius: number,
  rgb: readonly [number, number, number],
): void {
  const [r, g, b] = rgb;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(img.height - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(img.width - 1, Math.ceil(cx + radius)); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        const idx = (y * img.width + x) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
  }
}

describe('Coloring sheet creation & scanning seam', () => {
  it('auto-detects clownfish from a colored canonical sheet and clips exterior transparent', () => {
    const sheet = createColoringSheet('clownfish');
    // Paint vivid coral-red crayon spot inside the center of the clownfish body
    const bodyCenterX = SHEET_LAYOUT.templateBox.x + 192;
    const bodyCenterY = SHEET_LAYOUT.templateBox.y + 192;
    paintDisk(sheet, bodyCenterX, bodyCenterY, 18, [235, 65, 45]);

    const result = scanColoringSheet(sheet);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.speciesId).toBe('clownfish');

    const { cropRect } = getSpeciesTemplateMask('clownfish');
    expect(result.texture.width).toBe(cropRect.width);
    expect(result.texture.height).toBe(cropRect.height);

    // Center pixel in cropped texture should preserve the red crayon color
    const localX = 192 - cropRect.x;
    const localY = 192 - cropRect.y;
    const centerIdx = (localY * result.texture.width + localX) * 4;
    expect(result.texture.data[centerIdx]).toBeGreaterThan(190);
    expect(result.texture.data[centerIdx + 1]).toBeLessThan(110);
    expect(result.texture.data[centerIdx + 3]).toBe(255);

    // Top-left corner of cropped bounding box is outside the clownfish silhouette -> transparent
    expect(result.texture.data[3]).toBe(0);
  });

  it('distinguishes all 6 species, keeps interior paper-white opaque, and preserves crab open-stroke legs', () => {
    for (const speciesId of SPECIES_IDS) {
      const sheet = createColoringSheet(speciesId);
      const result = scanColoringSheet(sheet);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.speciesId).toBe(speciesId);

      // Verify interior uncolored pixels stay opaque white
      let opaqueWhiteCount = 0;
      for (let i = 0; i < result.texture.data.length; i += 4) {
        if (
          result.texture.data[i + 3] === 255 &&
          result.texture.data[i]! > 220 &&
          result.texture.data[i + 1]! > 220 &&
          result.texture.data[i + 2]! > 220
        ) {
          opaqueWhiteCount++;
        }
      }
      expect(opaqueWhiteCount).toBeGreaterThan(2000);
    }

    // Specifically verify crab's bottom-left & bottom-right legs are preserved as opaque pixels
    const crabScan = scanColoringSheet(createColoringSheet('crab'));
    expect(crabScan.ok).toBe(true);
    if (!crabScan.ok) return;
    const h = crabScan.texture.height;
    const w = crabScan.texture.width;
    let bottomLegInkPixels = 0;
    for (let y = Math.floor(h * 0.78); y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (crabScan.texture.data[idx + 3] === 255 && crabScan.texture.data[idx]! < 80) {
          bottomLegInkPixels++;
        }
      }
    }
    expect(bottomLegInkPixels).toBeGreaterThan(80);
  });

  it('recovers species and white-balanced texture under perspective tilt, 90deg rotation, dim warm lighting, and out-of-bounds scribbles', () => {
    const sheet = createColoringSheet('turtle');
    // Paint green inside turtle center and messy blue outside turtle in upper-left margin
    paintDisk(sheet, SHEET_LAYOUT.templateBox.x + 190, SHEET_LAYOUT.templateBox.y + 190, 22, [40, 185, 95]);
    paintDisk(sheet, SHEET_LAYOUT.templateBox.x + 16, SHEET_LAYOUT.templateBox.y + 180, 14, [30, 90, 230]);

    // Simulate a 680x620 camera photo with 90deg clockwise rotation + perspective keystone + dark table
    const photo = createRgbaImage(680, 620, [58, 42, 30, 255]);
    const sheetQuad: QuadCorners = [
      { x: 0, y: 0 },
      { x: 511, y: 0 },
      { x: 511, y: 511 },
      { x: 0, y: 511 },
    ];
    // Rotated 90deg CW with keystone tilt
    const photoQuad: QuadCorners = [
      { x: 550, y: 70 },
      { x: 590, y: 510 },
      { x: 110, y: 545 },
      { x: 135, y: 95 },
    ];
    const invH = computeHomography(photoQuad, sheetQuad);
    expect(invH).not.toBeNull();
    if (!invH) return;

    // Bounding scan over photo to rasterize warped sheet under dim warm indoor lighting
    for (let y = 50; y < 560; y++) {
      for (let x = 90; x < 610; x++) {
        const sp = applyHomography(invH, x, y);
        if (sp.x >= 0 && sp.x < 512 && sp.y >= 0 && sp.y < 512) {
          const sx = Math.round(sp.x);
          const sy = Math.round(sp.y);
          const sIdx = (sy * 512 + sx) * 4;
          const pIdx = (y * 680 + x) * 4;
          // Apply warm dim uneven lighting gradient across paper
          const lightFactor = 0.65 + 0.15 * (x / 680);
          photo.data[pIdx] = Math.round(sheet.data[sIdx]! * lightFactor);
          photo.data[pIdx + 1] = Math.round(sheet.data[sIdx + 1]! * lightFactor * 0.92);
          photo.data[pIdx + 2] = Math.round(sheet.data[sIdx + 2]! * lightFactor * 0.78);
          photo.data[pIdx + 3] = 255;
        }
      }
    }

    const result = scanColoringSheet(photo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.speciesId).toBe('turtle');

    // Green crayon inside shell should be preserved and white-balanced
    const { cropRect } = getSpeciesTemplateMask('turtle');
    const localX = 190 - cropRect.x;
    const localY = 190 - cropRect.y;
    const cIdx = (localY * result.texture.width + localX) * 4;
    expect(result.texture.data[cIdx + 1]).toBeGreaterThan(result.texture.data[cIdx]! + 40);
    expect(result.texture.data[cIdx + 3]).toBe(255);

    // Out-of-bounds blue scribble must be clipped away (top-left exterior transparent)
    expect(result.texture.data[3]).toBe(0);
  });

  it('reports structured errors on unreadable inputs and supports manual 4-corner extraction fallback', () => {
    const blank = createRgbaImage(320, 240, [240, 240, 240, 255]);
    const blankScan = scanColoringSheet(blank);
    expect(blankScan).toEqual({ ok: false, reason: 'markers_not_found' });

    // Sheet with markers intact but barcode erased -> barcode_unreadable
    const corrupted = createColoringSheet('dolphin');
    for (let y = SHEET_LAYOUT.barcode.y; y < SHEET_LAYOUT.barcode.y + SHEET_LAYOUT.barcode.height; y++) {
      for (let x = SHEET_LAYOUT.barcode.x; x < SHEET_LAYOUT.barcode.x + SHEET_LAYOUT.barcode.width; x++) {
        const idx = (y * corrupted.width + x) * 4;
        corrupted.data[idx] = 255;
        corrupted.data[idx + 1] = 255;
        corrupted.data[idx + 2] = 255;
      }
    }
    const corruptedScan = scanColoringSheet(corrupted);
    expect(corruptedScan).toEqual({ ok: false, reason: 'barcode_unreadable' });

    // Manual 4-corner fallback extracts texture cleanly even without barcode
    paintDisk(corrupted, SHEET_LAYOUT.templateBox.x + 192, SHEET_LAYOUT.templateBox.y + 185, 16, [55, 130, 240]);
    const manualCorners: QuadCorners = [
      SHEET_LAYOUT.markers.tl,
      SHEET_LAYOUT.markers.tr,
      SHEET_LAYOUT.markers.br,
      SHEET_LAYOUT.markers.bl,
    ];
    const manualTex = extractDoodleTexture(corrupted, manualCorners, 'dolphin');
    const { cropRect } = getSpeciesTemplateMask('dolphin');
    const cIdx = ((185 - cropRect.y) * manualTex.width + (192 - cropRect.x)) * 4;
    expect(manualTex.data[cIdx + 2]).toBeGreaterThan(180);
  });
});
