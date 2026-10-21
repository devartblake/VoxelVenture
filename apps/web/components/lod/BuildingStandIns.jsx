"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ALL_MODELS } from '@/lib/content/models';
import { averageModelColours, standInBox } from '@/lib/performance/lodPolicy';
import { reportLodCount } from '@/lib/performance/lodRuntime';
import { modelMatrix, modelTint, useModels } from '@/components/city/ModelBuildings';
import { registerGlow } from '@/components/city/nightLights';

// The zoomed-out stand-ins of the building models (the "far" level of detail: lib/performance/lodPolicy.js;
// docs/architecture/performance_policy.md). Each building is its model's bounding box, in the mean colour of the model's walls
// and of its roof, tinted like the model. Every stand-in is in one of two instanced meshes (the walls, the roofs), so the
// whole city's buildings are two draw calls of 12 triangles each instead of a few dozen calls of a thousand or more.
// A stand-in is selected and hovered exactly like its model (the click finds the plot behind the instance).
//
// rows: [{ plot, m }] the plots whose model is drawn as a stand-in (ModelBuildings.jsx leaves the selected one out).

const byId = new Map(ALL_MODELS.map((m) => [m.id, m]));
const HOVER = new THREE.Color('#bae6fd');

// The unit box, split into its walls (every face but the top) and its roof (the top face, y = +0.5).
const { wallGeometry, roofGeometry } = (() => {
  const box = new THREE.BoxGeometry(1, 1, 1); // faces in order: +x, -x, +y, -y, +z, -z (6 indices each)
  const all = [...box.index.array];
  const walls = box.clone();
  walls.setIndex([...all.slice(0, 12), ...all.slice(18)]);
  const roof = box.clone();
  roof.setIndex(all.slice(12, 18));
  box.dispose();
  return { wallGeometry: walls, roofGeometry: roof };
})();
const wallMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, emissive: '#ffcf8a' });
const roofMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 });
if (typeof window !== 'undefined') registerGlow(wallMaterial, { day: 0, night: 0.12 }); // a hint of the lit windows at night

// sRGB 0..255 to linear 0..1
const SRGB_TO_LINEAR = Array.from({ length: 256 }, (_, i) => new THREE.Color().setRGB(i / 255, 0, 0, THREE.SRGBColorSpace).r);

// The pixels of a colour texture, read once (a model kit shares one texture).
const pixelCache = new WeakMap();
function texturePixels(texture) {
  const image = texture?.image;
  if (!image || typeof document === 'undefined') return null;
  if (pixelCache.has(image)) return pixelCache.get(image);
  let out;
  try {
    const w = image.width;
    const h = image.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    out = { w, h, data: ctx.getImageData(0, 0, w, h).data, flipY: texture.flipY };
  } catch {
    out = null; // (a texture that cannot be read: the stand-in is white, tinted)
  }
  pixelCache.set(image, out);
  return out;
}

// Per model: its bounding box and the colours of its walls and roof (linear RGB), computed once.
const lookCache = new WeakMap();
function modelLook(geometry, material) {
  if (lookCache.has(geometry)) return lookCache.get(geometry);
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const box = { min: bb.min.toArray(), max: bb.max.toArray() };
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const vcol = geometry.attributes.color;
  const px = vcol ? null : texturePixels(material?.map);
  const sample = px
    ? (u, v) => {
        const fu = u - Math.floor(u);
        const fv = v - Math.floor(v);
        const x = Math.min(px.w - 1, Math.floor(fu * px.w));
        const y = Math.min(px.h - 1, Math.floor((px.flipY ? 1 - fv : fv) * px.h));
        const i = (y * px.w + x) * 4;
        return [SRGB_TO_LINEAR[px.data[i]], SRGB_TO_LINEAR[px.data[i + 1]], SRGB_TO_LINEAR[px.data[i + 2]]];
      }
    : null;
  const { wall, roof } = averageModelColours({ positions: pos.array, uvs: uv?.array ?? null, colors: vcol?.array ?? null, index: geometry.index?.array ?? null }, sample);
  // (averaged in linear light, as the eye sums the small details of a far building; vertex colours are already linear)
  const look = { box, wall: new THREE.Color(wall[0], wall[1], wall[2]), roof: new THREE.Color(roof[0], roof[1], roof[2]) };
  lookCache.set(geometry, look);
  return look;
}

const m4 = new THREE.Matrix4();
const tint = new THREE.Color();
const col = new THREE.Color();

export default function BuildingStandIns({ rows, hoveredId, onSelect, onHover }) {
  const walls = useRef(null);
  const roofs = useRef(null);
  const { geometries, materials } = useModels.getState();
  const looks = useMemo(
    () => rows.map(({ m }) => modelLook(geometries[m.id], materials[byId.get(m.id)?.kit])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows]
  );

  useLayoutEffect(() => {
    const w = walls.current;
    const r = roofs.current;
    if (!w || !r) return;
    rows.forEach(({ plot, m }, i) => {
      const look = looks[i];
      m4.fromArray(standInBox(look.box, modelMatrix(plot, m).elements));
      w.setMatrixAt(i, m4);
      r.setMatrixAt(i, m4);
      const hovered = plot.id === hoveredId;
      modelTint(plot, tint);
      w.setColorAt(i, hovered ? HOVER : col.copy(look.wall).multiply(tint));
      r.setColorAt(i, hovered ? HOVER : col.copy(look.roof).multiply(tint));
    });
    for (const mesh of [w, r]) {
      mesh.count = rows.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null; // (picking follows the instances)
      mesh.boundingBox = null;
    }
  }, [rows, looks, hoveredId]);

  useEffect(() => {
    reportLodCount('standIns', rows.length);
    reportLodCount('standInCalls', rows.length ? 2 : 0);
  }, [rows.length]);
  useEffect(() => () => {
    reportLodCount('standIns', 0);
    reportLodCount('standInCalls', 0);
  }, []);

  if (!rows.length) return null;
  const handlers = {
    onClick: (e) => {
      const p = rows[e.instanceId]?.plot;
      if (!p) return;
      e.stopPropagation();
      onSelect(p);
    },
    onPointerMove: (e) => {
      const p = rows[e.instanceId]?.plot;
      if (!p) return;
      e.stopPropagation();
      onHover(p.id);
    },
    onPointerOut: () => onHover(null),
  };
  return (
    <group name="building-stand-ins">
      <instancedMesh
        key={`walls-${rows.length}`}
        name="stand-in-walls"
        ref={(m) => {
          walls.current = m; // (no return value: React 19 treats a returned value as the ref's cleanup)
        }}
        args={[wallGeometry, wallMaterial, rows.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
        dispose={null}
        {...handlers}
      />
      <instancedMesh
        key={`roofs-${rows.length}`}
        name="stand-in-roofs"
        ref={(m) => {
          roofs.current = m;
        }}
        args={[roofGeometry, roofMaterial, rows.length]}
        receiveShadow
        frustumCulled={false}
        dispose={null}
        {...handlers}
      />
    </group>
  );
}
