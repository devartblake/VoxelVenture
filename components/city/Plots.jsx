"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PLOT_TILE, buildingSize } from '@/lib/city/cityGenerator';
import { bannerSize, logoOf } from '@/lib/game/logos';
import { buildBannerAtlas } from './bannerAtlas';
import ModelBuildings, { assignModels, useModels } from './ModelBuildings';
import PropInstances, { usePropsReady } from './PropModels';
import ParkingLots from './ParkingLots';
import { registerGlow } from './nightLights';
import { treeModelFor } from '@/lib/content/props';

const GOLD = '#fbbf24';
const HOVER_BLUE = '#38bdf8';

// Every plot in the city, drawn as a handful of instanced meshes instead of several meshes per plot.
// A city has about 500 plots; as separate meshes that was over 1,300 draw calls, as instances it is about a dozen.
// Each kind of part (foundations, buildings, doors, awnings, floor lines, glass bands, roof units,
// empty-lot outlines, gold rims) is one InstancedMesh with one instance per plot that has it.
// Clicking and hovering work per instance (the event carries `instanceId`).

const footprint = (plot) => {
  const w = plot.w ?? PLOT_TILE;
  const d = plot.d ?? PLOT_TILE;
  return { w, d, ...buildingSize(plot) };
};

// The part kinds. `material` builds the (shared) material; colours are set per instance unless `fixed`.
const PARTS = {
  foundation: { roughness: 0.7 },
  rim: { color: GOLD, roughness: 0.4, metalness: 0.4, emissive: GOLD, emissiveIntensity: 0.25 },
  grandRim: { color: '#fef3c7', roughness: 0.25, metalness: 0.7, emissive: '#fbbf24', emissiveIntensity: 0.55 },
  luxRim: { color: '#c084fc', roughness: 0.3, metalness: 0.5, emissive: '#a855f7', emissiveIntensity: 0.4 },
  pillar: { color: '#e9d5ff', roughness: 0.4, metalness: 0.3, castShadow: true },
  shrub: { roughness: 0.9, castShadow: true },
  treeTrunk: { color: '#78350f', roughness: 0.9 },
  treeCrown: { roughness: 0.8, castShadow: true },
  slot: { wireframe: true },
  building: { roughness: 0.3, metalness: 0.1, castShadow: true, receiveShadow: true },
  door: { color: '#0f172a', roughness: 0.6 },
  awning: { roughness: 0.7 },
  floorLine: { color: '#0f172a', roughness: 0.8 },
  glass: { color: '#38bdf8', roughness: 0.1, metalness: 0.6, emissive: '#ffd27a', emissiveIntensity: 0 }, // lit warm at night (nightLights)
  roof: { color: '#64748b', roughness: 0.8, castShadow: true },
  signPost: { color: '#94a3b8', roughness: 0.5, metalness: 0.4 },
  signBoard: { color: '#0f172a', roughness: 0.5, castShadow: true },
};

// A prime plot flies a gold pennant from its roof; the plot of the day has a spinning gem. Both animate, so
// they stay as separate small meshes (there are only a few of them).
function Pennant({ y }) {
  const flag = useRef(null);
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.25;
  });
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.03, 1, 0.03]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} metalness={0.5} />
      </mesh>
      <group ref={flag} position={[0, 0.82, 0]}>
        <mesh position={[0.26, 0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.3, 0.02]} />
          <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.5} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

// A small warm light on the roof of a building with real traffic.
function RoofLight({ y }) {
  return (
    <group position={[-0.5, y, 0]} raycast={() => {}}>
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.02, 0.02, 0.24, 6]} /><meshStandardMaterial color="#94a3b8" /></mesh>
      <mesh position={[0, 0.28, 0]}><sphereGeometry args={[0.07, 10, 8]} /><meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={1.6} /></mesh>
    </group>
  );
}

// The plaza fountain of a building with very high traffic: a stone basin, water, a spout.
function PlazaFountain({ x, z }) {
  return (
    <group position={[x, 0.1, z]} raycast={() => {}}>
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.17, 0.19, 0.08, 14]} /><meshStandardMaterial color="#d6d3d1" roughness={0.9} /></mesh>
      <mesh position={[0, 0.085, 0]}><cylinderGeometry args={[0.14, 0.14, 0.02, 14]} /><meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.5} /></mesh>
      <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.02, 0.03, 0.12, 8]} /><meshStandardMaterial color="#bae6fd" emissive="#7dd3fc" emissiveIntensity={0.8} /></mesh>
    </group>
  );
}

