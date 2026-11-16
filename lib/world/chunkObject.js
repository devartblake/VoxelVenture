// A baked chunk as three.js objects (roadmap task 11, slice 3; docs/world/streaming_runtime.md): one Group holding up to three meshes (ground, roads, highways) made from chunkMesh.js arrays.
// No React and no `import 'three'` here: the caller passes the THREE namespace, so the same code runs in the game, on the dev page and (with three installed) in a Node test. The materials are
// shared by every chunk (made once with createChunkMaterials) and are NOT disposed with a chunk; the geometries are, by disposeChunkObject, so letting a chunk go frees its memory.
import { BRIDGE, bridgePlacements, chunkMeshes } from './chunkMesh';

/** The three materials every chunk shares. Roads and highways are pulled a little toward the camera (polygon offset), so a ribbon laid a hair above the ground never flickers through it. */
export function createChunkMaterials(THREE) {
  const lay = (factor) => ({ polygonOffset: true, polygonOffsetFactor: -factor, polygonOffsetUnits: -factor });
  return {
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    roads: new THREE.MeshStandardMaterial({ color: '#3b4252', roughness: 0.95, metalness: 0, ...lay(1) }),
    highways: new THREE.MeshStandardMaterial({ color: '#c9971c', roughness: 0.9, metalness: 0, ...lay(2) }),
  };
}

/**
 * The Group for one chunk, named `chunk-<cx>_<cz>`, with `userData.chunk` the key and `userData.triangles` its triangle count. A mesh with no triangles is not made.
 * `options.models` ({ deck, pillar }, each { geometry, material }: the Kenney City Kit (Roads) bridge deck and pillar, loaded by the caller) draws a causeway's bridge from the models, as instanced meshes
 * (one for the deck tiles, one for the pillars) that SHARE the models' geometry and material; without models the bridge is a flat ribbon in the highways mesh.
 */
export function buildChunkObject(THREE, chunk, materials, options = {}) {
  const models = options.models ?? null;
  const meshes = options.meshes ?? chunkMeshes(chunk, { bridges: models ? 'models' : 'ribbon' });
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
  if (models) {
    const { tiles, pillars } = bridgePlacements(chunk);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const instanced = (name, model, list, place) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(model.geometry, model.material, list.length);
      mesh.name = `${group.name}:${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      list.forEach((item, i) => { place(item); mesh.setMatrixAt(i, matrix); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.sharedGeometry = true; // the geometry and material belong to the loaded model, not to this chunk
      group.add(mesh);
      triangles += (model.geometry.index ? model.geometry.index.count / 3 : model.geometry.attributes.position.count / 3) * list.length;
    };
    // a deck tile: the model's road runs along its Z and its surface is at y 0.51, so it is turned to the road (yaw), tilted to the slope (pitch), stretched to the tile (width across, length along, depth up)
    instanced('deck', models.deck, tiles, (t) => {
      euler.set(-t.pitch, t.yaw, 0, 'YXZ');
      quaternion.setFromEuler(euler);
      position.set(t.x, t.y - BRIDGE.surface * BRIDGE.depth, t.z);
      scale.set(t.width, BRIDGE.depth, t.length);
      matrix.compose(position, quaternion, scale);
    });
    // a pillar: the model stands on y 0 and is 0.5 tall; it is stretched to run from the shallows up into the deck
    instanced('pillars', models.pillar, pillars, (p) => {
      quaternion.identity();
      position.set(p.x, p.y0, p.z);
      scale.set(p.foot, (p.y1 - p.y0) / BRIDGE.pillarModelHeight, p.foot);
      matrix.compose(position, quaternion, scale);
    });
  }
  group.userData = { chunk: `${chunk.cx}_${chunk.cz}`, triangles };
  return group;
}

/** Frees a chunk instance buffers and geometries (the shared materials, and a bridge model geometry, stay). Returns how many meshes were freed. */
export function disposeChunkObject(group) {
  let n = 0;
  for (const child of [...group.children]) {
    if (child.isInstancedMesh) child.dispose(); // its instance buffers
    if (!child.userData?.sharedGeometry) child.geometry?.dispose();
    group.remove(child);
    n++;
  }
  return n;
}
