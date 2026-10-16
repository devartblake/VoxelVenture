"use client";

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// In-scene text label drawn to a canvas texture. Unlike drei's <Html>, it creates no DOM
// nodes, so remounting labels (Regenerate city, hot reload) can't trip React's removeChild.
export default function Label3D({
  text,
  position,
  background = '#0f172a',
  color = '#ffffff',
  border = null,
  height = 0.8,
}) {
  const { texture, aspect } = useMemo(() => {
    const label = text.toUpperCase();
    const font = 'bold 26px ui-sans-serif, system-ui, sans-serif';
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;

    const padX = 18;
    const w = Math.ceil(measure.measureText(label).width) + padX * 2;
    const h = 44;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(1, 1, w - 2, h - 2, 8);
    else ctx.rect(1, 1, w - 2, h - 2);
    ctx.fillStyle = background;
    ctx.fill();
    if (border) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = border;
      ctx.stroke();
    }

    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2 + 1);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { texture: tex, aspect: w / h };
  }, [text, background, color, border]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}
