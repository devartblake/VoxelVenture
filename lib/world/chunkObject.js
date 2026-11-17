// A baked chunk as three.js objects (roadmap task 11, slice 3; docs/world/streaming_runtime.md): one Group holding up to three meshes (ground, roads, highways) made from chunkMesh.js arrays.
// No React and no `import 'three'` here: the caller passes the THREE namespace, so the same code runs in the game, on the dev page and (with three installed) in a Node test. The materials are
// shared by every chunk (made once with createChunkMaterials) and are NOT disposed with a chunk; the geometries are, by disposeChunkObject, so letting a chunk go frees its memory.
import { BRIDGE, bridgePlacements, chunkMeshes } from './chunkMesh';
import { ANCHOR, FLOOD } from './track';
import { LIFT } from './datum';

/** The three materials every chunk shares. Roads and highways are pulled a little toward the camera (polygon offset), so a ribbon laid a hair above the ground never flickers through it. */
export function createChunkMaterials(THREE) {
  const lay = (factor) => ({ polygonOffset: true, polygonOffsetFactor: -factor, polygonOffsetUnits: -factor });
  return {
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    roads: new THREE.MeshStandardMaterial({ color: '#3b4252', roughness: 0.95, metalness: 0, ...lay(1) }),
    highways: new THREE.MeshStandardMaterial({ color: '#c9971c', roughness: 0.9, metalness: 0, ...lay(2) }),
    track: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, ...lay(3) }), // a circuit's paint, in layers 0.03 apart: pulled toward the camera so they do not flicker
  };
}

/**
 * The Group for one chunk, named `chunk-<cx>_<cz>`, with `userData.chunk` the key and `userData.triangles` its triangle count. A mesh with no triangles is not made.
 * `options.models` ({ deck, pillar }, each { geometry, material }: the Kenney City Kit (Roads) bridge deck and pillar, loaded by the caller) draws a causeway's bridge from the models, as instanced meshes
 * (one for the deck tiles, one for the pillars) that SHARE the models' geometry and material; without models the bridge is a flat ribbon in the highways mesh.
 */
