// Where a demo tour's stop puts the camera, and the tour's timing (docs/product/pilot_tour.md). Pure, so it is tested in Node (tests/tour.test.mjs).
// The game's tour player (apps/web/components/tour/TourPlayer.jsx) moves the follow camera with lib/state/viewStore.js: `free` is the point it
// looks at (in city coordinates), `azimuth` where it stands round that point, then `pitch` and `distance`.

export const FLY_MS = 2400; // how long the camera takes from one stop to the next (a cut with reduced motion)
const DEG = Math.PI / 180;

// The plot's door side as an azimuth: the camera stands in front of the building, looking at its door (the walk-to-the-door spot of the plot card).
export function frontAzimuth(plot) {
  const f = plot?.facing ?? 1;
  const yaw = plot?.yaw ?? 0;
  return Math.atan2(Math.sin(yaw) * f, Math.cos(yaw) * f);
}

// A heading (degrees clockwise from north, the way the camera looks; what the compass shows) as the view store's azimuth.
export const azimuthOfHeading = (deg) => -deg * DEG;
export const headingOfAzimuth = (az) => ((((-az / DEG) % 360) + 360) % 360);

// The middle of a district: the average of its plots.
function districtCentre(id, plots) {
  const own = plots.filter((p) => p.districtId === id);
  if (!own.length) return null;
  return { x: own.reduce((a, p) => a + p.x, 0) / own.length, z: own.reduce((a, p) => a + p.z, 0) / own.length };
}

// The point a target names, in city coordinates, and the plot when it is one: { x, z, plot } or null when this city has no such thing.
export function resolveTarget(target, { plots = [], layout = {} } = {}) {
  if (!target) return null;
  if (target.plot != null) {
    const plot = plots.find((p) => p.id === target.plot);
    return plot ? { x: plot.x, z: plot.z, plot } : null;
  }
  if (target.district) {
    const c = districtCentre(target.district, plots);
    return c ? { ...c, plot: null } : null;
  }
  if (target.place) {
    if (target.place === 'center') return layout.center ? { x: layout.center.x, z: layout.center.z, plot: null } : null;
    const mall = (layout.malls ?? []).find((m) => m.id === target.place);
    return mall ? { x: mall.x, z: mall.z, plot: null } : null;
  }
  if (Number.isFinite(target.x) && Number.isFinite(target.z)) return { x: target.x, z: target.z, plot: null };
  return null;
}

// The camera for a stop: { view, x, z, azimuth, pitch?, distance? }, or null when its target is not in this city.
export function cameraFor(stop, world) {
  const at = resolveTarget(stop.target, world);
  if (!at) return null;
  const cam = stop.camera ?? {};
  const azimuth = cam.heading === 'front' ? (at.plot ? frontAzimuth(at.plot) : 0) : azimuthOfHeading(cam.heading ?? 0);
  return { view: cam.view ?? 'diablo', x: at.x, z: at.z, azimuth, pitch: cam.pitch ?? null, distance: cam.distance ?? null };
}

// Every stop's target that this city does not have (an empty list when the tour fits the city).
export const missingTargets = (tour, world) => tour.stops.filter((s) => !resolveTarget(s.target, world) || (s.action?.plot != null && !world.plots.some((p) => p.id === s.action.plot))).map((s) => s.id);

export const totalMs = (tour) => tour.stops.reduce((a, s) => a + s.durationMs, 0);

// ?tour=<id> and ?tourSpeed=<n> (the recorder and the tests run a tour faster; 1 to 20, 1 when it is not a number)
export function tourParams(search = '') {
  const q = new URLSearchParams(search);
  const speed = Number(q.get('tourSpeed'));
  return { id: q.get('tour') || null, speed: Number.isFinite(speed) && speed >= 1 ? Math.min(20, speed) : 1, start: Math.max(0, Math.floor(Number(q.get('tourStop')) || 1) - 1) };
}

// Smooth in and out (the camera's glide between stops).
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// The short way round from one angle to another.
export const angleDelta = (from, to) => ((((to - from + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
