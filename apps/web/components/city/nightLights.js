import * as THREE from 'three';

// Things that light up at night. A material is registered once with how bright it is by day and by night; DayNight.jsx calls applyGlow() each frame with
// how dark it is (the sky's `lamps`, 0 by day to 1 at night). Shared materials keep this cheap: the merged road meshes and the instanced buildings all
// use one material each, so a few numbers change and thousands of lamps and windows follow.
const glows = new Set();

export function registerGlow(material, { day = 0, night = 1 } = {}) {
  const entry = { material, day, night, last: -1 };
  glows.add(entry);
  material.emissiveIntensity = day;
  return () => glows.delete(entry);
}

export function applyGlow(dark) {
  for (const g of glows) {
    const v = g.day + (g.night - g.day) * dark;
    if (Math.abs(v - g.last) < 0.01) continue;
    g.last = v;
    g.material.emissiveIntensity = v;
  }
}

// The street lamp heads (straight, diagonal and curved roads all use this one material).
export const lampHeadMaterial = new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: '#fde68a', emissiveIntensity: 1 });
registerGlow(lampHeadMaterial, { day: 1, night: 3.5 });

// A material that lights its textured parts from its own colour map (the windows of the 3D building models): warm, and only at night.
export function glowFromMap(material, { night = 0.6, color = '#ffcf8a' } = {}) {
  if (!material?.map) return () => {};
  material.emissive = new THREE.Color(color);
  material.emissiveMap = material.map;
  material.needsUpdate = true;
  return registerGlow(material, { day: 0, night });
}
