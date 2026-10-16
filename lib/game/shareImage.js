// "Create image": a shareable picture of a building (a 1200 x 630 card, the size social sites show), drawn on a canvas in the browser.
// Nothing leaves the device: the picture is downloaded, or handed to the phone's share sheet where there is one.
const W = 1200;
const H = 630;

function shade(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0x64748b;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

// A little isometric building in the plot's colour: floors set the height.
function drawBuilding(ctx, cx, base, floors, color) {
  const w = 120;
  const d = 90;
  const h = 46 * Math.min(8, Math.max(1, floors));
  const top = base - h;
  ctx.fillStyle = shade(color, 0.7); // left wall
  ctx.beginPath();
  ctx.moveTo(cx - w, base - d / 2);
  ctx.lineTo(cx, base);
  ctx.lineTo(cx, top);
  ctx.lineTo(cx - w, top - d / 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.5); // right wall
  ctx.beginPath();
  ctx.moveTo(cx + w, base - d / 2);
  ctx.lineTo(cx, base);
  ctx.lineTo(cx, top);
  ctx.lineTo(cx + w, top - d / 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 1.1); // roof
  ctx.beginPath();
  ctx.moveTo(cx, top - d);
  ctx.lineTo(cx + w, top - d / 2);
  ctx.lineTo(cx, top);
  ctx.lineTo(cx - w, top - d / 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 244, 190, 0.85)'; // windows on the left wall, following its slope
  const slope = d / 2 / w;
  for (let f = 0; f < Math.min(8, Math.max(1, floors)); f++) {
    for (let i = 0; i < 3; i++) {
      const x = cx - w + 18 + i * 34;
      const y = (xx) => base - d / 2 + (xx - (cx - w)) * slope - 14 - f * 46;
      ctx.beginPath();
      ctx.moveTo(x, y(x));
      ctx.lineTo(x + 20, y(x + 20));
      ctx.lineTo(x + 20, y(x + 20) - 22);
      ctx.lineTo(x, y(x) - 22);
      ctx.fill();
    }
  }
}

// facts: { plot, address, rank, visits, price, floors }
export function drawShareCard(ctx, { plot, address, rank, visits, price, floors }) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b1020');
  g.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
  for (let i = 0; i < 9; i++) ctx.fillRect(60 + i * 140, H - 90 - (i % 4) * 22, 90, 90 + (i % 4) * 22);

  drawBuilding(ctx, 900, 470, floors, plot.color || '#6366f1');

  ctx.fillStyle = '#e2e8f0';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = '#22d3ee';
  ctx.fillText('VOXELVENTURE', 70, 90);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 62px system-ui, sans-serif';
  const title = String(plot.title ?? 'A building');
  let t = title;
  while (ctx.measureText(t).width > 620 && t.length > 4) t = `${t.slice(0, -2)}…`;
  ctx.fillText(t, 70, 200);
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`${plot.district ?? ''}${plot.owner ? `  ·  ${plot.owner}` : ''}`, 70, 250);
  ctx.fillText(address ?? '', 70, 290);

  const stat = (x, label, value) => {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText(label.toUpperCase(), x, 440);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText(String(value), x, 490);
  };
  stat(70, 'Rank by value', `#${rank ?? '-'}`);
  stat(300, 'Visits', visits ?? 0);
  stat(480, 'Value', price != null ? `${Math.round(price).toLocaleString()} G` : '-');
  ctx.fillStyle = '#64748b';
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillText('Walk in and visit: voxelventure', 70, 575);
}

export async function createShareImage(facts) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  drawShareCard(canvas.getContext('2d'), facts);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Share it (the phone's share sheet when it can take a file), otherwise download it. Returns 'shared' | 'saved' | 'failed'.
export async function shareImage(facts) {
  const blob = await createShareImage(facts);
  if (!blob) return 'failed';
  const name = `${String(facts.plot.title ?? 'building').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: facts.plot.title });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'shared'; // the player closed the sheet
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
}
