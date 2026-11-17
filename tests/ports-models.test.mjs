// The ports' Kenney models and the phone (lib/world/chunkObject.js, lib/world/ports.js, docs/world/ports_models.md): a desktop draws the models (instanced, sharing the model's geometry and material) in place of the boxes they replace;
// a phone draws the boxes alone and none of the decoration, so the triangles of a port chunk on a phone are the boxes' and nothing more. The real three.js builds the geometry (no WebGL is needed); the models are
// stand-ins with the real triangle counts.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { imp, problemTally, root } from './helpers.mjs';
const { PORT_MODELS } = await imp('world/ports.js');
const { buildChunkObject, createChunkMaterials } = await imp('world/chunkObject.js');
const { chunkMeshes, meshCost } = await imp('world/chunkMesh.js');
const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { PROFILES } = await imp('world/chunkManager.js');
const { bad, total } = problemTally();
const TRIS = { 'ctr-a': 402, 'ctr-b': 402, 'ctr-c': 402, tank: 566, 'boat-row': 168, 'boat-row-l': 174, 'boat-fish': 237, 'boat-sail': 386, 'boat-speed': 156, 'boat-tug': 576, buoy: 118, ramp: 128, barrel: 148, crate: 76, palm: 186 };
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const materials = createChunkMaterials(THREE);

// stand-in models: a geometry with the real triangle count, a shared material
const stand = (tris) => { const g = new THREE.BufferGeometry(); const n = tris * 3, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) pos[i * 3 + 1] = (i % 3) * 0.1; g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return { geometry: g, material: new THREE.MeshStandardMaterial() }; };
const props = Object.fromEntries(Object.keys(PORT_MODELS).map((k) => [k, stand(TRIS[k])]));
if (Object.keys(PORT_MODELS).some((k) => !TRIS[k])) bad('every port model has its triangle count in the test', '');
const models = { deck: null, props };

// the chunk of the Kingston port: the most models
const man = baked.manifest.ports.find((p) => p.id === 'kingston-harbour');
const at0 = baked.chunkAt(man.at.x, man.at.z);
let chunk = null, at = at0, most = -1;
for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { // (the port can stand across a chunk edge: take the neighbour chunk with the most of its models)
  const c = baked.manifest.chunks.find((x) => x.cx === at0.cx + dx && x.cz === at0.cz + dz) ? await baked.chunk(at0.cx + dx, at0.cz + dz) : null;
  const n = c?.props?.filter((q) => q.d).length ?? 0;
  if (n > most) { most = n; chunk = c; at = { cx: at0.cx + dx, cz: at0.cz + dz }; }
}
if (!chunk.structures?.length || !chunk.props?.some((p) => p.d)) bad('the port chunk has structures and models', `${at.cx}_${at.cz}`);

const full = buildChunkObject(THREE, chunk, materials, { models, detail: 'full' });
const low = buildChunkObject(THREE, chunk, materials, { models, detail: 'low' });
const none = buildChunkObject(THREE, chunk, materials, { models: null });
const instanced = (g) => g.children.filter((m) => m.isInstancedMesh);
const bridgesOf = (g) => g.children.find((m) => m.name.endsWith(':bridges'));

// ---- a phone: no port models, and the boxes the models would replace
if (instanced(low).some((m) => /ctr|tank|boat|buoy|barrel|crate|palm|ramp/.test(m.name))) bad('a phone draws no port model', instanced(low).map((m) => m.name).join());
if (low.userData.triangles !== none.userData.triangles) bad('a phone draws exactly what a world without the models draws (the boxes alone)', `${low.userData.triangles} ${none.userData.triangles}`);
const replaced = chunk.structures.filter((b) => b[10] === 1).length;
if (!replaced || bridgesOf(low).geometry.attributes.position.count !== bridgesOf(none).geometry.attributes.position.count) bad('a phone keeps the replaced boxes', String(replaced));

// ---- a desktop: the models instead of those boxes, plus the decoration
const around = [];
for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (baked.manifest.chunks.some((x) => x.cx === at0.cx + dx && x.cz === at0.cz + dz)) around.push(buildChunkObject(THREE, await baked.chunk(at0.cx + dx, at0.cz + dz), materials, { models, detail: 'full' }));
const names = [...new Set(around.flatMap(instanced).map((m) => m.name.split(':')[1]))];
for (const want of ['ctr-a', 'ctr-b', 'ctr-c', 'tank', 'boat-tug', 'buoy']) if (!names.includes(want)) bad('a desktop draws the models of the port chunk', `${want} in ${names.join()}`);
if (!(bridgesOf(full).geometry.attributes.position.count < bridgesOf(low).geometry.attributes.position.count)) bad('the boxes the models replace are left out when the models are drawn', '');
const modelTris = instanced(full).reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3) * m.count, 0);
if (!(full.userData.triangles > low.userData.triangles - 200)) bad('a desktop port chunk has more triangles than a phone one (the models cost more than the boxes they replace)', `${full.userData.triangles} ${low.userData.triangles}`);
if (modelTris > 20000) bad('the models of the Kingston chunk are under 20,000 triangles', String(modelTris));
for (const m of instanced(full)) if (m.geometry !== props[m.name.split(':')[1]]?.geometry && m.geometry !== models.props[m.name.split(':')[1]]?.geometry) bad('a model is instanced from the shared geometry (not copied for the chunk)', m.name);
// a boat sits on the water: its instances are at the sea level, a container on the deck
const tug = around.flatMap(instanced).find((m) => m.name.endsWith(':boat-tug'));
if (!tug) bad('the shipping port has a tug in the chunks round it', '');
const m4 = new THREE.Matrix4(), pos = new THREE.Vector3();
if (tug) tug.getMatrixAt(0, m4);
pos.setFromMatrixPosition(m4);
if (tug && !(pos.y < -0.2 && pos.y > -0.6)) bad('a boat floats at the sea level (-0.3), its keel in the water', String(pos.y));
const ctr = instanced(full).find((m) => m.name.endsWith(':ctr-a'));
ctr.getMatrixAt(0, m4); pos.setFromMatrixPosition(m4);
if (!(pos.y >= 0.45 && pos.y < 5)) bad('a container stands on the quay deck (half a unit up) or on another container', String(pos.y));

// ---- the phone profile's ring: the budget the owner set (mobile has to stay smooth)
if (!(PROFILES.phone.ring === 1 && PROFILES.phone.maxMounted <= 16)) bad('a phone mounts a ring of one (3 x 3 chunks, at most 16)', JSON.stringify(PROFILES.phone));
// the phone triangles of every port chunk are the ordinary chunk's (the boxes), under the busiest-chunk limit the mesh test sets
let worst = 0;
for (const p of baked.manifest.ports) { const c = await baked.chunk(...Object.values(baked.chunkAt(p.at.x, p.at.z))); const g = buildChunkObject(THREE, c, materials, { models, detail: 'low' }); worst = Math.max(worst, g.userData.triangles); }
if (worst > 5000) bad('a port chunk on a phone is under 5,000 triangles', String(worst));
void chunkMeshes; void meshCost;
console.log(`port models: Kingston chunk ${full.userData.triangles} triangles on a desktop (${modelTris} of them models), ${low.userData.triangles} on a phone; the worst port chunk on a phone ${worst}`);
total();
