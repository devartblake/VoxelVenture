import * as THREE from 'three';
import { qualityGate } from '@/lib/performance/runtime';

// Small pixel-style textures drawn on a canvas (no image files): speckled grass for the land, a rough slate for the
// built-up base, and one for each kind of ground patch. They are cached, and filtered "nearest" so they stay crisp
// and blocky like the voxels.
const cache = new Map();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// base colour, then [colour, how many specks, speck size]
const RECIPES = {
  grass: { base: '#2f6b36', specks: [['#2b5f31', 140, 2], ['#36733b', 120, 2], ['#285a2d', 60, 3]] },
  slate: { base: '#1e2a3a', specks: [['#202d3e', 90, 2], ['#1c2837', 90, 2]] }, // almost flat: it is the city's paving, and close up any contrast reads as noise
  dirt: { base: '#8a6a45', specks: [['#6f5236', 120, 2], ['#a08058', 90, 2], ['#5a4129', 40, 3]] },
  gravel: { base: '#8b8b86', specks: [['#6e6e6a', 150, 2], ['#a5a5a0', 150, 2], ['#57575a', 60, 1]] },
  sand: { base: '#dbc994', specks: [['#cdb77c', 120, 2], ['#e8dba9', 100, 2], ['#bfa86d', 30, 1]] },
  dry: { base: '#a7a14d', specks: [['#8f8a3d', 130, 2], ['#bcb560', 100, 2], ['#7a7433', 40, 3]] },
  meadow: { base: '#4f9a3a', specks: [['#3f852f', 120, 2], ['#63ad49', 100, 2], ['#fde68a', 22, 1], ['#f9fafb', 18, 1], ['#f9a8d4', 14, 1], ['#c4b5fd', 10, 1]] },
  moss: { base: '#2f6b4a', specks: [['#265a3d', 130, 3], ['#3a7d58', 100, 2], ['#1d4a32', 50, 3]] },
};

export function groundTexture(kind, { repeat = null, size = 64 } = {}) {
  const key = `${kind}-${size}-${repeat ? repeat.join('x') : 1}`;
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return null;
  const recipe = RECIPES[kind];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = recipe.base;
  ctx.fillRect(0, 0, size, size);
  const rand = rng(kind.length * 7919 + kind.charCodeAt(0) * 31);
  for (const [colour, count, px] of recipe.specks) {
    ctx.fillStyle = colour;
    for (let i = 0; i < count * (size / 64) ** 2; i++) ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), px, px);
  }
  const texture = new THREE.CanvasTexture(canvas);
  // blocky when close, but smoothly averaged with distance (nearest filtering shimmered from the far views)
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = qualityGate.settings.anisotropy; // the tier's texture filtering (8 on high, as before; lib/performance/qualityPolicy.js)
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  cache.set(key, texture);
  return texture;
}
