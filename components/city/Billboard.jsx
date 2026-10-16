"use client";

import { useRotatingAd } from './useRotatingAd';
import { textOn } from '@/lib/game/adRotation';
import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

const FRAME_DEPTH = 0.2;
const BOTTOM = 2.0; // underside of the screen frame; the posts are this tall
const MAX_TEXT = 0.86; // widest text, as a share of the screen width

// Largest font size (down to `min`) at which `text` still fits in `maxWidth`.
function fit(ctx, text, weight, start, min, maxWidth) {
  let size = start;
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > min) {
    size -= 4;
    ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  return size;
}

// Paints the screen: the advertiser's creative, or a "your ad here" placeholder with the price.
function paintScreen(canvas, billboard) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const { ad, value } = billboard;
  ctx.clearRect(0, 0, w, h);

  if (!ad) {
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    ctx.setLineDash([22, 16]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2e8f0';
    fit(ctx, 'YOUR AD HERE', '800', 150, 60, w * MAX_TEXT);
    ctx.fillText('YOUR AD HERE', w / 2, h * 0.4);
    ctx.fillStyle = '#34d399';
    ctx.font = '700 64px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`Take this slot for $${Math.round(value * 1.25).toLocaleString()}`, w / 2, h * 0.62);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 40px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Click the billboard to book it', w / 2, h * 0.8);
    return;
  }

  // Creative: a diagonal wash of the brand colour over a dark base.
  // Text is white or near-black, whichever reads better on the brand colour (a light brand colour gets dark text and a gentler wash).
  const fg = textOn(ad.color);
  const light = fg !== '#ffffff';
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, ad.color);
  grad.addColorStop(1, light ? '#cbd5e1' : '#0b1020');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(w * 0.86, h * 0.2, h * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Brand badge
  ctx.fillStyle = light ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(w * 0.12, h * 0.26, h * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = light ? '#ffffff' : ad.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 110px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(ad.advertiser.charAt(0).toUpperCase(), w * 0.12, h * 0.265);

  ctx.textAlign = 'left';
  ctx.fillStyle = fg;
  const headline = ad.headline.toUpperCase();
  fit(ctx, headline, '900', 150, 56, w * MAX_TEXT);
  ctx.fillText(headline, w * 0.07, h * 0.52);

  ctx.fillStyle = fg;
  fit(ctx, ad.tagline, '500', 62, 32, w * MAX_TEXT);
  ctx.fillText(ad.tagline, w * 0.07, h * 0.7);

  // Footer: link and "sponsored" tag
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; // a dark footer: white text on it always reads
  ctx.fillRect(0, h * 0.84, w, h * 0.16);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 44px ui-sans-serif, system-ui, sans-serif';
  let host = ad.url;
  try {
    host = new URL(ad.url).host;
  } catch {
    /* keep the raw text */
  }
  ctx.fillText(host, w * 0.07, h * 0.92);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 32px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('SPONSORED', w * 0.93, h * 0.92);
}

// A large roadside billboard on two posts. The screen shows the current advertiser's creative
// (drawn to a canvas texture) or an empty-slot sign; it is clickable and lights up on hover.
// `billboard` comes from the store: { x, z, yaw, width, height, ad, value }.
export default function Billboard({ billboard, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const { x, z, yaw, width, height, value } = billboard;
  const ad = useRotatingAd(billboard);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round(1024 * (height / width));
    paintScreen(canvas, { ad, value });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [ad, value, width, height]);
  useEffect(() => () => texture.dispose(), [texture]);

  const setHover = (on) => {
    setHovered(on);
    document.body.style.cursor = on ? 'pointer' : '';
  };

  const centerY = BOTTOM + height / 2;
  const frameColor = isSelected ? '#f59e0b' : hovered ? '#64748b' : '#1e293b';

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, yaw, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(billboard);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      {/* Concrete footings and posts */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * width * 0.32, 0, 0]}>
          <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.6, 0.24, 0.6]} />
            <meshStandardMaterial color="#64748b" roughness={0.9} />
          </mesh>
          <mesh position={[0, BOTTOM / 2, 0]} castShadow>
            <boxGeometry args={[0.2, BOTTOM, 0.2]} />
            <meshStandardMaterial color="#475569" roughness={0.6} metalness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Frame and screen */}
      <mesh position={[0, centerY, 0]} castShadow>
        <boxGeometry args={[width + 0.24, height + 0.24, FRAME_DEPTH]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, centerY, FRAME_DEPTH / 2 + 0.005]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {/* Maintenance catwalk under the screen */}
      <mesh position={[0, BOTTOM - 0.02, 0.28]} castShadow>
        <boxGeometry args={[width * 0.9, 0.05, 0.5]} />
        <meshStandardMaterial color="#334155" roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh position={[0, BOTTOM + 0.2, 0.52]}>
        <boxGeometry args={[width * 0.9, 0.03, 0.03]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Spotlights along the top edge */}
      {[-0.32, 0, 0.32].map((f) => (
        <group key={f} position={[f * width, centerY + height / 2 + 0.12, 0]}>
          <mesh position={[0, 0.05, 0.2]}>
            <boxGeometry args={[0.04, 0.04, 0.4]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
          <mesh position={[0, 0.02, 0.42]}>
            <boxGeometry args={[0.18, 0.1, 0.12]} />
            <meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
