import type { SpeciesId } from '../domain/species';

export interface MeshGridSpec {
  readonly verticesX: number;
  readonly verticesY: number;
  readonly baseWidth: number;
  readonly baseHeight: number;
}

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

  let ptr = 0;
  for (let iy = 0; iy < verticesY; iy++) {
    const ny = iy / rows;
    const y0 = ny * baseHeight;
    for (let ix = 0; ix < verticesX; ix++) {
      const nx = ix / cols;
      const x0 = nx * baseWidth;

      let dx = 0;
      let dy = 0;

      switch (speciesId) {
        case 'clownfish': {
          // Head at nx=0, tail at nx=1
          const tailWeight = Math.pow(nx, 1.5);
          dy = Math.sin(phase - nx * 4.2) * baseHeight * 0.095 * tailWeight * boost;
          dx = -Math.abs(Math.sin(phase - nx * 4.2)) * baseWidth * 0.018 * tailWeight;
          break;
        }
        case 'dolphin': {
          // Head at nx=0, tail at nx=1
          const tailWeight = Math.pow(nx, 1.4);
          dy = Math.sin(phase * 0.9 - nx * 3.6) * baseHeight * 0.09 * tailWeight * boost;
          dx = Math.cos(phase * 0.9 - nx * 2.0) * baseWidth * 0.012 * tailWeight;
          break;
        }
        case 'turtle': {
          // Head at nx=1, back flippers at nx=0
          const finDist = Math.abs(ny - 0.5) * 2;
          const flap = Math.sin(phase * 0.85 + nx * 2.2) * baseHeight * 0.055 * finDist * boost;
          dy = flap + Math.sin(phase * 0.6 - (1 - nx) * 2.5) * baseHeight * 0.025;
          break;
        }
        case 'jellyfish': {
          const pulse = Math.sin(phase * 0.75);
          if (ny < 0.52) {
            const domeScale = 1 + pulse * 0.075 * boost;
            dx = (nx - 0.5) * baseWidth * (domeScale - 1);
            dy = -pulse * baseHeight * 0.045 * (1 - ny * 1.5) * boost;
          } else {
            const tentacleWeight = (ny - 0.45) / 0.55;
            dx =
              Math.sin(phase * 1.35 - ny * 4.8 + (nx - 0.5) * 2.2) *
              baseWidth *
              0.085 *
              tentacleWeight *
              boost;
            dy = Math.cos(phase * 0.75 - ny * 2.5) * baseHeight * 0.02 * tentacleWeight;
          }
          break;
        }
        case 'squid': {
          const jet = Math.sin(phase * 0.95);
          if (ny < 0.54) {
            dx = (nx - 0.5) * baseWidth * jet * 0.055 * boost;
            dy = -jet * baseHeight * 0.025;
          } else {
            const armWeight = (ny - 0.48) / 0.52;
            dx =
              Math.sin(phase * 1.75 - ny * 4.6 + (nx - 0.5) * 2.5) *
              baseWidth *
              0.08 *
              armWeight *
              boost;
          }
          break;
        }
        case 'crab': {
          // Claws bob playfully at top; legs scuttle at bottom
          if (ny < 0.48) {
            const side = nx < 0.5 ? -1 : 1;
            dy = Math.sin(phase * 1.4 + side * 0.9) * baseHeight * 0.05 * (1 - ny * 1.6) * boost;
          } else if (ny > 0.62) {
            const legWeight = (ny - 0.62) / 0.38;
            dx = Math.sin(phase * 2.6 + nx * 6.0) * baseWidth * 0.032 * legWeight * boost;
          }
          break;
        }
      }

      data[ptr] = x0 + dx;
      data[ptr + 1] = y0 + dy;
      ptr += 2;
    }
  }
}
