// The baked roads' asphalt and lines (lib/world/roadTexture.js, docs/world/road_texture.md): the per-vertex line coordinates of every ribbon, the lines they make, and the shader patch.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { imp, problemTally, root } from './helpers.mjs';
const R = await imp('world/roadTexture.js');
const { chunkMeshes } = await imp('world/chunkMesh.js');
const { createChunkMaterials } = await imp('world/chunkObject.js');
const { bad, total } = problemTally();
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- the settings
const K = R.ROAD_TEXTURE;
if (!(K.dash.on < K.dash.period && K.dash.width > 0 && K.edge.inset > K.edge.width && K.lineFadeTo <= K.grainFadeTo && K.strength > 0 && K.strength <= 1)) bad('the settings are ordered: a dash is shorter than its period, the lines fade before the grain', JSON.stringify(K));
if (!fs.existsSync(path.join(root, 'apps/web/public/world/ground/asphalt.jpg'))) bad('the asphalt texture is shipped (ambientCG Asphalt031)', '');
if (!/Asphalt031/.test(fs.readFileSync(path.join(root, 'docs/licences/ambientcg/README.md'), 'utf8')) || !fs.existsSync(path.join(root, 'docs/licences/ambientcg/Asphalt031.html'))) bad('the asphalt is in the ambientCG provenance, with its page saved', '');

// ---- a ribbon's line coordinates: the left side is +, the right -, the half width, the distance along
const uv = R.ribbonRoadUv(6, 10, 4);
if (uv.length !== 12 || uv[0] !== 3 || uv[3] !== -3 || uv[1] !== 10 || uv[7] !== 14 || uv[2] !== 3 || uv[11] !== 3) bad('four vertices of [across, along, half width]', JSON.stringify(uv));

// ---- the lines
const L = (o, a, h) => R.lineAt(o, a, h);
if (!L(0, 1, 3).centre || L(0, 5, 3).centre || L(0.5, 1, 3).centre) bad('a centre dash is 3.6 on, 3.4 off, and narrow', '');
if (!L(0, 8, 3).centre || L(0, -1, 3).centre || !L(0, -6.5, 3).centre) bad('the dashes repeat every period, also behind the start', '');
if (!(L(2.58, 0, 3).edge && L(-2.58, 0, 3).edge && !L(0, 0, 3).edge && !L(1.5, 0, 3).edge)) bad('a wide road has an edge line each side, inset from the edge', '');
if (L(1.58, 0, 1.6).edge || L(0.58, 0, 2).edge) bad('a street, an arterial or a link has no edge lines (half width under 2.9)', '');

// ---- every ribbon of a real chunk has its coordinates
let checked = 0;
for (const key of ['1_0', '13_0', '-1_-1', '15_1']) {
  const f = path.join(root, 'apps/web/public/world/chunks', `${key}.json`);
  if (!fs.existsSync(f)) continue;
  const m = chunkMeshes(JSON.parse(fs.readFileSync(f, 'utf8')));
  for (const part of ['roads', 'highways']) {
    const mesh = m[part];
    if (!mesh.triangles) continue;
    checked++;
    const n = mesh.positions.length / 3;
    if (!mesh.roadUv || mesh.roadUv.length !== n * 3) { bad(`${part} of ${key}: a roadUv of 3 for every vertex`, `${mesh.roadUv?.length} for ${n}`); continue; }
    for (let i = 0; i < n; i += 4) {
      const h = mesh.roadUv[i * 3 + 2];
      if (!near(mesh.roadUv[i * 3], h) || !near(mesh.roadUv[(i + 1) * 3], -h) || !near(mesh.roadUv[(i + 2) * 3], h) || !near(mesh.roadUv[(i + 3) * 3], -h) || !(mesh.roadUv[(i + 2) * 3 + 1] > mesh.roadUv[i * 3 + 1])) { bad(`${part} of ${key}: each ribbon is [+h, -h, +h, -h] across, going along`, String(i)); break; }
    }
  }
}
if (checked < 3) bad('real chunks with roads and highways were checked', String(checked));
const cm = createChunkMaterials(THREE);
if (cm.roads.color.getHexString() !== K.base.street.slice(1) || cm.highways.color.getHexString() !== K.base.highway.slice(1)) bad('the road materials start from the asphalt colours (not the old slate and amber)', '');

// ---- the shader patch
for (const [kind, colour] of [['street', K.colours.street], ['highway', K.colours.highway]]) {
  const mat = new THREE.MeshStandardMaterial();
  R.applyRoadTexture(THREE, mat, new THREE.Texture(), kind);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
  mat.onBeforeCompile(shader);
  if (!/attribute vec3 roadUv/.test(shader.vertexShader) || !/vRoadUv = roadUv/.test(shader.vertexShader)) bad('the vertex shader passes the line coordinates on', kind);
  if (!/texture2D\(uAsphalt/.test(shader.fragmentShader) || !/uEdgeColour/.test(shader.fragmentShader) || !/mod\(vRoadUv\.y, uDash\.x\)/.test(shader.fragmentShader)) bad('the fragment shader draws the grain, the dashes and the edge lines', kind);
  if (/\bhalf\b/.test(shader.fragmentShader.replace(/uEdge/g, ''))) bad('no variable named half (a reserved word in GLSL)', kind);
  if (shader.uniforms.uLineColour.value.getHexString() !== colour.slice(1)) bad('the centre line is the road\'s kind colour', kind);
  if (mat.customProgramCacheKey() === new THREE.MeshStandardMaterial().customProgramCacheKey()) bad('the program has its own cache key', kind);
}
console.log(`road texture: ${checked} meshes of real chunks have their line coordinates`);
total();
