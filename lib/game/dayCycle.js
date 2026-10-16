// The city's shared day and night. Everyone sees the same time of day because it comes from the world clock (UTC) alone: no server has to tell them.
// One full day lasts DAY_MINUTES real minutes (24 by default, so one city hour is a real minute). Pure, so it is tested in Node.
export const DAY_MINUTES = 24;
export const DAY_MS = DAY_MINUTES * 60 * 1000;

// Time of day as hours 0..24 (0 = midnight, 12 = noon) for the world clock `now` (ms), shifted by the server's clock offset if known.
export function hourAt(now = Date.now(), offsetMs = 0) {
  const t = (((now + offsetMs) % DAY_MS) + DAY_MS) % DAY_MS;
  return (t / DAY_MS) * 24;
}

// The fixed times the Day / Dusk / Night buttons and ?time=day|dusk|night|dawn jump to.
export const PRESET_HOURS = { dawn: 6.5, day: 12, dusk: 19, night: 0 };
export const MODES = ['live', 'dawn', 'day', 'dusk', 'night'];

// What ?time= can hold: live, a preset name, or an hour (0..24, "14" or "14.5"). Returns a mode or null.
export function parseTime(value) {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (MODES.includes(v)) return v;
  if (/^\d{1,2}(\.\d+)?$/.test(v) && Number(v) >= 0 && Number(v) < 24.0001) return v;
  return null;
}

// The hour a mode shows at world time `now`.
export function modeHour(mode, now = Date.now(), offsetMs = 0) {
  if (!mode || mode === 'live') return hourAt(now, offsetMs);
  if (PRESET_HOURS[mode] != null) return PRESET_HOURS[mode];
  const n = Number(mode);
  return Number.isFinite(n) ? ((n % 24) + 24) % 24 : hourAt(now, offsetMs);
}

// Keyframes for the lights, by hour. "day" is the city's original look, so noon is unchanged.
//   amb = ambient light (colour, intensity)   sun = the main light (colour, intensity)   fill = the soft light from the other side
const KEYS = [
  { h: 0, amb: ['#3a4a86', 0.6], sun: ['#7d8fc4', 0.0], fill: ['#7088c8', 0.55], lamps: 1 },
  { h: 4.5, amb: ['#3a4a86', 0.6], sun: ['#7d8fc4', 0.0], fill: ['#7088c8', 0.55], lamps: 1 },
  { h: 6, amb: ['#7a6f96', 0.55], sun: ['#ff9966', 0.55], fill: ['#8c8cc0', 0.4], lamps: 0.7 },
  { h: 7.5, amb: ['#e0d4c6', 0.62], sun: ['#ffd9a8', 1.25], fill: ['#c9d3ee', 0.3], lamps: 0.15 },
  { h: 10, amb: ['#ffffff', 0.7], sun: ['#ffffff', 1.5], fill: ['#ffffff', 0.3], lamps: 0 },
  { h: 15, amb: ['#ffffff', 0.7], sun: ['#ffffff', 1.5], fill: ['#ffffff', 0.3], lamps: 0 },
  { h: 17.5, amb: ['#ecd3b6', 0.64], sun: ['#ffc07a', 1.3], fill: ['#d6c3b6', 0.3], lamps: 0.1 },
  { h: 19, amb: ['#7e6a92', 0.55], sun: ['#ff7a4a', 0.5], fill: ['#7c76b8', 0.42], lamps: 0.8 },
  { h: 20.5, amb: ['#3a4a86', 0.6], sun: ['#7d8fc4', 0.0], fill: ['#7088c8', 0.55], lamps: 1 },
  { h: 24, amb: ['#3a4a86', 0.6], sun: ['#7d8fc4', 0.0], fill: ['#7088c8', 0.55], lamps: 1 },
];

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, f) => a + (b - a) * f;
const mixColor = (a, b, f) => {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex(x.map((c, i) => mix(c, y[i], f)));
};

export function phaseName(hour) {
  if (hour >= 5 && hour < 7.5) return 'Dawn';
  if (hour >= 7.5 && hour < 17.5) return 'Day';
  if (hour >= 17.5 && hour < 20.5) return 'Dusk';
  return 'Night';
}

export function clockLabel(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Everything the scene needs at `hour`: the three lights, where the sun is, and how lit the street lamps should be (0 by day .. 1 at night).
//   sunDir  a unit vector pointing from the city to the sun; it never goes below SUN_MIN so shadows stay sensible while the light fades out
export const SUN_MIN = 0.22;
export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const f = (h - a.h) / (b.h - a.h);
  // the sun rises at 6 in the east, is highest at noon in the south and sets at 18 in the west; at night the moon takes the same path, opposite
  const day = h >= 6 && h <= 18;
  const progress = day ? (h - 6) / 12 : ((h + 6) % 24) / 12; // 0..1 along the arc of whichever is up
  const elevation = Math.max(SUN_MIN, Math.sin(Math.PI * progress) * 0.85);
  const azimuth = Math.PI * (1 - progress); // from east (PI) over south to west (0)
  const horiz = Math.sqrt(Math.max(0, 1 - elevation * elevation));
  // the sun's path is tilted a little off due south; the horizontal part is rescaled so the elevation stays exactly as set
  const hx = Math.cos(azimuth) * -1;
  const hz = Math.sin(azimuth) + 0.2;
  const hl = Math.hypot(hx, hz) || 1;
  const sunDir = [(hx / hl) * horiz, elevation, (hz / hl) * horiz];
  return {
    hour: h,
    phase: phaseName(h),
    ambient: { color: mixColor(a.amb[0], b.amb[0], f), intensity: mix(a.amb[1], b.amb[1], f) },
    sun: { color: mixColor(a.sun[0], b.sun[0], f), intensity: mix(a.sun[1], b.sun[1], f) },
    fill: { color: mixColor(a.fill[0], b.fill[0], f), intensity: mix(a.fill[1], b.fill[1], f) },
    lamps: mix(a.lamps, b.lamps, f),
    sunDir,
  };
}

// The server's clock offset (ms to add to this machine's clock), from a request sent at `sent`, answered with `serverNow`, received at `received`.
export function clockOffset(serverNow, sent, received) {
  if (!Number.isFinite(serverNow) || !Number.isFinite(sent) || !Number.isFinite(received) || received < sent) return 0;
  return Math.round(serverNow - (sent + received) / 2);
}
