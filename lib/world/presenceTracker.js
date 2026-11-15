// From verified positions to DERIVED events (docs/architecture/presence_positions.md). Pure: the presence server feeds it each signed-in account's verified position a couple of times a
// second and sends what comes out to the API, which keeps it a few days and checks task goals against it. Raw tracks are never kept: what leaves here is "was in the Bazaar at dusk",
// "went once round the lake", "walked the length of Pixel Ln", "walked 340 m", not where an avatar was at 14:03:07.
//
// Events: { kind, ref, at, phase, ... }
//   in        ref 'district:<id>' | 'place:<kind>:<id>' | 'zone:<id>' | 'edge:<west|east|north|south>'   is there; once on arriving and then once a minute while it stays; `dwell` is the
//             unbroken seconds so far; a zone also reports at 60 and 300 seconds of dwell
//   pass      ref 'road:<name>'    walked or driven the length of a road (85% of it, from near one end to near the other, within half an hour): `mode` is 'walk' or 'car'
//   loop      ref 'place:<kind>:<id>'   went round it (every eighth of the way round within 15 minutes), or out along a pier or bridge and back
//   distance  ref '<mode>'   metres moved in the last half minute; `district` is set for the share that was inside one district (so "800 m inside the Bazaar" can be told from the total)
// `phase` is the city's shared clock at that moment: 'dawn' | 'day' | 'dusk' | 'night' (lib/game/taskRules.js phaseAt).
import { SPEED_CAP, LAG_FACTOR } from './movement';

export const HEARTBEAT_MS = 60000;
export const DISTANCE_FLUSH_MS = 30000;
export const SETTLE_MS = 10000; // after a (re)start nothing is credited for this long: a new connection's first position is the client's own
export const ROAD_COVER = 0.85;
export const ROAD_WINDOW_MS = 30 * 60000;
export const LOOP_WINDOW_MS = 15 * 60000;
export const LOOP_RING = 12; // units from a place's edge that count as "going round it"
export const ANCHOR_RADIUS = 2.5;
export const ZONE_DWELLS = [60, 300];
const SECTORS = 8;

/**
 * @param {{ geometry: ReturnType<import('./placeGeometry').buildPlaceGeometry>, phaseAt: (ms:number) => string }} deps
 */
