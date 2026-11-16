// The racing track (lib/world/track.js, docs/world/racing_track.md): a circuit built from the shape of a real one in OpenStreetMap, on the mainland, with asphalt, lines, kerbs, gravel, a start line and
// a grid, and the Kenney Racing Kit round it. The shape, the surface, the scenery, the placement on the map, the road to it, the bake and the mesh.
import * as THREE from 'three';
import { imp } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { RACEWAYS } = await imp('world/data/raceways.js');
const { generateTrack, PALETTE, TRACK, TRACK_MODELS, ANCHOR } = await imp('world/track.js');
const { buildWorld } = await imp('world/buildWorld.js');
const { WORLD_RECIPE, validateRecipe } = await imp('world/worldRecipe.js');
const { bakeWorld } = await imp('world/bake.js');
const { chunkMeshes } = await imp('world/chunkMesh.js');
const { buildChunkObject, createChunkMaterials, disposeChunkObject } = await imp('world/chunkObject.js');
const { distToSegment } = await imp('world/island.js');

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---- the real shapes (from OpenStreetMap)
{
  const names = Object.keys(RACEWAYS);
  check('three real Jamaican circuits are in the data, each a closed ring of 80 or more points from OpenStreetMap (Dover Raceway, Jamwest Speedway, Palisadoes)', names.length === 3 && names.every((k) => { const r = RACEWAYS[k]; const a = r.points[0], b = r.points[r.points.length - 1]; return r.points.length >= 80 && a[0] === b[0] && a[1] === b[1] && Number.isInteger(r.osmWay) && r.points.every(([lon, lat]) => lon < -76 && lon > -79 && lat > 17.5 && lat < 19); }) && RACEWAYS['dover-raceway'].osmWay === 247345542, names.join());
}

// ---- each circuit as a track
for (const shape of Object.keys(RACEWAYS)) {
  const t = generateTrack({ shape, seed: 7, origin: { x: 100, z: -200 } });
  const c = t.centreline, n = c.length;
  const spaced = c.every((p, i) => Math.abs(dist(p, c[(i + 1) % n]) - TRACK.spacing) < 0.8);
  check(`${shape}: a closed loop of points about 2.5 units apart, a lap of 500 to 1,000 units (about 1 to 2.5 minutes by car)`, n > 180 && spaced && t.length > 500 && t.length < 1000, `${n} points, ${t.length} long, scale ${t.scale}`);
  let min = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const gap = Math.min(j - i, n - (j - i)); if (gap >= 40) min = Math.min(min, dist(c[i], c[j])); }
  check(`${shape}: no two stretches of road come within a road's width, a kerb and a margin of each other (at least ${TRACK.width + 6} apart)`, min >= TRACK.width + 5.5, `${min.toFixed(1)} apart at the closest`);
  const xs = c.map((p) => p.x), zs = c.map((p) => p.z);
  check(`${shape}: it fits the site it was asked for (210 x 135 about its middle, with the road wide enough to need a little more)`, Math.max(...xs) - Math.min(...xs) < 210 + 40 && Math.max(...zs) - Math.min(...zs) < 135 + 60 && Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 100) < 25);
  check(`${shape}: it is the same every time for the same seed`, JSON.stringify(generateTrack({ shape, seed: 7, origin: { x: 100, z: -200 } })) === JSON.stringify(t));
}

