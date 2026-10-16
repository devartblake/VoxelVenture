// Redesigned interiors: the saved scene is described for the viewer, the outside colour is read from the walls, and the store keeps designs per plot.
import { imp, problemTally } from './helpers.mjs';
const { describeScene, exteriorColorOf, useDesigns } = await imp('state/designStore.js');
const { bad, total } = problemTally();

// a small scene of the same shape the generator builds: building > level > slab + four walls, with a second level
const nodes = { b: { id: 'b', type: 'building', children: ['l0', 'l1'] }, l0: { id: 'l0', type: 'level', level: 0, children: ['s', 'w0', 'w1', 'w2', 'w3'] }, l1: { id: 'l1', type: 'level', level: 1, children: [] }, s: { id: 's', type: 'slab', polygon: [[0, 0], [10, 0], [10, 7], [0, 7]] } };
[[0, 0], [10, 0], [10, 7], [0, 7]].forEach((start, i, c) => { nodes[`w${i}`] = { id: `w${i}`, type: 'wall', start, end: c[(i + 1) % 4] }; });
const built = { nodes, rootNodeIds: ['b'], buildingId: 'b', levelIds: ['l0', 'l1'], floors: 2, room: { width: 10, depth: 7 } };
const d = describeScene(built);
if (!d || d.buildingId !== built.buildingId || d.floors !== built.floors || d.levelIds.join() !== built.levelIds.join()) bad('a scene is described the same way it was built', JSON.stringify(d));
if (!d || Math.abs(d.room.width - built.room.width) > 1e-9 || Math.abs(d.room.depth - built.room.depth) > 1e-9) bad('the room size is read from the walls', JSON.stringify(d?.room));
if (describeScene({ nodes: {}, rootNodeIds: [] }) !== null) bad('a scene with no building is refused', '');

if (exteriorColorOf(built) !== null) bad('no outside colour until a wall has one', String(exteriorColorOf(built)));
const painted = JSON.parse(JSON.stringify(built));
const level0 = painted.nodes[painted.levelIds[0]];
const walls = level0.children.map((id) => painted.nodes[id]).filter((n) => n.type === 'wall');
walls.forEach((w, i) => { w.exteriorMaterial = { properties: { color: i < 3 ? '#FF0000' : '#00ff00' } }; });
if (exteriorColorOf(painted) !== '#ff0000') bad('the most common outside colour wins', String(exteriorColorOf(painted)));
walls.forEach((w) => { delete w.exteriorMaterial; w.material = { properties: { color: '#336699' } }; });
if (exteriorColorOf(painted) !== '#336699') bad('a wall\'s general material colour counts when it has no exterior one', String(exteriorColorOf(painted)));
walls.forEach((w) => { w.material = { properties: { color: 'red' } }; });
if (exteriorColorOf(painted) !== null) bad('only #rrggbb colours are used', String(exteriorColorOf(painted)));

const v0 = useDesigns.getState().version;
useDesigns.getState().saveDesign(5, built);
if (!useDesigns.getState().designs[5] || useDesigns.getState().version !== v0 + 1) bad('saving stores the design and bumps the version', '');
useDesigns.getState().resetDesign(5);
if (useDesigns.getState().designs[5] || useDesigns.getState().version !== v0 + 2) bad('reset removes the design and bumps the version', '');
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
