// The pop-up market API: the weekly layout (admin), the stalls and prices everyone sees, and booking a stall for 24 to 72 hours.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { root, sleep, imp } from './helpers.mjs';

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const port = await free();
const ADMIN = 'test-admin-token';
const proc = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { cwd: root, env: { ...process.env, API_PORT: String(port), API_DB: ':memory:', ADMIN_TOKEN: ADMIN }, stdio: 'ignore' });
const base = `http://localhost:${port}`;
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const call = async (method, p, { token, body } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const HOUR = 3600000;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { /* starting */ } await sleep(250); }
  const { weekStartOf, addWeeks, weekWindow } = await imp('market/weeks.js');
  const { generateCity } = await imp('city/cityGenerator.js');
  const sites = generateCity(20260101).layout.reserved;
  const marketSite = sites.find((s) => s.market);

  // ---- the sites have ID codes, and exactly one is the market
  check('every site has a number and an ID code', sites.every((s, i) => s.number === i + 1 && s.code === `SD-${String(i + 1).padStart(4, '0')}`), sites.map((s) => s.code).join());
  check('one site is the market', sites.filter((s) => s.market).length === 1 && marketSite.code === 'SD-0004');
  const sum = (await call('GET', '/market')).data;
  check('the API lists the market and the weeks to set up', sum.sites.length === 1 && sum.sites[0].code === marketSite.code && sum.weeks.length === 6 && sum.weeks[0] === weekStartOf());

  // ---- a week nobody set up shows an automatic layout that can be booked
  const week = weekStartOf();
  const next = addWeeks(week, 1);
  const w0 = (await call('GET', `/market/${marketSite.code}/${week}`)).data;
  check('an automatic layout is shown, open, with prices of $2 to $5', w0.source === 'auto' && w0.open && w0.stalls.length >= 40 && w0.stalls.every((s) => s.cents >= 200 && s.cents <= 500), `${w0.stalls.length} stalls`);
  check('the default week is this week, and a bad week or code is refused', (await call('GET', `/market/${marketSite.code}`)).data.week === week && (await call('GET', `/market/${marketSite.code}/2026-03-03`)).status === 400 && (await call('GET', '/market/SD-0099')).status === 404);

  // ---- the admin sets next week's layout
  const set = { siteCode: marketSite.code, week: next, params: { style: 'columns', entrances: 2, seed: 7 }, rates: { prime: 450, quiet: 250 }, note: 'Food week', publish: false };
  check('only an admin can set a layout', (await call('POST', '/admin/market/layout', { body: set })).status === 403 && (await call('POST', '/admin/market/layout', { token: 'nope', body: set })).status === 403);
  check('a bad week or site is refused', (await call('POST', '/admin/market/layout', { token: ADMIN, body: { ...set, week: '2020-01-06' } })).status === 400 && (await call('POST', '/admin/market/layout', { token: ADMIN, body: { ...set, siteCode: 'SD-0001' } })).status === 404);
  const draft = (await call('POST', '/admin/market/layout', { token: ADMIN, body: set })).data;
  check('the layout is saved as a draft with its style, rates and note', draft.source === 'admin' && !draft.open && draft.params.style === 'columns' && draft.note === 'Food week' && draft.rates.prime === 450 && draft.rates.quiet === 250);
  const primeStall = draft.stalls.find((s) => s.tier === 'prime');
  const quietStall = draft.stalls.find((s) => s.tier === 'quiet');
  check('the admin\'s rates replace the standard price of that tier, within $2 to $5', primeStall.cents === 450 && quietStall.cents === 250 && draft.stalls.find((s) => s.tier === 'busy').cents === 400);
  const amy = (await call('POST', '/auth/signup', { body: { username: 'Amy', password: 'longenough1' } })).data;
  const start = weekWindow(next).start + 2 * 24 * HOUR;
  const order = { siteCode: marketSite.code, week: next, stallId: primeStall.id, hours: 48, start, brand: 'Amy Bakes', product: 'Fresh bread' };
  check('a draft week cannot be booked', (await call('POST', '/market/book', { token: amy.token, body: order })).status === 409);
  check('publishing opens it', (await call('POST', '/admin/market/layout', { token: ADMIN, body: { ...set, publish: true } })).data.open === true);

  // ---- booking
  check('booking needs an account', (await call('POST', '/market/book', { body: order })).status === 401);
  check('a booking must be 24, 48 or 72 hours', (await call('POST', '/market/book', { token: amy.token, body: { ...order, hours: 36 } })).status === 409);
  check('a stall needs a name', (await call('POST', '/market/book', { token: amy.token, body: { ...order, brand: ' ' } })).status === 400);
  check('an unknown stall is refused', (await call('POST', '/market/book', { token: amy.token, body: { ...order, stallId: 'ZZ99' } })).status === 409);
  check('a booking cannot run past the end of the week', (await call('POST', '/market/book', { token: amy.token, body: { ...order, start: weekWindow(next).end - 10 * HOUR, hours: 24 } })).status === 409);
  const ok = await call('POST', '/market/book', { token: amy.token, body: order });
  check('a stall is booked at its flat price', ok.status === 200 && ok.data.paid === 450 && ok.data.booking.hours === 48 && ok.data.booking.end === start + 48 * HOUR && ok.data.stall.id === primeStall.id, JSON.stringify(ok.data));
  const bob = (await call('POST', '/auth/signup', { body: { username: 'Bob', password: 'longenough2' } })).data;
  check('the same stall cannot be booked over the top', (await call('POST', '/market/book', { token: bob.token, body: { ...order, start: start + 24 * HOUR, hours: 24, brand: 'Bob' } })).status === 409);
  check('it can be booked after the first booking ends', (await call('POST', '/market/book', { token: bob.token, body: { ...order, start: start + 48 * HOUR, hours: 24, brand: 'Bob Cheese' } })).status === 200);
  const seen = (await call('GET', `/market/${marketSite.code}/${next}`)).data;
  check('everyone sees who has the stall and when', seen.bookings.length === 2 && seen.bookings[0].brand === 'Amy Bakes' && seen.bookings[0].by === 'Amy' && seen.bookings.every((b) => b.stallId === primeStall.id));
  check('my bookings lists them', (await call('GET', '/market/mine', { token: amy.token })).data.bookings.length === 1 && (await call('GET', '/market/mine')).status === 401);
  // the layout of a booked week cannot be rearranged, but its prices can be changed
  check('a week with bookings cannot be rearranged', (await call('POST', '/admin/market/layout', { token: ADMIN, body: { ...set, publish: true, params: { style: 'rows', seed: 3 } } })).status === 409);
  check('...but its prices and note can change', (await call('POST', '/admin/market/layout', { token: ADMIN, body: { ...set, publish: true, rates: { prime: 500 }, note: 'Food week!' } })).data.rates.prime === 500);
  // one account holds at most four stalls a week
  const others = seen.stalls.filter((s) => s.id !== primeStall.id).slice(0, 5);
  let last = null;
  for (const s of others) last = await call('POST', '/market/book', { token: amy.token, body: { ...order, stallId: s.id, hours: 24, start } });
  check('one account holds at most four stalls in a week', last.status === 409 && (await call('GET', '/market/mine', { token: amy.token })).data.bookings.length === 4, String(last.status));
  // cancelling
  const mineId = (await call('GET', '/market/mine', { token: amy.token })).data.bookings[0].id;
  check('only the owner can cancel', (await call('POST', `/market/bookings/${mineId}/cancel`, { token: bob.token })).status === 404 && (await call('POST', `/market/bookings/${mineId}/cancel`, { token: amy.token })).status === 200);
  check('a cancelled stall can be booked again', (await call('POST', '/market/book', { token: bob.token, body: { ...order, brand: 'Bob again' } })).status === 200);

  // ---- the admin's view
  const adm = (await call('GET', `/admin/market?week=${next}`, { token: ADMIN })).data;
  const row = adm.sites[0];
  check('the admin sees stalls, bookings and what the week earns', (await call('GET', `/admin/market?week=${next}`)).status === 403 && row.code === marketSite.code && row.published && row.stalls === seen.stalls.length && row.bookings >= 5 && row.earnedCents > 0 && row.booked >= 4, JSON.stringify({ ...row, stats: undefined }));

  // ---- a stall that is open now: its shop, its visitors, and what happens when the time is up
  const cur = (await call('GET', `/market/${marketSite.code}/${week}`)).data;
  const nowMs = Date.now();
  const liveStart = Math.max(weekWindow(week).start, nowMs - 60000);
  if (liveStart + 24 * HOUR <= weekWindow(week).end) {
    const free = cur.stalls.find((s) => !cur.bookings.some((b) => b.stallId === s.id));
    const liveOrder = { siteCode: marketSite.code, week, stallId: free.id, hours: 24, start: liveStart, brand: 'Live Bakes', product: 'Bread', goods: [{ name: 'Sourdough', cents: 450 }, { name: 'Rye', cents: 500 }, { name: '  ', cents: 100 }], offer: '2 for 1 on rolls', website: 'https://bakes.test' };
    check('a bad website is refused', (await call('POST', '/market/book', { token: amy.token, body: { ...liveOrder, website: 'javascript:alert(1)' } })).status === 400);
    const lv = await call('POST', '/market/book', { token: amy.token, body: liveOrder });
    check('a stall can be booked from now and is open at once, with its goods', lv.status === 200 && lv.data.booking.state === 'live' && lv.data.booking.goods.length === 2 && lv.data.booking.offer === '2 for 1 on rolls', JSON.stringify(lv.data));
    const shown = (await call('GET', `/market/${marketSite.code}/${week}`)).data.bookings.find((b) => b.id === lv.data.booking.id);
    check('visitors see the goods, offer and website of an open stall', shown.state === 'live' && shown.goods[0].name === 'Sourdough' && shown.goods[0].cents === 450 && shown.website === 'https://bakes.test');
    const id = lv.data.booking.id;
    check('only the owner can set up the shop', (await call('PATCH', `/market/bookings/${id}`, { token: bob.token, body: { goods: [] } })).status === 404);
    const upd = await call('PATCH', `/market/bookings/${id}`, { token: amy.token, body: { goods: Array.from({ length: 12 }, (_, i) => ({ name: `Item ${i}`, cents: 100 + i })), offer: 'Free tasting', website: '' } });
    check('the owner changes the shop (at most eight goods)', upd.status === 200 && upd.data.booking.goods.length === 8 && upd.data.booking.offer === 'Free tasting' && upd.data.booking.website === null);
    const v1 = await call('POST', `/market/bookings/${id}/visit`, { token: bob.token, body: {} });
    const v2 = await call('POST', `/market/bookings/${id}/visit`, { token: bob.token, body: {} });
    const v3 = await call('POST', `/market/bookings/${id}/visit`, { body: { visitor: 'guest-1' } });
    const v4 = await call('POST', `/market/bookings/${id}/visit`, { token: amy.token, body: {} });
    check('a visitor is counted once an hour, a guest counts, the owner does not', v1.data.counted === true && v2.data.counted === false && v3.data.counted === true && v4.data.counted === false, JSON.stringify([v1.data, v2.data, v3.data, v4.data]));
    const mineNow = (await call('GET', '/market/mine', { token: amy.token })).data.bookings.find((b) => b.id === id);
    check('the owner sees their visitors and that the stall is open', mineNow.visits === 2 && mineNow.state === 'live');
    check('a stall that has not started is not counted', (await call('POST', `/market/bookings/${ok.data.booking.id}/visit`, { token: bob.token, body: {} })).data.counted !== true);
    check('notices can only be run by an admin, and report what they sent', (await call('POST', '/admin/market/notices', { body: {} })).status === 403 && typeof (await call('POST', '/admin/market/notices', { token: ADMIN, body: { now: nowMs } })).data.opening === 'number');
    // the time runs out: the stall is shut and free to rent again
    const after = nowMs + 25 * HOUR;
    const closing = (await call('POST', '/admin/market/notices', { token: ADMIN, body: { now: after } })).data;
    check('when the time is up the closing notices run (no email on file, so none are sent)', closing.closed === 0 && closing.opening === 0);
  }
} finally {
  proc.kill();
}
console.log(fails ? `${fails} failed` : 'ALL OK');
process.exit(fails ? 1 : 0);
