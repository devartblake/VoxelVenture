// The API (server/api): accounts, the directory, claiming (atomic), take-over, events and statistics. Starts its own server on a free port.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { root, sleep, imp } from './helpers.mjs';

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const port = await free();
const proc = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { cwd: root, env: { ...process.env, API_PORT: String(port), API_DB: ':memory:', ADMIN_TOKEN: 'admin-secret', HUMAN_MIN_AGE_MS: '0', HUMAN_VISIT_CAP: '1000', HUMAN_CLICK_CAP: '1000' }, stdio: 'ignore' });
const base = `http://localhost:${port}`;
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const call = async (method, p, { token, body } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { /* starting */ } await sleep(250); }
  const { generateCity } = await imp('city/cityGenerator.js');
  const city = generateCity(20260101);
  const built = city.plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2);
  const empties = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb');

  // ---- the world is the game's own
  const health = await call('GET', '/health');
  check('the world is seeded with every plot of the game', health.data.plots === city.plots.length && health.data.adSlots === city.billboards.length, `${health.data.plots}`);
  const dir = await call('GET', '/plots');
  check('the directory lists every built plot, numbered 1 to N', dir.data.total === built.length && dir.data.entries.every((e, i) => e.number === i + 1) && dir.data.entries[0].rank === 1, `${dir.data.total}`);
  check('it is ordered by value', dir.data.entries.every((e, i) => !i || e.plot.value <= dir.data.entries[i - 1].plot.value));
  check('sort and search work', (await call('GET', '/plots?sort=plot&limit=3')).data.entries.map((e) => e.plot.id).join() === built.map((p) => p.id).sort((a, b) => a - b).slice(0, 3).join() && (await call('GET', `/plots?q=${encodeURIComponent(built[0].title)}`)).data.matched >= 1);
  check('a plot by id', (await call('GET', `/plots/${built[0].id}`)).data.title === built[0].title && (await call('GET', '/plots/999999')).status === 404);

  // ---- accounts
  check('a short password is refused', (await call('POST', '/auth/signup', { body: { username: 'amy', password: 'short' } })).status === 400);
  check('a bad name is refused', (await call('POST', '/auth/signup', { body: { username: 'a b', password: 'longenough1' } })).status === 400);
  const amy = (await call('POST', '/auth/signup', { body: { username: 'Amy', password: 'longenough1' } })).data;
  check('signing up returns a token and the account', amy.token?.length === 64 && amy.account.username === 'Amy');
  check('the same name (any case) is taken', (await call('POST', '/auth/signup', { body: { username: 'amy', password: 'longenough1' } })).status === 409);
  check('a wrong password is refused', (await call('POST', '/auth/login', { body: { username: 'Amy', password: 'nope-nope-1' } })).status === 401);
  const again = (await call('POST', '/auth/login', { body: { username: 'amy', password: 'longenough1' } })).data;
  check('logging in works and /me knows the account', (await call('GET', '/me', { token: again.token })).data.account.id === amy.account.id && (await call('GET', '/me')).status === 401 && (await call('GET', '/me', { token: 'bad' })).status === 401);
  const bob = (await call('POST', '/auth/signup', { body: { username: 'Bob', password: 'longenough2' } })).data;

  // ---- claiming
  const lot = empties[0];
  const biz = { title: 'Amy Coffee', buildingType: 'restaurant', website: 'https://amy.test', variant: 'cafe', logo: { kind: 'generated' }, description: 'Fresh coffee all day.' };
  check('claiming needs an account', (await call('POST', `/plots/${lot.id}/claim`, { body: biz })).status === 401);
  check('a bad logo, website or type is refused', (await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, logo: { kind: 'icon', icon: 'bomb' } } })).status === 400 && (await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, website: 'javascript:alert(1)' } })).status === 400 && (await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, buildingType: 'casino' } })).status === 400);
  check('an Old Town house cannot be claimed', (await call('POST', `/plots/${city.plots.find((p) => p.districtId === 'suburb').id}/claim`, { token: amy.token, body: biz })).status === 409);
  const claim = await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: biz });
  check('a claim makes the plot hers, worth its land price (its price for 30 days, as the claim form shows it)', claim.status === 200 && claim.data.owner === 'Amy' && claim.data.value === lot.price && claim.data.ownerAccount === amy.account.id, JSON.stringify(claim.data).slice(0, 80));
  check('it appears in the directory', (await call('GET', `/plots?q=${encodeURIComponent('Amy Coffee')}`)).data.matched === 1);
  // the race: ten players claim one lot at the same moment, exactly one wins
  const racers = [];
  for (let i = 0; i < 10; i++) racers.push((await call('POST', '/auth/signup', { body: { username: `racer${i}`, password: 'longenough3' } })).data);
  const target = empties[1];
  const results = await Promise.all(racers.map((r, i) => call('POST', `/plots/${target.id}/claim`, { token: r.token, body: { ...biz, title: `Racer ${i}` } })));
  const wins = results.filter((r) => r.status === 200).length;
  check('ten players race for one lot: exactly one wins, nine get 409', wins === 1 && results.filter((r) => r.status === 409 && r.data.code === 'already_owned').length === 9, results.map((r) => r.status).join());
  const owner = (await call('GET', `/plots/${target.id}`)).data;
  check('and the winner owns it', results.findIndex((r) => r.status === 200) === Number(owner.title.replace('Racer ', '')));

  // ---- take over
  const prey = built[3];
  // a business the city started with is worth its land: a take-over is 1.25x that, for 30 days
  const takePrice = Math.round(prey.price * 1.25 * 100) / 100;
  check('you cannot take over your own business', (await call('POST', `/plots/${lot.id}/takeover`, { token: amy.token, body: biz })).status === 409);
  check('a stale price is refused', (await call('POST', `/plots/${prey.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Co', expectedPrice: 1 } })).status === 409);
  const take = await call('POST', `/plots/${prey.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Co', expectedPrice: takePrice } });
  check('a take-over costs 1.25x, pays out the old owner and counts', take.status === 200 && take.data.paidOut === takePrice && take.data.previousOwner === prey.owner && take.data.plot.owner === 'Bob' && take.data.plot.takeovers === 1, JSON.stringify(take.data).slice(0, 100));
  const hist = (await call('GET', `/plots/${prey.id}/history`)).data;
  check('the history shows the take-over, then the opening', hist.events[0].title === 'Bob Co' && hist.events[0].now && hist.events[0].paidTo === prey.owner && hist.events.at(-1).kind === 'open' && hist.owners === 1);
  check('only the owner can edit; the price and owner cannot be edited', (await call('PATCH', `/plots/${prey.id}`, { token: amy.token, body: { description: 'x' } })).status === 403 && (await call('PATCH', `/plots/${prey.id}`, { token: bob.token, body: { description: 'New words', value: 1, owner: 'x' } })).data.description === 'New words' && (await call('GET', `/plots/${prey.id}`)).data.value === takePrice);

  // ---- events and statistics
  const mine = built[5];
  check('statistics start empty and real', (await call('GET', `/plots/${mine.id}/stats`)).data.views === 0 && (await call('GET', `/plots/${mine.id}/stats`)).data.simulated === false);
  const anonIds = new Map();
  const ev = async (kind, source, who, seconds) => {
    const visitor = who ? 'account-visitor' : (anonIds.get(source) ?? (anonIds.set(source, `anon${anonIds.size}${Date.now()}`), anonIds.get(source)));
    await call('POST', '/presence/ping', { token: who?.token, body: { visitor } }); // a running page, so the event is verified
    return call('POST', '/events', { token: who?.token, body: { plotId: mine.id, kind, source, seconds, visitor: who ? undefined : visitor } });
  };
  await ev('visit', 'billboard', amy, 90);
  await ev('visit', 'search', bob, 30);
  await ev('visit', 'street', null, 60);
  await ev('click', 'street', amy);
  const dup = await ev('visit', 'billboard', amy, 90);
  check('a repeat visit within a minute is not counted again', dup.data.counted === false);
  const st = (await call('GET', `/plots/${mine.id}/stats`)).data;
  check('three visits, three visitors, one click', st.views === 3 && st.uniques === 3 && st.clicks === 1 && Math.abs(st.ctr - 1 / 3) < 1e-9, JSON.stringify({ v: st.views, u: st.uniques, c: st.clicks }));
  check('average time inside and the sources add up', st.avgSeconds === 60 && Math.abs(st.sources.reduce((a, s) => a + s.share, 0) - 1) < 1e-9 && st.sources.find((s) => s.id === 'billboard').share > 0.3);
  check('today has the visits, with thirty days', st.days.length === 30 && st.days[29].views === 3 && st.busiestHour !== null);
  check('the visit count on the plot is the verified visits only (no generated starting figure)', (await call('GET', `/plots/${mine.id}`)).data.visits === 3);
  check('events on an empty lot or with a bad kind are refused', (await call('POST', '/events', { body: { plotId: empties[5].id, kind: 'visit' } })).status === 400 && (await call('POST', '/events', { body: { plotId: mine.id, kind: 'hack' } })).status === 400);
  // leaving a building: its time inside goes on the visit, once, and never more than the time since the visit began
  await call('POST', '/presence/ping', { body: { visitor: 'leaver' } });
  check('a leave without a visit changes nothing', (await call('POST', '/events', { body: { plotId: mine.id, kind: 'leave', seconds: 40, visitor: 'leaver' } })).data.counted === false);
  await call('POST', '/events', { body: { plotId: mine.id, kind: 'visit', source: 'search', visitor: 'leaver' } });
  const left = (await call('POST', '/events', { body: { plotId: mine.id, kind: 'leave', seconds: 900, visitor: 'leaver' } })).data;
  check('a leave sets the time inside, capped by the time since the visit began', left.counted === false && left.seconds >= 0 && left.seconds <= 2, JSON.stringify(left));
  check('a second leave does not change it again', !('seconds' in (await call('POST', '/events', { body: { plotId: mine.id, kind: 'leave', seconds: 30, visitor: 'leaver' } })).data));
  check('a bad leave is refused', (await call('POST', '/events', { body: { plotId: mine.id, kind: 'leave', seconds: 'x', visitor: 'leaver' } })).status === 400);
  const afterLeave = (await call('GET', `/plots/${mine.id}/stats`)).data;
  check('the visit found by search counts in the search source', afterLeave.sources.find((x) => x.id === 'search').share > 0 && afterLeave.views === 4, JSON.stringify(afterLeave.sources));
  const ws = (await call('GET', '/world/stats')).data;
  check('world statistics', ws.buildings === built.length + 2 + 0 || ws.buildings >= built.length, JSON.stringify(ws));

  // ---- ad slots (billboards and the aerial banners)
  const ads = (await call('GET', '/ads')).data.slots;
  check('every billboard and banner of the game is an ad slot', ads.length === city.billboards.length && ads.every((x) => city.billboards.some((b) => b.id === x.id)) && ads.some((x) => x.kind === 'banner') && ads.some((x) => x.open), `${ads.length}`);
  const open = ads.find((x) => x.open);
  const adBody = { advertiser: 'Amy Coffee', headline: 'Best coffee in town', tagline: 'Fresh daily', url: 'https://amy.test', color: '#10b981' };
  check('buying an ad space needs an account and a valid ad', (await call('POST', `/ads/${open.id}/buy`, { body: adBody })).status === 401 && (await call('POST', `/ads/${open.id}/buy`, { token: amy.token, body: { ...adBody, color: 'green' } })).status === 400 && (await call('POST', `/ads/${open.id}/buy`, { token: amy.token, body: { ...adBody, url: 'javascript:1' } })).status === 400 && (await call('POST', '/ads/nothing/buy', { token: amy.token, body: adBody })).status === 404);
  const buy = await call('POST', `/ads/${open.id}/buy`, { token: amy.token, body: adBody });
  check('an open ad space is bought at 1.25x its value, nobody to pay out', buy.status === 200 && buy.data.slot.value === Math.round(open.value * 1.25) && buy.data.paidOut === 0 && buy.data.slot.ad.headline === 'Best coffee in town' && !buy.data.slot.open);
  check('you cannot buy your own ad space again', (await call('POST', `/ads/${open.id}/buy`, { token: amy.token, body: adBody })).status === 409);
  const taken = await call('POST', `/ads/${open.id}/buy`, { token: bob.token, body: { ...adBody, advertiser: 'Bob Co', headline: 'Bob wins', expectedPrice: buy.data.slot.price } });
  check('a take-over pays out the old advertiser and starts the stats from zero', taken.status === 200 && taken.data.previousAdvertiser === 'Amy Coffee' && taken.data.paidOut === buy.data.slot.price && taken.data.slot.views === 0 && taken.data.slot.takeovers === 1);
  check('a stale price is refused', (await call('POST', `/ads/${open.id}/buy`, { token: amy.token, body: { ...adBody, expectedPrice: 1 } })).status === 409);
  const adHist = (await call('GET', `/ads/${open.id}/history`)).data.events;
  check('the ad history lists both purchases, newest first', adHist.length === 2 && adHist[0].advertiser === 'Bob Co' && adHist[0].paidTo === 'Amy Coffee');
  const raceSlot = ads.find((x) => x.open && x.id !== open.id) ?? ads.find((x) => !x.open && x.id !== open.id);
  const raceRes = await Promise.all(racers.map((r, i) => call('POST', `/ads/${raceSlot.id}/buy`, { token: r.token, body: { ...adBody, advertiser: `Racer ${i}`, expectedPrice: raceSlot.price } })));
  check('ten players race for one ad space: exactly one wins', raceRes.filter((r) => r.status === 200).length === 1 && raceRes.filter((r) => r.status === 409).length === 9, raceRes.map((r) => r.status).join());
  const viewer = racers[0];
  await call('POST', '/presence/ping', { token: viewer.token, body: { visitor: 'ad-viewer' } }); // a running page
  await call('POST', '/ad-events', { token: amy.token, body: { slotId: open.id, kind: 'view' } });
  await call('POST', '/ad-events', { token: viewer.token, body: { slotId: open.id, kind: 'view' } });
  await call('POST', '/ad-events', { token: viewer.token, body: { slotId: open.id, kind: 'click' } });
  const dupAd = await call('POST', '/ad-events', { token: viewer.token, body: { slotId: open.id, kind: 'click' } });
  const ownAd = await call('POST', '/ad-events', { token: bob.token, body: { slotId: open.id, kind: 'view' } });
  const botAd = await call('POST', '/ad-events', { body: { slotId: open.id, kind: 'view', visitor: 'never-pinged' } });
  const after = (await call('GET', `/ads/${open.id}`)).data;
  check('verified views and clicks on an ad are counted (a repeat within a minute is not)', after.views === 2 && after.clicks === 1 && dupAd.data.counted === false, JSON.stringify({ v: after.views, c: after.clicks }));
  check("the advertiser's own view and a visitor with no running page are recorded but not counted", ownAd.data.verified === false && botAd.data.verified === false);
  const openSlot2 = ads.find((x) => x.open && x.id !== open.id && x.id !== raceSlot.id);
  check('events on an empty slot or of a bad kind are refused', (openSlot2 ? (await call('POST', '/ad-events', { body: { slotId: openSlot2.id, kind: 'view' } })).status === 400 : true) && (await call('POST', '/ad-events', { body: { slotId: open.id, kind: 'x' } })).status === 400);
  const state = (await call('GET', '/plots/state')).data;
  check('the world state carries every plot and every ad space', state.plots.length === city.plots.length && state.ads.length === ads.length && state.plots.find((p) => p.id === lot.id).owner === 'Amy');

  // ---- safety
  check('a huge body is refused', (await fetch(base + '/auth/login', { method: 'POST', body: 'x'.repeat(300000) }).then((r) => r.status).catch(() => 413)) === 413);
  check('bad JSON is a 400, an unknown route a 404', (await fetch(base + '/auth/login', { method: 'POST', body: '{nope' })).status === 400 && (await call('GET', '/nothing')).status === 404);
  const flood = await Promise.all(Array.from({ length: 30 }, () => call('POST', '/auth/login', { body: { username: 'Amy', password: 'wrong-wrong-1' } })));
  check('guessing passwords is rate limited', flood.some((r) => r.status === 429));
} catch (e) {
  fails++;
  console.log('FAIL the API test crashed:', e.stack);
} finally {
  proc.kill();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
