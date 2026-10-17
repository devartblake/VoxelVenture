import * as THREE from 'three';
import { LOGO_ICONS, boardColor, generatedSpec } from '@/lib/game/logos';

// The faces of the roof banners, drawn on one canvas (an atlas), so every banner in the city is one draw call.
// A face is 192 x 80 (the shape of an ordinary banner): the logo in a square on the left, the business name beside it.
export const CELL_W = 192;
export const CELL_H = 80;
const COLS = 10;

const imageCache = new Map(); // data: URL -> HTMLImageElement (loaded)
const loading = new Set();

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A generated logo: the business's letters in a shape that goes with its type.
function drawGenerated(ctx, spec, x, y, size) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2;
  ctx.fillStyle = spec.bg;
  ctx.beginPath();
  if (spec.shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  } else if (spec.shape === 'tag') {
    roundRect(ctx, x, y + size * 0.1, size, size * 0.8, size * 0.16);
  } else {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = spec.fg;
  ctx.stroke();
  ctx.fillStyle = spec.fg;
  ctx.font = `800 ${Math.round(size * (spec.letters.length > 1 ? 0.44 : 0.52))}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.letters, cx, cy + 2);
}

function drawName(ctx, name, x, y, w, h, dark) {
  const words = String(name).trim().split(/\s+/);
  // one line if it fits, else two: split the words as evenly as possible
  let lines = [words.join(' ')];
  if (words.length > 1) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const score = Math.max(a.length, b.length);
      if (!best || score < best.score) best = { lines: [a, b], score };
    }
    lines = words.join(' ').length <= 11 ? lines : best.lines;
  }
  let size = lines.length > 1 ? 21 : 26;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const fit = () => {
    ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
    return Math.max(...lines.map((l) => ctx.measureText(l).width));
  };
  while (size > 11 && fit() > w) size -= 1;
  fit();
  const gap = size * 1.12;
  const top = y + h / 2 - ((lines.length - 1) * gap) / 2;
  lines.forEach((l, i) => {
    if (!dark) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(l, x + 1.5, top + i * gap + 1.5);
    }
    ctx.fillStyle = dark ? '#0f172a' : '#ffffff';
    ctx.fillText(l, x, top + i * gap);
  });
}

function drawFace(ctx, ox, oy, plot, logo, redraw) {
  const color = boardColor(plot, logo);
  const dark = luminance(color) > 0.62;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.beginPath();
  ctx.rect(0, 0, CELL_W, CELL_H);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, CELL_W, CELL_H);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(0, 0, CELL_W, CELL_H / 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = dark ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.7)';
  ctx.strokeRect(2, 2, CELL_W - 4, CELL_H - 4);

  const size = CELL_H - 18;
  const lx = 10;
  const ly = 9;
  if (logo.kind === 'image') {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, lx, ly, size, size, 8);
    ctx.fill();
    const img = imageCache.get(logo.image);
    if (img) {
      const k = Math.min((size - 8) / img.width, (size - 8) / img.height);
      ctx.drawImage(img, lx + (size - img.width * k) / 2, ly + (size - img.height * k) / 2, img.width * k, img.height * k);
    } else if (!loading.has(logo.image)) {
      loading.add(logo.image);
      const el = new Image();
      el.onload = () => {
        imageCache.set(logo.image, el);
        loading.delete(logo.image);
        redraw();
      };
      el.onerror = () => loading.delete(logo.image);
      el.src = logo.image;
    }
  } else if (logo.kind === 'icon') {
    const icon = LOGO_ICONS.find((i) => i.id === logo.icon);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx + size / 2, ly + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.round(size * 0.62)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(icon?.emoji ?? '⭐', lx + size / 2, ly + size / 2 + 3);
  } else {
    drawGenerated(ctx, generatedSpec(plot), lx, ly, size);
  }
  drawName(ctx, plot.title, lx + size + 10, 6, CELL_W - (lx + size + 10) - 10, CELL_H - 12, dark);
  ctx.restore();
}

// items: [{ id, plot, logo }]. Returns { texture, cols, rows, index: Map(id -> cell) }. `onUpdate` is called when a picture
// that was still loading arrives and the texture has been redrawn.
export function buildBannerAtlas(items, onUpdate) {
  const cols = COLS;
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W;
  canvas.height = rows * CELL_H;
  const ctx = canvas.getContext('2d');
  const index = new Map();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = () => {
    items.forEach((item, i) => drawFace(ctx, (i % cols) * CELL_W, Math.floor(i / cols) * CELL_H, item.plot, item.logo, redraw));
    texture.needsUpdate = true;
    onUpdate?.();
  };
  items.forEach((item, i) => {
    index.set(item.id, i);
    drawFace(ctx, (i % cols) * CELL_W, Math.floor(i / cols) * CELL_H, item.plot, item.logo, redraw);
  });
  return { texture, cols, rows, index };
}
