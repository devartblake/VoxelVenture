// Redesigned interiors: the saved scene is described for the viewer, the outside colour is read from the walls, and the store keeps designs per plot
// (with a game server: the published one cached, the local copy a draft, saves sent by catalogue id with their revision).
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

// with a game server: the design is the server's, the local copy only a draft (lib/state/designStore.js)
const { designOnServer, fetchPublished, publishDesign } = await imp('state/designStore.js');
if (designOnServer(5)) bad('without a game server, designs stay in the browser', '');
process.env.NEXT_PUBLIC_LIVE_API_URL = 'http://api.test';
if (!designOnServer(5) || designOnServer('mall-3-store-2')) bad('with a game server, a city plot\'s design is on the server, a mall store\'s is not', '');
const sent = [];
let answer = { status: 200, body: { plotId: 5, version: 1, design: null, revision: 3, updatedAt: null } };
globalThis.fetch = async (url, init) => (sent.push({ url, method: init.method, body: init.body && JSON.parse(init.body) }), { ok: answer.status < 300, status: answer.status, json: async () => answer.body });
const v1 = useDesigns.getState().version;
await fetchPublished(5);
if (useDesigns.getState().published[5]?.revision !== 3 || useDesigns.getState().version !== v1 + 1) bad('a fetched design is cached and the viewer told', JSON.stringify(useDesigns.getState().published[5]));
await fetchPublished(5);
if (useDesigns.getState().version !== v1 + 1) bad('the same answer again does not reload the scene', '');
const withAsset = JSON.parse(JSON.stringify(built));
withAsset.nodes.i = { id: 'i', type: 'item', asset: { id: 'sofa', src: 'https://old-host.test/sofa.glb' } };
useDesigns.setState((s) => ({ designs: { ...s.designs, 5: withAsset }, bases: { ...s.bases, 5: 3 } }));
answer = { status: 409, body: { error: 'This interior was changed somewhere else.', code: 'stale_revision' } };
const refusal = await publishDesign(5, withAsset).catch((e) => e);
const put = sent.at(-1);
if (put.method !== 'PUT' || put.url !== 'http://api.test/plots/5/interior' || put.body.revision !== 3 || JSON.stringify(put.body.design.nodes.i.asset) !== '{"id":"sofa"}') bad('a save sends the design with catalogue ids only, and the revision it was based on', JSON.stringify(put).slice(0, 300));
if (refusal?.code !== 'stale_revision' || !useDesigns.getState().designs[5]) bad('a refused save throws the server\'s reason and keeps the draft', String(refusal));
answer = { status: 200, body: { plotId: 5, version: 1, design: put.body.design, revision: 4, updatedAt: 1 } };
await publishDesign(5, withAsset);
if (useDesigns.getState().designs[5] || useDesigns.getState().bases[5] != null || useDesigns.getState().published[5]?.revision !== 4) bad('a published design is cached and the draft is done with', '');
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
