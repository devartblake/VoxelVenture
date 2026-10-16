// What owners put behind their buildings: valid parts, fitted to the free ground, never on a neighbour.
import { imp, problemTally } from './helpers.mjs';
const b = await imp('content/backyards.js');
const { cleanExterior } = await imp('game/exterior.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();
const HEX = /^#[0-9a-f]{6}$/;

for (const { id } of b.BACKS) {
  const parts = b.backParts(id);
  if (id === 'none') { if (parts.length) bad('"none" has no parts', ''); continue; }
  if (parts.length < 2 || parts.length > 6) bad('a back is a few solids', `${id}: ${parts.length}`);
  for (const p of parts) if (p.color !== 'accent' && !HEX.test(p.color)) bad('a part has a colour', `${id} ${p.color}`);
}
const plot = { id: 1, owner: 'x', x: 10, z: 0, w: 3, d: 3, facing: 1, yaw: 0, exterior: { back: 'garden' } };
if (cleanExterior({ back: 'laser' }, plot, 'shop').back !== 'none') bad('an unknown back becomes none', '');
if (cleanExterior({ back: 'pool' }, plot, 'shop').back !== 'pool') bad('a known back is kept', '');
if (b.backRoom(plot, [plot]) !== b.MAX_ROOM) bad('a lot alone has the most room', '');
const behind = { ...plot, id: 2, z: -3.6 }; // 0.6 behind a lot facing +z
if (Math.abs(b.backRoom(plot, [plot, behind]) - 0.6) > 1e-6) bad('room is the gap to the lot behind', String(b.backRoom(plot, [plot, behind])));
const inFront = { ...plot, id: 3, z: 3.6 };
if (b.backRoom(plot, [plot, inFront]) !== b.MAX_ROOM) bad('a lot in front does not take the room', '');
const turned = { ...plot, yaw: Math.PI / 2 }; // its back is toward -x
const nextDoor = { ...plot, id: 4, x: 10 - 3 - 1.0, yaw: Math.PI / 2 };
if (Math.abs(b.backRoom(turned, [turned, nextDoor]) - 1.0) > 1e-6) bad('room works for a turned lot', String(b.backRoom(turned, [turned, nextDoor])));

const inst = b.backInstances([plot, { ...plot, id: 5, exterior: { back: 'none' } }, { ...plot, id: 6, owner: null }], [plot]);
if (inst.map((i) => i.id).join() !== '1') bad('only built plots with a back get one', inst.map((i) => i.id).join());
if (inst[0] && inst[0].parts.some((p) => p.pos[2] > -(1.5) + 1e-6 && p.pos[2] > 0)) bad('items stand behind the building (facing +z)', '');
const tight = b.backInstances([plot, behind], [plot, behind]);
const tightReach = tight[0] ? Math.max(...tight[0].parts.map((p) => Math.abs(p.pos[2]) + p.scale[2] / 2)) - 1.5 : 0;
if (!tight.some((i) => i.id === 1) || tightReach > 0.6 + 1e-6) bad('a 0.6 gap still takes a shallow back that stays inside it', String(tightReach));
if (b.backInstances([plot, { ...behind, z: -3.2 }], [plot, { ...behind, z: -3.2 }]).some((i) => i.id === 1)) bad('a 0.2 gap is too tight for a back', '');
const wide = b.backInstances([plot], [plot])[0];
const reach = Math.max(...wide.parts.map((p) => Math.abs(p.pos[2]) + p.scale[2] / 2));
if (reach > 1.5 + b.MAX_ROOM) bad('nothing reaches past the room', String(reach));

// in the real city, nothing placed behind a lot reaches another lot
const city = generateCity(20260101);
const built = city.plots.filter((p) => !p.owner).slice(0, 200).map((p) => ({ ...p, owner: 'x', exterior: { back: 'parking' } }));
let overlaps = 0;
for (const p of built) {
  const i = b.backInstances([p], city.plots)[0];
  if (!i) continue;
  const cos = Math.cos(i.yaw), sin = Math.sin(i.yaw);
  for (const part of i.parts) {
    const wx = i.x + part.pos[0] * cos + part.pos[2] * sin;
    const wz = i.z - part.pos[0] * sin + part.pos[2] * cos;
    for (const o of city.plots) {
      if (o.id === p.id) continue;
      const bx = Math.abs(wx - o.x) < (o.w ?? 3) / 2 - 0.05 && Math.abs(wz - o.z) < (o.d ?? 3) / 2 - 0.05;
      if (bx && !(Math.abs(Math.sin(o.yaw ?? 0)) > 0.7)) overlaps++;
    }
  }
}
if (overlaps) bad('no item stands inside another lot', String(overlaps));
console.log(`backyards: ${built.length} lots checked`);
total();
