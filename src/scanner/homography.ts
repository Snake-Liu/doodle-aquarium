import type { Point2D } from './sheetLayout';

export type QuadCorners = readonly [Point2D, Point2D, Point2D, Point2D];

/** 3x3 homography matrix stored row-major: [h0..h8] with h8 = 1 */
export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Solves the projective transform mapping `src` quad points to `dst` quad points.
 * Uses Gaussian elimination with partial pivoting on an 8x8 linear system.
 */
export function computeHomography(src: QuadCorners, dst: QuadCorners): Matrix3 | null {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i]!.x;
    const sy = src[i]!.y;
    const dx = dst[i]!.x;
    const dy = dst[i]!.y;

    a.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    a.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(a[col]![col]!);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(a[row]![col]!);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = row;
      }
    }
    if (maxAbs < 1e-10) {
      return null;
    }
    if (pivotRow !== col) {
      [a[col], a[pivotRow]] = [a[pivotRow]!, a[col]!];
      [b[col], b[pivotRow]] = [b[pivotRow]!, b[col]!];
    }

    const pivot = a[col]![col]!;
    for (let row = col + 1; row < n; row++) {
      const factor = a[row]![col]! / pivot;
      if (factor === 0) continue;
      for (let k = col; k < n; k++) {
        a[row]![k]! -= factor * a[col]![k]!;
      }
      b[row]! -= factor * b[col]!;
    }
  }

  const h = new Array<number>(9).fill(1);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row]!;
    for (let k = row + 1; k < n; k++) {
      sum -= a[row]![k]! * h[k]!;
    }
    h[row] = sum / a[row]![row]!;
  }

  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(m: Matrix3, x: number, y: number): Point2D {
  const denom = m[6] * x + m[7] * y + m[8];
  if (Math.abs(denom) < 1e-9) {
    return { x: 0, y: 0 };
  }
  return {
    x: (m[0] * x + m[1] * y + m[2]) / denom,
    y: (m[3] * x + m[4] * y + m[5]) / denom,
  };
}
