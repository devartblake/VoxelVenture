// Where is a point? The places the tasks name (docs/architecture/presence_positions.md), as geometry, built from the game's OWN city: `buildPlaceGeometry(generateTown(seed))`.
// Pure (no fs, no network), shared by the presence server (which watches where signed-in players are) and the tests. The ids and names are the catalogue's (lib/game/taskCatalogue.json),
// which scripts/tasks/build-task-catalogue.mjs makes from the same layout: tests/place-geometry.test.mjs checks that every place, road, zone and district a task names resolves here.
//
//   locate(x, z)   { district, places: [{ kind, id }], zones: [zoneId], roads: [{ name, t }], edge }   what is at that point
//   district       the district of the NEAREST plot centre, if one is within DISTRICT_RADIUS (30 units: the plots are about 11 apart, so the built-up land all has one and only open fields and water have none); else null
//   places         every place whose area (grown by its margin) holds the point: a park, lake, bridge, airport, mall, the fun park, a pier, the river
//   zones          every sound zone heard at 0.5 or more here (the zone weights of lib/game/soundZones.js, the same maths the game's audio uses)
//   roads          every named road whose corridor (ROAD_HALF either side of its centre line) holds the point; t is how far along the road's whole length, 0 to 1
//   edge           'west' | 'east' | 'north' | 'south' when within EDGE_BAND of the land's edge (for "walk from one end of the city to the other"), else null
//
// The city is the one the GAME builds (generateTown: generateCity plus the extra lots and roads of lib/city/townExtension.js): with plain generateCity the plots and roads differ
// (PR #126). The server's plots are the city's starting ones, so a sound zone made by a lot that a player has since claimed is not counted: the zones are the generated city's.
import { LOCAL_ZONES, buildEmitters, gapTo, roadSources, zoneWeights } from '../game/soundZones';

export const DISTRICT_RADIUS = 30;
export const ZONE_THRESHOLD = 0.5;
export const ROAD_HALF = 5; // a road's corridor: its width and its pavements
export const EDGE_BAND = 14;
/** How far outside its area a place still counts as "reached", by kind. */
export const PLACE_MARGIN = { park: 2, lake: 3, bridge: 0, airport: 3, mall: 3, funpark: 3, pier: 3, river: 6 };
const BRIDGE_HALF = 3.2; // a bridge's deck: half its width across the road

const rectOf = (x, z, hw, hd) => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
const inside = (x, z, r, margin = 0) => gapTo(x, z, r) <= margin;

