"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useFrame, useThree } from '@react-three/fiber';
import { loadBakedWorld } from '@/lib/world/bakedWorld';
import { createChunkManager } from '@/lib/world/chunkManager';
import { buildChunkObject, createChunkMaterials, disposeChunkObject } from '@/lib/world/chunkObject';
import { createTerrain, setActiveTerrain } from '@/lib/world/terrain';
import { TRACK_MODELS } from '@/lib/world/track';
import { PORT_MODELS } from '@/lib/world/ports';
import { MID_MADE, midModel } from '@/lib/world/portMid';
import { useFleet } from '@/lib/state/fleetStore';
import { applyGroundTexture } from '@/lib/world/groundTexture';
import { applyRoadTexture } from '@/lib/world/roadTexture';
import { SEA_LEVEL } from '@/lib/world/datum';
import { clipChunkToTown, insideTown, overlapsTown } from '@/lib/world/townJoin';
import { applySeaDepth, shoreField } from '@/lib/world/seaDepth';
import { SEABED, seabedMesh } from '@/lib/world/seabed';
import { applyRiverFx, riverWaterMesh } from '@/lib/world/riverWater';
import { pondMeshes } from '@/lib/world/ponds';
import { OCEAN_FLOOR, SEA_FLOOR } from '@/lib/world/datum';
import { registerGlow } from '@/components/city/nightLights';

// The streaming runtime React layer (roadmap task 11, slice 3; docs/world/streaming_runtime.md). Mounts the baked chunks (public/world, scripts/bake-world.mjs) near the camera or a point the
// caller gives, and disposes the ones left behind, one chunk a frame. It owns no game state: with no `focus` it follows the camera, and `skip(chunk)` lets a caller leave out chunks it draws itself
// (the game leaves out the first town own land while that town is still drawn by the generator code). Nothing renders until the manifest has loaded; a missing world (no bake) renders nothing.
//   window.__vvStreamedWorld: { ready, mounted, mounts, unmounts, loads, triangles, drawCalls, profile, focus } for the tests and the dev page.
const stats = { ready: false, mounted: 0, mounts: 0, unmounts: 0, loads: 0, triangles: 0, drawCalls: 0, profile: '', focus: null };
if (typeof window !== 'undefined') window.__vvStreamedWorld = stats;

