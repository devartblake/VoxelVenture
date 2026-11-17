// The seabed and the water column (lib/world/seabed.js, docs/world/water.md): the profile of the floor, the light the water takes, the mesh made from the coast raster, and the shader that reads the same profile.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { imp, problemTally, root } from './helpers.mjs';
const B = await imp('world/seabed.js');
const S = await imp('world/seaDepth.js');
const D = await imp('world/datum.js');
const { bad, total } = problemTally();

// ---- the profile: on the shelf out to `shelf`, falling to the ocean floor by `reach`, never rising
const K = B.SEABED;
if (!(0 < K.shelf && K.shelf < K.reach && K.reach <= S.SEA_DEPTH.maxDist + 20)) bad('the shelf is inside the reach, and the reach is about the raster\'s', JSON.stringify(K));
if (!(D.OCEAN_FLOOR < D.SEA_FLOOR && D.SEA_FLOOR < D.SEA_LEVEL)) bad('the datum stacks the ocean floor under the shallows\' floor under the sea', '');
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
if (!near(B.seabedY(0), D.SEA_FLOOR - 0.05) || !near(B.seabedY(K.shelf), D.SEA_FLOOR - 0.05)) bad('the seabed is the shallows\' floor (a hair under) out to the shelf', `${B.seabedY(0)} ${B.seabedY(K.shelf)}`);
if (!near(B.seabedY(K.reach), D.OCEAN_FLOOR) || !near(B.seabedY(5000), D.OCEAN_FLOOR)) bad('the seabed is the ocean floor from the reach out', `${B.seabedY(K.reach)}`);
let prev = B.seabedY(0), worst = 0;
for (let d = 1; d <= 600; d++) { const y = B.seabedY(d); if (y > prev + 1e-12) bad('the seabed never rises going out to sea', `at ${d}`); worst = Math.max(worst, prev - y); prev = y; }
if (worst > 0.6) bad('the seabed has no cliff: it falls less than 0.6 in a unit', String(worst));
if (!(B.seabedY(0) < D.SEA_LEVEL && B.seabedY(0) > D.SEA_FLOOR - 0.5)) bad('the shelf is under the sea and a hair under the baked seabed (no z-fight)', '');
if (!near(B.waterDepth(0), D.SEA_LEVEL - B.seabedY(0)) || B.waterDepth(600) < 13) bad('the water is shallow at the coast and deep far out', `${B.waterDepth(0)} ${B.waterDepth(600)}`);

// ---- the water column (Beer-Lambert): more water, or a flatter look, takes more light; none takes none
if (B.absorbed(0) !== 0) bad('no water takes no light', '');
if (!(B.absorbed(1) < B.absorbed(5) && B.absorbed(5) < B.absorbed(13))) bad('deeper water takes more light', '');
if (!(B.absorbed(3, 1) < B.absorbed(3, 0.3))) bad('a flatter look through the water takes more light', '');
if (!(B.absorbed(1.2) < 0.3 && B.absorbed(13.7) > 0.9)) bad('the shallows are clear (you see the bottom) and the open sea is nearly opaque', `${B.absorbed(1.2)} ${B.absorbed(13.7)}`);
if (!near(B.absorbed(4, 0), B.absorbed(4, 0.12))) bad('a grazing look is capped, not infinite', '');

// ---- the colour: sand on the shelf, dark in the deep, always a byte
const sand = B.seabedColor(0), deep = B.seabedColor(600);
if (!(sand[0] > deep[0] + 100 && sand[2] > 100 && deep[2] < 90)) bad('the seabed is sand in the shallows and dark in the deep', `${sand} ${deep}`);
for (const d of [0, 50, 140, 300, 500, 900]) if (B.seabedColor(d).some((v) => !Number.isInteger(v) || v < 0 || v > 255)) bad('colours are bytes', String(d));

