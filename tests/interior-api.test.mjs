// Redesigned interiors on the server (services/api/interiors.mjs, lib/content/interiorDesign.js): every visitor reads the owner's design,
// only the owner writes it, a stale revision is refused, the checks keep anything odd out, and a change of owner hides the old design.
// Also: the catalogue ids the server checks against are the installed Pascal catalogue's, and every generated interior passes the checks
// and comes back whole when its assets are filled in again from the catalogue.
import fs from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createApi } from '../services/api/server.mjs';
import { imp } from './helpers.mjs';
import * as types from '@voxelventure/shared-types';
import { catalogIdsFromPackage } from '../scripts/interior-asset-ids.mjs';

// The Pascal catalogue is a TypeScript file only the bundler loads (see tests/hotspots.test.mjs); with its types stripped Node can read it,
// so the generated interiors can be built here.
registerHooks({ load: (url, ctx, next) => (url.endsWith('.tsx') ? { format: 'module', source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url), 'utf8')), shortCircuit: true } : next(url, ctx)) });

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { CATALOG_ITEM_IDS } = await imp('content/interiorAssetIds.js');
const { cleanDesign, storedDesign, roomForPlot, NODE_TYPES, MAX_NODES, MAX_BODY_BYTES } = await imp('content/interiorDesign.js');
const { buildInteriorScene, withCatalogAssets, interiorAsset } = await imp('content/interiorScenes.js');
const { generateCity } = await imp('city/cityGenerator.js');

// ---- the catalogue ids and the contract agree with the code
const installed = await catalogIdsFromPackage();
check('the committed catalogue ids are the installed catalogue\'s (run node scripts/interior-asset-ids.mjs after updating @pascal-app/editor)', JSON.stringify(installed) === JSON.stringify(CATALOG_ITEM_IDS), `${installed.length} installed, ${CATALOG_ITEM_IDS.length} committed`);
const nodeSchema = types.INTERIOR_DESIGN.schema.properties.nodes;
check('the contract allows exactly the node types the checks allow', JSON.stringify(nodeSchema.additionalProperties.properties.type.enum) === JSON.stringify(NODE_TYPES));
check('and the same number of nodes', nodeSchema.maxProperties === MAX_NODES);

// ---- every generated interior is a design the server takes, and comes back whole from its catalogue ids
const city = generateCity(20260101);
let generated = 0;
let biggest = 0;
const problems = [];
for (const p of city.plots.filter((q) => q.owner && q.interiorData)) {
  const scene = buildInteriorScene(p);
  const room = roomForPlot({ buildingType: p.buildingType, variant: p.interiorData.variant, prime: p.prime, luxury: p.luxury, grand: p.grand });
  if (room.width !== scene.room.width || room.depth !== scene.room.depth) problems.push(`${p.id}: room ${JSON.stringify(room)} vs ${JSON.stringify(scene.room)}`);
  try {
    const design = cleanDesign(storedDesign(scene), room);
    biggest = Math.max(biggest, JSON.stringify(design).length);
    const back = withCatalogAssets(design);
    for (const [id, n] of Object.entries(scene.nodes)) if (n.type === 'item' && JSON.stringify(back.nodes[id].asset) !== JSON.stringify(n.asset)) problems.push(`${p.id}: ${id} asset ${n.asset.id} differs`);
    if (!types.check(types.INTERIOR_DESIGN, design).ok) problems.push(`${p.id}: outside the contract: ${types.check(types.INTERIOR_DESIGN, design).errors[0]}`);
    generated++;
  } catch (e) {
    problems.push(`${p.id}: ${e.message}`);
  }
}
check('every generated interior passes the checks, fits the contract and gets its assets back from the catalogue', problems.length === 0 && generated > 300, `${generated} rooms; ${problems.slice(0, 3).join(' | ')}`);
check('the largest of them is well under the limit', biggest > 0 && biggest < 512 * 1024 / 2, `${Math.round(biggest / 1024)} KB`);
check('an id the catalogue does not have is left out when loading, and its parent forgets it', (() => {
  const g = withCatalogAssets({ nodes: { l: { id: 'l', type: 'level', children: ['a', 'x'] }, a: { id: 'a', type: 'item', asset: { id: 'sofa' } }, x: { id: 'x', type: 'item', asset: { id: 'no-such-thing' } } }, rootNodeIds: [] });
  return !g.nodes.x && g.nodes.l.children.join() === 'a' && g.nodes.a.asset.src === interiorAsset('sofa').src;
})());

