// The undersea tunnel beside the first causeway (docs/world/tunnel_evaluation.md): the route and the profile of the tube. Pure. So far only the development spike (apps/web/components/dev/TunnelSpike.jsx,
// /world/stream?tunnel=1) uses it: nothing in the game does.
//
// It runs parallel to Harbor Causeway, `lateral` units to the side (the train's rail is on the other side), and has its OWN road entrance, which starts before the causeway's road does: the approach
// road begins `approach` units before the portal, and the portal is `inland` units before the causeway's first point, so the tunnel's road is separate from the bridge's and comes first. The tube
// goes down from the ground at a grade of `grade`, runs at `floor` under the sea (its roof under the water), and comes up on the far side the same way.
import { TRAIN, pointAt as railPointAt, trainLine } from './train';
import { TUNNEL } from './tunnelSpec';
export { TUNNEL, floorY, roofY, rampLength } from './tunnelSpec';

/**
 * The route along a causeway line (lib/world/train.js trainLine): { s0, s1 (the portals), approach0, approach1 (where the tunnel's road starts at each end), length, links }.
 * `roads` are the main roads of the area ([{ a: {x, z}, b: {x, z}, id }]: the rings and spurs of the baked world): the tunnel's road is a link from the nearest main road to each portal, so it joins the
 * road network instead of ending in a field. Without them each portal has a plain approach road of `approach` units.
 */
export function tunnelRoute(line, roads = []) {
  const s0 = -TUNNEL.inland, s1 = line.length + TUNNEL.inland;
  const route = { s0, s1, approach0: s0 - TUNNEL.approach, approach1: s1 + TUNNEL.approach, length: s1 - s0, line, links: [] };
  if (roads.length) {
    route.links = [s0, s1].map((s, end) => linkToRoads(pointAt(line, s), roads, end));
    // where each link leaves the main road, measured along the line (the tunnel's road starts there)
    const along = (q) => (q.x - line.a.x) * line.dir.x + (q.z - line.a.z) * line.dir.z;
    route.approach0 = Math.min(s0, along(route.links[0].from));
    route.approach1 = Math.max(s1, along(route.links[1].from));
  }
  return route;
}

/** The nearest point of any main road to `p`, and the link from there to `p`: { end, from (on the road), to: p, length, road (its id) }. */
export function linkToRoads(p, roads, end = 0) {
  let best = null;
  for (const r of roads) {
    const dx = r.b.x - r.a.x, dz = r.b.z - r.a.z;
    const t = Math.max(0, Math.min(1, ((p.x - r.a.x) * dx + (p.z - r.a.z) * dz) / (dx * dx + dz * dz || 1)));
    const q = { x: r.a.x + t * dx, z: r.a.z + t * dz };
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (!best || d < best.length) best = { end, from: q, to: p, length: d, road: r.id };
  }
  return best;
}

/** The point of the tunnel's road centre at `s` on the ground plan. */
export const pointAt = (line, s) => railPointAt(line, s, TUNNEL.lateral - TRAIN.lateral);

/**
 * The tunnels of a built world (recipe.tunnels: [{ id, name, causeway }]): each runs beside the causeway it names, with its portals' links to the main roads (the rings and spurs of the world). What the bake writes
 * into the manifest and cuts the ground by: { id, name, causeway, line: { a, b, length, dir, normal }, s0, s1, approach0, approach1, length, links }. [] when the recipe has none.
 */
/** The rail line through a baked tunnel (the manifest's `tunnels` entry): the train's line object (lib/world/train.js) along the middle of the tube, with a station `station` units outside each portal. */
export const TUNNEL_LINE = { station: 40 };
export function tunnelTrainLine(t) {
  const length = t.line.length, dir = t.line.dir, normal = t.line.normal;
  return {
    id: t.id, name: t.name, a: t.line.a, b: t.line.b, length, dir, yaw: Math.atan2(dir.x, dir.z), normal,
    lateral: TUNNEL.lateral, tunnel: { s0: t.s0, s1: t.s1 }, stationNames: ['Mainland Tunnel Station', 'Isle Tunnel Station'],
    sA: t.s0 - TUNNEL_LINE.station, sB: t.s1 + TUNNEL_LINE.station,
    deckFrom: Infinity, bridgeLen: 0, clearance: 0, // (no bridge deck on this line: railY's deck branch never applies)
  };
}

export function buildTunnels(world, highwaySegments) {
  return (world.recipe.tunnels ?? []).map((def) => {
    const c = world.causeways.find((x) => x.id === def.causeway);
    if (!c) throw new Error(`tunnel ${def.id} names a causeway (${def.causeway}) the world does not have`);
    const line = trainLine({ id: c.id, name: c.name, points: c.points, length: c.length, bridge: c.bridge.length, clearance: c.bridge.clearance, span: { from: c.bridge.from } });
    const roads = highwaySegments(world).filter((h) => h.kind === 'ring' || h.kind === 'spur').map((h) => ({ a: h.a, b: h.b, id: h.id.split(':')[0] }));
    const route = tunnelRoute(line, roads);
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      id: def.id, name: def.name, causeway: c.id,
      line: { a: line.a, b: line.b, length: r2(line.length), dir: { x: r2(line.dir.x * 1e6) / 1e6, z: r2(line.dir.z * 1e6) / 1e6 }, normal: { x: r2(line.normal.x * 1e6) / 1e6, z: r2(line.normal.z * 1e6) / 1e6 } },
      s0: route.s0, s1: r2(route.s1), approach0: r2(route.approach0), approach1: r2(route.approach1), length: r2(route.length),
      links: route.links.map((l) => ({ end: l.end, from: { x: r2(l.from.x), z: r2(l.from.z) }, to: { x: r2(l.to.x), z: r2(l.to.z) }, length: r2(l.length), road: l.road })),
    };
  });
}