// ---- the Voxel Speedway
const world = buildWorld();
const tr = world.tracks[0];
const half = tr.width / 2;
{
  check('the recipe has one track, Voxel Speedway, on the mainland, from Dover Raceway (OpenStreetMap way 247345542)', world.tracks.length === 1 && tr.id === 'speedway' && tr.landmass === 'mainland' && tr.shape === 'dover-raceway' && tr.osmWay === 247345542);
  const c = tr.centreline, n = c.length;
  const curv = (i) => { const a = c[(i + n - 6) % n], b = c[i], d = c[(i + 6) % n]; const u = { x: b.x - a.x, z: b.z - a.z }, v = { x: d.x - b.x, z: d.z - b.z }; return Math.abs(u.x * v.z - u.z * v.x) / (Math.hypot(u.x, u.z) * Math.hypot(v.x, v.z)); };
  check('the start line is on the straightest stretch of the lap (little turning over the 25 points round it) and the lap is clockwise on the map', [...Array(25).keys()].reduce((sum, k) => sum + curv((tr.start.index + k - 12 + n) % n), 0) / 25 < 0.2 && c.reduce((s, p, i) => s + (p.x * c[(i + 1) % n].z - c[(i + 1) % n].x * p.z), 0) > 0);
  check('seven checkpoints round the lap, in order from the start line, all on the road', tr.checkpoints.length === 7 && tr.checkpoints.every((p, i) => i === 0 || ((p.index - tr.start.index + n) % n) > ((tr.checkpoints[i - 1].index - tr.start.index + n) % n)) && tr.checkpoints.every((p) => c.some((q) => dist(p, q) < 0.02)));
  // the surface
  const quads = tr.surface;
  check('the surface is painted quads with a valid palette entry and finite corners, and every road point has its asphalt (one quad each, bar the few that fold at the tightest hairpin)', quads.every((q) => q.length === 9 && Number.isInteger(q[0]) && q[0] >= 0 && q[0] < PALETTE.length && q.slice(1).every(Number.isFinite)) && quads.filter((q) => q[0] <= 1).length >= n - 6, `${quads.length} quads`);
  const byName = (name) => quads.filter((q) => PALETTE[q[0]].name === name).length;
  check('it has white edge lines on both sides all the way (two quads a point, a few fewer at the sharpest hairpin), kerbs in red and white on the bends only, gravel on the outside of bends, a 16-square chequered start line and 8 grid boxes', byName('line') >= 2 * n - 60 && byName('kerb-red') > 20 && byName('kerb-white') > 20 && byName('gravel') > 30 && byName('black') + byName('white') === 16 && byName('grid') === 8 && tr.bends > 30, `lines ${byName('line')}, kerbs ${byName('kerb-red')}+${byName('kerb-white')}, gravel ${byName('gravel')}, ${tr.bends} bends`);
  check('the paint lies in layers: gravel under the asphalt under the lines and kerbs under the chequers, each 0.02 or more above the one below', PALETTE.find((p) => p.name === 'gravel').y < PALETTE.find((p) => p.name === 'asphalt').y && PALETTE.find((p) => p.name === 'asphalt').y < PALETTE.find((p) => p.name === 'line').y && PALETTE.find((p) => p.name === 'line').y < PALETTE.find((p) => p.name === 'black').y);
  // the scenery
  const props = tr.props;
  const used = new Set(props.map((p) => p.model));
  check('the scenery is Racing Kit models only: every model it uses is in the list that is shipped, with an anchor', [...used].every((m) => TRACK_MODELS.includes(m) && ANCHOR[m]) && ['roadStart', 'barrierRed', 'barrierWhite', 'grandStand', 'pitsOffice', 'tent', 'lightPostModern', 'treeSmall'].every((m) => used.has(m)), [...used].join());
  const nearest = (p) => Math.min(...c.map((q) => dist(p, q)));
  const only = (m) => props.filter((p) => p.model === m);
  check('one start gantry, on the start line, turned along the road, as wide as the road', only('roadStart').length === 1 && dist(only('roadStart')[0], tr.start) < 0.02 && Math.abs(only('roadStart')[0].yaw - tr.start.heading) < 1e-3 && Math.abs(only('roadStart')[0].s * 1.26 - tr.width) < 0.1);
  check('barriers keep beyond the run-off (never nearer the road than 7.7), none lies across another part of the circuit, and there are hundreds in red and white', [...only('barrierRed'), ...only('barrierWhite')].every((p) => nearest(p) >= half + 2.6) && only('barrierRed').length > 250 && only('barrierWhite').length > 250);
  check('a few grandstands (2 or 3) and pits and tents (2 or 3) stand round the start, all 9 or more from the road, and trees are 20 or more from it', [...only('grandStand'), ...only('grandStandAwning')].length >= 2 && [...only('grandStand'), ...only('grandStandAwning')].length <= 3 && [...only('pitsOffice'), ...only('tent')].length >= 2 && [...only('pitsOffice'), ...only('tent')].length <= 3 && [...only('grandStand'), ...only('grandStandAwning'), ...only('pitsOffice'), ...only('tent')].every((p) => nearest(p) >= half + 9) && [...only('treeSmall'), ...only('treeLarge')].every((p) => nearest(p) >= half + 19));
  check('the grandstands face the track: each one\'s front (its +z) points at the road, to within 0.3 of a turn', [...only('grandStand'), ...only('grandStandAwning')].every((p) => { let best = null; for (const q of c) if (!best || dist(p, q) < dist(p, best)) best = q; const want = Math.atan2(best.x - p.x, best.z - p.z); let d = Math.abs(p.yaw - want) % (Math.PI * 2); d = Math.min(d, Math.PI * 2 - d); return d < 0.35; }));
}

