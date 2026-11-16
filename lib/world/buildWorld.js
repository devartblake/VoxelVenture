// Turns a world recipe (worldRecipe.js) into the map (docs/world/world_recipe.md): each town is made by the town generator (`generateTown(seed)`, in its own local coordinates), the
// landmasses get their coasts and features, and every landmass after the first is placed out to sea at the recipe's bearing and gap. The towns' plots and roads are returned in
// WORLD coordinates, with global plot ids. The first town's origin is (0, 0), so its coordinates and ids are exactly what the game has always used.
//
//   buildWorld(recipe?)  -> { recipe, towns, landmasses, ocean, plots, roads, stats }
//     towns[]       { id, index, name, seed, landmass, live, origin: { x, z }, land: { x0, x1, z0, z1 } (world), city (local coordinates), plots (world, global ids), roads (world) }
//     landmasses[]  { id, name, centre, outline: { points }, bounds, area, features: { harbour, beaches, headlands, hills, airstrip } }
//     ocean         { x0, x1, z0, z1 }: the sea round everything
import { generateTown } from '../city/townExtension';
import { coastFeatures, coastOutline, distToSegment, pointInPolygon, polygonArea, polygonBounds, polygonDistance } from './island';
import { buildCauseways, buildHighways, buildLinks } from './highways';
import { buildTracks } from './track';
import { vacateTown } from './vacant';
import { elevationAt, templateOutline } from './shapes';
import { TOWN_ID_STRIDE, WORLD_RECIPE, toGlobalId, validateRecipe } from './worldRecipe';

const memo = new Map();
const r2 = (n) => Math.round(n * 100) / 100;
const shift = (points, dx, dz) => points.map((p) => ({ x: r2(p.x + dx), z: r2(p.z + dz) }));

