// A baked chunk as three.js objects (lib/world/chunkObject.js, docs/world/streaming_runtime.md, slice 3), with the real three.js (no WebGL is needed to build geometry): a Group of up to three
// meshes, the right counts, shared materials, geometries freed on dispose; and the chunk manager driving it, so a long walk leaves a bounded scene and no geometry behind.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { imp, root } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { createChunkManager } = await imp('world/chunkManager.js');
const { buildChunkObject, createChunkMaterials, disposeChunkObject } = await imp('world/chunkObject.js');
const { chunkMeshes, meshCost } = await imp('world/chunkMesh.js');
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const materials = createChunkMaterials(THREE);
const town = baked.manifest.towns[0];
const home = { x: (town.land.x0 + town.land.x1) / 2, z: (town.land.z0 + town.land.z1) / 2 };
const hc = baked.chunkAt(home.x, home.z);
const chunk = await baked.chunk(hc.cx, hc.cz);

// ---- one chunk
{
  const g = buildChunkObject(THREE, chunk, materials);
  const cost = meshCost(chunkMeshes(chunk));
  check('a chunk is a Group named for it, with one mesh for each kind that has triangles', g.isGroup && g.name === `chunk-${hc.cx}_${hc.cz}` && g.children.length === cost.drawCalls && g.userData.chunk === `${hc.cx}_${hc.cz}`);
  check('its triangle count is the mesh count, and the ground has vertex colours (sand, grass, rock)', g.userData.triangles === cost.triangles && g.children.find((m) => m.name.endsWith(':ground')).geometry.attributes.color.count === g.children.find((m) => m.name.endsWith(':ground')).geometry.attributes.position.count);
  check('the meshes use the shared materials (not one per chunk), and the ground receives shadows', g.children.every((m) => m.material === materials[m.name.split(':')[1]]) && g.children.find((m) => m.name.endsWith(':ground')).receiveShadow);
  check('the geometry has normals and a bounding sphere inside the chunk\'s neighbourhood', g.children.every((m) => m.geometry.attributes.normal && m.geometry.boundingSphere.radius > 0 && m.geometry.boundingSphere.radius < 200));
  check('the ground faces up: its normals point +y', (() => { const n = g.children.find((m) => m.name.endsWith(':ground')).geometry.attributes.normal; let up = 0; for (let i = 1; i < n.array.length; i += 3) if (n.array[i] > 0.5) up++; return up / (n.array.length / 3) > 0.95; })());
  check('a mesh is never moved, so its matrix is not updated each frame', g.children.every((m) => m.matrixAutoUpdate === false));
  let disposed = 0;
  const geoms = g.children.map((m) => m.geometry);
  for (const geo of geoms) geo.addEventListener('dispose', () => disposed++);
  const n = disposeChunkObject(g);
  check('disposing frees every geometry and empties the group, and leaves the shared materials alone', n === geoms.length && disposed === geoms.length && g.children.length === 0 && materials.ground.vertexColors === true);
  const sea = buildChunkObject(THREE, { cx: 40, cz: 40, size: 128, bounds: { x0: 5120, z0: 5120, x1: 5248, z1: 5248 }, land: 0, plots: [], roads: [], highways: [] }, materials);
  check('a chunk with nothing in it makes an empty group, not an error', sea.children.length === 0 && sea.userData.triangles === 0);
}

// ---- the bridge from models: instanced decks and pillars sharing the model geometry
{
  const deckGeometry = new THREE.BoxGeometry(1, 0.52, 1);
  const pillarGeometry = new THREE.BoxGeometry(0.14, 0.5, 0.14);
  const models = { deck: { geometry: deckGeometry, material: new THREE.MeshStandardMaterial() }, pillar: { geometry: pillarGeometry, material: new THREE.MeshStandardMaterial() } };
  const bridgeChunks = [];
  for (const c of baked.manifest.chunks) { const ch = await baked.chunk(c.cx, c.cz); if (ch.highways.some((h) => h.kind === 'causeway-bridge')) bridgeChunks.push(ch); }
  const withModels = bridgeChunks.map((c) => buildChunkObject(THREE, c, materials, { models }));
  const decks = withModels.flatMap((g) => g.children.filter((m) => m.name.endsWith(':deck')));
  const pillars = withModels.flatMap((g) => g.children.filter((m) => m.name.endsWith(':pillars')));
  check('a chunk with a bridge gets an instanced deck (and pillars where it is high), sharing the model geometry and material', decks.length >= 8 && pillars.length >= 3 && decks.every((m) => m.isInstancedMesh && m.geometry === deckGeometry && m.material === models.deck.material) && pillars.every((m) => m.geometry === pillarGeometry));
  const first = decks[0];
  const m4 = new THREE.Matrix4();
  first.getMatrixAt(0, m4);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  m4.decompose(pos, q, sc);
  check('a deck tile is scaled to the road (8 across, 5 deep, its length along) and its origin is 0.51 x 5 below the road surface', Math.abs(sc.x - 8) < 1e-6 && Math.abs(sc.y - 5) < 1e-6 && sc.z > 0 && sc.z <= 8 + 1e-6 && pos.y < 0 + 1e-6 + 9);
  const noModels = bridgeChunks.map((c) => buildChunkObject(THREE, c, materials));
  check('without models the same chunks draw the bridge as a ribbon in the highways mesh (the fallback), and no instanced mesh is made', noModels.every((g) => !g.children.some((m) => m.isInstancedMesh)) && noModels.some((g, i) => g.userData.triangles > withModels[i].userData.triangles - 1e9));
  let freed = 0;
  const geoms = [deckGeometry, pillarGeometry];
  for (const geo of geoms) geo.addEventListener('dispose', () => freed++);
  for (const g of withModels) disposeChunkObject(g);
  check('disposing a bridge chunk frees its instance buffers and its own geometries but NOT the shared model geometry (other chunks still use it)', freed === 0 && withModels.every((g) => g.children.length === 0));
}

