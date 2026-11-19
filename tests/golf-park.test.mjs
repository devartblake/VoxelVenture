// The mini-golf park (lib/world/golfPark.js, docs/world/minigolf.md): the grounds round the course: a gate and an access road from the highway, a car park, the clubhouse beside the first tee, paths and the loop,
// benches by the windmill, a pond with a footbridge, a lighthouse, a fence, palms, and a strip kept clear for a second nine. Planned from the course, baked into the world.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const M = await imp('world/minigolf.js');
const K = await imp('world/golfPark.js');
const { PALETTE } = await imp('world/track.js');
const { bad, total } = problemTally();
const course = M.generateCourse({ seed: 7, origin: { x: 2285, z: 297 } });
const roads = [{ a: { x: 2304, z: 218.86 }, b: { x: 2688, z: 218.86 } }];
const a = K.generatePark(course, roads), b = K.generatePark(course, roads);
const B = course.bounds, P = a.bounds;
if (JSON.stringify(a) !== JSON.stringify(b)) bad('the same course makes the same park', '');
if (!(P.x0 < B.x0 && P.x1 > B.x1 && P.z0 < B.z0 && P.z1 > B.z1)) bad('the park surrounds the course', JSON.stringify(P));
const inP = (x, z, m = 0.5) => x >= P.x0 - m && x <= P.x1 + m && z >= P.z0 - m && z <= P.z1 + m;
if (a.props.some((p) => !inP(p.x, p.z)) || a.boxes.some((q) => !inP(q[0], q[2], 8)) || a.surface.some((q) => !inP((q[1] + q[5]) / 2, (q[2] + q[6]) / 2))) bad('everything is inside the park\'s fence', '');
// the models: every prop's model is in the park's list, and its file is in the repository
const names = new Set(K.PARK_MODELS.map((n) => `park-${n}`));
if (a.props.some((p) => !names.has(p.m) && p.m !== 'lightPostModern')) bad('every prop is a model of PARK.models', [...new Set(a.props.map((p) => p.m).filter((m) => !names.has(m) && m !== 'lightPostModern'))].join());
for (const [name, [file]] of Object.entries(K.PARK.models)) if (!fs.existsSync(path.join(root, 'apps/web/public/models/kenney', `${file}.glb`))) bad('the kit file is in the repository', `${name}: ${file}`);
// nothing is built on the course or its walls (the loop path and the pond's bridge are the only things near)
const onCourse = (x, z) => x > B.x0 - 1 && x < B.x1 + 1 && z > B.z0 - 1 && z < B.z1 + 1;
const placed = a.props.filter((p) => onCourse(p.x, p.z)), builtOn = a.boxes.filter((q) => onCourse(q[0], q[2]));
if (placed.length || builtOn.length) bad('nothing of the park stands on the course', `${placed.length} props, ${builtOn.length} boxes`);

