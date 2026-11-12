import type { SpeciesId } from '../domain/species';

export interface MeshGridSpec {
  readonly verticesX: number;
  readonly verticesY: number;
  readonly baseWidth: number;
  readonly baseHeight: number;
}

type VertexDeformer = (
  nx: number,
  ny: number,
  baseWidth: number,
  baseHeight: number,
  phase: number,
  boost: number,
) => readonly [number, number];

const SPECIES_DEFORMERS: Record<SpeciesId, VertexDeformer> = {
  clownfish(nx, _ny, baseWidth, baseHeight, phase, boost) {
    // Head at nx=0, tail at nx=1
    const tailWeight = Math.pow(nx, 1.5);
    return [
      -Math.abs(Math.sin(phase - nx * 4.2)) * baseWidth * 0.018 * tailWeight,
      Math.sin(phase - nx * 4.2) * baseHeight * 0.095 * tailWeight * boost,
    ];
  },
  dolphin(nx, _ny, baseWidth, baseHeight, phase, boost) {
    const tailWeight = Math.pow(nx, 1.4);
    return [
      Math.cos(phase * 0.9 - nx * 2.0) * baseWidth * 0.012 * tailWeight,
      Math.sin(phase * 0.9 - nx * 3.6) * baseHeight * 0.09 * tailWeight * boost,
    ];
  },
  turtle(nx, ny, _baseWidth, baseHeight, phase, boost) {
    // Head at nx=1, flippers flap along top/bottom edges
    const finDist = Math.abs(ny - 0.5) * 2;
    const flap = Math.sin(phase * 0.85 + nx * 2.2) * baseHeight * 0.055 * finDist * boost;
    return [0, flap + Math.sin(phase * 0.6 - (1 - nx) * 2.5) * baseHeight * 0.025];
  },
  jellyfish(nx, ny, baseWidth, baseHeight, phase, boost) {
    const pulse = Math.sin(phase * 0.75);
    if (ny < 0.52) {
      const domeScale = 1 + pulse * 0.075 * boost;
      return [
        (nx - 0.5) * baseWidth * (domeScale - 1),
        -pulse * baseHeight * 0.045 * (1 - ny * 1.5) * boost,
      ];
    }
    const tentacleWeight = (ny - 0.45) / 0.55;
    return [
      Math.sin(phase * 1.35 - ny * 4.8 + (nx - 0.5) * 2.2) * baseWidth * 0.085 * tentacleWeight * boost,
      Math.cos(phase * 0.75 - ny * 2.5) * baseHeight * 0.02 * tentacleWeight,
    ];
  },
  squid(nx, ny, baseWidth, baseHeight, phase, boost) {
    const jet = Math.sin(phase * 0.95);
    if (ny < 0.54) {
      return [(nx - 0.5) * baseWidth * jet * 0.055 * boost, -jet * baseHeight * 0.025];
    }
    const armWeight = (ny - 0.48) / 0.52;
    return [
      Math.sin(phase * 1.75 - ny * 4.6 + (nx - 0.5) * 2.5) * baseWidth * 0.08 * armWeight * boost,
      0,
    ];
  },
  crab(nx, ny, baseWidth, baseHeight, phase, boost) {
    // Claws bob playfully at top; legs scuttle at bottom
    if (ny < 0.48) {
      const side = nx < 0.5 ? -1 : 1;
      return [0, Math.sin(phase * 1.4 + side * 0.9) * baseHeight * 0.05 * (1 - ny * 1.6) * boost];
    }
    if (ny > 0.62) {
      const legWeight = (ny - 0.62) / 0.38;
      return [Math.sin(phase * 2.6 + nx * 6.0) * baseWidth * 0.032 * legWeight * boost, 0];
    }
    return [0, 0];
  },
};

/**
 * Applies organic 2D swimming/pulsing/scuttling vertex deformation directly onto
 * a PixiJS MeshPlane `aPosition` Float32Array buffer.
 */
export function deformSpeciesMesh(
  data: Float32Array,
  spec: MeshGridSpec,
  speciesId: SpeciesId,
  phase: number,
  reactionActive: boolean,
): void {
  const { verticesX, verticesY, baseWidth, baseHeight } = spec;
  const cols = verticesX - 1;
  const rows = verticesY - 1;
  const boost = reactionActive ? 1.55 : 1.0;
  const deform = SPECIES_DEFORMERS[speciesId];

  let ptr = 0;
  for (let iy = 0; iy < verticesY; iy++) {
    const ny = iy / rows;
    const y0 = ny * baseHeight;
    for (let ix = 0; ix < verticesX; ix++) {
      const nx = ix / cols;
      const x0 = nx * baseWidth;
      const [dx, dy] = deform(nx, ny, baseWidth, baseHeight, phase, boost);
      data[ptr] = x0 + dx;
      data[ptr + 1] = y0 + dy;
      ptr += 2;
    }
  }
}
