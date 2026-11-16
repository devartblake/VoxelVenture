// The racing track's lap timer on the page (docs/world/racing_track.md, "Lap timing"): from the avatar's position, which point of the circuit it has just passed. Pure: it keeps only the run in progress.
// The page uses it to show the lap clock and to know when to tell the server ("I am at point 3"); the server does its own timing and decides what counts (services/api/race.mjs). The points are the
// manifest's: the start line, then the seven checkpoints, then the start line again.
export const PASS_RADIUS = 12; // a pass is being within this many units of the point (the server allows 16)

/**
 * createLapTimer({ points: [{ x, z }, ...] }): update(x, z, now) returns the events this position causes: [{ type: 'start' | 'checkpoint' | 'lap', index, ms }].
 * `ms` is the time since the run began (for a lap, the lap time). After the start line it waits for point 1, then 2, ... then the start line again, which ends the lap and begins the next.
 */
export function createLapTimer({ points, radius = PASS_RADIUS }) {
  let next = 0; // the point it is waiting for: 0 before the first start, then 1 to points.length - 1, then 0 again
  let began = null; // when this lap began
  let inside = null; // the point the avatar is still standing at (so one crossing is one event)
  let laps = 0;
  const near = (x, z, p) => Math.hypot(x - p.x, z - p.z) <= radius;
  return {
    update(x, z, now) {
      const events = [];
      const at = points.findIndex((p) => near(x, z, p));
      if (at < 0) { inside = null; return events; }
      if (at === inside) return events; // still at the same point
      inside = at;
      if (at === 0 && next === 0 && began === null) { began = now; next = 1; events.push({ type: 'start', index: 0, ms: 0 }); }
      else if (at === next && at !== 0) { next = (next + 1) % points.length; events.push({ type: 'checkpoint', index: at, ms: now - began }); }
      else if (at === 0 && next === 0 && began !== null) { laps++; const ms = now - began; began = now; next = 1; events.push({ type: 'lap', index: 0, ms, lap: laps }); }
      else if (at === 0 && next !== 0) { began = now; next = 1; events.push({ type: 'start', index: 0, ms: 0 }); } // back at the line without finishing: a fresh run
      return events;
    },
    state: () => ({ next, began, laps }),
    reset() { next = 0; began = null; inside = null; laps = 0; },
  };
}

export const formatLap = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), t = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
};
