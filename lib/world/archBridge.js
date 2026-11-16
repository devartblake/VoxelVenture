// The arch bridge: the North Causeway's water section drawn after the great steel through-arch bridge of Sydney harbour (docs/world/arch_bridge.md). Pure: lists of points for
// apps/web/components/world/ArchBridge.jsx to draw. Everything is in the bridge's own coordinates: `s` along the bridge (0 at the first shore), `lateral` across it (0 the centre line), `y` high.
//
// An arch of two latticed ribs (a top chord and a bottom chord joined by a zigzag web and by uprights) rises from the approach at s0 to a crown at mid-span and comes down at s1. The deck passes between the
// ribs: in the middle, where the arch is above it, it hangs from the bottom chords on vertical hangers; near the ends, where the arch is below the deck, posts carry the deck on the ribs. Cross struts join the
// ribs at the top where there is room under them. Four stone pylons stand at the ends, and nothing stands under the arch.
import { deckHeight } from './chunkMesh';
import { ARCH, archS, inMainSpan, isArch } from './archSpec';
export { ARCH, archS, inMainSpan, isArch };

export function archBridge(bridge) {
  const span = bridge.span;
  const [a0, a1] = archS(span);
  const mid = (a0 + a1) / 2, half = (a1 - a0) / 2;
  const deckTop = bridge.clearance; // the deck's height over its flat middle
  const crown = deckTop + bridge.clearance * ARCH.crownAbove; // the centre line of the ribs at the crown
  const deckY = (s) => deckHeight(bridge, s);
  const u = (s) => (s - mid) / half;
  const centre = (s) => ARCH.springAbove + (crown - ARCH.springAbove) * (1 - u(s) * u(s));
  const depth = (s) => ARCH.depth[0] + (ARCH.depth[1] - ARCH.depth[0]) * u(s) * u(s);
  const top = (s) => centre(s) + depth(s) / 2;
  const bottom = (s) => centre(s) - depth(s) / 2;
  const L = ARCH.legOffset;

  // the ribs: joints along the bridge, a top and a bottom chord point at each, a zigzag web and an upright at each joint
  const n = Math.max(2, Math.round((a1 - a0) / ARCH.panel));
  const joints = Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n);
  const ribs = [-1, 1].map((side) => {
    const topPts = joints.map((s) => ({ s, y: top(s) }));
    const bottomPts = joints.map((s) => ({ s, y: bottom(s) }));
    const web = [];
    for (let i = 0; i < n; i++) web.push(i % 2 === 0 ? { from: { s: joints[i], y: bottom(joints[i]) }, to: { s: joints[i + 1], y: top(joints[i + 1]) } } : { from: { s: joints[i], y: top(joints[i]) }, to: { s: joints[i + 1], y: bottom(joints[i + 1]) } });
    const uprights = joints.map((s) => ({ s, y0: bottom(s), y1: top(s) }));
    return { side, lateral: side * L, top: topPts, bottom: bottomPts, web, uprights };
  });

  // hangers (the arch above the deck) and posts (the arch below it), at both ribs; an outrigger joins each to the deck's edge
  const hangers = [];
  const posts = [];
  for (let s = a0 + ARCH.hangerEvery / 2; s < a1; s += ARCH.hangerEvery) {
    const d = deckY(s);
    if (bottom(s) - d > 0.8) hangers.push({ s, y0: d - ARCH.deckThickness / 2, y1: bottom(s) });
    else if (d - ARCH.deckThickness - top(s) > 0.5) posts.push({ s, y0: top(s), y1: d - ARCH.deckThickness / 2 });
  }

  // cross struts between the ribs at the top chord, where there is room under them for the road and a train
  const struts = [];
  for (let s = a0 + ARCH.strutEvery; s < a1 - ARCH.strutEvery / 2; s += ARCH.strutEvery) if (top(s) - deckY(s) >= ARCH.strutClear) struts.push({ s, y: top(s), lateral0: -L, lateral1: L });

  // four pylons, two at each end beside the deck: a tapering block and a cap
  const pylons = [];
  for (const s of [a0, a1]) {
    for (const side of [-1, 1]) {
      const deck = deckY(s);
      const boxes = [];
      const steps = 4;
      boxes.push({ y0: ARCH.foot, y1: deck, across: ARCH.pylon.across + 0.4, along: ARCH.pylon.along + 0.4 });
      for (let i = 0; i < steps; i++) {
        const k = (i + 0.5) / steps;
        boxes.push({ y0: deck + (ARCH.pylon.top * i) / steps, y1: deck + (ARCH.pylon.top * (i + 1)) / steps, across: ARCH.pylon.across * (1 - 0.28 * k), along: ARCH.pylon.along * (1 - 0.28 * k) });
      }
      boxes.push({ y0: deck + ARCH.pylon.top, y1: deck + ARCH.pylon.top + 0.7, across: ARCH.pylon.across * 0.9, along: ARCH.pylon.along * 0.9 }); // the cap
      pylons.push({ s, lateral: side * ARCH.pylon.offset, top: deck + ARCH.pylon.top + 0.7, boxes });
    }
  }

  // lights for the night: a red beacon on each rib at the crown, a warm light every 8 units along each top chord, and one on each pylon's cap
  const lights = [];
  for (const side of [-1, 1]) {
    lights.push({ kind: 'beacon', s: mid, lateral: side * L, y: top(mid) + 0.6 });
    for (let s = a0 + 4; s < a1; s += 8) lights.push({ kind: 'warm', s, lateral: side * L, y: top(s) + 0.45 });
  }
  for (const p of pylons) lights.push({ kind: 'warm', s: p.s, lateral: p.lateral, y: p.top + 0.5 });
  return { a0, a1, crown, ribs, hangers, posts, struts, pylons, lights, topAt: top, bottomAt: bottom, deckY };
}