export function buildChunkObject(THREE, chunk, materials, options = {}) {
  const models = options.models ?? null;
  const meshes = options.meshes ?? chunkMeshes(chunk, { bridges: models?.deck ? 'models' : 'ribbon' });
  const group = new THREE.Group();
  group.name = `chunk-${chunk.cx}_${chunk.cz}`;
  let triangles = 0;
  for (const kind of ['ground', 'roads', 'highways', 'track']) {
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
  if (models?.props && chunk.props) {
    // the racing track: every placed model (tile, barrier, grandstand...) in this chunk, one instanced mesh for each kind of model, sharing the model's geometry and material
    const byModel = new Map();
    for (const p of chunk.props) if (models.props[p.m]) byModel.set(p.m, [...(byModel.get(p.m) ?? []), p]);
    const matrix = new THREE.Matrix4(), place = new THREE.Matrix4(), shift = new THREE.Matrix4();
    const position = new THREE.Vector3(), scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [name, list] of byModel) {
      const model = models.props[name];
      const mesh = new THREE.InstancedMesh(model.geometry, model.material, list.length);
      mesh.name = `${group.name}:${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const [ax, az] = ANCHOR[name] ?? [0, 0];
      list.forEach((p, i) => {
        // T(position) * Ry(yaw) * S(scale) * T(-anchor): the model is turned about its anchor (a tile about its centre) and put where the placement says
        position.set(p.x, LIFT.prop, p.z); // a hair above the ground (lib/world/datum.js): the kit's tiles have a base at height 0, which would flicker against our ground
        quaternion.setFromAxisAngle(up, p.yaw);
        scale.set(p.s, p.s, p.s);
        place.compose(position, quaternion, scale);
        shift.makeTranslation(-ax, 0, -az);
        matrix.multiplyMatrices(place, shift);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.sharedGeometry = true;
      group.add(mesh);
      triangles += (model.geometry.index ? model.geometry.index.count / 3 : model.geometry.attributes.position.count / 3) * list.length;
    }
  }
  if (models?.deck) {
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
    // (a styled bridge's deck is not made of these tiles: its own girder is drawn by apps/web/components/world/Suspension.jsx or ArchBridge.jsx)
    instanced('deck', models.deck, tiles.filter((t) => !t.styled), (t) => {
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
  // night: the street lamps (the track's, and the bridges') each get a pool of light on the road, an additive disc that is dark by day (its brightness is a glow the game's DayNight drives:
  // components/city/nightLights.js). The bridge's own lamps are lightPostModern posts along its edges.
  if (models?.props?.lightPostModern && models.deck) {
    const { lamps } = bridgePlacements(chunk);
    if (lamps.length) {
      const model = models.props.lightPostModern;
      const mesh = new THREE.InstancedMesh(model.geometry, model.material, lamps.length);
      mesh.name = `${group.name}:bridge-lamps`;
      const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), sc = new THREE.Vector3(BRIDGE.lampScale, BRIDGE.lampScale, BRIDGE.lampScale), q = new THREE.Quaternion(), upv = new THREE.Vector3(0, 1, 0);
      // the model's post is not at its origin (ANCHOR in track.js: the Racing Kit's offset), so it is shifted to stand where the lamp is placed
      const [lax, laz] = ANCHOR.lightPostModern, place = new THREE.Matrix4(), lift = new THREE.Matrix4().makeTranslation(-lax, 0, -laz);
      lamps.forEach((l, i) => { pos.set(l.x, l.y, l.z); q.setFromAxisAngle(upv, l.yaw); place.compose(pos, q, sc); m4.multiplyMatrices(place, lift); mesh.setMatrixAt(i, m4); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.sharedGeometry = true;
      group.add(mesh);
    }
  }
  if (models?.floodPool) {
    // the stadium lights: a wide pool of light under each mast, reaching out over the road
    const floods = (chunk.props ?? []).filter((p) => p.m === 'lightPostLarge');
    if (floods.length) {
      const mesh = new THREE.InstancedMesh(models.floodPool.geometry, models.floodPool.material, floods.length);
      mesh.name = `${group.name}:flood-pools`;
      mesh.renderOrder = 4;
      const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), sc = new THREE.Vector3(FLOOD.pool, 1, FLOOD.pool), q = new THREE.Quaternion();
      floods.forEach((p, i) => { pos.set(p.x + Math.sin(p.yaw) * FLOOD.towards, 0.16, p.z + Math.cos(p.yaw) * FLOOD.towards); m4.compose(pos, q, sc); mesh.setMatrixAt(i, m4); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.sharedGeometry = true;
      group.add(mesh);
    }
  }
  if (models?.pool) {
    const lights = [];
    for (const p of chunk.props ?? []) if (p.m === 'lightPostModern') lights.push({ x: p.x, z: p.z, y: 0.12, yaw: p.yaw });
    if (models.deck) for (const l of bridgePlacements(chunk).lamps) lights.push({ x: l.x, z: l.z, y: l.y + 0.12, yaw: l.yaw });
    if (lights.length) {
      const mesh = new THREE.InstancedMesh(models.pool.geometry, models.pool.material, lights.length);
      mesh.name = `${group.name}:light-pools`;
      mesh.renderOrder = 5;
      const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), sc = new THREE.Vector3(9, 1, 9), q = new THREE.Quaternion();
      lights.forEach((l, i) => { pos.set(l.x + Math.sin(l.yaw) * 3.2, l.y, l.z + Math.cos(l.yaw) * 3.2); m4.compose(pos, q, sc); mesh.setMatrixAt(i, m4); }); // 3.2 out along the arm, over the road
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.sharedGeometry = true;
      group.add(mesh);
    }
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
