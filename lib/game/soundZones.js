// Presence-based sound, the way the SimCity games do it: what you hear depends on where you are and how close you look. Close to the ground, the places around you are
// heard (the arcade's bleeps, a cafe's jazz, a busy street, the carousel organ at the fun park, water lapping at a pier); high above the map you hear the city's music
// instead, with only a faint city murmur under it. Every sound has a place; the nearer you are the louder it is, and it fades out over a distance.
//
// This file is the rules (pure, so they are tested in Node): the places that make sound (`buildEmitters`), how far each is heard (`zoneWeights`), how near or far
// from the ground the view is (`viewFarness`), and the level of every layer of sound (`mixZones`). apps/web/components/SoundEngine.jsx makes the sounds.
import { trafficLevel } from './soundscape';

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const smooth = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

// The zones. `fade` is how far beyond a place it can still be heard; `loud` how far it carries (a fun park and an airport carry far, a cafe does not).
export const ZONES = {
  arcade: { label: 'Arcade', fade: 12 },
  jazz: { label: 'Cafe jazz', fade: 9 },
  office: { label: 'Offices', fade: 10 },
  market: { label: 'Market', fade: 12 },
  park: { label: 'Park', fade: 12 },
  water: { label: 'Water', fade: 9 },
  mall: { label: 'Mall', fade: 14 },
  airport: { label: 'Airport', fade: 45 },
  funfair: { label: 'Fun park', fade: 34 },
  farm: { label: 'Countryside', fade: 30 },
  street: { label: 'Busy street', fade: 10 },
};
export const LOCAL_ZONES = Object.keys(ZONES);
export const MAX_LOCAL = 4; // at most this many local layers sound at once (the loudest): keeps the audio light and the mix clear

// How much traffic a road makes, by kind and class
const ROAD_NOISE = { arterial: 1, ring: 0.9, drive: 0.7, avenue: 0.65, street: 0.6, county: 0.45, design: 0.3, infill: 0.25, spur: 0.2, lake: 0.15, airport: 0.2, highland: 0.15, diagonal: 1 };
const roadNoise = (r) => (r.class === 'arterial' ? Math.max(ROAD_NOISE[r.kind] ?? 0.6, 0.9) : ROAD_NOISE[r.kind] ?? 0.5);

const rectOf = (x, z, hw, hd) => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
// distance from a point to a rectangle (0 inside)
export const gapTo = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

// The places that make sound in a finished city ({ plots, layout }). Each: { zone, rect, gain (0..1, how strong it is), fade (how far beyond it is heard) }.
// Rooms with a type of business make that business's sound: arcades bleep, restaurants play jazz, offices hum and tap, the bazaar's shops are a market.
export function buildEmitters({ plots = [], layout }) {
  const out = [];
  const add = (zone, rect, gain = 1, fade = ZONES[zone].fade) => out.push({ zone, rect, gain, fade });
  for (const p of plots) {
    if (!p.owner || p.buildingType === 'house') continue; // an empty lot makes no noise
    const box = rectOf(p.x, p.z, (p.w ?? 3) / 2, (p.d ?? 3) / 2);
    const theme = p.interiorData?.theme;
    if (p.districtId === 'arcade' || theme === 'arcade') add('arcade', box, 1, 8);
    else if (p.districtId === 'bazaar') add('market', box, 0.7, 8);
    else if (p.buildingType === 'restaurant') add('jazz', box, 0.8, 7);
    else if (p.districtId === 'saas' || p.buildingType === 'office') add('office', box, 0.6, 7);
  }
  for (const k of layout.parks ?? []) add('park', rectOf(k.center.x, k.center.z, k.width / 2, k.depth / 2), 1);
  for (const l of layout.lakes ?? []) add('water', rectOf(l.x, l.z, l.rx, l.rz), 1);
  for (const v of layout.rivers ?? []) add('water', { x0: v.x0, x1: v.x1, z0: v.z0, z1: v.z1 }, 1);
  for (const p of layout.piers ?? []) add('water', rectOf(p.tip.x, p.tip.z, 2, 2), 0.9, 8); // the creak and lap of a pier carries a little further
  for (const m of layout.malls ?? []) add('mall', m.rect, 1);
  for (const a of layout.airports ?? []) add('airport', a.rect, 1);
  if (layout.amusement) add('funfair', layout.amusement.rect, 1);
  const market = (layout.reserved ?? []).find((r) => r.market);
  if (market) add('market', { x0: market.x0, x1: market.x1, z0: market.z0, z1: market.z1 }, 1, 14);
  return out;
}