export function createTracker({ geometry, phaseAt }) {
  const accounts = new Map();
  const fresh = (t) => ({ begun: t, last: null, loc: null, locAt: 0, inside: new Map(), distance: new Map(), flushedAt: t, roads: new Map(), loops: new Map(), anchors: new Map() });
  const stateOf = (id, t) => { let s = accounts.get(id); if (!s) { s = fresh(t); accounts.set(id, s); } return s; };

  /** A new start for an account (a new connection, a long silence): its checks begin again. */
  const begin = (id, t) => accounts.set(id, fresh(t));
  const forget = (id) => accounts.delete(id);

  /**
   * One sample of one account's verified position. Returns the events it makes (usually none).
   * @param {number} id  account id
   * @param {{ x: number, z: number, mode: 'walk'|'car'|'boat' }} p  the verified position
   * @param {number} t   ms
   */
  function sample(id, p, t) {
    const s = stateOf(id, t);
    const events = [];
    const phase = phaseAt(t);
    const prev = s.last;
    s.last = { x: p.x, z: p.z, t, mode: p.mode };
    if (t - s.begun < SETTLE_MS) return events;

    // where it is: re-locate when it has moved a little, or every ten seconds
    const moved = prev ? Math.hypot(p.x - prev.x, p.z - prev.z) : 0;
    if (!s.loc || moved > 0.4 || t - s.locAt > 10000) { s.loc = geometry.locate(p.x, p.z); s.locAt = t; }
    const loc = s.loc;

    // distance: only a step that was possible at the mode's speed (the validator already said so; this keeps a stray big step out of the sum)
    if (prev && moved > 0) {
      const dt = Math.max(0.05, (t - prev.t) / 1000);
      if (moved <= (SPEED_CAP[p.mode] ?? SPEED_CAP.walk) * LAG_FACTOR * dt + 3) {
        const add = (key, ref, district) => { const e = s.distance.get(key) ?? { ref, district, metres: 0 }; e.metres += moved; s.distance.set(key, e); };
        add(p.mode, p.mode, null);
        if (loc.district) add(`${p.mode}|${loc.district}`, p.mode, loc.district);
      }
    }
    if (t - s.flushedAt >= DISTANCE_FLUSH_MS) {
      for (const e of s.distance.values()) if (e.metres >= 1) events.push({ kind: 'distance', ref: e.ref, at: t, phase, metres: Math.round(e.metres), district: e.district ?? undefined });
      s.distance.clear();
      s.flushedAt = t;
    }

    // being somewhere: on arriving, then once a minute; the keys of what is here now
    const keys = [];
    if (loc.district) keys.push(`district:${loc.district}`);
    for (const pl of loc.places) keys.push(`place:${pl.kind}:${pl.id}`);
    for (const z of loc.zones) keys.push(`zone:${z}`);
    if (loc.edge) keys.push(`edge:${loc.edge}`);
    const here = new Set(keys);
    for (const key of [...s.inside.keys()]) if (!here.has(key)) s.inside.delete(key); // left
    for (const key of keys) {
      let v = s.inside.get(key);
      if (!v) { v = { since: t, emitted: t, milestones: 0 }; s.inside.set(key, v); events.push({ kind: 'in', ref: key, at: t, phase, dwell: 0, mode: p.mode }); continue; }
      const dwell = Math.floor((t - v.since) / 1000);
      let due = t - v.emitted >= HEARTBEAT_MS;
      if (key.startsWith('zone:') && v.milestones < ZONE_DWELLS.length && dwell >= ZONE_DWELLS[v.milestones]) { v.milestones++; due = true; }
      if (due) { v.emitted = t; events.push({ kind: 'in', ref: key, at: t, phase, dwell, mode: p.mode }); }
    }

    // roads: how much of each road has been covered, by walking or by car
    if (p.mode !== 'boat') {
      for (const r of loc.roads) {
        const road = geometry.roads.get(r.name);
        if (!road) continue;
        const n = Math.max(6, Math.min(60, Math.round(road.length / 6)));
        const key = `${r.name}|${p.mode}`;
        let c = s.roads.get(key);
        if (!c || t - c.startedAt > ROAD_WINDOW_MS) { c = { n, buckets: new Set(), startedAt: t }; s.roads.set(key, c); }
        c.buckets.add(Math.min(n - 1, Math.floor(r.t * n)));
        const ends = [0, 1].some((i) => c.buckets.has(i)) && [n - 1, n - 2].some((i) => c.buckets.has(i));
        if (ends && c.buckets.size >= ROAD_COVER * n) { events.push({ kind: 'pass', ref: `road:${r.name}`, at: t, phase, mode: p.mode }); s.roads.delete(key); }
      }
    }

    // going round a place, or out along a pier or a bridge and back
    for (const pl of geometry.places) {
      const r = pl.rect;
      const gap = Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.z0 - p.z, 0, p.z - r.z1));
      const key = `place:${pl.kind}:${pl.id}`;
      if (pl.anchors) {
        const hit = pl.anchors.findIndex((a) => Math.hypot(p.x - a.x, p.z - a.z) <= ANCHOR_RADIUS);
        if (hit < 0) continue;
        const a = s.anchors.get(key) ?? { seq: [], at: t };
        if (t - a.at > LOOP_WINDOW_MS) { a.seq = []; a.at = t; }
        if (a.seq[a.seq.length - 1] !== hit) a.seq.push(hit);
        if (a.seq.length >= 3 && a.seq.slice(-3)[0] === a.seq.slice(-3)[2]) { events.push({ kind: 'loop', ref: key, at: t, phase }); a.seq = [hit]; a.at = t; }
        s.anchors.set(key, a);
      } else if (gap <= LOOP_RING) {
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        const sector = Math.min(SECTORS - 1, Math.floor(((Math.atan2(p.z - cz, p.x - cx) + Math.PI) / (2 * Math.PI)) * SECTORS));
        let l = s.loops.get(key);
        if (!l || t - l.startedAt > LOOP_WINDOW_MS) { l = { mask: 0, startedAt: t }; s.loops.set(key, l); }
        l.mask |= 1 << sector;
        if (l.mask === (1 << SECTORS) - 1) { events.push({ kind: 'loop', ref: key, at: t, phase }); s.loops.delete(key); }
      }
    }
    return events;
  }

  return { sample, begin, forget, size: () => accounts.size };
}
