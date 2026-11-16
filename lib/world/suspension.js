// The suspension bridge: Harbor Causeway's water section drawn after a great suspension bridge (the owner's request; the shape of the Golden Gate Bridge: two tall towers with cross struts, a main cable
// hung over each tower on each side, back-stays down to the shore, vertical suspenders from the cables to the deck, the colour International Orange, and no piers under the main span). Pure: the
// towers, the cables and the suspenders as lists of points, for apps/web/components/world/Suspension.jsx to draw; lib/world/chunkMesh.js asks `inMainSpan` to leave the piers out under the main span.
// Everything is in the bridge's own coordinates: `s` along the bridge (0 at the first shore, `span` at the other), `lateral` across it (0 the centre line, + toward the normal of lib/world/train.js's line).
//
// The real bridge's proportions are kept where they fit: the main span is about two thirds of the bridge and each side span a sixth (1280 m and 343 m of 1966 m), the towers stand 2.4 times as high
// above the deck as the deck is above the water (160 m over 67 m), the cable sags to about a 9th of the span's height at mid-span (it comes within 5 m of the deck), and the deck is a flat, high main span with the road
// rising to it from each shore (the game's deck: lib/world/chunkMesh.js deckHeight).
import { deckHeight } from './chunkMesh';
import { SUSPENSION, inMainSpan, isSuspension, towerS } from './suspensionSpec';
export { SUSPENSION, inMainSpan, isSuspension, towerS };

/**
 * The structure for a bridge piece `bridge` = { span, clearance }: { towers, cables, hangers } with every point in { s, lateral, y }.
 *   towers[i]  { s, top (the y of the head), deck (the deck's y there), legs: [{ lateral, boxes: [{ y0, y1, across, along }] }], braces: [{ y, lateral0, lateral1 }], head: { y, ... } }
 *   cables     [{ side (-1 or 1), points: [...] }]  one polyline for each side and each part (the side span, the main span, the side span)
 *   hangers    [{ side, s, y0 (at the deck), y1 (at the cable) }]
 */
export function suspension(bridge) {
  const S = SUSPENSION;
  const span = bridge.span;
  const deckY = (s) => deckHeight(bridge, s);
  const [t0, t1] = towerS(span);
  const rise = bridge.clearance * S.heightAbove; // a tower's height above its deck
  const towers = [t0, t1].map((s) => {
    const deck = deckY(s);
    const top = deck + rise;
    const legs = [-1, 1].map((side) => {
      // the leg is a stack of boxes that narrows toward the head: from the foundation to the deck wide and straight, above the deck tapering
      const boxes = [];
      const n = 8;
      for (let i = 0; i < n; i++) {
        const y0 = deck + (rise * i) / n, y1 = deck + (rise * (i + 1)) / n, k = (i + 0.5) / n;
        boxes.push({ y0, y1, across: S.legBase[0] + (S.legTop[0] - S.legBase[0]) * k, along: S.legBase[1] + (S.legTop[1] - S.legBase[1]) * k });
      }
      boxes.unshift({ y0: S.foot, y1: deck, across: S.legBase[0] + 0.5, along: S.legBase[1] + 0.5 }); // the pier under the deck: the leg continues down into the water
      return { lateral: side * S.legOffset, boxes };
    });
    const braces = [...S.braces.map((f) => deck + rise * f), top - 0.6].map((y) => ({ y, lateral0: -S.legOffset, lateral1: S.legOffset }));
    return { s, deck, top, legs, braces };
  });

  // the main cable of each side: a parabola from the head of one tower to the head of the other, its lowest point `sag` of the rise above the deck at mid-span; the back-stays run from each head down
  // to the shore end of the bridge, where the deck is at the ground (a shallow sag, so they hang a little)
  const cables = [];
  const sample = (a, b, f, n) => Array.from({ length: n + 1 }, (_, i) => { const s = a + ((b - a) * i) / n; return { s, y: f(s) }; });
  const midY = (deckY(t0) + deckY(t1)) / 2 + rise * S.sag;
  const main = (s) => { const u = (s - (t0 + t1) / 2) / ((t1 - t0) / 2); return midY + (towers[0].top - midY) * u * u; };
  // a back-stay: from the head of the tower (`towerS`, height `top`) down to the shore end (`shoreS`, anchored 1.5 above the road there), hanging a little below the straight line
  const stay = (towerAt, shoreAt, top) => (s) => {
    const u = Math.min(1, Math.max(0, Math.abs(s - towerAt) / Math.abs(shoreAt - towerAt)));
    const anchor = deckY(shoreAt) + 1.5;
    return top + (anchor - top) * u - Math.sin(Math.PI * u) * rise * 0.04;
  };
  for (const side of [-1, 1]) {
    cables.push({ side, part: 'back0', points: sample(0, t0, stay(t0, 0, towers[0].top), 20) });
    cables.push({ side, part: 'main', points: sample(t0, t1, main, 60) });
    cables.push({ side, part: 'back1', points: sample(t1, span, stay(t1, span, towers[1].top), 20) });
  }
  const cableAt = (s) => (s <= t0 ? stay(t0, 0, towers[0].top)(s) : s >= t1 ? stay(t1, span, towers[1].top)(s) : main(s));
  const hangers = [];
  for (const side of [-1, 1]) {
    for (let s = S.hangerEvery; s < span - S.hangerEvery / 2; s += S.hangerEvery) {
      if (Math.abs(s - t0) < 2 || Math.abs(s - t1) < 2) continue;
      const y1 = cableAt(s), y0 = deckY(s);
      if (y1 - y0 > 0.8) hangers.push({ side, s, y0, y1 });
    }
  }
  return { towers, cables, hangers, cableAt };
}

/** The deck of a suspension bridge as pieces laid along the slope: [{ s (the middle), y (the road surface there), pitch, length }]. The road surface is the game's (deckHeight), so a car on the deck is on it. */
export function deckSegments(bridge) {
  const n = Math.ceil(bridge.span / SUSPENSION.deckSegment);
  const len = bridge.span / n;
  return Array.from({ length: n }, (_, i) => {
    const s = (i + 0.5) * len;
    const y0 = deckHeight(bridge, i * len), y1 = deckHeight(bridge, (i + 1) * len);
    return { s, y: (y0 + y1) / 2, pitch: Math.atan2(y1 - y0, len), length: len };
  });
}
