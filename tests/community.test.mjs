// Proof-of-human traffic, leaseholds, the activity-based skyline and Building of the Week (server side).
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { root, sleep, imp } from './helpers.mjs';

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const port = await free();
const ADMIN = 'admin-secret';
// the default human rules (3 visits and 1 click per network per building per day), no minimum presence age; X-Forwarded-For stands in for different networks
const proc = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { cwd: root, env: { ...process.env, API_PORT: String(port), API_DB: ':memory:', ADMIN_TOKEN: ADMIN, HUMAN_MIN_AGE_MS: '0', TRUST_PROXY: '1' }, stdio: 'ignore' });
const base = `http://localhost:${port}`;
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const call = async (method, p, { token, body, ip, ua = 'Mozilla/5.0 test' } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': ua, ...(ip ? { 'X-Forwarded-For': ip } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { /* starting */ } await sleep(250); }
  const { generateCity } = await imp('city/cityGenerator.js');
  const { weekStartOf } = await imp('market/weeks.js');
  const city = generateCity(20260101);
  const built = city.plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2 && !p.admin);
  const hq = city.plots.find((p) => p.admin);
  const empties = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb');
  const visit = (plotId, visitor, ip, extra = {}) => call('POST', '/events', { ip, ua: extra.ua, body: { plotId, kind: extra.kind ?? 'visit', visitor, seconds: extra.seconds ?? 60 } });
  const ping = (visitor, ip, ua) => call('POST', '/presence/ping', { ip, ua, body: { visitor } });
  const stats = async (id) => (await call('GET', `/plots/${id}/stats`)).data;

  // ---- proof of human traffic
  const P = built[3];
  const nobody = await visit(P.id, 'visitor-nopresence', '10.1.0.1');
  check('an event from a visitor who never had a page open is recorded but not verified', nobody.data.counted === true && nobody.data.verified === false);
  await ping('visitor-bot1', '10.1.0.2', 'SomeBot/1.0 (+http://bot.test)');
  check('a bot is not verified', (await visit(P.id, 'visitor-bot1', '10.1.0.2', { ua: 'SomeBot/1.0' })).data.verified === false);
  await ping('visitor-human1', '10.1.0.3');
  const first = await visit(P.id, 'visitor-human1', '10.1.0.3');
  check('a visitor with a running page is verified', first.data.verified === true);
  let s0 = await stats(P.id);
  check('only verified events are counted in the statistics', s0.views === 1 && s0.verified === true && s0.humanShare > 0 && s0.humanShare < 1, JSON.stringify({ v: s0.views, h: s0.humanShare }));
  // the same network: at most three visits and one click per building per day
  for (const n of [2, 3, 4, 5]) { await ping(`visitor-net${n}`, '10.1.0.9'); }
  const sameNet = [];
  for (const n of [2, 3, 4, 5]) sameNet.push((await visit(P.id, `visitor-net${n}`, '10.1.0.9')).data.verified);
  check('one network gets three verified visits a day per building, then no more', sameNet.join() === 'true,true,true,false', sameNet.join());
  await ping('visitor-click1', '10.1.0.20');
  await ping('visitor-click2', '10.1.0.20');
  const c1 = await visit(P.id, 'visitor-click1', '10.1.0.20', { kind: 'click' });
  const c2 = await visit(P.id, 'visitor-click2', '10.1.0.20', { kind: 'click' });
  check('one click per network per building per day', c1.data.verified === true && c2.data.verified === false);
  const other = built[4];
  await ping('visitor-click1', '10.1.0.20');
  check('the caps are per building', (await visit(other.id, 'visitor-click1', '10.1.0.20', { kind: 'click' })).data.verified === true);
  const s1 = await stats(P.id);
  check('the dashboard counts only the verified events', s1.views === 4 && s1.clicks === 1 && s1.uniques === 4, JSON.stringify({ v: s1.views, c: s1.clicks, u: s1.uniques }));

  // ---- the skyline grows with verified engagement
  const Q = built[8];
  for (let i = 0; i < 30; i++) {
    const v = `visitor-sky${i}`;
    const ip = `10.2.0.${i + 1}`;
    await ping(v, ip);
    await visit(Q.id, v, ip, { seconds: 120 });
  }
  const world = (await call('GET', '/plots/state')).data;
  const qs = world.plots.find((p) => p.id === Q.id).skyline;
  check('a building with thirty real visitors reaches level 2 with the verified badge', qs && qs.level === 2 && qs.badges.includes('verified') && qs.badges.includes('light') && qs.badges.includes('pennant') && !qs.badges.includes('fountain'), JSON.stringify(qs));
  check('a building nobody visited has no skyline growth', world.plots.find((p) => p.id === built[20].id).skyline === null);

  // ---- leaseholds
  const amy = (await call('POST', '/auth/signup', { body: { username: 'Amy', password: 'longenough1' } })).data;
  const bob = (await call('POST', '/auth/signup', { body: { username: 'Bob', password: 'longenough2' } })).data;
  const lot = empties[0];
  const biz = { title: 'Amy Coffee', buildingType: 'restaurant', website: 'https://amy.test', variant: 'cafe', logo: { kind: 'generated' }, description: 'Coffee.' };
  check('a lease is 30, 90 or 365 days', (await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, leaseDays: 45 } })).status === 400);
  const claim = await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, leaseDays: 30 } });
  check('claiming with a 30-day lease gives a lease that ends in 30 days', claim.status === 200 && claim.data.lease.days === 30 && claim.data.lease.state === 'active' && Math.abs(claim.data.lease.end - Date.now() - 30 * 86400000) < 60000, JSON.stringify(claim.data.lease));
  check('the plot is worth a year\'s price (its land), whatever the lease', claim.data.value === lot.price && claim.data.lease.renewPrice === Math.round(lot.price * 0.2 * 0.5 * 100) / 100, JSON.stringify([claim.data.value, claim.data.lease.renewPrice]));
  check('nobody can take over a leased business', (await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Co' } })).data.code === 'leased');
  check('it is too early to renew a fresh lease', (await call('POST', `/plots/${lot.id}/renew`, { token: amy.token, body: {} })).data.code === 'too_early');
  check('renewing needs the tenant', (await call('POST', `/plots/${lot.id}/renew`, {})).status === 401 && (await call('POST', `/plots/${lot.id}/renew`, { token: bob.token, body: {} })).status === 404);
  check('only an admin can end a lease early', (await call('POST', `/admin/plots/${lot.id}/lease`, { body: { state: 'renewal' } })).status === 403);
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
  check('in the last days nobody else can take it over either', (await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Co' } })).data.code === 'leased');
  const before = (await call('GET', `/plots/${lot.id}`)).data.lease;
  const renewed = await call('POST', `/plots/${lot.id}/renew`, { token: amy.token, body: { leaseDays: 90 } });
  check('the tenant renews at half price and the lease runs on from its old end', renewed.status === 200 && renewed.data.plot.lease.days === 90 && renewed.data.plot.lease.end > before.end + 89 * 86400000 && renewed.data.paid === Math.round(lot.price * 0.5 * 0.5 * 100) / 100 && renewed.data.plot.lease.state === 'active', JSON.stringify(renewed.data.plot.lease));
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'grace' } });
  check('in the grace week only the tenant can renew (right of first refusal)', (await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Co' } })).data.code === 'leased');
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'open' } });
  const notices = (await call('POST', '/admin/leases/notices', { token: ADMIN, body: {} })).data;
  check('lease notices run (nobody has a verified email here, so none are sent)', notices.sent === 0);
  const taken = await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Co' } });
  check('once the lease has ended and the week has passed the plot is open to a buyout, and the new tenant gets a lease', taken.status === 200 && taken.data.plot.lease.days === 365 && taken.data.plot.lease.state === 'active' && taken.data.plot.owner === 'Bob', JSON.stringify(taken.data.plot?.lease));
  check('a business the city started with has no lease and can be taken over', (await call('GET', `/plots/${built[0].id}`)).data.lease === null);

  // ---- Building of the Week
  const cat = (await call('POST', '/auth/signup', { body: { username: 'Cat', password: 'longenough3' } })).data;
  const today = new Date().toISOString().slice(0, 10);
  check('voting needs a sign-in', (await call('POST', '/vote', { body: { plotId: built[1].id } })).status === 401);
  const fresh = (await call('GET', '/votes', { token: cat.token })).data;
  check('every signed-in player has one vote a week without the stars', fresh.allowed === 1 && fresh.votesLeft === 1 && fresh.canVote === true && fresh.huntWon === false && fresh.week === weekStartOf(), JSON.stringify(fresh));
  check('a headquarters cannot be voted for', (await call('POST', '/vote', { token: cat.token, body: { plotId: hq.id } })).data.code === 'bad_plot');
  check('nor your own building', (await call('POST', '/vote', { token: bob.token, body: { plotId: lot.id } })).data.code === 'own_building');
  const voted = await call('POST', '/vote', { token: cat.token, body: { plotId: built[1].id } });
  check('the vote counts and shows in the leaders', voted.status === 200 && voted.data.votedFor.join() === String(built[1].id) && voted.data.votesLeft === 0 && voted.data.leaders[0].plotId === built[1].id && voted.data.leaders[0].votes === 1, JSON.stringify(voted.data));
  const noMore = (await call('POST', '/vote', { token: cat.token, body: { plotId: built[2].id } })).data;
  check('with the one vote used, a second needs the stars (and says so)', noMore.code === 'no_votes_left' && /gold stars/.test(noMore.error), JSON.stringify(noMore));
  check('the stars must all be found, and it must be today', (await call('POST', '/hunt/complete', { token: cat.token, body: { day: today, found: [0, 1] } })).data.code === 'incomplete' && (await call('POST', '/hunt/complete', { token: cat.token, body: { day: '2020-01-01', found: [0, 1, 2] } })).data.code === 'bad_day' && (await call('POST', '/hunt/complete', { body: { day: today, found: [0, 1, 2] } })).status === 401);
  const hunt = await call('POST', '/hunt/complete', { token: cat.token, body: { day: today, found: [0, 1, 2] } });
  check('finding all three stars earns a second vote this week', hunt.status === 200 && hunt.data.huntWon === true && hunt.data.allowed === 2 && hunt.data.votesLeft === 1 && hunt.data.canVote === true, JSON.stringify(hunt.data));
  check('but not for the same building twice', (await call('POST', '/vote', { token: cat.token, body: { plotId: built[1].id } })).data.code === 'already_voted');
  const second = await call('POST', '/vote', { token: cat.token, body: { plotId: built[2].id } });
  check('the bonus vote goes to another building', second.status === 200 && second.data.votedFor.length === 2 && second.data.votesLeft === 0 && second.data.leaders.length === 2);
  check('and then no more this week', (await call('POST', '/vote', { token: cat.token, body: { plotId: built[3].id } })).data.code === 'no_votes_left');
  await call('POST', '/vote', { token: amy.token, body: { plotId: built[2].id } });
  const pub = (await call('GET', '/votes')).data;
  check('anyone can see the leaders, most votes first, with when voting closes and no winner until a week has ended', pub.leaders[0].plotId === built[2].id && pub.leaders[0].votes === 2 && pub.winner === null && pub.canVote === false && pub.signedIn === false && pub.endsAt > Date.now(), JSON.stringify(pub).slice(0, 200));
  check('the state list carries the Building of the Week (none yet)', (await call('GET', '/plots/state')).data.botw === null);
  // last week's top becomes this week's Building of the Week (the votes are moved back a week here, as if the week had ended)
  const { createApi } = await import(new URL('../services/api/server.mjs', import.meta.url).href);
  const local = createApi({ deliverEveryMs: 0, env: {} });
  const lastWeek = (await imp('market/weeks.js')).addWeeks(weekStartOf(), -1);
  const a1 = local.db.prepare("INSERT INTO accounts (username, pass_salt, pass_hash, created_at) VALUES ('v1','s','h',0)").run().lastInsertRowid;
  const a2 = local.db.prepare("INSERT INTO accounts (username, pass_salt, pass_hash, created_at) VALUES ('v2','s','h',0)").run().lastInsertRowid;
  for (const [a, p, at] of [[a1, built[5].id, 1], [a2, built[5].id, 2], [a1, built[6].id, 3]]) local.db.prepare('INSERT INTO votes (week, account_id, plot_id, at) VALUES (?,?,?,?)').run(lastWeek, a, p, at);
  const { buildingOfTheWeek } = await import(new URL('../services/api/community.mjs', import.meta.url).href);
  const w = buildingOfTheWeek(local.db);
  check('last week\'s most-voted building is this week\'s Building of the Week', w?.plotId === built[5].id && w.votes === 2 && w.week === lastWeek, JSON.stringify(w));
  await local.close();
} finally {
  proc.kill();
}
console.log(fails ? `${fails} failed` : 'ALL OK');
process.exit(fails ? 1 : 0);
