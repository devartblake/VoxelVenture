"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { avatarState } from '@/lib/sim/avatarState';
import { HALL, insideHall, storeDoors } from '@/lib/city/mallHall';
import { useCityStore } from '@/lib/state/store';
import { usePanel } from '@/lib/state/panelStore';
import { buildBannerAtlas } from './bannerAtlas';
import VoxLandmark from './VoxLandmark';


// A big sign texture: the mall's name on a gradient.
function signTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, '#4f46e5');
  g.addColorStop(1, '#a855f7');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 1008, 240);
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 56px "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 96, 128);
  ctx.fillText('★', 928, 128);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  const words = text.toUpperCase().split(' ');
  const size = words.length > 2 ? 74 : 92;
  ctx.font = `900 ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(words.slice(0, -1).join(' '), 512, 92);
  ctx.font = '900 70px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(words.slice(-1)[0], 512, 190);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A plane showing one cell of a banner atlas.
function cellGeometry(slot, cols, rows) {
  const g = new THREE.PlaneGeometry(1, 1);
  const uv = g.attributes.uv;
  const c = slot % cols;
  const r = Math.floor(slot / cols);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (c + uv.getX(i)) / cols, 1 - (r + 1 - uv.getY(i)) / rows);
  return g;
}

function Mall({ mall }) {
  const { w, d, height: h, facing: f } = mall;
  const openMall = usePanel.getState().openMall;
  // each store's sign on the front, drawn like the roof banners (logo and name)
  const atlas = useMemo(() => buildBannerAtlas(mall.stores.map((st) => ({ id: st.id, plot: st, logo: { kind: 'generated' } }))), [mall]);
  const sign = useMemo(() => signTexture(mall.name), [mall.name]);
  useEffect(
    () => () => {
      atlas.texture.dispose();
      sign.dispose();
    },
    [atlas, sign]
  );
  const storeSlots = useMemo(() => {
    // the stores line the front on both sides of the entrance
    const door = 3.4;
    const n = mall.stores.length;
    const left = Math.ceil(n / 2);
    const out = [];
    const span = (w - 2 * door) / 2 - 1.2;
    mall.stores.forEach((st, k) => {
      const onLeft = k < left;
      const idx = onLeft ? k : k - left;
      const count = onLeft ? left : n - left;
      const width = span / count;
      const x0 = onLeft ? -w / 2 + 1 : door + 0.2;
      out.push({ st, x: x0 + width * (idx + 0.5) + (onLeft ? 0 : 0), width: width - 0.15 });
    });
    return out;
  }, [mall.stores, w]);
  const geometries = useMemo(() => mall.stores.map((_, k) => cellGeometry(k, atlas.cols, atlas.rows)), [mall.stores, atlas]);
  const doors = useMemo(() => storeDoors(mall), [mall]);
  // the mall is hollow: when you are inside, the outer shell is hidden and the concourse is drawn (a cutaway, so the camera sees in)
  const shell = useRef(null);
  const hall = useRef(null);
  const inside = useRef(false);
  useFrame(() => {
    if (!shell.current || !hall.current) return;
    const near = insideHall(mall, avatarState.x, avatarState.z, inside.current ? -0.6 : 0.1); // a little hysteresis at the doorway
    if (near === inside.current) return;
    inside.current = near;
    shell.current.visible = !near;
    hall.current.visible = near;
  });
  const click = (e) => {
    e.stopPropagation();
    openMall(mall.id);
  };
  const frontZ = f * (d / 2);
  const faceYaw = f < 0 ? Math.PI : 0;

  return (
    // the whole mall is clickable (walls, roof, canopy, door, signs), not just its body
    <group position={[mall.x, 0, mall.z]} rotation={[0, mall.yaw, 0]} name={mall.id} onClick={click}>
      {/* plinth and body */}
      <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[w + 0.6, 0.12, d + 0.6]} /><meshStandardMaterial color="#cbd5e1" roughness={0.9} /></mesh>
      <group ref={shell}>
      <VoxLandmark
        name="mall"
        fit={[w, h + 0.55, d]}
        position={[0, 0.1, 0]}
        fallback={
          <>
      <mesh position={[0, h / 2 + 0.1, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} /><meshStandardMaterial color="#e5e7eb" roughness={0.6} /></mesh>
      <mesh position={[0, h + 0.22, 0]} castShadow><boxGeometry args={[w + 0.3, 0.26, d + 0.3]} /><meshStandardMaterial color="#6366f1" roughness={0.5} /></mesh>
      {/* a glass storefront band under the signs, and the roof's skylight (the voxel model has its own) */}
      <mesh position={[0, 0.9, frontZ + f * 0.03]}><boxGeometry args={[w - 0.5, 1.3, 0.06]} /><meshStandardMaterial color="#7dd3fc" roughness={0.1} metalness={0.5} emissive="#38bdf8" emissiveIntensity={0.15} /></mesh>
      <mesh position={[0, h + 0.55, 0]}><boxGeometry args={[w * 0.45, 0.5, d * 0.35]} /><meshStandardMaterial color="#bae6fd" roughness={0.1} metalness={0.4} emissive="#7dd3fc" emissiveIntensity={0.3} /></mesh>
          </>
        }
      />
      </group>
      {/* the concourse, drawn while you are inside */}
      <group ref={hall} visible={false}>
        <mesh position={[0, 0.13, 0]} receiveShadow><boxGeometry args={[w - 0.2, 0.06, d - 0.2]} /><meshStandardMaterial color="#e7e5e4" roughness={0.45} /></mesh>
        <mesh position={[0, 0.17, 0]}><boxGeometry args={[3.2, 0.02, d - 1.2]} /><meshStandardMaterial color="#c7d2fe" roughness={0.5} /></mesh>
        {/* walls: a cutaway, low enough for the camera to see over */}
        <mesh position={[0, 0.85, -f * (d / 2 - HALL.wall)]}><boxGeometry args={[w, 1.5, HALL.wall * 2]} /><meshStandardMaterial color="#cbd5e1" roughness={0.7} /></mesh>
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * (w / 2 - HALL.wall), 0.85, 0]}><boxGeometry args={[HALL.wall * 2, 1.5, d]} /><meshStandardMaterial color="#cbd5e1" roughness={0.7} /></mesh>
        ))}
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * (HALL.door + (w / 2 - HALL.door) / 2), 0.85, f * (d / 2 - HALL.wall)]}><boxGeometry args={[w / 2 - HALL.door, 1.5, HALL.wall * 2]} /><meshStandardMaterial color="#cbd5e1" roughness={0.7} /></mesh>
        ))}
        {/* each store's door and sign on the inside of a long wall */}
        {doors.map(({ store, side, local }, k) => (
          <group key={store.id} position={[local.x, 0, local.z]} rotation={[0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <mesh position={[0, 0.75, 0]}><boxGeometry args={[1.2, 1.3, 0.12]} /><meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={0.6} /></mesh>
            <mesh geometry={geometries[k]} position={[0, 1.7, 0.08]} scale={[2.6, 2.6 / 2.4, 1]}><meshBasicMaterial map={atlas.texture} /></mesh>
          </group>
        ))}
        {/* a fountain and planters down the middle */}
        <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[1.3, 1.4, 0.35, 20]} /><meshStandardMaterial color="#94a3b8" roughness={0.6} /></mesh>
        <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[1.05, 1.05, 0.1, 20]} /><meshStandardMaterial color="#38bdf8" roughness={0.1} metalness={0.3} /></mesh>
        {[-1, 1].map((sd) => [-0.32, 0.32].map((q) => (
          <group key={`${sd}${q}`} position={[sd * 1.5, 0, q * d]}>
            <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.7, 0.4, 0.7]} /><meshStandardMaterial color="#78716c" roughness={0.8} /></mesh>
            <mesh position={[0, 0.75, 0]}><sphereGeometry args={[0.45, 8, 6]} /><meshStandardMaterial color="#16a34a" roughness={0.8} /></mesh>
          </group>
        )))}
        {[-0.2, 0.2].map((q) => (
          <mesh key={q} position={[0, 0.3, q * d + 2.6]}><boxGeometry args={[2.2, 0.3, 0.5]} /><meshStandardMaterial color="#92400e" roughness={0.7} /></mesh>
        ))}
      </group>
      {/* the entrance: a canopy on two pillars, and a dark glass door */}
      <mesh position={[0, 2.35, frontZ + f * 1.1]} castShadow><boxGeometry args={[5.6, 0.22, 2.4]} /><meshStandardMaterial color="#6366f1" roughness={0.5} /></mesh>
      {[-2.5, 2.5].map((x) => (
        <mesh key={x} position={[x, 1.2, frontZ + f * 2.05]} castShadow><boxGeometry args={[0.22, 2.3, 0.22]} /><meshStandardMaterial color="#e2e8f0" roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, 1.1, frontZ + f * 0.04]}><boxGeometry args={[4.2, 2, 0.08]} /><meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.5} /></mesh>
      <mesh position={[0, 2.18, frontZ + f * 2.2]}><boxGeometry args={[5.2, 0.05, 0.05]} /><meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={1.2} /></mesh>
      {/* each store's sign along the front */}
      {storeSlots.map(({ st, x, width }, k) => (
        <mesh key={st.id} geometry={geometries[k]} position={[x, h - 0.95, frontZ + f * 0.05]} rotation={[0, faceYaw, 0]} scale={[width, width / 2.4, 1]}>
          <meshBasicMaterial map={atlas.texture} />
        </mesh>
      ))}
      {/* the big roof sign with the mall's name, on two posts */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * w * 0.22, h + 1.4, f * (d / 2 - 1.2)]} castShadow><boxGeometry args={[0.18, 2.4, 0.18]} /><meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, h + 3.8, f * (d / 2 - 1.2)]} rotation={[0, faceYaw, 0]} castShadow>
        <boxGeometry args={[w * 0.6, w * 0.6 * 0.25 + 0.2, 0.2]} />
        <meshStandardMaterial color="#312e81" roughness={0.5} />
      </mesh>
      {[0.11, -0.11].map((o) => (
        <mesh key={o} position={[0, h + 3.8, f * (d / 2 - 1.2) + o * (f < 0 ? -1 : 1)]} rotation={[0, o > 0 ? faceYaw : faceYaw + Math.PI, 0]}>
          <planeGeometry args={[w * 0.6 - 0.2, w * 0.6 * 0.25]} />
          <meshBasicMaterial map={sign} />
        </mesh>
      ))}
    </group>
  );
}

// The two malls (layout.malls). Click one, or walk to its door, to open the directory of its stores.
export default function Malls() {
  const malls = useCityStore((s) => s.layout.malls);
  return (
    <group name="malls">
      {(malls ?? []).map((m) => (
        <Mall key={m.id} mall={m} />
      ))}
    </group>
  );
}