// ---- circulation: the gate is on the road side, a gap in the fence; the access road runs from the highway to it
const fence = a.props.filter((p) => p.m === 'park-fence');
if (fence.length < 80 || fence.some((p) => Math.abs(p.x - a.gate.x) < 6 && Math.abs(p.z - a.gate.z) < 1.5)) bad('a fence all round, but at the gate', `${fence.length}`);
if (!(a.gate.z < B.z0 - 40 && Math.abs(a.gate.x - (B.x0 + B.x1) / 2) < 1)) bad('the gate is on the north side, in the middle, toward the road', JSON.stringify(a.gate));
if (!a.road || Math.abs(a.road.from.z - 218.86) > 0.01 || Math.hypot(a.road.to.x - a.gate.x, a.road.to.z - a.gate.z) > 14 || Math.hypot(a.road.to.x - a.road.from.x, a.road.to.z - a.road.from.z) > 60) bad('the access road runs from the highway to the gate', JSON.stringify(a.road));
// the car park: bays with cars in them, cars apart, all inside it
const cars = a.props.filter((p) => /^park-(sedan|suv|van|taxi)$/.test(p.m));
if (cars.length < 6 || cars.length > 30) bad('some cars in the car park, most bays empty', String(cars.length));
if (cars.some((c) => c.x < a.lot.x0 || c.x > a.lot.x1 || c.z < a.lot.z0 || c.z > a.lot.z1)) bad('the cars are in the car park', '');
for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) if (Math.hypot(cars[i].x - cars[j].x, cars[i].z - cars[j].z) < 3.2) bad('cars do not overlap', `${i} ${j}`);
// the clubhouse is beside the first tee, on the way from the car park, with a path from its front to the loop
const tee = course.holes[0].tee;
if (Math.hypot(a.club.x - tee.x, a.club.z - (tee.z - 22)) > 25 || !(a.club.z > a.lot.z1 && a.club.z < a.ring.z0)) bad('the clubhouse is between the car park and the course, beside the first tee', JSON.stringify(a.club));
const pathQuads = a.surface.filter((q) => q[0] === PALETTE.findIndex((p) => p.name === 'path'));
const onPath = (x, z) => pathQuads.some((q) => x >= q[1] - 0.01 && x <= q[5] + 0.01 && z >= q[2] - 0.01 && z <= q[6] + 0.01);
if (!onPath(a.club.x, a.ring.z0 - 4) || !onPath(a.ring.x0 + 1, a.ring.z1 - 1) || !onPath(a.ring.x1 - 1, a.ring.z0 + 1) || !onPath((B.x0 + B.x1) / 2, a.lot.z1 + 3)) bad('paths: car park to clubhouse, clubhouse to the loop, the loop round the course', '');
// the rest spot by the windmill (hole 4): benches, a picnic table
const w4 = course.holes[3];
if (Math.abs(a.rest.x - (w4.bounds.x0 + w4.bounds.x1) / 2) > 1 || !a.boxes.some((q) => Math.abs(q[0] - (a.rest.x - 5)) < 2.5 && Math.abs(q[2] - a.rest.z) < 2)) bad('a rest spot with benches beside the windmill hole', '');
// the pond: painted triangles that face up, inside the park, with a bridge across its neck; the lighthouse is tall and in the north-east corner
const pondIdx = PALETTE.findIndex((p) => p.name === 'pond'), pond = a.surface.filter((q) => q[0] === pondIdx);
const up = (q) => { const ax = q[5] - q[1], az = q[6] - q[2], bx = q[3] - q[1], bz = q[4] - q[2]; return az * bx - ax * bz; };
if (pond.length < 10 || pond.some((q) => !(up(q) > 0))) bad('the pond is painted and faces up', String(pond.length));
if (a.surface.some((q) => !(up(q) > 0))) bad('every quad of the park faces up', '');
const bridge = a.boxes.filter((q) => Math.abs(q[2] - a.pond.z) < 2 && q[3] > 6);
if (!bridge.length) bad('a footbridge across the pond', '');
const top = Math.max(...a.boxes.filter((q) => Math.hypot(q[0] - a.lighthouse.x, q[2] - a.lighthouse.z) < 3).map((q) => q[1] + q[4]));
if (!(top > 28) || !(a.lighthouse.x > B.x1 && a.lighthouse.z < B.z0)) bad('a lighthouse over 28 tall in the north-east corner', `${top}`);
// a second nine can be added: a clear strip west of the course with a path stub to it
if (a.props.some((p) => p.x > a.reserve.x0 && p.x < a.reserve.x1 && p.z > a.reserve.z0 && p.z < a.reserve.z1)) bad('the strip kept for a second nine has nothing in it', JSON.stringify(a.reserve));
if (!onPath(a.reserve.x0 + 8, (a.reserve.z0 + a.reserve.z1) / 2)) bad('a path stub leads into the reserved strip', '');
// the signs
if (!['HARBOR MINI-GOLF', 'LEADERS', 'CLUBHOUSE', 'HARBOR LIGHT'].every((t) => a.labels.some((l) => l.text === t))) bad('the gate, the leaderboard, the clubhouse and the lighthouse have signs', a.labels.map((l) => l.text).join());

// ---- in the baked world
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const mc = manifest.courses[0], pk = mc?.park;
if (!pk || !pk.road || pk.labels.length < 4) bad('the manifest has the park: its gate, road, signs', JSON.stringify(pk && Object.keys(pk)));
else {
  const want = K.generatePark(M.generateCourse({ seed: mc.seed, origin: { x: mc.bounds.x0, z: mc.bounds.z0 } }), []);
  let props = 0, link = 0;
  for (const c of manifest.chunks) { if (c.cx * 128 > pk.bounds.x1 || (c.cx + 1) * 128 < pk.bounds.x0 || c.cz * 128 > pk.bounds.z1 || (c.cz + 1) * 128 < pk.bounds.z0) { continue; } const j = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')); props += (j.props ?? []).filter((p) => /^park-|^lightPostModern$/.test(p.m)).length; link += (j.highways ?? []).filter((h) => h.id === 'harbor-minigolf-road').length; if (j.ground?.h?.some((v) => v !== 0)) bad('the park is on flat ground', c.key); }
  if (props !== want.props.length) bad('every model of the park is baked', `${props} of ${want.props.length}`);
  if (!link) bad('the access road is baked as a link road', '');
}
console.log(`golf park: ${a.props.length} models, ${a.boxes.length} boxes, ${a.surface.length} quads, ${cars.length} cars, ${fence.length} fence pieces`);
if (total()) process.exitCode = 1;
