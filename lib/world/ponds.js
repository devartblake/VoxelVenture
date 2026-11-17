// The ponds of the towns that are drawn from the baked world (docs/world/harbor_town.md): the first town draws its own lakes (apps/web/components/city/Lake.jsx: a sandy shore a hair over the ground and a sheet of
// water at the datum's TOWN_WATER over that), so the second town's are the same two flat rectangles, drawn by the streamed world. A pond is raised, not sunk: the datum keeps the town's ponds apart from the sea
// and the rivers (waterLevel('pond') is TOWN_WATER, the sea and the rivers are SEA_LEVEL). Pure (no three.js): positions and indices.
import { LIFT, TOWN_WATER } from './datum';

export const POND = { shore: 0.9, shoreY: 0.012 }; // the sand a pond has all round (Lake.jsx), and how far over the ground it lies

/** One flat rectangle, `rx` and `rz` its half sizes, turned by `yaw` about (x, z), at height y: appended to { positions, indices }. */
function quad(out, x, z, rx, rz, yaw, y) {
  const c = Math.cos(yaw), s = Math.sin(yaw), base = out.positions.length / 3;
  for (const [u, v] of [[-rx, -rz], [rx, -rz], [rx, rz], [-rx, rz]]) out.positions.push(x + u * c + v * s, y, z - u * s + v * c);
  out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2); // counter-clockwise seen from above
}

/** The manifest's ponds ([{ x, z, rx, rz, yaw }]) as two meshes: { shore, water }, each { positions: Float32Array, indices: Uint32Array }. */
export function pondMeshes(ponds) {
  const shore = { positions: [], indices: [] }, water = { positions: [], indices: [] };
  for (const p of ponds ?? []) {
    quad(shore, p.x, p.z, p.rx + POND.shore, p.rz + POND.shore, p.yaw ?? 0, POND.shoreY);
    quad(water, p.x, p.z, p.rx, p.rz, p.yaw ?? 0, TOWN_WATER);
  }
  const fin = (m) => ({ positions: Float32Array.from(m.positions), indices: Uint32Array.from(m.indices) });
  return { shore: fin(shore), water: fin(water) };
}

export const POND_LIFT_OK = POND.shoreY < TOWN_WATER && TOWN_WATER < LIFT.road; // (the water is over the shore and under the roads: a guard the test reads)