// ---- the API
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: 'admin' } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { token, body, raw } = {}) => {
  try {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: raw ?? (body == null ? undefined : JSON.stringify(body)) });
    return { status: res.status, data: await res.json().catch(() => null) };
  } catch {
    return { status: 413, data: null }; // the server stops reading a body that is too large and closes the connection
  }
};
try {
  const amy = (await call('POST', '/auth/signup', { body: { username: 'Amy', password: 'longenough1' } })).data;
  const bob = (await call('POST', '/auth/signup', { body: { username: 'Bob', password: 'longenough1' } })).data;
  const lot = city.plots.find((p) => !p.owner && p.districtId !== 'suburb' && !p.prime && !p.luxury && !p.grand);
  const biz = { title: 'Amy Shop', buildingType: 'shop', website: 'https://amy.test', logo: { kind: 'generated' } };
  await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: biz });
  const at = `/plots/${lot.id}/interior`;
  const room = roomForPlot({ buildingType: 'shop' }); // 8 x 6
  const node = (id, type, parentId, extra = {}) => ({ object: 'node', id, type, parentId, visible: true, metadata: { editor: 'state' }, ...extra });
  const design = (extra = {}) => ({
    nodes: {
      b: node('b', 'building', null, { children: ['l'], position: [0, 0, 0], rotation: [0, 0, 0] }),
      l: node('l', 'level', 'b', { children: ['s', 'w', 'i'], level: 0, height: 2.5 }),
      s: node('s', 'slab', 'l', { name: 'Floor', polygon: [[0, 0], [room.width, 0], [room.width, room.depth], [0, room.depth]], elevation: 0.05 }),
      w: node('w', 'wall', 'l', { children: [], start: [0, 0], end: [room.width, 0], interiorMaterial: { preset: 'custom', properties: { color: '#336699', roughness: 0.8, side: 'double' } } }),
      i: node('i', 'item', 'l', { name: 'Hello world', position: [2, 0, 3], rotation: [0, 1.5, 0], asset: { id: 'sofa', src: 'https://old-host.test/sofa.glb', thumbnail: 'https://old-host.test/t.png', dimensions: [2, 1, 1] } }),
      ...extra,
    },
    rootNodeIds: ['b'],
  });

  const none = await call('GET', at);
  check('a plot nobody redesigned has no design (the generated interior is shown)', none.status === 200 && none.data.design === null && none.data.revision === 0, JSON.stringify(none.data));
  check('a signed-out visitor cannot write', (await call('PUT', at, { body: { design: design(), revision: 0 } })).status === 401 && (await call('DELETE', at, { body: {} })).status === 401);
  check('another account cannot write', (await call('PUT', at, { token: bob.token, body: { design: design(), revision: 0 } })).status === 403 && (await call('DELETE', at, { token: bob.token, body: {} })).status === 403);
  check('nobody can write the inside of a building the city owns', (await call('PUT', `/plots/${city.plots.find((p) => p.owner && p.interiorData).id}/interior`, { token: amy.token, body: { design: design(), revision: 0 } })).status === 403);

  const first = await call('PUT', at, { token: amy.token, body: { design: design(), revision: 0 } });
  check('the owner saves a design', first.status === 200 && first.data.revision === 1, JSON.stringify(first.data).slice(0, 200));
  const item = first.data.design?.nodes.i;
  check('an item keeps its catalogue id only, not the asset\'s URLs', JSON.stringify(item?.asset) === '{"id":"sofa"}');
  check('names and the editor\'s metadata are left out; colours and positions are kept', item && !('name' in item) && !('metadata' in item) && !('name' in first.data.design.nodes.s) && first.data.design.nodes.w.interiorMaterial.properties.color === '#336699' && item.position.join() === '2,0,3');
  const seen = await call('GET', at);
  check('any visitor reads it', seen.status === 200 && seen.data.revision === 1 && JSON.stringify(seen.data.design) === JSON.stringify(first.data.design));
  check('a save based on an older revision is refused (409)', (await call('PUT', at, { token: amy.token, body: { design: design(), revision: 0 } })).status === 409 && (await call('PUT', at, { token: amy.token, body: { design: design(), revision: 7 } })).data?.code === 'stale_revision');
  check('a save must say its revision', (await call('PUT', at, { token: amy.token, body: { design: design() } })).status === 400);
  const second = await call('PUT', at, { token: amy.token, body: { design: design(), revision: 1 } });
  check('a save based on the current revision goes through', second.status === 200 && second.data.revision === 2);

  // what the checks refuse
  const refused = async (name, d, status, code) => {
    const r = await call('PUT', at, { token: amy.token, body: { design: d, revision: 2 } });
    check(name, r.status === status && (!code || r.data?.code === code) && typeof r.data?.error === 'string' && r.data.error.length > 10, `${r.status} ${JSON.stringify(r.data)}`);
  };
  await refused('an unknown node type is refused (400)', design({ r: node('r', 'roof', 'l') }), 400, 'bad_node_type');
  await refused('furniture not in the catalogue is refused (400)', design({ i: node('i', 'item', 'l', { position: [2, 0, 3], asset: { id: 'my-own-model', src: 'https://evil.test/x.glb' } }) }), 400, 'unknown_asset');
  await refused('an item without a catalogue id is refused', design({ i: node('i', 'item', 'l', { position: [2, 0, 3], asset: { src: 'https://evil.test/x.glb' } }) }), 400, 'unknown_asset');
  await refused('furniture outside the room is refused', design({ i: node('i', 'item', 'l', { position: [40, 0, 3], asset: { id: 'sofa' } }) }), 400, 'outside_room');
  await refused('a wall outside the room is refused', design({ w: node('w', 'wall', 'l', { children: [], start: [0, 0], end: [0, 500] }) }), 400, 'outside_room');
  await refused('a position that is not a number is refused', design({ i: node('i', 'item', 'l', { position: [null, 0, 3], asset: { id: 'sofa' } }) }), 400, 'bad_number');
  await refused('a size bigger than the room is refused', design({ l: node('l', 'level', 'b', { children: ['s', 'w', 'i'], level: 0, height: 80 }) }), 400, 'outside_room');
  await refused('free text in a field is refused', design({ w: node('w', 'wall', 'l', { children: [], start: [0, 0], end: [8, 0], materialPreset: '<script>alert(1)</script>' }) }), 400, 'bad_value');
  await refused('a node whose parent is not in the design is refused', design({ i: node('i', 'item', 'gone', { position: [2, 0, 3], asset: { id: 'sofa' } }) }), 400, 'bad_tree');
  await refused('a wall hanging off a building (not a floor) is refused', design({ w: node('w', 'wall', 'b', { children: [], start: [0, 0], end: [8, 0] }) }), 400, 'bad_tree');
  await refused('a design without its building is refused', { ...design(), rootNodeIds: ['l'] }, 400, 'bad_tree');
  const many = Object.fromEntries(Array.from({ length: MAX_NODES + 1 }, (_, k) => [`n${k}`, node(`n${k}`, 'item', 'l', { position: [1, 0, 1], asset: { id: 'sofa' } })]));
  await refused('too many nodes are refused (413)', design(many), 413, 'too_many_nodes');
  const padded = Object.fromEntries(Array.from({ length: 1500 }, (_, k) => [`p${k}`, node(`p${k}`, 'item', 'l', { position: [1, 0, 1], asset: { id: 'sofa' }, slots: Object.fromEntries(Array.from({ length: 8 }, (__, j) => [`slot${j}`, 'x'.repeat(40)])) })]));
  await refused('a design too large to store is refused (413)', design(padded), 413, 'too_large');
  check('a body larger than the limit is refused (413)', (await call('PUT', at, { token: amy.token, raw: JSON.stringify({ design: design(), revision: 2, pad: 'x'.repeat(MAX_BODY_BYTES) }) })).status === 413);
  check('nothing refused was saved', (await call('GET', at)).data.revision === 2);

  // the audit trail has every save and reset
  const audit = (await call('GET', `/admin/audit?target_kind=plot&target_id=${lot.id}`, { token: 'admin' })).data.entries;
  check('saves are in the audit trail, with who and which revision', audit.filter((e) => e.action === 'plot.interior_save').length === 2 && audit.find((e) => e.action === 'plot.interior_save').actor.id === amy.account.id && audit.find((e) => e.action === 'plot.interior_save').detail.revision === 2);

  // back to the generated interior
  check('a reset based on an older revision is refused', (await call('DELETE', at, { token: amy.token, body: { revision: 1 } })).status === 409);
  const reset = await call('DELETE', at, { token: amy.token, body: { revision: 2 } });
  check('the owner goes back to the generated interior', reset.status === 200 && reset.data.design === null && reset.data.revision === 3 && (await call('GET', at)).data.design === null);
  check('the reset is in the audit trail', (await call('GET', `/admin/audit?action=plot.interior_delete`, { token: 'admin' })).data.entries.length === 1);
  check('and the next save goes on from that revision', (await call('PUT', at, { token: amy.token, body: { design: design(), revision: 3 } })).data?.revision === 4);

  // a lease that has ended leaves the business, and its design, with the tenant until somebody takes it over; only the editing stops
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: 'admin', body: { state: 'grace' } });
  check('in the grace week the tenant can no longer save', (await call('PUT', at, { token: amy.token, body: { design: design(), revision: 4 } })).data?.code === 'lease_ended');
  check('but the design is still shown', (await call('GET', at)).data.revision === 4 && (await call('GET', at)).data.design !== null);
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: 'admin', body: { state: 'open' } });
  const price = (await call('GET', `/plots/${lot.id}`)).data;
  const took = await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Shop' } });
  check('(Bob takes the shop over)', took.status === 200, JSON.stringify(took.data).slice(0, 200) + price.value);
  const after = await call('GET', at);
  check('after a take-over the old owner\'s design is gone: the generated interior is shown', after.data.design === null && after.data.revision === 0, JSON.stringify(after.data));
  check('the old owner cannot write any more', (await call('PUT', at, { token: amy.token, body: { design: design(), revision: 0 } })).status === 403);
  check('the new owner starts from revision 0', (await call('PUT', at, { token: bob.token, body: { design: design(), revision: 0 } })).data?.revision === 1);

  // the room's own door and windows (the project's models, not the catalogue's) save, and come back whole when loaded
  const { DOOR_ASSET, WINDOW_ASSET } = await imp('content/interiorOwnAssets.js');
  const fitted = design({
    w: node('w', 'wall', 'l', { children: ['dr', 'wn'], start: [0, 0], end: [room.width, 0], frontSide: 'interior', backSide: 'exterior' }),
    dr: node('dr', 'item', 'w', { name: 'door', position: [3, 0, 0], rotation: [0, 0, 0], side: 'front', asset: { ...DOOR_ASSET } }),
    wn: node('wn', 'item', 'w', { name: 'window-large', position: [6, 0.5, 0], rotation: [0, 0, 0], side: 'front', asset: { ...WINDOW_ASSET } }),
  });
  const withDoor = await call('PUT', at, { token: bob.token, body: { design: storedDesign(fitted), revision: 1 } });
  const loaded = withCatalogAssets((await call('GET', at)).data.design ?? {});
  check('a design with the room\'s own door and windows saves', withDoor.status === 200 && JSON.stringify(withDoor.data.design.nodes.dr.asset) === '{"id":"door"}' && withDoor.data.design.nodes.wn.side === 'front', JSON.stringify(withDoor.data).slice(0, 200));
  check('and reloads with their whole assets, by id', JSON.stringify(loaded.nodes?.dr?.asset) === JSON.stringify(DOOR_ASSET) && JSON.stringify(loaded.nodes?.wn?.asset) === JSON.stringify(WINDOW_ASSET) && loaded.nodes.w.children.join() === 'dr,wn');

  // a lease that has ended stops the editing (the grace week and after); the last 14 days still allow it, and renewing gives it back
  const DAY = 86400000;
  const setEnd = (ms) => api.db.prepare('UPDATE plots SET lease_end = ? WHERE id = ?').run(ms, lot.id);
  const rev = async () => (await call('GET', at)).data.revision;
  setEnd(Date.now() + 3 * DAY);
  const inWindow = await call('PUT', at, { token: bob.token, body: { design: storedDesign(fitted), revision: await rev() } });
  check('in the lease\'s last 14 days the owner can still change the inside', inWindow.status === 200, JSON.stringify(inWindow.data));
  setEnd(Date.now() - DAY);
  const inGrace = await call('PUT', at, { token: bob.token, body: { design: storedDesign(fitted), revision: await rev() } });
  const delGrace = await call('DELETE', at, { token: bob.token });
  check('once the lease has ended (the grace week), saving is refused with lease_ended', inGrace.status === 403 && inGrace.data?.code === 'lease_ended', JSON.stringify(inGrace.data));
  check('and so is going back to the generated inside', delGrace.status === 403 && delGrace.data?.code === 'lease_ended');
  check('visitors still see the design meanwhile', (await call('GET', at)).data.design !== null);
  setEnd(Date.now() - 30 * DAY);
  check('after the grace week too (open to a buyout)', (await call('PUT', at, { token: bob.token, body: { design: storedDesign(fitted), revision: await rev() } })).data?.code === 'lease_ended');
  setEnd(Date.now() + 100 * DAY);
  check('renewing gives the editing back', (await call('PUT', at, { token: bob.token, body: { design: storedDesign(fitted), revision: await rev() } })).status === 200);

  // a design is shown only while its author owns the plot, however the plot changed hands
  api.db.prepare('UPDATE plots SET owner_account = ? WHERE id = ?').run(amy.account.id, lot.id);
  check('a design saved by anyone but today\'s owner is never served', (await call('GET', at)).data.design === null);
  api.db.prepare('UPDATE plots SET owner_account = ? WHERE id = ?').run(bob.account.id, lot.id);

  // a claim starts from the generated interior too, even if a row was left behind
  const lot2 = city.plots.find((p) => !p.owner && p.districtId !== 'suburb' && p.id !== lot.id);
  api.db.prepare('INSERT INTO plot_interiors (plot_id, account_id, design, revision, updated_at) VALUES (?, ?, ?, 3, 0)').run(lot2.id, bob.account.id, JSON.stringify(design()));
  await call('POST', `/plots/${lot2.id}/claim`, { token: bob.token, body: { ...biz, title: 'Bob Two' } });
  check('a claim removes any design left on the lot', (await call('GET', `/plots/${lot2.id}/interior`)).data.design === null && !api.db.prepare('SELECT 1 FROM plot_interiors WHERE plot_id = ?').get(lot2.id));
  check('an unknown plot is 404', (await call('GET', '/plots/999999/interior')).status === 404);
} catch (err) {
  fails++;
  console.log('FAIL', err.stack);
} finally {
  await api.close();
}
console.log(fails ? `\n${fails} check(s) failed` : '\nALL OK');
process.exit(fails ? 1 : 0);
