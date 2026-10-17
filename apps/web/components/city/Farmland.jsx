"use client";

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import PropInstances, { usePropsReady } from './PropModels';
import { bushModelFor, treeModelFor } from '@/lib/content/props';

const CROP_COLORS = { wheat: '#d9c26a', corn: '#8fb339', plough: '#7a5535', meadow: '#4f9a45' };
const FIELD_Y = 0.007;

// Furrows: one shared greyscale stripe texture, tinted per field by the crop colour.
let furrowTexture = null;
function getFurrows() {
  if (!furrowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 8, 64);
    ctx.fillStyle = '#c9c9c9';
    for (let i = 0; i < 64; i += 8) ctx.fillRect(0, i, 8, 3);
    furrowTexture = new THREE.CanvasTexture(canvas);
    furrowTexture.colorSpace = THREE.SRGBColorSpace;
    furrowTexture.wrapS = furrowTexture.wrapT = THREE.RepeatWrapping;
  }
  return furrowTexture;
}

// Every field is one instance of a flat plane, so any number of fields costs a single draw call.
// `fields` comes from generateCity(): [{ x0, x1, z0, z1, crop }].
export function Fields({ fields }) {
  const mesh = useRef(null);
  const map = useMemo(() => getFurrows(), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    fields.forEach((f, i) => {
      dummy.position.set((f.x0 + f.x1) / 2, FIELD_Y, (f.z0 + f.z1) / 2);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(f.x1 - f.x0, f.z1 - f.z0, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.set(CROP_COLORS[f.crop] ?? CROP_COLORS.meadow));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [fields]);

  if (!fields.length) return null;
  return (
    <instancedMesh ref={mesh} args={[null, null, fields.length]} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial map={map} roughness={1} />
    </instancedMesh>
  );
}

// Trees in the woods: trunks and crowns as two instanced boxes. `trees`: [{ x, z, size, trunk, color }].
export function Woods({ trees, park = false }) {
  const trunks = useRef(null);
  const crowns = useRef(null);
  // Kenney tree models once they have loaded (all of them, so the switch is one step); the boxes until then
  const models = useMemo(() => trees.map((t) => ({ x: t.x, z: t.z, model: treeModelFor(t, undefined, { park }) })), [trees, park]);
  const ids = useMemo(() => [...new Set(models.map((m) => m.model?.id).filter(Boolean))].sort(), [models]);
  const modelsReady = usePropsReady(ids) && models.every((m) => m.model);

  useLayoutEffect(() => {
    if (!trunks.current || !crowns.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    trees.forEach((t, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, t.trunk, 1);
      dummy.position.set(t.x, t.trunk / 2, t.z);
      dummy.updateMatrix();
      trunks.current.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(t.size, t.size, t.size);
      dummy.position.set(t.x, t.trunk + t.size / 2 - 0.05, t.z);
      dummy.updateMatrix();
      crowns.current.setMatrixAt(i, dummy.matrix);
      crowns.current.setColorAt(i, color.set(t.color));
    });
    trunks.current.instanceMatrix.needsUpdate = true;
    crowns.current.instanceMatrix.needsUpdate = true;
    if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
  }, [trees]);

  if (!trees.length) return null;
  if (modelsReady) return <PropInstances items={models} />;
  return (
    <group>
      <instancedMesh ref={trunks} args={[null, null, trees.length]} castShadow>
        <boxGeometry args={[0.14, 1, 0.14]} />
        <meshStandardMaterial color="#78350f" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[null, null, trees.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

// Shrubs: low green boxes, one instanced mesh. `bushes`: [{ x, z, w, h, color }].
export function Shrubs({ bushes }) {
  const mesh = useRef(null);
  const models = useMemo(() => bushes.map((b) => ({ x: b.x, z: b.z, model: bushModelFor(b) })), [bushes]);
  const ids = useMemo(() => [...new Set(models.map((m) => m.model?.id).filter(Boolean))].sort(), [models]);
  const modelsReady = usePropsReady(ids) && models.every((m) => m.model);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    bushes.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.w);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.set(b.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [bushes]);
  if (!bushes.length) return null;
  if (modelsReady) return <PropInstances items={models} />;
  return (
    <instancedMesh ref={mesh} args={[null, null, bushes.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}
