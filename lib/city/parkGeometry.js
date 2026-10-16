import { PARK_BORDER } from './cityGenerator';

// Shared by the park mesh (Park.jsx) and the collision map (collision.js), so what you see is what
// you bump into. Positions are relative to the park's centre.
export const PARK_GATE_WIDTH = 1.1; // opening in the hedge where each path enters
export const PARK_BENCH_OFFSETS = [
  [-1.2, -0.65],
  [1.2, -0.65],
  [-1.2, 0.65],
  [1.2, 0.65],
];
export const PARK_POND_RADIUS = 0.7;

// The hedge ring around the lawn, split in two on every side around the gate:
// [{ x, z, w, d }] with (x, z) the centre of each segment.
export function parkHedges(width, depth) {
  const lenX = (width - PARK_GATE_WIDTH) / 2;
  const lenZ = (depth - PARK_GATE_WIDTH) / 2;
  const hedges = [];
  for (const side of [-1, 1]) {
    for (const half of [-1, 1]) {
      hedges.push({ x: half * (PARK_GATE_WIDTH / 2 + lenX / 2), z: side * (depth / 2 - PARK_BORDER / 2), w: lenX, d: PARK_BORDER });
      hedges.push({ x: side * (width / 2 - PARK_BORDER / 2), z: half * (PARK_GATE_WIDTH / 2 + lenZ / 2), w: PARK_BORDER, d: lenZ });
    }
  }
  return hedges;
}