/** The places of a layout: [{ kind, id, name, rect, margin }], the ids the catalogue uses (lake-1, bridge-avenue-1-creator, airport-1, mall-1, amusement, pier-1, river-1, park). */
export function placesOf(layout) {
  const out = [];
  const add = (kind, id, name, rect, extra = {}) => out.push({ kind, id, name, rect, margin: PLACE_MARGIN[kind], ...extra });
  for (const p of layout.parks ?? []) add('park', p.id ?? p.name, p.name, rectOf(p.center.x, p.center.z, p.width / 2, p.depth / 2));
  for (const l of layout.lakes ?? []) add('lake', l.id, l.name, rectOf(l.x, l.z, l.rx, l.rz));
  for (const b of layout.bridges ?? []) {
    // a bridge crosses the river along its road: `axis` is the road's axis, `center` the road's other coordinate, u0..u1 the span over the water
    const rect = b.axis === 'x' ? { x0: b.u0, x1: b.u1, z0: b.center - BRIDGE_HALF, z1: b.center + BRIDGE_HALF } : { x0: b.center - BRIDGE_HALF, x1: b.center + BRIDGE_HALF, z0: b.u0, z1: b.u1 };
    const ends = b.axis === 'x' ? [{ x: b.u0, z: b.center }, { x: b.u1, z: b.center }] : [{ x: b.center, z: b.u0 }, { x: b.center, z: b.u1 }];
    add('bridge', b.id, b.id, rect, { axis: b.axis, anchors: ends }); // "cross it and come back": one end, the other, the first again
  }
  for (const a of layout.airports ?? []) add('airport', a.id ?? a.name, a.name, { ...a.rect });
  for (const m of layout.malls ?? []) add('mall', m.id ?? m.name, m.name, { ...m.rect });
  if (layout.amusement) add('funpark', 'amusement', layout.amusement.name, { ...layout.amusement.rect });
  (layout.piers ?? []).forEach((p, i) => add('pier', p.id ?? `pier-${i + 1}`, `Pier ${i + 1}`, { x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 }, { anchors: [p.start, p.tip] })); // "out along it and back": the start, the tip, the start
  for (const r of layout.rivers ?? []) add('river', r.id, r.name ?? 'the river', { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
  return out;
}

/** The named roads: Map(name -> { name, length, segments: [{ axis, center, from, to, length, offset }] }). A road with several segments (a loop) is one road: its length is their sum. */
export function roadsOf(layout) {
  const byName = new Map();
  for (const r of layout.roads ?? []) {
    if (!r.name || !(r.to > r.from)) continue;
    if (!byName.has(r.name)) byName.set(r.name, { name: r.name, length: 0, segments: [] });
    const road = byName.get(r.name);
    road.segments.push({ axis: r.axis, center: r.center, from: r.from, to: r.to, length: r.to - r.from, offset: road.length });
    road.length += r.to - r.from;
  }
  return byName;
}

/** @param {{ plots: object[], layout: object }} city the game's city (generateTown) */
export function buildPlaceGeometry(city) {
  const { plots = [], layout } = city;
  const land = layout.land;
  const places = placesOf(layout);
  const roads = roadsOf(layout);
  const emitters = buildEmitters({ plots, layout });
  const roadSrc = roadSources(layout);
  const urban = layout.urban ?? null;

  // the plots centres in a grid of 30-unit cells, for "the nearest plot"
  const CELL = 30;
  const cells = new Map();
  const cellKey = (cx, cz) => `${cx},${cz}`;
  for (const p of plots) {
    if (!p.districtId) continue;
    const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(p);
  }
  function districtAt(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = null, bestD = DISTRICT_RADIUS * DISTRICT_RADIUS;
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) for (const p of cells.get(cellKey(i, j)) ?? []) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best ? best.districtId : null;
  }

  const placesAt = (x, z) => places.filter((p) => inside(x, z, p.rect, p.margin)).map((p) => ({ kind: p.kind, id: p.id }));
  const zonesAt = (x, z) => { const w = zoneWeights(x, z, { emitters, roads: roadSrc, urban }); return LOCAL_ZONES.filter((k) => w[k] >= ZONE_THRESHOLD); };
  function roadsAt(x, z) {
    const out = [];
    for (const road of roads.values()) {
      for (const s of road.segments) {
        const across = s.axis === 'x' ? z - s.center : x - s.center;
        const along = s.axis === 'x' ? x : z;
        if (Math.abs(across) <= ROAD_HALF && along >= s.from - 1 && along <= s.to + 1) { out.push({ name: road.name, t: Math.max(0, Math.min(1, (s.offset + (along - s.from)) / road.length)) }); break; }
      }
    }
    return out;
  }
  function edgeAt(x, z) {
    if (!land) return null;
    if (x - land.x0 < EDGE_BAND) return 'west';
    if (land.x1 - x < EDGE_BAND) return 'east';
    if (z - land.z0 < EDGE_BAND) return 'north';
    if (land.z1 - z < EDGE_BAND) return 'south';
    return null;
  }

  return {
    land,
    places,
    roads,
    zones: [...LOCAL_ZONES],
    districts: [...new Set(plots.map((p) => p.districtId).filter(Boolean))],
    placeIds: (kind) => places.filter((p) => p.kind === kind).map((p) => p.id),
    placeOf: (kind, id) => places.find((p) => p.kind === kind && p.id === id) ?? null,
    districtAt,
    locate: (x, z) => ({ district: districtAt(x, z), places: placesAt(x, z), zones: zonesAt(x, z), roads: roadsAt(x, z), edge: edgeAt(x, z) }),
    /** Whether (x, z) is in the world at all: the land and a margin for the beaches (the bounds are data, so a bigger world is a different `land`). */
    inBounds: (x, z, margin = 30) => Boolean(land) && x >= land.x0 - margin && x <= land.x1 + margin && z >= land.z0 - margin && z <= land.z1 + margin,
  };
}
