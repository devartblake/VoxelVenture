// Scoring a round of mini-golf (docs/world/minigolf.md): the name of a hole's score against par, a card's totals, and the best round kept on this device. Pure (the storage is passed in).

/** What a score on a hole is called: strokes against par. A hole in one is always a hole in one. */
export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  if (d <= -3) return 'Albatross';
  return { '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] ?? (d < 0 ? `${-d} under par` : `${d} over par`);
}

/** The signed difference from par as text: 'E', '-2', '+3'. */
export const toPar = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);

/** A card (an array of strokes, one for each hole played so far) against the course's holes: { strokes, par (of the holes played), diff, played }. */
export function cardTotals(card, holes) {
  const played = card.filter((s) => Number.isFinite(s)).length;
  const strokes = card.reduce((n, s) => n + (Number.isFinite(s) ? s : 0), 0);
  const par = holes.slice(0, played).reduce((n, h) => n + h.par, 0);
  return { strokes, par, diff: strokes - par, played };
}

export const BEST_KEY = 'voxelventure-golf-best';

/** The best finished round kept in `storage` ({ getItem, setItem }), for a course: { strokes, par, at } or null. */
export function bestRound(storage, courseId) {
  try { const all = JSON.parse(storage.getItem(BEST_KEY) || '{}'); return all[courseId] ?? null; } catch { return null; }
}

/** Records a finished round if it beats the best (or there is none): returns { best, isBest }. Nothing is sent anywhere: it is this device's. */
export function recordRound(storage, courseId, round, now = Date.now()) {
  const best = bestRound(storage, courseId);
  const isBest = !best || round.strokes < best.strokes;
  if (isBest) {
    try { const all = JSON.parse(storage.getItem(BEST_KEY) || '{}'); all[courseId] = { strokes: round.strokes, par: round.par, at: now }; storage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* not remembered */ }
  }
  return { best: isBest ? { strokes: round.strokes, par: round.par, at: now } : best, isBest };
}