// The causeway bridge models: the Kenney City Kit (Roads) deck and pillar (public/models/kenney/roads, CC0, docs/licences/kenney/). Loaded once and shared by every chunk; if they cannot be loaded the
// bridges are flat ribbons (chunkMesh.js), so nothing breaks.
let bridgeModels = null;
function loadBridgeModels() {
  bridgeModels ??= (async () => {
    const loader = new GLTFLoader();
    // a model is one geometry with a group for each of its materials (a track tile is road, kerb and grass; a flag is cloth and pole): every mesh of the file, in the file's own placement, merged
    const first = async (file) => {
      const gltf = await loader.loadAsync(`/models/kenney/roads/${file}`);
      gltf.scene.updateMatrixWorld(true);
      const parts = [];
      // a road tile carries its own grass, coplanar with the road: the ground is already grass, and two surfaces at one height flicker, so a tile's grass is left out (trees keep theirs: it is their leaves)
      gltf.scene.traverse((o) => { if (o.isMesh && !(/^road/.test(file.replace(/^.*\//, '')) && o.material?.name === 'grass')) parts.push(o); });
      if (!parts.length) throw new Error(`${file} has no mesh`);
      const geometries = parts.map((o) => {
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(name === 'uv' && parts.some((o) => o.material?.map))) g.deleteAttribute(name); // the racing kit's colours are in its materials, not textures; the industrial and watercraft kits' are in a colour map (the uv stays)
        return g;
      });
      const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, true);
      // the road surface is drawn over the tile's grey base, which is at the same height: pulled toward the camera it always wins
      const materials = parts.map((o) => { if (o.material?.name === 'road') { const m = o.material.clone(); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; return m; } return o.material; });
      return { geometry, material: materials.length === 1 ? materials[0] : materials };
    };
    const models = { deck: await first('road-bridge.glb'), pillar: await first('bridge-pillar-wide.glb'), props: null };
    // the racing track's models (Kenney Racing Kit, public/models/kenney/racing): a circuit that cannot load them stays a ribbon
    try {
      const entries = await Promise.all(TRACK_MODELS.map(async (name) => [name, await first(`../racing/${name}.glb`)]));
      models.props = Object.fromEntries(entries);
    } catch { models.props = null; }
    // the ports' models (lib/world/ports.js: Kenney Industrial, Watercraft, Pirate and Nature kits, CC0): containers, tanks, boats, buoys, cargo, palms. A world that cannot load them keeps the ports' boxes alone.
    try {
      const entries = await Promise.all(Object.entries(PORT_MODELS).map(async ([name, m]) => [name, await first(`../${m.file}.glb`)]));
      models.props = { ...(models.props ?? {}), ...Object.fromEntries(entries) };
    } catch { /* the boxes alone */ }
    // the mid tier (a phone, lib/world/portMid.js): small made models for the containers and the tanks, and the simplified copies of the others (public/world/lod, made by scripts/world/make-lods.mjs), flat shaded
    try {
      const mid = {};
      for (const name of MID_MADE) {
        const m = midModel(name), geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(m.indices, 1));
        mid[name] = { geometry, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }) };
      }
      const rest = Object.keys(PORT_MODELS).filter((name) => !MID_MADE.includes(name));
      const loaded = await Promise.all(rest.map(async (name) => {
        const model = await first(`../../../world/lod/${name}.glb`); // (relative to /models/kenney/roads: /world/lod)
        model.material = [].concat(model.material).map((mat) => { const c = mat.clone(); c.flatShading = true; return c; }); // (the simplified copies have no normals: the shader works the face normal out)
        return [name, model];
      }));
      models.propsMid = { ...mid, ...Object.fromEntries(loaded) };
    } catch { /* no mid tier: a phone draws the boxes */ }
    // night (components/city/nightLights.js drives these with the game's own dusk): the lamp heads and the pit windows glow, and each lamp throws a pool of light on the road
    if (models.props) {
      const warm = (material, night, day = 0) => { const m = material.clone(); m.emissive.set('#ffe2a0'); registerGlow(m, { day, night }); return m; };
      const lamp = models.props.lightPostModern;
      if (lamp) lamp.material = [].concat(lamp.material).map((m) => (m.name === '_defaultMat' ? warm(m, 3.2, 0.15) : m));
      const mast = models.props.lightPostLarge;
      if (mast) mast.material = [].concat(mast.material).map((m) => (m.name === '_defaultMat' ? warm(m, 5, 0.2) : m)); // the lamp bank of a stadium mast
      const pits = models.props.pitsOffice;
      if (pits) pits.material = [].concat(pits.material).map((m) => (m.name === 'glass' ? warm(m, 1.3) : m));
      if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#808080');
        grad.addColorStop(1, '#000000');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(c);
        const geometry = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
        const material = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffc872', emissiveIntensity: 0, alphaMap: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
        registerGlow(material, { day: 0, night: 0.9 });
        models.pool = { geometry, material };
        // the stadium lights' pools: much wider, and a little dimmer where they overlap
        const floodMaterial = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#fff0d4', emissiveIntensity: 0, alphaMap: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        registerGlow(floodMaterial, { day: 0, night: 0.3 });
        models.floodPool = { geometry, material: floodMaterial };
      }
    }
    return models;
  })().catch(() => null);
  return bridgeModels;
}

export { SEA_LEVEL }; // the water plane (lib/world/datum.js): the shallows meet it a little out from the shore