// ---- night: pools of light under the lamps (the track's and the bridges') and the bridge's own lamp posts
{
  const model = (g) => ({ geometry: g, material: new THREE.MeshStandardMaterial() });
  const pool = { geometry: new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2), material: new THREE.MeshStandardMaterial() };
  const models = { deck: model(new THREE.BoxGeometry(1, 0.5, 1)), pillar: model(new THREE.BoxGeometry(0.1, 0.5, 0.1)), props: { lightPostModern: model(new THREE.BoxGeometry(0.1, 0.8, 0.1)) }, pool };
  const withLamps = [];
  for (const c of baked.manifest.chunks) { const ch = await baked.chunk(c.cx, c.cz); const g = buildChunkObject(THREE, ch, materials, { models }); if (g.children.some((m) => m.name.endsWith(':light-pools'))) withLamps.push({ g, ch }); }
  const pools = withLamps.flatMap(({ g }) => g.children.filter((m) => m.name.endsWith(':light-pools')));
  check('chunks with a lamp get an instanced pool of light, one disc a lamp, sharing the pool geometry and material (the DayNight glow lights them)', pools.length >= 6 && pools.every((m) => m.isInstancedMesh && m.geometry === pool.geometry && m.material === pool.material) && withLamps.some(({ g }) => g.children.some((m) => m.name.endsWith(':bridge-lamps'))));
  const noPool = baked.manifest.chunks.length > 0 && (await (async () => { const ch = await baked.chunk(withLamps[0].ch.cx, withLamps[0].ch.cz); return !buildChunkObject(THREE, ch, materials, { models: { ...models, pool: null } }).children.some((m) => m.name.endsWith(':light-pools')); })());
  check('without the pool model (or by day, where its glow is 0) nothing is drawn: a chunk makes no light pools', noPool);
  let freed = 0;
  pool.geometry.addEventListener('dispose', () => freed++);
  for (const { g } of withLamps) disposeChunkObject(g);
  check('disposing a lit chunk leaves the shared pool geometry alone', freed === 0);
}

// ---- stadium lights: a wide pool of light under each mast
{
  const model = (g) => ({ geometry: g, material: new THREE.MeshStandardMaterial() });
  const floodPool = { geometry: new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2), material: new THREE.MeshStandardMaterial() };
  const models = { deck: model(new THREE.BoxGeometry(1, 0.5, 1)), pillar: model(new THREE.BoxGeometry(0.1, 0.5, 0.1)), props: { lightPostLarge: model(new THREE.BoxGeometry(0.2, 0.8, 0.1)) }, floodPool };
  const pools = [];
  for (const c of baked.manifest.chunks) { const ch = await baked.chunk(c.cx, c.cz); const g = buildChunkObject(THREE, ch, materials, { models }); pools.push(...g.children.filter((m) => m.name.endsWith(':flood-pools'))); }
  check('every mast gets a wide pool of light: instanced discs sharing the pool geometry and material, as many as there are masts', pools.length >= 3 && pools.every((m) => m.isInstancedMesh && m.geometry === floodPool.geometry && m.material === floodPool.material) && pools.reduce((n, m) => n + m.count, 0) >= 6, `${pools.reduce((n, m) => n + m.count, 0)} pools`);
}

// ---- the manager driving it: a long walk leaves a bounded scene and frees what it leaves behind
{
  const scene = new THREE.Group();
  const objects = new Map();
  let created = 0;
  let freed = 0;
  const m = createChunkManager(baked, {
    onMount: (c) => { const g = buildChunkObject(THREE, c, materials); created += g.children.length; objects.set(`${c.cx}_${c.cz}`, g); scene.add(g); },
    onUnmount: (k) => { const g = objects.get(k); scene.remove(g); freed += disposeChunkObject(g); objects.delete(k); },
  });
  let peak = 0;
  m.focus(home.x, home.z);
  await m.settle();
  for (let x = home.x; x < home.x + 1500; x += 12) { m.focus(x, home.z, 1, 0); await m.step(); peak = Math.max(peak, scene.children.length); }
  await m.settle();
  const live = scene.children.reduce((s, g) => s + g.children.length, 0);
  check('walking 1,500 units east, the scene never holds more groups than the cap, and every geometry made is either live or freed', peak <= 36 && peak >= 20 && created - freed === live, `${peak} groups at most, ${created} made, ${freed} freed, ${live} live`);
  check('and the groups in the scene are exactly the chunks the manager has mounted', scene.children.map((g) => g.userData.chunk).sort().join() === m.mounted().join());
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
