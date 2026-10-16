// Traffic-signal timing, shared by the signal meshes (IntersectionControl), the cars and the
// pedestrians, so a car stops exactly when its light shows red.
//
// A 12 s cycle: avenue green 0-5 s, yellow 5-6 s, red 6-12 s; the cross street is the mirror
// image (red 0-6 s, green 6-11 s, yellow 11-12 s), so cross traffic is never green together.
// `t` is the clock time plus the intersection's own `phase`, so lights don't all change at once.
export const SIGNAL_CYCLE = 12;

export function signalState(t, onAvenue) {
  const s = ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (onAvenue) return s < 5 ? 'green' : s < 6 ? 'yellow' : 'red';
  return s < 6 ? 'red' : s < 11 ? 'green' : 'yellow';
}

// Seconds until the light for this direction turns green (0 if it already is green or yellow).
export function secondsUntilGreen(t, onAvenue) {
  const s = ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (onAvenue) return s >= 6 ? SIGNAL_CYCLE - s : 0;
  return s < 6 ? 6 - s : 0;
}
