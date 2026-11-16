// The numbers behind the dashboard gauges (apps/web/components/ui/Gauges.jsx): pure, so they are tested on their own. The speed shown is the vehicle's speed in map units a second times DISPLAY_SCALE,
// as "km/h": the map is scaled down (a unit is about a metre on a street, far more across the landmasses), so a race car's top speed of 15 units a second reads as 210 km/h and a city car's 7 as 98.
// The gears and the revs are for the dial's feel: the game has no gearbox, they follow the speed.
export const DISPLAY_SCALE = 14;
export const GAUGE_SWEEP = { from: -135, to: 135 }; // the needle's travel, in degrees from straight up

/** The speed to show, in km/h (never negative: reversing shows its speed too). */
export const speedKmh = (speed) => Math.round(Math.abs(speed) * DISPLAY_SCALE);

/** The dial's top: the vehicle's top speed rounded up to the next 40. */
export const gaugeMax = (spec) => Math.ceil((spec.maxSpeed * DISPLAY_SCALE) / 40) * 40;

/** The needle's angle in degrees for a speed, held to the dial. */
export function needleAngle(kmh, max) {
  const t = Math.max(0, Math.min(1, kmh / max));
  return GAUGE_SWEEP.from + (GAUGE_SWEEP.to - GAUGE_SWEEP.from) * t;
}

// where each gear ends, as a share of the top speed
const GEARS = [0.12, 0.26, 0.42, 0.6, 0.8, 1];

/** The gear to show: 'R' reversing, 'N' standing still, then 1 to 6 from the speed. */
export function gearOf(speed, spec) {
  if (speed < -0.15) return 'R';
  if (Math.abs(speed) < 0.15) return 'N';
  const share = Math.min(1, Math.abs(speed) / spec.maxSpeed);
  return GEARS.findIndex((end) => share <= end) + 1;
}

/** The revs, 0 to 1: they climb through each gear's band and fall back on the next gear, 0.3 at the bottom of a band and 1 at the top; idling is 0.2. */
export function revsOf(speed, spec) {
  const g = gearOf(speed, spec);
  if (g === 'N') return 0.2 + Math.min(0.1, Math.abs(speed));
  if (g === 'R') return 0.35 + Math.min(0.4, Math.abs(speed) / spec.maxSpeed);
  const share = Math.min(1, Math.abs(speed) / spec.maxSpeed);
  const lo = g === 1 ? 0 : GEARS[g - 2], hi = GEARS[g - 1];
  return 0.3 + 0.7 * ((share - lo) / (hi - lo || 1));
}

/** The tick marks of the dial: a major one every 20 (race car) or 10 km/h, and the labels at every second major. */
export function ticks(max) {
  const step = max > 150 ? 20 : 10;
  const out = [];
  for (let v = 0; v <= max; v += step) out.push({ value: v, major: v % (step * 2) === 0, angle: needleAngle(v, max) });
  return out;
}