export function buildWorld(recipe = WORLD_RECIPE) {
  const key = JSON.stringify(recipe);
  if (memo.has(key)) return memo.get(key);
  const problems = validateRecipe(recipe);
  if (problems.length) throw new Error(`the world recipe is not valid: ${problems.join('; ')}`);

  // each town, in its own coordinates
  const towns = recipe.towns.map((t) => {
    // a vacant town has no businesses of the city's own on its lots (vacant.js): every lot is empty, for players to claim
    const city = t.vacant ? vacateTown(generateTown(t.seed)).city : generateTown(t.seed);
    const land = city.layout.land;
    return { ...t, city, localLand: land, localCentre: { x: (land.x0 + land.x1) / 2, z: (land.z0 + land.z1) / 2 }, origin: { x: 0, z: 0 } };
  });
  const townById = Object.fromEntries(towns.map((t) => [t.id, t]));

  // each landmass: its coast round its town's land (made in the town's coordinates, then moved), placed out from the one it names
  const landmasses = [];
  const done = new Map();
  const place = (l) => {
    if (done.has(l.id)) return done.get(l.id);
    const town = townById[l.towns[0]];
    // a coast from a template (a variation of a real island: shapes.js) or the plain lumpy ring round the town's land
    const local = l.coast.shape
      ? templateOutline({ template: l.coast.shape, rect: town?.localLand, seed: l.coast.seed, margin: l.coast.margin, length: l.coast.length, anchor: l.coast.anchor, stretch: l.coast.stretch, rotate: l.coast.rotate, variation: l.coast.variation })
      : coastOutline({ rect: town.localLand, seed: l.coast.seed, margin: l.coast.margin });
    let dx = 0;
    let dz = 0;
    if (l.place) {
      const from = place(recipe.landmasses.find((o) => o.id === l.place.from));
      const a = (l.place.bearing * Math.PI) / 180;
      const dir = { x: Math.cos(a), z: Math.sin(a) };
      // the land's centre goes out along the bearing until the open water between the two coasts is `gap`
      const at = (t) => ({ dx: from.centre.x + dir.x * t - local.centre.x, dz: from.centre.z + dir.z * t - local.centre.z });
      const distance = (t) => { const o = at(t); return polygonDistance(from.outline.points, shift(local.points, o.dx, o.dz)); };
      let lo = 0;
      let hi = 6000;
      for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (distance(mid) < l.place.gap) lo = mid; else hi = mid; }
      ({ dx, dz } = at(hi));
      dx = r2(dx);
      dz = r2(dz);
    }
    for (const id of l.towns) townById[id].origin = { x: dx, z: dz };
    const points = shift(local.points, dx, dz);
    const centre = { x: r2(local.centre.x + dx), z: r2(local.centre.z + dz) };
    const outline = { centre, points, radii: local.radii, margin: local.margin, ...(local.angles ? { angles: local.angles, kind: local.kind, template: local.template } : {}) };
    const landWorld = town ? { x0: town.localLand.x0 + dx, x1: town.localLand.x1 + dx, z0: town.localLand.z0 + dz, z1: town.localLand.z1 + dz } : null; // a landmass with no town has no town land
    const ranges = (local.ranges ?? []).map((rg) => ({ ...rg, points: rg.points.map((p) => ({ ...p, x: r2(p.x + dx), z: r2(p.z + dz) })), ...(rg.field && { field: { ...rg.field, x0: r2(rg.field.x0 + dx), z0: r2(rg.field.z0 + dz) } }) })) // (a point keeps its real height `h`, when it has one; a terrain grid moves with the landmass);
    const built = { id: l.id, name: l.name, towns: l.towns, centre, outline, bounds: polygonBounds(points), area: Math.round(polygonArea(points)), land: landWorld, spec: l, ranges };
    done.set(l.id, built);
    landmasses.push(built);
    return built;
  };
  for (const l of recipe.landmasses) place(l);

  // features: the harbour faces the nearest other landmass
  for (const m of landmasses) {
    const others = landmasses.filter((o) => o.id !== m.id);
    const nearest = others.sort((a, b) => Math.hypot(a.centre.x - m.centre.x, a.centre.z - m.centre.z) - Math.hypot(b.centre.x - m.centre.x, b.centre.z - m.centre.z))[0];
    // the harbour faces the landmass this one is placed from (Harbor Isle's faces the mainland, as George Town's faces out to sea on the west), else the nearest
    const toward = m.spec.place ? done.get(m.spec.place.from) : nearest;
    const facing = toward ? { x: toward.centre.x - m.centre.x, z: toward.centre.z - m.centre.z } : { x: 1, z: 0 };
    const all = coastFeatures(m.outline, { seed: m.spec.coast.seed, facing, landRect: m.land });
    m.features = Object.fromEntries(Object.entries(all).filter(([k]) => m.spec.features.includes(k)));
    if (m.spec.features.includes('ranges') && m.ranges.length) m.features.ranges = m.ranges; // the mountains of a template coast
    if (m.features.airstrip) m.features.airstrip.name = `${m.name} Airstrip`; // a destination for flights (docs/world/player_flight.md)
  }

  // the towns' plots and roads in world coordinates, with global plot ids
  const plots = [];
  const roads = [];
  for (const t of towns) {
    const { x: ox, z: oz } = t.origin;
    t.land = { x0: r2(t.localLand.x0 + ox), x1: r2(t.localLand.x1 + ox), z0: r2(t.localLand.z0 + oz), z1: r2(t.localLand.z1 + oz) };
    t.plots = t.city.plots.map((p) => ({ ...p, id: toGlobalId(t.index, p.id), localId: p.id, town: t.id, x: r2(p.x + ox), z: r2(p.z + oz) }));
    t.roads = t.city.layout.roads.map((r) => ({ id: `${t.id}:${r.id}`, town: t.id, axis: r.axis, name: r.name, kind: r.kind, class: r.class, center: r2(r.center + (r.axis === 'x' ? oz : ox)), from: r2(r.from + (r.axis === 'x' ? ox : oz)), to: r2(r.to + (r.axis === 'x' ? ox : oz)) }));
    plots.push(...t.plots);
    roads.push(...t.roads);
  }

  const all = landmasses.map((m) => m.bounds);
  const m = recipe.ocean.margin;
  const ocean = { x0: Math.min(...all.map((b) => b.x0)) - m, x1: Math.max(...all.map((b) => b.x1)) + m, z0: Math.min(...all.map((b) => b.z0)) - m, z1: Math.max(...all.map((b) => b.z1)) + m };
  const stats = {
    towns: towns.map((t) => ({ id: t.id, index: t.index, plots: t.plots.length, firstId: Math.min(...t.plots.map((p) => p.id)), lastId: Math.max(...t.plots.map((p) => p.id)), roads: t.roads.length, origin: t.origin, live: t.live })),
    plots: plots.length,
    landmasses: landmasses.map((l) => ({ id: l.id, area: l.area, centre: l.centre })),
    gaps: landmasses.filter((l) => l.spec.place).map((l) => ({ between: [l.spec.place.from, l.id], water: r2(polygonDistance(done.get(l.spec.place.from).outline.points, l.outline.points)), centresApart: r2(Math.hypot(l.centre.x - done.get(l.spec.place.from).centre.x, l.centre.z - done.get(l.spec.place.from).centre.z)) })),
  };
  const world = { recipe, towns, landmasses, ocean, plots, roads, stats, highways: [], causeways: [], links: [], tracks: [], strideOk: plots.every((p) => p.localId < TOWN_ID_STRIDE) };
  world.highways = buildHighways(world); // the ring roads and their spurs (highways.js)
  world.causeways = buildCauseways(world, world.highways); // the roads across the sea between them
  world.tracks = buildTracks(world, world.recipe.tracks ?? [], { pointInPolygon, distToSegment, elevationAt }); // closed racing circuits (track.js)
  world.links = buildLinks(world, world.highways); // from the harbour and from an airstrip to the nearest spur
  memo.set(key, world);
  return world;
}
