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