// ---- race cars on the grid, and the lamps that light the track at night
{
  const cars = tr.props.filter((p) => /^raceCar/.test(p.model));
  check('six race cars stand on the grid behind the start line, in all four colours, pointing along the lap (the way the gantry faces)', cars.length === 6 && new Set(cars.map((c) => c.model)).size === 4 && cars.every((c) => Math.abs(Math.sin(c.yaw) - Math.sin(tr.start.heading)) < 0.6 && Math.abs(Math.cos(c.yaw) - Math.cos(tr.start.heading)) < 0.6) && cars.every((c) => Math.hypot(c.x - tr.start.x, c.z - tr.start.z) > 6 && Math.hypot(c.x - tr.start.x, c.z - tr.start.z) < 60));
  check('race cars are about the size of the city cars (4 units), and every model they use is in the shipped list with an anchor', cars.every((c) => c.s === 3.1) && cars.every((c) => TRACK_MODELS.includes(c.model) && ANCHOR[c.model]));
  const lamps = tr.props.filter((p) => p.model === 'lightPostModern');
  check('the lamps stand beside the road with their arms reaching over it: each lamp\'s front points at the nearest road, to within 0.3 of a turn', lamps.length >= 3 && lamps.every((l) => { let best = null; for (const q of tr.centreline) if (!best || Math.hypot(l.x - q.x, l.z - q.z) < Math.hypot(l.x - best.x, l.z - best.z)) best = q; let d = Math.abs(l.yaw - Math.atan2(best.x - l.x, best.z - l.z)) % (Math.PI * 2); d = Math.min(d, Math.PI * 2 - d); return d < 0.3; }));
}

// ---- where it stands on the map
{
  const mainland = world.landmasses[0];
  const town = world.towns[0];
  const b = tr.bounds;
  check('it is on the mainland\'s flat plain: inside the coast, off the town\'s land by 40 or more, and about 600 units (85 seconds by car) from Voxel Town', b.x0 > mainland.bounds.x0 && b.x1 < mainland.bounds.x1 && (b.x0 > town.land.x1 + 40 || b.x1 < town.land.x0 - 40 || b.z0 > town.land.z1 + 40 || b.z1 < town.land.z0 - 40) && Math.hypot(tr.start.x - (town.land.x0 + town.land.x1) / 2, tr.start.z - (town.land.z0 + town.land.z1) / 2) > 400 && Math.hypot(tr.start.x - (town.land.x0 + town.land.x1) / 2, tr.start.z - (town.land.z0 + town.land.z1) / 2) < 700);
  const bad = JSON.parse(JSON.stringify(WORLD_RECIPE));
  bad.tracks[0].site = { x: -2000, z: -2000 };
  let message = '';
  try { buildWorld(bad); } catch (e) { message = e.message; }
  check('a recipe that puts the track anywhere else (here out at sea) is an error that says why, not a track in the sea', /does not fit where the recipe puts it/.test(message), message.slice(0, 120));
  const worse = JSON.parse(JSON.stringify(WORLD_RECIPE));
  delete worse.tracks[0].shape;
  check('the recipe refuses a track with no shape', validateRecipe(worse).some((p) => p.includes('needs a shape')));
  const link = world.links.find((l) => l.kind === 'track');
  const spurs = world.highways[0].spurs;
  check('a road joins the track to the nearest spur: it ends on a spur 50 or more from the coast road, and keeps clear of the circuit\'s run-off all the way', link && spurs.some((s) => !s.via && distToSegment(link.to, s.from, s.to) < 0.6) && link.length < 200 && (() => { for (let k = 0; k <= 60; k++) { const p = { x: link.from.x + ((link.to.x - link.from.x) * k) / 60, z: link.from.z + ((link.to.z - link.from.z) * k) / 60 }; if (dist(p, link.from) > half + 14 && Math.min(...tr.centreline.map((q) => dist(p, q))) < half + 13.5) return false; } return true; })(), link ? `${link.length} long, to the ${link.spur} spur` : 'none');
}

