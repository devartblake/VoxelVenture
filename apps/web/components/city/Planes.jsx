"use client";

import { useRotatingAd } from './useRotatingAd';
import { textOn } from '@/lib/game/adRotation';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import { flightClock, flightPlanFor, flightState, trailPoint } from '@/lib/sim/flight';
import { useCityStore } from '@/lib/state/store';

const SEGMENTS = 24; // the banner is a strip of this many quads
const STEP = 0.2; // seconds of flight between the strip's columns (about 1.3 units at cruise: a banner about 31 units long)
const FIRST = 0.55; // the banner starts this far behind the tail (the tow rope)
const BANNER_HEIGHT = 3.6;
const PLANE_COLOURS = [
  { body: '#facc15', trim: '#dc2626' },
  { body: '#f8fafc', trim: '#2563eb' },
];

// The ad on a banner, drawn on a canvas: the advertiser's colour with a headline, or an invitation when the space
// is for sale. Read left to right from the tail to the plane.
function drawBanner(canvas, banner) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const ad = banner.ad;
  const bg = ad?.color ?? '#facc15';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const fg = textOn(bg); // white or near-black, whichever has the higher WCAG contrast on the background
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, width, 10);
  ctx.fillRect(0, height - 10, width, 10);
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const main = (ad ? ad.headline : 'YOUR AD HERE').toUpperCase();
  const sub = ad ? ad.tagline : `BUY THIS BANNER · ${banner.airline}`;
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText(main, width / 2, height * 0.38, width - 60);
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(sub, width / 2, height * 0.76, width - 60);
}