// The roads, with how noisy each is, for the traffic you hear beside them: [{ rect, noise }]
export function roadSources(layout) {
  return (layout.roads ?? []).map((r) => ({
    rect: r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to },
    noise: roadNoise(r),
  }));
}

// How strongly each zone is heard from a point: { zone: 0..1 }. Inside a place it is 1 (times its gain); it falls to 0 over `fade`, smoothly.
// The countryside is the ground outside the city (`urban`), growing the further out you go; a busy street is heard beside every road, by how noisy the road is.
export function zoneWeights(x, z, { emitters = [], roads = [], urban = null } = {}) {
  const w = Object.fromEntries(LOCAL_ZONES.map((k) => [k, 0]));
  for (const e of emitters) {
    const d = gapTo(x, z, e.rect);
    if (d >= e.fade) continue;
    const v = e.gain * smooth(1 - d / e.fade) ** 1.4;
    if (v > w[e.zone]) w[e.zone] = v;
  }
  let street = 0;
  for (const r of roads) {
    const d = gapTo(x, z, r.rect);
    if (d >= ZONES.street.fade) continue;
    const v = r.noise * smooth(1 - d / ZONES.street.fade);
    if (v > street) street = v;
  }
  w.street = street;
  if (urban) {
    const d = gapTo(x, z, urban);
    w.farm = smooth((d - 4) / ZONES.farm.fade);
    w.street *= 1 - 0.6 * w.farm; // out in the country the roads are quiet
  }
  return w;
}

// How far from the ground the view is: 0 close (you hear the places round you), 1 high above the map (you hear the music).
//   iso view      by the camera's zoom (a bigger number is nearer): 14 or more is close, 5 is as far as it goes
//   follow views  by the camera's distance behind the avatar: up to 40 is close, 160 is the Overview
export function viewFarness({ view = 'iso', zoom = 14, distance = 28, mapOpen = false } = {}) {
  if (mapOpen) return 1;
  if (view === 'iso') return smooth((14 - zoom) / 9);
  if (view === 'first') return 0;
  return smooth((distance - 40) / 120);
}

// The levels of every layer, 0..1, from what is heard where you are and how high you look. `sky` is skyAt(hour) (lib/game/dayCycle.js).
//   music     the city's music: it plays high above the map (and a little at the very start of the day), and not indoors
//   city      the hum of the city underneath everything, quiet on the ground and a faint bed under the music
//   street    traffic, by how near a busy road you are and the hour
//   the others (arcade, jazz, ...) the local sounds, only the loudest MAX_LOCAL at once
// Returns { music, city, street, local: { zone: level }, master, lowpass, top: [zone, ...] (the loudest, loudest first) }.
export function mixZones({ weights, far = 0, sky, indoors = false, driving = false, musicOn = true } = {}) {
  const near = 1 - far;
  const hour = sky?.hour ?? 12;
  const traffic = trafficLevel(hour);
  const w = weights ?? {};
  const level = {};
  for (const k of LOCAL_ZONES) {
    if (k === 'street') continue;
    const v = (w[k] ?? 0) * near ** 1.5 * (indoors ? 0.35 : 1);
    level[k] = v > 0.03 ? v : 0;
  }
  const loudest = Object.entries(level)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LOCAL);
  const local = Object.fromEntries(LOCAL_ZONES.filter((k) => k !== 'street').map((k) => [k, 0]));
  for (const [k, v] of loudest) local[k] = v;
  const street = clamp01((w.street ?? 0) * (0.25 + 0.75 * traffic) * (driving ? 0.5 : 1) * near ** 1.2 * (indoors ? 0.3 : 1));
  const musicLevel = indoors || !musicOn ? 0 : smooth((far - 0.12) / 0.6);
  return {
    music: musicLevel,
    city: clamp01((0.22 + 0.2 * traffic) * (0.5 + 0.5 * near) * (indoors ? 0.5 : 1)),
    street,
    local,
    master: indoors ? 0.32 : 1,
    lowpass: indoors ? 1100 : 16000,
    top: loudest.map(([k]) => k),
  };
}

// What the listener is hearing, in words (the speaker button's tooltip): the loudest places, then busy streets.
export function describeMix(mix) {
  const names = mix.top.map((k) => ZONES[k].label);
  if (mix.street > 0.35) names.push(ZONES.street.label);
  if (!names.length && mix.music > 0.4) return 'City music';
  if (mix.music > 0.4) names.unshift('City music');
  return names.slice(0, 3).join(' · ');
}