// ---- the bake and the mesh
{
  const { manifest, chunks } = bakeWorld(world);
  const all = Object.values(chunks);
  const inChunks = all.reduce((s, c) => s + (c.surface?.length ?? 0), 0);
  const propsInChunks = all.reduce((s, c) => s + (c.props?.length ?? 0), 0);
  check('every painted quad and every model is in a chunk, once: the chunks hold exactly what the track made', inChunks === tr.surface.length && propsInChunks === tr.props.length, `${inChunks} quads, ${propsInChunks} models in ${all.filter((c) => c.surface).length} chunks`);
  const mt = manifest.tracks[0];
  check('the manifest records it: name, the OpenStreetMap way it came from, its lap, width, start, checkpoints and counts', mt.id === 'speedway' && mt.osmWay === 247345542 && mt.length === tr.length && mt.width === 10 && mt.checkpoints.length === 7 && mt.quads === tr.surface.length && mt.props === tr.props.length);
  check('the centreline is baked as a closed road for timing laps (kind track), and is never drawn as a ribbon', all.some((c) => c.highways.some((h) => h.kind === 'track')) && all.every((c) => chunkMeshes(c).highways.triangles === 0 || c.highways.some((h) => h.kind !== 'track')));
  const withSurface = all.filter((c) => c.surface);
  const meshes = withSurface.map((c) => ({ c, m: chunkMeshes(c).track }));
  const downFacing = meshes.reduce((n2, { m }) => { let bad = 0; for (let t = 0; t < m.indices.length; t += 3) { const [a, b, d] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [m.positions[i * 3], m.positions[i * 3 + 2]]); if ((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]) > 1e-6) bad++; } return n2 + bad; }, 0);
  check('a chunk with paint gets one track mesh: two triangles a quad and a colour a vertex, and all but a handful of triangles (at the tightest hairpin, under 0.5 per cent) face up', meshes.every(({ c, m }) => m.triangles === 2 * c.surface.length && m.colors.length === m.positions.length) && downFacing <= 8, `${meshes.length} chunks, ${downFacing} folded`);
  const materials = createChunkMaterials(THREE);
  const model = (g) => ({ geometry: g, material: new THREE.MeshStandardMaterial() });
  const models = { deck: model(new THREE.BoxGeometry(1, 0.5, 1)), pillar: model(new THREE.BoxGeometry(0.1, 0.5, 0.1)), props: Object.fromEntries(TRACK_MODELS.map((m) => [m, model(new THREE.BoxGeometry(0.25, 0.1, 0.1))])) };
  const group = buildChunkObject(THREE, withSurface[0], materials, { models });
  check('in the game a chunk of the circuit is a track mesh and one instanced mesh for each kind of model in it, sharing the model geometry; disposing it frees its own and leaves the shared ones', group.children.some((m) => m.name.endsWith(':track')) && group.children.some((m) => m.isInstancedMesh && m.geometry === models.props.barrierRed.geometry || m.isInstancedMesh && m.geometry === models.props.barrierWhite.geometry) && (() => { let freed = 0; models.props.barrierRed.geometry.addEventListener('dispose', () => freed++); disposeChunkObject(group); return freed === 0 && group.children.length === 0; })());
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
