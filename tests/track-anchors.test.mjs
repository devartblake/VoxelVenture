// Each Racing Kit model has an ANCHOR (lib/world/track.js): the point of the model, in the kit's own coordinates, that is put at the place a prop is given. Every model of the kit sits at an offset from its own origin
// (the glb's node is translated by (-0.35, -0.01, -0.65)), so an anchor that is not on the model puts the prop away from its place: a lamp three units from where it was meant to stand. The anchor must lie on the
// model's footprint (as it is drawn: the node's translation applied).
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { ANCHOR, TRACK_MODELS } = await imp('world/track.js');
const { bad, total } = problemTally();
for (const name of TRACK_MODELS) {
  const b = fs.readFileSync(path.join(root, 'apps/web/public/models/kenney/racing', `${name}.glb`));
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
  const t = j.nodes[0].translation ?? [0, 0, 0];
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const m of j.meshes) for (const p of m.primitives) { const a = j.accessors[p.attributes.POSITION]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i] + t[i]); mx[i] = Math.max(mx[i], a.max[i] + t[i]); } }
  const a = ANCHOR[name];
  if (!a) { bad('every model has an anchor', name); continue; }
  const slack = 0.05;
  if (a[0] < mn[0] - slack || a[0] > mx[0] + slack || a[1] < mn[2] - slack || a[1] > mx[2] + slack) bad(`the anchor of ${name} lies on the model (as drawn), so a prop stands where it is put`, `${name}: anchor ${a} on x ${mn[0].toFixed(2)}..${mx[0].toFixed(2)}, z ${mn[2].toFixed(2)}..${mx[2].toFixed(2)}`);
}
// and, for everything but a lamp post (whose anchor is its pole, at the foot of the arm), it is near the middle of the model's footprint: a barrier, a stand, a tent, a pit building, a tree or a car is centred
// on the place it is given, not hung off it
for (const name of TRACK_MODELS) {
  if (/^lightPost/.test(name)) continue;
  const b = fs.readFileSync(path.join(root, 'apps/web/public/models/kenney/racing', `${name}.glb`));
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
  const t = j.nodes[0].translation ?? [0, 0, 0];
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const m of j.meshes) for (const p of m.primitives) { const a = j.accessors[p.attributes.POSITION]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i] + t[i]); mx[i] = Math.max(mx[i], a.max[i] + t[i]); } }
  const c = [(mn[0] + mx[0]) / 2, (mn[2] + mx[2]) / 2];
  const a = ANCHOR[name];
  if (Math.hypot(a[0] - c[0], a[1] - c[1]) > 0.2) bad(`the anchor of ${name} is near the middle of its footprint`, `${name}: anchor ${a} centre ${c.map((v) => v.toFixed(2))}`);
}
total();