function Beacon({ y }) {
  const gem = useRef(null);
  useFrame(({ clock }) => {
    if (!gem.current) return;
    gem.current.rotation.y = clock.elapsedTime * 1.6;
    gem.current.position.y = y + Math.sin(clock.elapsedTime * 2) * 0.1;
  });
  return (
    <mesh ref={gem} position={[0, y, 0]}>
      <octahedronGeometry args={[0.22]} />
      <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={1.6} />
    </mesh>
  );
}

// a stable number in [0, 1) from the plot's id and a key, so a plot's garden does not change when the plot does
const lotHash = (plot, k) => ((Math.imul(plot.id * 2654435761 + k * 40503, 2246822519) >>> 0) % 1000) / 1000;

export default function Plots({ plots, selectedId, potdId, onSelect }) {
  const [hoveredId, setHoveredId] = useState(null);
  // The 3D models for the buildings (ModelBuildings.jsx). A plot whose model has loaded is drawn by it; any other keeps its box.
  const assignments = useMemo(() => assignModels(plots), [plots]);
  const modelStatus = useModels((s) => s.status);
  const modelGeoms = useModels((s) => s.geometries);
  const modelOf = (p) => {
    const m = assignments.get(p.id);
    return modelStatus === 'ready' && m && modelGeoms[m.id] ? m : null;
  };
  // The small tree on some empty lots: a Kenney tree once the models have loaded, the box tree until then
  const lotTrees = useMemo(
    () =>
      plots
        .filter((p) => !p.owner && !p.prime && lotHash(p, 1) < 0.4)
        .map((p) => {
          const { w, d } = footprint(p);
          const lx = (lotHash(p, 2) < 0.5 ? -1 : 1) * (w / 2 - 0.55);
          const lz = (lotHash(p, 3) < 0.5 ? -1 : 1) * (d / 2 - 0.55);
          const yaw = p.yaw ?? 0;
          const x = p.x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
          const z = p.z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
          return { x, z, y: 0.1, model: treeModelFor({ x, z, trunk: 0.4, size: 0.5 }) };
        }),
    [plots]
  );
  const lotTreeIds = useMemo(() => [...new Set(lotTrees.map((t) => t.model?.id).filter(Boolean))].sort(), [lotTrees]);
  const lotTreeModels = usePropsReady(lotTreeIds) && lotTrees.every((t) => t.model);
  const refs = useRef({});
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const materials = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(PARTS).map(([name, p]) => [
          name,
          new THREE.MeshStandardMaterial({ color: p.color ?? '#ffffff', roughness: p.roughness ?? 1, metalness: p.metalness ?? 0, emissive: p.emissive ?? '#000000', emissiveIntensity: p.emissiveIntensity ?? 1, wireframe: Boolean(p.wireframe) }),
        ])
      ),
    []
  );
  // the windows light up at night
  useEffect(() => registerGlow(materials.glass, { day: 0, night: 1.1 }), [materials]);

  // The roof banners: every face (logo and business name) is drawn into one atlas texture, and each banner is two
  // planes that pick their face out of it. The atlas is redrawn only when a banner's contents change.
  const bannerItems = useMemo(() => plots.map((p) => ({ id: p.id, plot: p, logo: logoOf(p) })).filter((x) => x.logo), [plots]);
  const bannerKey = useMemo(() => bannerItems.map((i) => `${i.id}|${i.plot.title}|${i.plot.color}|${JSON.stringify(i.logo)}`).join('~'), [bannerItems]);
  const [, setAtlasVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const atlas = useMemo(() => (typeof document === 'undefined' ? null : buildBannerAtlas(bannerItems, () => setAtlasVersion((v) => v + 1))), [bannerKey]);
  useLayoutEffect(() => () => atlas?.texture.dispose(), [atlas]);
  const iconGeometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(new Float32Array(plots.length * 4 + 8), 2));
    return g;
  }, [plots.length]);
  const iconMaterial = useMemo(() => {
    if (!atlas) return null;
    const m = new THREE.MeshBasicMaterial({ map: atlas.texture, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute vec2 uvOffset;
${shader.vertexShader}`.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = vMapUv / vec2(${atlas.cols}.0, ${atlas.rows}.0) + uvOffset;
#endif`
      );
    };
    return m;
  }, [atlas]);

  // which plot is behind each instance, per part (for clicks)
  const owners = useRef({ building: [], slot: [], foundation: [] });

  useLayoutEffect(() => {
    const tmp = new THREE.Object3D();
    const parent = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const counts = Object.fromEntries(Object.keys(PARTS).map((k) => [k, 0]));
    const ids = { building: [], slot: [], foundation: [] };

    const put = (kind, pos, scale, tint, rotY = 0) => {
      const mesh = refs.current[kind];
      if (!mesh) return;
      const i = counts[kind]++;
      tmp.position.set(pos[0], pos[1], pos[2]);
      tmp.scale.set(scale[0], scale[1], scale[2]);
      tmp.rotation.set(0, rotY, 0);
      tmp.updateMatrix();
      local.multiplyMatrices(parent, tmp.matrix);
      mesh.setMatrixAt(i, local);
      if (tint) mesh.setColorAt(i, color.set(tint));
      return i;
    };
    // one face of a banner: a plane that shows its cell of the atlas
    let icons = 0;
    const putFace = (pos, width, height, rotY, slot) => {
      const mesh = refs.current.signIcon;
      if (!mesh || slot == null || !atlas) return;
      const i = icons++;
      tmp.position.set(pos[0], pos[1], pos[2]);
      tmp.scale.set(width, height, 1);
      tmp.rotation.set(0, rotY, 0);
      tmp.updateMatrix();
      local.multiplyMatrices(parent, tmp.matrix);
      mesh.setMatrixAt(i, local);
      mesh.geometry.attributes.uvOffset.setXY(i, (slot % atlas.cols) / atlas.cols, 1 - (Math.floor(slot / atlas.cols) + 1) / atlas.rows);
    };

    for (const plot of plots) {
      const { w, d, bw, bd } = footprint(plot);
      const claimed = Boolean(plot.owner);
      const lit = plot.id === hoveredId || plot.id === selectedId;
      quat.setFromAxisAngle(up, plot.yaw ?? 0);
      parent.compose(new THREE.Vector3(plot.x, 0, plot.z), quat, new THREE.Vector3(1, 1, 1));

      if (plot.luxury) {
        put(plot.grand ? 'grandRim' : 'luxRim', [0, 0.035, 0], [w + 0.2, 0.07, d + 0.2]);
        // pillars at the corners of the estate, like a gatehouse (a grand estate has two more along each long side)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('pillar', [sx * (w / 2 - 0.15), 0.55, sz * (d / 2 - 0.15)], [0.2, 0.9, 0.2]);
        if (plot.grand) for (const sz of [-1, 1]) put('pillar', [0, 0.55, sz * (d / 2 - 0.15)], [0.2, 0.9, 0.2]);
      } else if (plot.prime) put('rim', [0, 0.035, 0], [w + 0.14, 0.07, d + 0.14]);
      const fi = put('foundation', [0, 0.05, 0], [w, 0.1, d], lit ? '#ffffff' : plot.parkBoost ? '#14532d' : plot.grand ? '#422006' : plot.luxury ? '#2e1065' : plot.prime ? '#3b2f12' : '#1e293b');
      ids.foundation[fi] = plot;

      // --- the plot's garden: a stable pick from the plot's id, so it does not change when the plot does ---
      const hash = (k) => lotHash(plot, k);
      const GREENS = ['#15803d', '#16a34a', '#22c55e', '#4d7c0f'];
      const green = (k) => GREENS[Math.floor(hash(k) * GREENS.length)];
      const frontZ = (plot.facing ?? 1) * (d / 2 - 0.11);
      if (!claimed && !plot.prime) {
        // an empty lot: a small tree on some, a pair of shrubs on others
        if (hash(1) < 0.4) {
          const sx = hash(2) < 0.5 ? -1 : 1;
          const sz = hash(3) < 0.5 ? -1 : 1;
          if (!lotTreeModels) {
            put('treeTrunk', [sx * (w / 2 - 0.55), 0.3, sz * (d / 2 - 0.55)], [0.12, 0.4, 0.12]);
            put('treeCrown', [sx * (w / 2 - 0.55), 0.62, sz * (d / 2 - 0.55)], [0.5, 0.5, 0.5], green(4));
          }
        } else if (hash(5) < 0.7) {
          put('shrub', [(hash(6) - 0.5) * (w - 1.2) - 0.2, 0.22, (hash(7) - 0.5) * (d - 1.2)], [0.5, 0.3, 0.5], green(8));
          put('shrub', [(hash(9) - 0.5) * (w - 1.2) + 0.3, 0.2, (hash(10) - 0.5) * (d - 1.2)], [0.36, 0.24, 0.36], green(11));
        }
      } else if (claimed) {
        if (plot.luxury) {
          // an estate: a low hedge along its front, between the pillars
          const n = Math.max(3, Math.floor((w - 1.4) / 0.62));
          for (let k = 0; k < n; k++) put('shrub', [-(w - 1.4) / 2 + ((k + 0.5) * (w - 1.4)) / n, 0.2, frontZ], [0.34, 0.2, 0.2], green(20 + k));
        } else {
          // a building: a shrub at each front corner
          for (const sx of [-1, 1]) put('shrub', [sx * (w / 2 - 0.11), 0.2, frontZ], [0.2, 0.2, 0.2], green(30 + sx));
        }
      }

      if (!claimed) {
        const si = put('slot', [0, 0.15, 0], [w * 0.8, 0.05, d * 0.8], plot.luxury ? '#c084fc' : plot.prime ? GOLD : '#475569');
        ids.slot[si] = plot;
        continue;
      }

      const mdl = modelOf(plot); // a 3D model stands here: no box, door, awning or windows (the model has its own)
      const f = plot.facing ?? 1;
      const roofY = mdl ? mdl.height : plot.height;
      if (!mdl) {
      const bi = put('building', [0, plot.height / 2 + 0.1, 0], [bw, plot.height, bd], plot.id === selectedId ? '#f59e0b' : plot.wallColor ?? plot.color);
      ids.building[bi] = plot;

      const type = plot.buildingType;
      const front = bd / 2;
      const doorWidth = plot.prime ? 0.55 : 0.32;
      const awningWidth = Math.min(bw * 0.88, plot.prime ? 3.4 : 1.5);
      const fronts = plot.primeKind === 'deep' ? [f, -f] : [f]; // a double-deep plot has a door at each end
      for (const side of fronts) {
        put('door', [0, 0.35, side * (front + 0.005)], [doorWidth, 0.5, 0.02]);
        if (type === 'restaurant' || type === 'shop') put('awning', [0, 0.88, side * (front + 0.17)], [awningWidth, 0.06, 0.36], type === 'restaurant' ? '#dc2626' : '#f59e0b');
      }
      const floors = plot.interiorData?.floors ?? 1;
      for (let k = 0; k < floors - 1; k++) put('floorLine', [0, 0.1 + ((k + 1) * plot.height) / floors, 0], [bw + 0.03, 0.03, bd + 0.03]);
      if (type === 'office') {
        put('glass', [0, 0.1 + plot.height * 0.6, 0], [bw + 0.04, plot.height * 0.3, bd + 0.04]);
        put('roof', [bw * 0.14, plot.height + 0.2, -bd * 0.12], [bw * 0.3, 0.2, bd * 0.3]);
      }
      }

      // the roof banner: a big board on two posts at the front edge of the roof, its logo and name on both faces
      const logo = logoOf(plot);
      const slot = atlas?.index.get(plot.id);
      if (logo && slot != null) {
        const top = roofY + 0.1;
        const { width, height } = bannerSize(plot, bw);
        const post = 0.4 + height * 0.15;
        const z = f * Math.max(0, bd / 2 - 0.2);
        const y = top + post + height / 2;
        for (const sx of [-1, 1]) put('signPost', [sx * width * 0.34, top + post / 2, z], [0.08, post, 0.08]);
        put('signBoard', [0, y, z], [width + 0.14, height + 0.14, 0.1]);
        putFace([0, y, z + f * 0.056], width, height, f < 0 ? Math.PI : 0, slot);
        putFace([0, y, z - f * 0.056], width, height, f < 0 ? 0 : Math.PI, slot);
      }
    }

    for (const [kind, mesh] of Object.entries(refs.current)) {
      if (!mesh) continue;
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // the cached bounding volumes (used for picking) must follow the instances
      mesh.boundingSphere = null;
      mesh.boundingBox = null;
    }
    const iconMesh = refs.current.signIcon;
    if (iconMesh) {
      iconMesh.count = icons;
      iconMesh.instanceMatrix.needsUpdate = true;
      iconMesh.geometry.attributes.uvOffset.needsUpdate = true;
      iconMesh.boundingSphere = null;
      iconMesh.boundingBox = null;
    }
    owners.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plots, hoveredId, selectedId, iconGeometry, atlas, assignments, modelStatus, modelGeoms, lotTreeModels]);

  const pick = (kind) => ({
    onClick: (e) => {
      const plot = owners.current[kind][e.instanceId];
      if (!plot) return;
      e.stopPropagation();
      onSelect(plot);
    },
    onPointerMove: (e) => {
      const plot = owners.current[kind][e.instanceId];
      if (!plot) return;
      e.stopPropagation();
      setHoveredId((h) => (h === plot.id ? h : plot.id));
    },
    onPointerOut: () => setHoveredId(null),
  });

  const max = plots.length * 2 + 8;
  const part = (kind, cap, extra = {}) => (
    <instancedMesh
      key={kind}
      ref={(m) => {
        refs.current[kind] = m; // (no return value: React 19 treats a returned value as the ref's cleanup)
      }}
      args={[unitBox, materials[kind], cap]}
      castShadow={Boolean(PARTS[kind].castShadow)}
      receiveShadow={Boolean(PARTS[kind].receiveShadow)}
      frustumCulled={false}
      {...extra}
    />
  );
  const hovered = hoveredId != null ? plots.find((p) => p.id === hoveredId) : null;

  return (
    <group name="plots">
      <ModelBuildings plots={plots} assignments={assignments} selectedId={selectedId} hoveredId={hoveredId} onSelect={onSelect} onHover={setHoveredId} />
      {lotTreeModels && <PropInstances items={lotTrees} />}
      <ParkingLots plots={plots} assignments={assignments} ready={modelStatus === 'ready'} />
      {part('rim', plots.length)}
      {part('shrub', plots.length * 12 + 64)}
      {part('treeTrunk', plots.length)}
      {part('treeCrown', plots.length)}
      {part('luxRim', 16)}
      {part('grandRim', 8)}
      {part('pillar', 96)}
      {part('foundation', plots.length)}
      {part('slot', plots.length, pick('slot'))}
      {part('building', plots.length, pick('building'))}
      {part('door', max)}
      {part('awning', max)}
      {part('floorLine', plots.length * 6)}
      {part('glass', plots.length)}
      {part('roof', plots.length)}
      {part('signPost', plots.length * 2)}
      {part('signBoard', plots.length)}
      {iconMaterial && (
        <instancedMesh
          key={`signIcon-${plots.length}-${atlas.rows}`}
          name="roof-banners"
          ref={(m) => {
            refs.current.signIcon = m;
          }}
          args={[iconGeometry, iconMaterial, plots.length * 2 + 4]}
          frustumCulled={false}
          raycast={() => {}}
        />
      )}

      {/* an empty lot under the pointer shows solid, like a highlighted slot */}
      {hovered && !hovered.owner && (
        <mesh position={[hovered.x, 0.15, hovered.z]} rotation={[0, hovered.yaw ?? 0, 0]} raycast={() => {}}>
          <boxGeometry args={[(hovered.w ?? PLOT_TILE) * 0.8, 0.05, (hovered.d ?? PLOT_TILE) * 0.8]} />
          <meshStandardMaterial color={HOVER_BLUE} />
        </mesh>
      )}

      {plots.filter((p) => p.owner && (p.prime || p.skyline?.badges?.includes('pennant'))).map((p) => (
        <group key={`pennant-${p.id}`} position={[p.x, 0, p.z]} rotation={[0, p.yaw ?? 0, 0]}>
          <Pennant y={(modelOf(p)?.height ?? p.height) + 0.1} />
        </group>
      ))}
      {/* what real traffic earns a building (lib/game/skyline.js): a roof light, and at level 3 a fountain in front */}
      {plots.filter((p) => p.owner && p.skyline?.badges?.some((b) => b === 'light' || b === 'fountain')).map((p) => (
        <group key={`sky-${p.id}`} position={[p.x, 0, p.z]} rotation={[0, p.yaw ?? 0, 0]}>
          {p.skyline.badges.includes('light') && <RoofLight y={(modelOf(p)?.height ?? p.height) + 0.1} />}
          {p.skyline.badges.includes('fountain') && <PlazaFountain x={(p.w ?? PLOT_TILE) / 2 - 0.4} z={(p.facing ?? 1) * ((p.d ?? PLOT_TILE) / 2 - 0.3)} />}
        </group>
      ))}
      {potdId != null && (() => {
        const p = plots.find((q) => q.id === potdId);
        return p ? (
          <group position={[p.x, 0, p.z]} rotation={[0, p.yaw ?? 0, 0]}>
            <Beacon y={(modelOf(p)?.height ?? p.height) + 1.1} />
          </group>
        ) : null;
      })()}
    </group>
  );
}
