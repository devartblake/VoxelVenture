// What the city sounds like: a quiet hum, traffic that follows the hours, birds by daylight, crickets at night, all muffled indoors.
// This file only decides the levels (0..1) from the sky and where the listener is; apps/web/components/SoundEngine.jsx makes the sound. Pure, so it is tested in Node.
const clamp01 = (n) => Math.max(0, Math.min(1, n));

// How busy the streets are at an hour of the day (0..1): quiet at night, rush hours at 8 and 17:30, busy through the day.
export function trafficLevel(hour) {
  const h = ((hour % 24) + 24) % 24;
  const bump = (centre, width) => Math.exp(-(((h - centre) / width) ** 2));
  return clamp01(0.12 + 0.55 * bump(13, 5.5) + 0.35 * bump(8, 1.4) + 0.4 * bump(17.5, 1.6));
}

// The level of each layer. `sky` is skyAt(hour) from dayCycle.js; `indoors` is true inside a building; `driving` while in a car; `water` 0..1 near the river or a lake.
export function soundMix({ sky, indoors = false, driving = false, water = 0 } = {}) {
  const hour = sky?.hour ?? 12;
  const daylight = clamp01((sky?.sun?.intensity ?? 1.5) / 1.5);
  const night = clamp01(sky?.lamps ?? 0);
  const dawnBoost = hour >= 5 && hour < 9 ? 1.3 : 1;
  const traffic = trafficLevel(hour);
  return {
    master: indoors ? 0.28 : 1,
    lowpass: indoors ? 900 : 16000,
    hum: 0.3 + 0.25 * traffic,
    traffic: (driving ? 0.5 : 1) * traffic * 0.8,
    birds: clamp01(daylight ** 1.5 * dawnBoost * (1 - 0.6 * traffic)),
    crickets: clamp01(night ** 2 * (1 - 0.5 * traffic)),
    water: clamp01(water) * 0.5,
  };
}

// Milliseconds until the next bird call or cricket burst; busier layers call more often. Returns Infinity when the layer is silent.
export function nextCallDelay(level, rand = Math.random) {
  if (!(level > 0.02)) return Infinity;
  return Math.round((1200 + rand() * 4200) / (0.4 + level));
}

// The notes of one bird call: a few short rising or falling chirps, as [start (s), length (s), from Hz, to Hz].
export function birdCall(rand = Math.random) {
  const notes = [];
  const n = 2 + Math.floor(rand() * 3);
  const base = 2200 + rand() * 1800;
  const rising = rand() < 0.5;
  for (let i = 0; i < n; i++) {
    const from = base * (1 + 0.08 * i);
    notes.push([i * 0.14, 0.09, from, rising ? from * 1.35 : from * 0.75]);
  }
  return notes;
}

// One cricket burst: a run of short high pulses, as [start (s), length (s), Hz].
export function cricketBurst(rand = Math.random) {
  const pulses = 3 + Math.floor(rand() * 3);
  const hz = 4100 + rand() * 500;
  return Array.from({ length: pulses }, (_, i) => [i * 0.075, 0.04, hz]);
}