// ---- the mesh from a coast raster: a square island
const square = { id: 'sq', bounds: { x0: -100, x1: 100, z0: -100, z1: 100 }, coast: { points: [{ x: -100, z: -100 }, { x: 100, z: -100 }, { x: 100, z: 100 }, { x: -100, z: 100 }] } };
const field = S.shoreField([square], { x0: -800, x1: 800, z0: -800, z1: 800 }, { cell: 20, maxDist: 510 });
const mesh = B.seabedMesh(field);
const cells = field.w * field.h;
if (mesh.positions.length !== cells * 3 || mesh.colors.length !== cells * 3 || mesh.triangles !== (field.w - 1) * (field.h - 1) * 2 || mesh.indices.length !== mesh.triangles * 3) bad('one vertex a cell and two triangles a square', `${mesh.positions.length} ${mesh.triangles}`);
if (mesh.indices.some((i) => i >= cells)) bad('every index is a vertex', '');
let up = 0;
for (let t = 0; t < mesh.indices.length; t += 3) {
  const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[t + k] * 3);
  const p = mesh.positions;
  const nY = (p[b + 2] - p[a + 2]) * (p[c] - p[a]) - (p[b] - p[a]) * (p[c + 2] - p[a + 2]); // the y of the normal (b-a) x (c-a)
  if (nY > 0) up++;
}
if (up !== mesh.triangles) bad('every triangle faces up (seen from the sea)', `${up}/${mesh.triangles}`);
let lo = Infinity, hi = -Infinity;
for (let i = 1; i < mesh.positions.length; i += 3) { lo = Math.min(lo, mesh.positions[i]); hi = Math.max(hi, mesh.positions[i]); }
if (!near(hi, D.SEA_FLOOR - 0.05, 1e-4) || !near(lo, D.OCEAN_FLOOR, 1e-4)) bad('the mesh runs from the shelf down to the ocean floor', `${hi} ${lo}`);
const mid = (x, z) => { const i = Math.floor((x - field.x0) / field.cell), j = Math.floor((z - field.z0) / field.cell); return mesh.positions[(j * field.w + i) * 3 + 1]; };
if (!(mid(0, 0) === mid(50, 0) && mid(-780, -780) < mid(130, 0))) bad('under the island the floor is the shelf; far out it is lower', '');

// ---- the shader reads the same profile
const texture = new THREE.DataTexture(field.data, field.w, field.h, THREE.RedFormat, THREE.UnsignedByteType);
const material = new THREE.MeshStandardMaterial({ transparent: true });
const u = S.applySeaDepth(THREE, material, field, texture, undefined, { ...K, shallowY: D.SEA_FLOOR - 0.05, deepY: D.OCEAN_FLOOR, seaY: D.SEA_LEVEL });
const v = u.uBed.value, y = u.uBedY.value;
if (v.x !== K.shelf || v.y !== K.reach || v.z !== K.absorb || v.w !== K.tint || !near(y.x, D.SEA_FLOOR - 0.05) || y.y !== D.OCEAN_FLOOR || y.z !== D.SEA_LEVEL) bad('the shader\'s uniforms are the seabed\'s profile and the datum\'s heights', '');
const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
material.onBeforeCompile(shader);
if (!/exp\(-\(depth \/ cosView\) \* uBed\.z\)/.test(shader.fragmentShader) || !/cameraPosition/.test(shader.fragmentShader) || !/smoothstep\(uBed\.x, uBed\.y, d\)/.test(shader.fragmentShader)) bad('the shader works the water column out from the depth and the view', '');
const off = S.applySeaDepth(THREE, new THREE.MeshStandardMaterial(), field, texture);
if (off.uBed.value.z !== 0) bad('without a seabed the column is off (the distance shading alone)', '');

// ---- the real world
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const t0 = Date.now();
const real = S.shoreField(manifest.landmasses, { x0: manifest.ocean.x0, x1: manifest.ocean.x1, z0: manifest.ocean.z0, z1: manifest.ocean.z1 });
const rm = B.seabedMesh(real);
const ms = Date.now() - t0;
if (rm.triangles < 10000 || rm.triangles > 200000) bad('the world\'s seabed is a modest mesh', String(rm.triangles));
if (ms > 6000) bad('the world\'s seabed is made in a few seconds', `${ms} ms`);
console.log(`seabed: ${rm.triangles} triangles for the world (${real.w}x${real.h} cells), made with the raster in ${ms} ms`);
total();
