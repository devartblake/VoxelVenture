// A baked chunk as three.js objects (roadmap task 11, slice 3; docs/world/streaming_runtime.md): one Group holding up to three meshes (ground, roads, highways) made from chunkMesh.js arrays.
// No React and no `import 'three'` here: the caller passes the THREE namespace, so the same code runs in the game, on the dev page and (with three installed) in a Node test. The materials are
// shared by every chunk (made once with createChunkMaterials) and are NOT disposed with a chunk; the geometries are, by disposeChunkObject, so letting a chunk go frees its memory.
import { chunkMeshes } from './chunkMesh';

/** The three materials every chunk shares. Roads and highways are pulled a little toward the camera (polygon offset), so a ribbon laid a hair above the ground never flickers through it. */
export function createChunkMaterials(THREE) {
  const lay = (factor) => ({ polygonOffset: true, polygonOffsetFactor: -factor, polygonOffsetUnits: -factor });
  return {
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    roads: new THREE.MeshStandardMaterial({ color: '#3b4252', roughness: 0.95, metalness: 0, ...lay(1) }),
    highways: new THREE.MeshStandardMaterial({ color: '#c9971c', roughness: 0.9, metalness: 0, ...lay(2) }),
  };
}

/** The Group for one chunk, named `chunk-<cx>_<cz>`, with `userData.chunk` the key and `userData.triangles` its triangle count. A mesh with no triangles is not made. */
export function buildChunkObject(THREE, chunk, materials, meshes = chunkMeshes(chunk)) {
  const group = new THREE.Group();
  group.name = `chunk-${chunk.cx}_${chunk.cz}`;
  let triangles = 0;
  for (const kind of ['ground', 'roads', 'highways']) {
    const m = meshes[kind];
    if (!m.triangles) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    if (m.colors) geometry.setAttribute('color', new THREE.BufferAttribute(m.colors, 3, true)); // 0-255 bytes, normalised to 0-1
    geometry.setIndex(new THREE.BufferAttribute(m.indices, 1));
    if (m.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3)); // the ground brings its own, the same either side of a chunk edge
    else geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[kind]);
    mesh.name = `${group.name}:${kind}`;
    mesh.receiveShadow = kind === 'ground';
    mesh.matrixAutoUpdate = false; // a chunk never moves
    mesh.updateMatrix();
    group.add(mesh);
    triangles += m.triangles;
  }
  group.userData = { chunk: `${chunk.cx}_${chunk.cz}`, triangles };
  return group;
}

/** Frees a chunk geometries (the shared materials stay). Returns how many were freed. */
export function disposeChunkObject(group) {
  let n = 0;
  for (const child of [...group.children]) { child.geometry?.dispose(); group.remove(child); n++; }
  return n;
}
