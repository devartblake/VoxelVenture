"use client";

import React from 'react';
import * as THREE from 'three';

export const MARKING_Y = 0.036;
export const CROSSWALK_DEPTH = 0.45;
export const CROSSWALK_WIDTH = 1.56; // spans the 1.6 road

// Zebra stripes as a shared texture: bars run along the direction of travel.
const zebraTextures = {};
function getZebra(stripesAlongX) {
  const key = stripesAlongX ? 'x' : 'z';
  if (!zebraTextures[key]) {
    const canvas = document.createElement('canvas');
    canvas.width = stripesAlongX ? 128 : 16;
    canvas.height = stripesAlongX ? 16 : 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f1f5f9';
    const segments = 11; // 6 bars, 5 gaps
    const size = (stripesAlongX ? canvas.width : canvas.height) / segments;
    for (let i = 0; i < segments; i += 2) {
      if (stripesAlongX) ctx.fillRect(i * size, 0, size, canvas.height);
      else ctx.fillRect(0, i * size, canvas.width, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    zebraTextures[key] = tex;
  }
  return zebraTextures[key];
}

// Zebra crossing centered at `position` ([x, z] relative to the parent group). `carsAlongX`: cars
// travel along X, so the pedestrian crosses along Z.
export function ZebraCrossing({ position, carsAlongX }) {
  return (
    <mesh position={[position[0], MARKING_Y, position[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={carsAlongX ? [CROSSWALK_DEPTH, CROSSWALK_WIDTH] : [CROSSWALK_WIDTH, CROSSWALK_DEPTH]} />
      <meshStandardMaterial map={getZebra(!carsAlongX)} transparent alphaTest={0.5} roughness={0.9} />
    </mesh>
  );
}
