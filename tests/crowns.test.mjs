// Rooftop features: what each is made of, and where they stand.
import { imp, problemTally } from './helpers.mjs';
const c = await imp('content/crowns.js');
const { CROWN_IDS } = await imp('game/exterior.js');
const { bad, total } = problemTally();
const HEX = /^#[0-9a-f]{6}$/;

for (const id of CROWN_IDS) {
  const parts = c.crownParts(id);
  if (id === 'none') { if (parts.length) bad('"none" has no parts', ''); continue; }
  if (parts.length < 2 || parts.length > 6) bad('a crown is a few solids', `${id}: ${parts.length}`);
  for (const p of parts) {
    if (!c.CROWN_SHAPES.includes(p.shape)) bad('every part is a known shape', `${id} ${p.shape}`);
    if (p.pos.length !== 3 || p.scale.length !== 3 || [...p.pos, ...p.scale].some((v) => !Number.isFinite(v)) || p.scale.some((v) => v <= 0)) bad('a part has a place and a size', `${id}`);
    if (p.color !== 'accent' && !HEX.test(p.color)) bad('a part has a colour', `${id} ${p.color}`);
    if (p.pos[1] - p.scale[1] / 2 < -0.01 && p.shape !== 'sphere') bad('a part does not start below the roof', `${id} ${p.shape}`);
  }
  const h = c.crownHeight(id);
  if (h < 0.3 || h > 2.1) bad('a crown stands a sensible height above the roof', `${id}: ${h.toFixed(2)}`);
  if (!parts.some((p) => p.color === 'accent')) bad('the owner\'s colour shows somewhere', id);
}
if (c.crownParts('laser').length !== 0) bad('an unknown crown has no parts', '');
if (!(c.crownHeight('spire') > c.crownHeight('dome'))) bad('a spire is taller than a dome', '');

const roof = () => 2.4;
const base = { id: 1, owner: 'x', x: 10, z: -4, w: 3, d: 3, facing: 1, yaw: 0, exterior: { crown: 'beacon', crownColor: '#ff0000' } };
const list = [
  base,
  { ...base, id: 2, exterior: { crown: 'none' } },
  { ...base, id: 3, owner: null },
  { ...base, id: 4, exterior: undefined },
  { ...base, id: 5, exterior: { crown: 'laser' } },
  { ...base, id: 6, x: 20, yaw: Math.PI / 2, w: 8, d: 8, exterior: { crown: 'dome', crownColor: '#00ff00' } },
];
const inst = c.crownInstances(list, roof);
if (inst.map((i) => i.id).join() !== '1,6') bad('only built plots with a real crown get one', inst.map((i) => i.id).join());
const one = inst[0];
if (Math.abs(one.y - 2.5) > 1e-9 || one.parts.some((p) => p.color === 'accent') || !one.parts.some((p) => p.color === '#ff0000')) bad('the crown stands on the roof, in the owner\'s colour', JSON.stringify([one.y, one.parts.map((p) => p.color)]));
if (!(one.z > base.z - 0.6 && one.z < base.z) || one.x !== base.x) bad('it stands toward the back of the roof (away from the front banner)', `${one.x},${one.z}`);
if (!(inst[1].scale <= 1.3 && one.scale >= 0.45 && inst[1].scale > one.scale)) bad('a bigger building gets a bigger crown, within limits', `${one.scale} ${inst[1].scale}`);
if (Math.abs(inst[1].z - (list[5].z + Math.cos(Math.PI / 2) * -8 * 0.16)) > 1e-9 || Math.abs(inst[1].x - (20 + Math.sin(Math.PI / 2) * -8 * 0.16)) > 1e-9) bad('the offset turns with the plot', `${inst[1].x},${inst[1].z}`);
if (c.crownInstances([{ ...base, exterior: { crown: 'garden' } }], roof)[0].parts.find((p) => p.shape === 'glow').color !== '#fbbf24') bad('a missing colour falls back to amber', '');

console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