export default function StreamedWorld({ base = '/world', profile = 'desktop', focus = null, skip = null, town = null, onReady = null, sea = true }) {
  const root = useRef(null);
  const camera = useThree((s) => s.camera);
  const materials = useMemo(() => createChunkMaterials(THREE), []);
  // the grain of the ground (lib/world/groundTexture.js): ambientCG's grass and dirt over the vertex colours; ?groundtex=0 turns it off (to compare)
  useEffect(() => {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('groundtex') === '0') return undefined;
    let alive = true;
    const loader = new THREE.TextureLoader();
    Promise.all([loader.loadAsync(`${base}/ground/grass.jpg`), loader.loadAsync(`${base}/ground/dirt.jpg`)])
      .then(([grass, dirt]) => { if (alive) applyGroundTexture(THREE, materials.ground, grass, dirt); })
      .catch(() => {}); // no textures: the vertex colours alone
    return () => { alive = false; };
  }, [base, materials]);
  // the asphalt and the lines of the roads (lib/world/roadTexture.js, docs/world/road_texture.md): ambientCG's Asphalt031 over the road colours, a dashed centre line and edge lines; ?roadtex=0 keeps the flat colours
  useEffect(() => {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('roadtex') === '0') return undefined;
    let alive = true;
    new THREE.TextureLoader().loadAsync(`${base}/ground/asphalt.jpg`)
      .then((tex) => { if (alive) { applyRoadTexture(THREE, materials.roads, tex, 'street'); applyRoadTexture(THREE, materials.highways, tex.clone(), 'highway'); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [base, materials]);
  const state = useRef({ manager: null, objects: new Map(), last: null, velocity: { x: 0, z: 0 } });
  const water = useRef(null);
  const seaMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1f6a99', roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.88 }), []);

  useEffect(() => {
    let cancelled = false;
    const st = state.current;
    const objects = st.objects;
    const parent = root.current; // the group is attached before an effect runs
    (async () => {
      let baked;
      try {
        baked = await loadBakedWorld(async (name) => { const r = await fetch(`${base}/${name}`); if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); });
      } catch { return; } // no baked world here: draw nothing
      const models = await loadBridgeModels(); // null when they cannot be loaded: the bridges are then ribbons
      if (cancelled) return;
      // the manager only knows the chunks the caller has not skipped
      // (and, with `town` (the first town's land), the chunks wholly inside it; those that only overlap it are drawn joined to it: lib/world/townJoin.js)
      const left = (c) => Boolean(skip?.(c)) || Boolean(town && insideTown(c, town));
      const known = skip || town ? { ...baked, manifest: { ...baked.manifest, chunks: baked.manifest.chunks.filter((c) => !left(c)) } } : baked;
      st.manager = createChunkManager(known, {
        profile,
        onMount: (chunk) => {
          const joined = town && overlapsTown(chunk, town);
          const group = buildChunkObject(THREE, joined ? clipChunkToTown(chunk, town) : chunk, materials, { models, detail: profile === 'phone' ? 'mid' : 'full' }); // (a phone draws the ports' small models, a desktop the Kenney ones)
          objects.set(`${chunk.cx}_${chunk.cz}`, group);
          parent?.add(group);
          stats.mounts++; stats.mounted = objects.size; stats.triangles += group.userData.triangles; stats.drawCalls += group.children.length;
        },
        onUnmount: (key) => {
          const group = objects.get(key);
          if (!group) return;
          stats.triangles -= group.userData.triangles; stats.drawCalls -= group.children.length;
          parent?.remove(group);
          disposeChunkObject(group);
          objects.delete(key);
          stats.unmounts++; stats.mounted = objects.size;
        },
      });
      // the sea: one plane over the whole ocean of the world (the manifest's bounds, with a margin), under every chunk's shore
      if (sea && water.current) {
        const o = baked.manifest.ocean;
        water.current.scale.set(o.x1 - o.x0 + 4000, o.z1 - o.z0 + 4000, 1);
        water.current.position.set((o.x0 + o.x1) / 2, SEA_LEVEL, (o.z0 + o.z1) / 2);
        water.current.visible = true;
        // the rivers' own water (lib/world/riverWater.js): a ribbon along each course at the sea's level, light over the banks, deeper in the middle, fading out past the mouth; ?riverwater=0 turns it off
        if (parent && baked.manifest.rivers?.length && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('riverwater') !== '0') {
          const parts = baked.manifest.rivers.map((r) => riverWaterMesh(r));
          const n = parts.reduce((s, p) => s + p.vertices, 0);
          const positions = new Float32Array(n * 3), colors = new Float32Array(n * 4), fx = new Float32Array(n * 4), indices = new Uint32Array(parts.reduce((s, p) => s + p.indices.length, 0));
          let v = 0, k = 0;
          for (const p of parts) {
            positions.set(p.positions, v * 3); colors.set(p.colors, v * 4); fx.set(p.fx, v * 4);
            for (let i = 0; i < p.indices.length; i++) indices[k + i] = p.indices[i] + v;
            v += p.vertices; k += p.indices.length;
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
          geometry.setAttribute('riverFx', new THREE.BufferAttribute(fx, 4)); // the shader's: across, along, mouth, fade (lib/world/riverWater.js)
          geometry.setIndex(new THREE.BufferAttribute(indices, 1));
          geometry.computeVertexNormals();
          const ribbon = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); // (pulled toward the camera: at 300 units the depth buffer is coarser than the 0.02 the water is over the sea plane)
          if (new URLSearchParams(window.location.search).get('riverfx') !== '0') applyRiverFx(THREE, ribbon.material); // ripples, bank foam and mouth foam; ?riverfx=0 keeps the still water
          ribbon.name = 'river-water';
          ribbon.renderOrder = 20; // after the sea's plane (which is drawn translucent over the whole ocean)
          ribbon.frustumCulled = false;
          parent.add(ribbon);
          st.riverWater = ribbon;
          stats.riverWaterVertices = n; // (for the tests and the dev page)
        }
        // the ponds of the towns drawn from the baked world (lib/world/ponds.js: Harbor Town's): the same raised sand and sheet of water as the first town's lakes (Lake.jsx), at the datum's heights; ?ponds=0 turns them off
        if (parent && baked.manifest.ponds?.length && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ponds') !== '0') {
          const meshes = pondMeshes(baked.manifest.ponds);
          st.ponds = [];
          for (const [name, m, material] of [['pond-shore', meshes.shore, new THREE.MeshStandardMaterial({ color: '#d6c7a1', roughness: 1 })], ['pond-water', meshes.water, new THREE.MeshStandardMaterial({ color: '#2563eb', emissive: '#38bdf8', emissiveIntensity: 0.18, roughness: 0.7, metalness: 0 })]]) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
            geometry.setIndex(new THREE.BufferAttribute(m.indices, 1));
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = name;
            mesh.receiveShadow = true;
            parent.add(mesh);
            st.ponds.push(mesh);
          }
          stats.ponds = baked.manifest.ponds.length;
        }
        // depth shading (lib/world/seaDepth.js, docs/world/water.md): the water is coloured by its distance from the coast, with a foam line at the shore; ?seashade=0 turns it off
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('seashade') !== '0') {
          setTimeout(() => {
            if (cancelled) return;
            const field = shoreField(baked.manifest.landmasses, o);
            const texture = new THREE.DataTexture(field.data, field.w, field.h, THREE.RedFormat, THREE.UnsignedByteType);
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearFilter;
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
            // the seabed (lib/world/seabed.js): a floor to see through the water, and the water's column over it; ?seabed=0 keeps the distance shading alone
            const bed = new URLSearchParams(window.location.search).get('seabed') !== '0';
            applySeaDepth(THREE, seaMaterial, field, texture, undefined, bed ? { ...SEABED, shallowY: SEA_FLOOR - 0.05, deepY: OCEAN_FLOOR, seaY: SEA_LEVEL } : null);
            if (bed && parent) {
              const mesh = seabedMesh(field);
              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
              geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3, true));
              geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
              geometry.computeVertexNormals();
              const floor = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
              floor.name = 'seabed';
              floor.renderOrder = -2;
              floor.frustumCulled = false;
              parent.add(floor);
              // beyond the raster, the ocean floor: a plane out to the sea's own edge
              const far = new THREE.Mesh(new THREE.PlaneGeometry(o.x1 - o.x0 + 8000, o.z1 - o.z0 + 8000), new THREE.MeshStandardMaterial({ color: '#1a283e', roughness: 1 }));
              far.rotation.x = -Math.PI / 2;
              far.position.set((o.x0 + o.x1) / 2, OCEAN_FLOOR - 0.05, (o.z0 + o.z1) / 2);
              far.name = 'ocean-floor';
              parent.add(far);
              st.seabed = [floor, far];
            }
          }, 0);
        }
      }
      // the ground under things: the avatar and the vehicles ask it (lib/world/terrain.js) through setActiveTerrain, only while this layer is mounted
      // the race car waiting on the grid of the circuit: a parked car you can drive
      const circuit = baked.manifest.tracks?.[0];
      if (circuit) useFleet.getState().seedRaceCar({ x: circuit.start.x + Math.sin(circuit.start.heading) * 5, z: circuit.start.z + Math.cos(circuit.start.heading) * 5, heading: circuit.start.heading });
      const here = new Set(baked.manifest.chunks.map((c) => c.key));
      const o = baked.manifest.ocean;
      const terrain = createTerrain({
        chunkAt: (cx, cz) => st.manager?.chunk(`${cx}_${cz}`) ?? undefined,
        has: (cx, cz) => here.has(`${cx}_${cz}`),
        skipped: (cx, cz) => Boolean(skip?.({ cx, cz })) || Boolean(town && overlapsTown({ cx, cz }, town)), // (the town's own rules in every chunk that overlaps it)
        bounds: { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1 },
      });
      setActiveTerrain(terrain);
      stats.sample = (x, z) => terrain.sample(x, z);
      stats.describe = () => [...objects.entries()].map(([k, g]) => `${k}: ${g.children.map((m) => `${m.name.split(':')[1]}${m.isInstancedMesh ? `x${m.count}` : ''}`).join(',')}`); // for the tests and the dev page
      stats.bridgeModels = Boolean(models?.deck);
      stats.trackModels = Boolean(models?.props);
      stats.portModels = Boolean(models?.props?.['ctr-a']); // the ports' Kenney models (lib/world/ports.js)
      stats.portModelsMid = Boolean(models?.propsMid); // and their small copies, for a phone
      stats.ready = true; stats.profile = profile;
      onReady?.(baked.manifest);
    })();
    return () => {
      cancelled = true;
      setActiveTerrain(null);
      for (const group of objects.values()) { parent?.remove(group); disposeChunkObject(group); }
      for (const m of [...(st.seabed ?? []), ...(st.riverWater ? [st.riverWater] : [])]) { parent?.remove(m); m.geometry.dispose(); m.material.dispose(); }
      st.riverWater = null;
      for (const m of st.ponds ?? []) { parent?.remove(m); m.geometry.dispose(); m.material.dispose(); }
      st.ponds = null;
      st.seabed = null;
      objects.clear();
      st.manager = null;
      stats.ready = false; stats.mounted = 0; stats.triangles = 0; stats.drawCalls = 0;
    };
  }, [base, profile, skip, town, materials, onReady, sea, seaMaterial]);

  useFrame((_, delta) => {
    const depth = seaMaterial.userData.seaDepth;
    if (depth) depth.uTime.value += delta; // the foam
    const rfx = state.current.riverWater?.material.userData.riverFx;
    if (rfx) rfx.uTime.value += delta; // the rivers' ripples and foam
    const m = state.current.manager;
    if (!m) return;
    const at = focus ? focus() : camera.position; // { x, z } or a Vector3: z is the ground z in both
    const prev = state.current.last;
    if (prev && delta > 0) state.current.velocity = { x: (at.x - prev.x) / delta, z: (at.z - prev.z) / delta };
    state.current.last = { x: at.x, z: at.z };
    stats.focus = { x: Math.round(at.x), z: Math.round(at.z) };
    m.focus(at.x, at.z, state.current.velocity.x, state.current.velocity.z);
    m.step().then(() => { stats.loads = m.stats().loads; });
  });

  useEffect(() => () => { materials.ground.dispose(); materials.roads.dispose(); materials.highways.dispose(); materials.track.dispose(); seaMaterial.dispose(); }, [materials, seaMaterial]);
  return (
    <group ref={root} name="streamed-world">
      <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={-1} material={seaMaterial} name="sea">
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}