function Plane({ index, plan, banner }) {
  const body = useRef(null);
  const prop = useRef(null);
  const bannerGroup = useRef(null);
  const rope = useRef(null);
  const colours = PLANE_COLOURS[index % PLANE_COLOURS.length];

  // the banner strip: pairs of vertices (top, bottom) along the trail, rewritten every frame
  const strip = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
    const uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = 1 - i / SEGMENTS; // the plane (column 0) is the right-hand end, so text reads tail to plane
      uvs.set([u, 1, u, 0], i * 4);
    }
    const indices = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const topHead = i * 2;
      const botHead = i * 2 + 1;
      const topTail = (i + 1) * 2;
      const botTail = (i + 1) * 2 + 1;
      indices.push(botTail, botHead, topHead, botTail, topHead, topTail);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return geometry;
  }, []);

  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    return c;
  }, []);
  const { front, back } = useMemo(() => {
    const front = new THREE.CanvasTexture(canvas);
    front.colorSpace = THREE.SRGBColorSpace;
    // the other side shows the same text the right way round
    const back = front.clone();
    back.wrapS = THREE.RepeatWrapping;
    back.repeat.x = -1;
    back.offset.x = 1;
    return { front, back };
  }, [canvas]);

  const ad = useRotatingAd(banner); // the banner rotates through the ads that share it
  useEffect(() => {
    drawBanner(canvas, { ...banner, ad });
    front.needsUpdate = true;
    back.needsUpdate = true;
  }, [canvas, front, back, banner, ad]);

  const ropeLine = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#e2e8f0' }));
  }, []);

  useGatedFrame(LOOPS.distantSimulation, ({ clock }) => {
    const time = flightClock();
    const s = flightState(plan, index, time);
    const g = body.current;
    if (!g) return;
    g.position.set(s.x, s.y, s.z);
    g.rotation.set(-s.pitch, s.yaw, s.roll, 'YXZ');
    if (prop.current) prop.current.rotation.z = clock.elapsedTime * (s.onGround && s.speed < 0.3 ? 4 : 60);

    const towing = s.towing;
    if (bannerGroup.current) bannerGroup.current.visible = towing;
    ropeLine.visible = towing;
    if (!towing) return;
    const pos = strip.attributes.position;
    let first = null;
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = trailPoint(plan, index, time, FIRST + i * STEP);
      const flutter = Math.sin(clock.elapsedTime * 7 + i * 0.8) * 0.07 * (i / SEGMENTS);
      const top = Math.max(p.y - 0.25 + flutter, 0.35);
      const bottom = Math.max(top - BANNER_HEIGHT, 0.04);
      pos.setXYZ(i * 2, p.x, top, p.z);
      pos.setXYZ(i * 2 + 1, p.x, bottom, p.z);
      if (i === 0) first = [p.x, top, p.z];
    }
    pos.needsUpdate = true;
    strip.computeBoundingSphere();
    // the rope from the plane's tail to the front of the banner
    const tail = new THREE.Vector3(0, -0.05, -1.25).applyEuler(g.rotation).add(g.position);
    const rp = ropeLine.geometry.attributes.position;
    rp.setXYZ(0, tail.x, tail.y, tail.z);
    rp.setXYZ(1, first[0], first[1], first[2]);
    rp.needsUpdate = true;
    ropeLine.geometry.computeBoundingSphere();
  });

  const select = (e) => {
    e.stopPropagation();
    useCityStore.getState().setSelectedBillboard(banner);
  };
  const over = (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  };
  const out = () => (document.body.style.cursor = '');
  const handlers = { onClick: select, onPointerOver: over, onPointerOut: out };

  return (
    <>
      {/* the plane: a small voxel high-wing prop plane; the nose points along local +Z */}
      <group ref={body} scale={1.35}>
        <group {...handlers}>
          {/* a generous invisible target, so a small, fast plane is easy to click */}
          <mesh>
            <sphereGeometry args={[2.1, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.46, 2.1]} />
            <meshStandardMaterial color={colours.body} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, 0.95]}>
            <boxGeometry args={[0.54, 0.5, 0.4]} />
            <meshStandardMaterial color={colours.trim} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.2, 0.35]}>
            <boxGeometry args={[0.46, 0.2, 0.5]} />
            <meshStandardMaterial color="#7dd3fc" roughness={0.1} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.34, 0.1]} castShadow>
            <boxGeometry args={[3.2, 0.08, 0.62]} />
            <meshStandardMaterial color={colours.trim} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.06, -0.95]} castShadow>
            <boxGeometry args={[1.2, 0.06, 0.3]} />
            <meshStandardMaterial color={colours.trim} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.32, -0.95]} castShadow>
            <boxGeometry args={[0.07, 0.5, 0.36]} />
            <meshStandardMaterial color={colours.trim} roughness={0.5} />
          </mesh>
          <mesh position={[0, -0.34, 0.35]}>
            <boxGeometry args={[0.7, 0.08, 0.08]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          {[-0.3, 0.3].map((x) => (
            <mesh key={x} position={[x, -0.4, 0.35]}>
              <boxGeometry args={[0.12, 0.16, 0.18]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
          ))}
          <group ref={prop} position={[0, 0.02, 1.2]}>
            <mesh>
              <boxGeometry args={[1.1, 0.1, 0.04]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
          </group>
        </group>
      </group>

      {/* the banner: one strip, seen from either side (the back shows the text the right way round) */}
      <group ref={bannerGroup} visible={false}>
        <mesh geometry={strip} frustumCulled={false} {...handlers}>
          <meshBasicMaterial map={front} side={THREE.FrontSide} toneMapped={false} />
        </mesh>
        <mesh geometry={strip} frustumCulled={false} {...handlers}>
          <meshBasicMaterial map={back} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      </group>
      <primitive ref={rope} object={ropeLine} />
    </>
  );
}

// The banner planes (lib/sim/flight.js). Each plane is tied to a banner ad slot: click the plane or its banner.
export default function Planes() {
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  const billboards = useCityStore((s) => s.billboards);
  const plan = useMemo(() => flightPlanFor(layout, plots), [layout, plots]);
  const banners = billboards.filter((b) => b.kind === 'banner');

  // for the test driver (development, or ?diag=1): where a plane is right now
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && !new URLSearchParams(window.location.search).has('diag')) return undefined;
    window.__vvPlaneState = (i) => flightState(plan, i, flightClock());
    return () => {
      delete window.__vvPlaneState;
    };
  }, [plan]);

  return (
    <group name="planes">
      {plan.planes.map((p) => {
        const banner = banners[p.index];
        return banner ? <Plane key={`${layout.seed}-${p.index}`} index={p.index} plan={plan} banner={banner} /> : null;
      })}
    </group>
  );
}
