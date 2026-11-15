// The server and the player must agree on the daily content: where the chest is, which plot is the Plot of the Day, where the stars are. The game builds its city with
// generateTown (lib/state/store.js: the generator's city plus the extra lots); the server checks every claim against its own copy, so it must build the very same one.
// With generateCity alone the chest was in another place on most days and the Plot of the Day was a different plot on every day, so a player standing at the real chest was told
// "you are not close enough". Both sides of the currency and task tests used the same wrong city, which is how it was missed: this test uses the game's.
import fs from 'node:fs';
import path from 'node:path';
import { createApi } from '../services/api/server.mjs';
import { imp, root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const SEED = 20260101;
const SITE = 'https://site.test';
const { generateCity } = await imp('city/cityGenerator.js');
const { generateTown } = await imp('city/townExtension.js');
const { dailyChest, plotOfTheDay, scavengerHunt, POTD_VISIT_GOLD } = await imp('game/daily.js');
const { utcDay } = await imp('game/goldRules.js');

// ---- the game's city: the one the page builds
const store = fs.readFileSync(path.join(root, 'lib/state/store.js'), 'utf8');
check('the game builds its city with generateTown', /const initialCity = generateTown\(DEFAULT_SEED\)/.test(store));
for (const file of ['services/api/gold.mjs', 'services/api/tasks.mjs']) {
  const src = fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  check(`${file} builds the same city, with generateTown, not generateCity`, /generateTown\(/.test(src) && !/generateCity\(/.test(src));
}

// ---- why it matters: the two generators disagree
const base = generateCity(SEED);
const town = generateTown(SEED);
let chestDiffers = 0, potdDiffers = 0;
for (let i = 0; i < 120; i++) {
  const day = new Date(Date.UTC(2026, 10, 15) + i * 86400000).toISOString().slice(0, 10);
  if (JSON.stringify(dailyChest(base.layout.intersections, SEED, day)) !== JSON.stringify(dailyChest(town.layout.intersections, SEED, day))) chestDiffers++;
  if (plotOfTheDay(base.plots, SEED, day)?.id !== plotOfTheDay(town.plots, SEED, day)?.id) potdDiffers++;
}
check('the plain generator and the game\'s city give a different chest on most days and a different Plot of the Day, so the server must use the game\'s', chestDiffers > 60 && potdDiffers > 60, `chest ${chestDiffers}/120, Plot of the Day ${potdDiffers}/120`);

// ---- the server accepts the game's chest, Plot of the Day and star, where the player sees them
const api = createApi({ dbFile: ':memory:', seed: SEED, deliverEveryMs: 0, origin: SITE, rate: { perMinute: 100000, authPerMinute: 100000 }, env: { ADMIN_TOKEN: 'admin-machine-token', IP_SALT: 'salt', TRUST_PROXY: '1' } });
await new Promise((r) => api.server.listen(0, r));
const url = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { body, token } = {}) => {
  const res = await fetch(url + p, { method, headers: { 'Content-Type': 'application/json', Origin: SITE, 'X-Forwarded-For': '10.2.0.1', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data };
};
const day = utcDay();
const chest = dailyChest(town.layout.intersections, SEED, day);
const potd = plotOfTheDay(town.plots, SEED, day);
const stars = scavengerHunt(town.layout, town.plots, SEED, day);
// one account per claim: the server refuses an account that is in two far-apart places in the same second, as it should
const signup = async (name) => (await call('POST', '/auth/signup', { body: { username: name, password: 'longenough1' } })).data;
const walker = await signup('Chestwalker');
const visitor = await signup('Plotvisitor');
const hunter = await signup('Starhunter');

const opened = await call('POST', '/game/chest', { token: walker.token, body: { x: chest.x, z: chest.z } });
check('standing at the chest the player sees opens it', opened.status === 200 && opened.data.paid === chest.gold, `${opened.status} ${JSON.stringify(opened.data)}`);
const visited = await call('POST', '/game/potd', { token: visitor.token, body: { plotId: potd.id, x: potd.x, z: potd.z } });
check('walking into the Plot of the Day the player sees pays it', visited.status === 200 && visited.data.paid === POTD_VISIT_GOLD, `${visited.status} ${JSON.stringify(visited.data)}`);
const star = await call('POST', '/game/star', { token: hunter.token, body: { index: 0, x: stars[0].x, z: stars[0].z } });
check('standing at the star the player sees collects it', star.status === 200, `${star.status} ${JSON.stringify(star.data)}`);
const wrong = await call('POST', '/game/potd', { token: hunter.token, body: { plotId: base.plots[0].id === potd.id ? base.plots[1].id : base.plots[0].id, x: 0, z: 0 } });
check('another plot is still not the Plot of the Day', wrong.status === 409);

api.server.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
