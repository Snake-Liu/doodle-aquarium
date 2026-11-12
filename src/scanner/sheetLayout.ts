export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Canonical coordinate system for the Coloring Sheet scan region (512 x 512).
 * Both the printable sheet renderer and the camera perspective-warp scanner share
 * these exact coordinates so no layout constant is ever duplicated.
 */
export const SHEET_LAYOUT = {
  canonicalSize: 512,
  markerSize: 42,
  markerModuleRatio: 7, // 1:1:3:1:1 finder pattern
  markers: {
    tl: { x: 34, y: 34 },
    tr: { x: 478, y: 34 },
    br: { x: 478, y: 478 },
    bl: { x: 34, y: 478 },
  },
  barcode: {
    x: 96,
    y: 20,
    width: 320,
    height: 28,
    cellCount: 10, // [1, 0, ...6 species bits..., 1, 1]
    startSync: [1, 0] as const,
    endSync: [1, 1] as const,
  },
  templateBox: {
    x: 64,
    y: 92,
    size: 384,
  },
  /** Printable A4 sheet dimensions at ~150 DPI */
  printPage: {
    width: 1240,
    height: 1754,
    scanFrameX: 90,
    scanFrameY: 360,
    scanFrameSize: 1060,
  },
} as const;
