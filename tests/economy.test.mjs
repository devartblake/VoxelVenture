// The plot economy's data (services/api/economy.mjs, docs/monetization/plot_economy_data.md): the server's claim hold (conflicts, refresh, the
// 15-minute ceiling, expiry), the steps towards a plot (recorded, verified, capped, the owner's own left out, a price never taken from the client),
// take-over attempts and refusals, a paid claim's checkout and outcome, foot traffic per area (aggregated in memory, flushed, a player once a day and
// once an hour, the per-network cap, the owner's own area left out), watching a plot (one email per event), and the admin report's figures on a
// seeded database.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import * as economy from '../services/api/economy.mjs';
import { signPayload } from '../services/api/billing.mjs';
import { imp } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const DAY = 86400000;
const ADMIN = 'admin';
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1)';
const { areaOf, isAreaId, HOLD_SECONDS, HOLD_MAX_SECONDS } = await imp('game/economy.js');
const { leaseQuote } = await imp('game/claimPrice.js');

async function start(env) {
  const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: ADMIN, HUMAN_MIN_AGE_MS: '0', ...env } });
  await new Promise((r) => api.server.listen(0, r));
  const base = `http://localhost:${api.server.address().port}`;
  const call = async (method, p, { token, body, ua } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(ua ? { 'User-Agent': ua } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const signup = async (u) => (await call('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
  const empty = api.db.prepare("SELECT * FROM plots WHERE owner_name IS NULL AND claimable = 1 AND json_extract(facts, '$.admin') = 0 ORDER BY id").all();
  const business = api.db.prepare("SELECT * FROM plots WHERE owner_name IS NOT NULL AND claimable = 1 AND owner_account IS NULL AND json_extract(facts, '$.admin') = 0 AND building_type != 'house' ORDER BY id").all();
  return { api, call, signup, empty, business, base };
}
const biz = (title, extra = {}) => ({ title, buildingType: 'shop', website: 'https://shop.test', logo: { kind: 'generated' }, leaseDays: 30, ...extra });

try {
  check('an area is a 24-unit square of the map, named by column and row', areaOf(0, 0) === '0:0' && areaOf(23.9, -0.1) === '0:-1' && areaOf(-24, 48) === '-1:2' && isAreaId('-1:2') && !isAreaId('1:2:3') && !isAreaId('x') && !isAreaId('999:0') && !isAreaId('-0:1'));

  // ================================================================================================================ the hold
  const { api, call, signup, empty, business } = await start({});
  const db = api.db;
  const intents = (where = '1=1', ...args) => db.prepare(`SELECT * FROM plot_intents WHERE ${where} ORDER BY id`).all(...args);
  const amy = await signup('Amy');
  const bob = await signup('Bob');
  const carl = await signup('Carl');
  const [P, Q, R, S, T] = empty;

  check('a hold needs an account', (await call('POST', `/plots/${P.id}/hold`, { body: {} })).status === 401);
  const h1 = await call('POST', `/plots/${P.id}/hold`, { token: amy.token, body: { leaseDays: 30, buildingType: 'shop' } });
  const want = Math.round(leaseQuote({ ...JSON.parse(P.facts), id: P.id, value: P.value, ownerAccount: null, exterior: null }, null, 'shop', 30).total * 100);
  check('an empty plot is held for three minutes', h1.status === 200 && Math.abs(h1.data.secondsLeft - HOLD_SECONDS) <= 1 && h1.data.until > Date.now(), JSON.stringify(h1.data));
  check('the hold quotes the price the claim form shows, priced by the server', h1.data.quote.priceCents === want && h1.data.quote.termDays === 30, `${h1.data.quote.priceCents} vs ${want}`);
  check('the hold and the quote are steps of the intent', intents('plot_id = ?', P.id).map((i) => i.step).join() === 'hold,quote' && intents('plot_id = ?', P.id).every((i) => i.account_id === amy.account.id && i.kind === 'claim'));
  const h2 = await call('POST', `/plots/${P.id}/hold`, { token: bob.token, body: {} });
  check('another account is refused with the time left', h2.status === 409 && h2.data.code === 'held' && h2.data.secondsLeft > 170 && h2.data.secondsLeft <= HOLD_SECONDS, JSON.stringify(h2.data));
  const seen = (await call('GET', `/plots/${P.id}/hold`, { token: bob.token })).data;
  check('GET says it is held and for how long, not by whom', seen.held === true && seen.mine === false && seen.secondsLeft > 170 && Object.keys(seen).sort().join() === 'held,mine,secondsLeft' && (await call('GET', `/plots/${P.id}/hold`, { token: amy.token })).data.mine === true);
  const refused = await call('POST', `/plots/${P.id}/claim`, { token: bob.token, body: biz('Bob Shop') });
  check('a claim by another account is refused while it is held', refused.status === 409 && refused.data.code === 'held' && !db.prepare('SELECT owner_name FROM plots WHERE id = ?').get(P.id).owner_name);
  check('...and is recorded as a failed claim', intents("plot_id = ? AND step = 'failed'", P.id).length === 1 && intents("plot_id = ? AND step = 'failed'", P.id)[0].account_id === bob.account.id);
  db.prepare('UPDATE plot_holds SET hold_until = ? WHERE plot_id = ?').run(Date.now() + 60000, P.id);
  const h3 = await call('POST', `/plots/${P.id}/hold`, { token: amy.token, body: { leaseDays: 30, buildingType: 'shop' } });
  check('the same account refreshes it (three minutes again), with no second hold step and no repeated quote', h3.status === 200 && h3.data.secondsLeft > 170 && intents("plot_id = ? AND step IN ('hold','quote')", P.id).length === 2);
  await call('POST', `/plots/${P.id}/hold`, { token: amy.token, body: { leaseDays: 7, buildingType: 'shop' } });
  check('a different term is a new quote', intents("plot_id = ? AND step = 'quote'", P.id).at(-1).term_days === 7);
  db.prepare('UPDATE plot_holds SET started_at = ? WHERE plot_id = ?').run(Date.now() - (HOLD_MAX_SECONDS - 30) * 1000, P.id);
  const h4 = await call('POST', `/plots/${P.id}/hold`, { token: amy.token, body: { leaseDays: 7 } });
  check('a hold is never refreshed beyond 15 minutes from its start', h4.data.secondsLeft <= 31 && h4.data.secondsLeft >= 28, JSON.stringify(h4.data));
  check('a plot with a business cannot be held', (await call('POST', `/plots/${business[0].id}/hold`, { token: amy.token, body: {} })).data.code === 'not_empty');

  // holding another plot lets the first go
  await call('POST', `/plots/${Q.id}/hold`, { token: amy.token, body: {} });
  check('holding another plot lets go of the first (an abandoned step)', !db.prepare('SELECT 1 FROM plot_holds WHERE plot_id = ?').get(P.id) && intents("plot_id = ? AND step = 'abandoned'", P.id).length === 1);
  check('...so another account can hold it now', (await call('POST', `/plots/${P.id}/hold`, { token: bob.token, body: {} })).status === 200);

  // expiry
  db.prepare('UPDATE plot_holds SET hold_until = ? WHERE plot_id = ?').run(Date.now() - 1000, P.id);
  check('a run-out hold no longer blocks a claim', (await call('GET', `/plots/${P.id}/hold`)).data.held === false);
  check('the sweep lets it go by itself and writes the abandoned step', economy.sweepHolds(db) === 1 && intents("plot_id = ? AND step = 'abandoned' AND account_id = ?", P.id, bob.account.id).length === 1 && !db.prepare('SELECT 1 FROM plot_holds WHERE plot_id = ?').get(P.id));
  await call('POST', `/plots/${R.id}/hold`, { token: carl.token, body: {} });
  db.prepare('UPDATE plot_holds SET hold_until = ? WHERE plot_id = ?').run(Date.now() - 1000, R.id);
  check('a run-out hold is taken over by the next player even before the sweep', (await call('POST', `/plots/${R.id}/hold`, { token: bob.token, body: {} })).status === 200 && intents("plot_id = ? AND step = 'abandoned' AND account_id = ?", R.id, carl.account.id).length === 1);
  check('letting go (DELETE) is an abandoned step', (await call('DELETE', `/plots/${R.id}/hold`, { token: bob.token })).data.released === true && intents("plot_id = ? AND step = 'abandoned' AND account_id = ?", R.id, bob.account.id).length === 1);
  check('...and only the holder can let it go', (await call('DELETE', `/plots/${Q.id}/hold`, { token: bob.token })).data.released === false && db.prepare('SELECT 1 FROM plot_holds WHERE plot_id = ?').get(Q.id));

  // claiming the held plot
  const claimed = await call('POST', `/plots/${Q.id}/claim`, { token: amy.token, body: biz('Amy Shop') });
  const claimRow = intents("plot_id = ? AND step = 'claimed'", Q.id)[0];
  const ledger = db.prepare("SELECT price FROM ledger WHERE plot_id = ? AND kind = 'claim'").get(Q.id);
  check('the holder claims it', claimed.status === 200 && claimed.data.owner === 'Amy');
  check('the claim is a step, at the price in the ledger, and ends the hold', claimRow && claimRow.verified === 1 && claimRow.price_cents === Math.round(ledger.price * 100) && claimRow.term_days === 30 && !db.prepare('SELECT 1 FROM plot_holds WHERE plot_id = ?').get(Q.id));
  check('a claimed hold is not abandoned', economy.sweepHolds(db) === 0 && intents("plot_id = ? AND step = 'abandoned'", Q.id).length === 0);

  // ================================================================================================================ steps the game sends
  const ping = (visitor, extra = {}, opts = {}) => call('POST', '/presence/ping', { body: { visitor, ...extra }, ...opts });
  const intent = (id, body, opts = {}) => call('POST', `/plots/${id}/intent`, { body, ...opts });
  check('an unknown step is refused', (await intent(S.id, { step: 'claimed', visitor: 'visitor-1' })).status === 400);
  const noPresence = await intent(S.id, { step: 'card_open', visitor: 'visitor-1' });
  check('a card opened by a page that has not pinged presence is kept, not counted', noPresence.data.recorded && noPresence.data.verified === false);
  await ping('visitor-2');
  check('after a ping it counts', (await intent(S.id, { step: 'card_open', visitor: 'visitor-2' })).data.verified === true);
  check('the same card again within a minute is one', (await intent(S.id, { step: 'card_open', visitor: 'visitor-2' })).data.recorded === false);
  check('the visitor number is kept hashed, never as sent', intents("step = 'card_open'").every((i) => i.visitor && !i.visitor.includes('visitor')));
  await ping('crawler-1', {}, { ua: BOT });
  check('a robot\'s card open is not counted', (await intent(S.id, { step: 'card_open', visitor: 'crawler-1' }, { ua: BOT })).data.verified === false);
  for (const v of ['visitor-3', 'visitor-4', 'visitor-5']) await ping(v);
  const capped = [];
  for (const v of ['visitor-3', 'visitor-4', 'visitor-5']) capped.push((await intent(S.id, { step: 'card_open', visitor: v })).data.verified);
  check('one network counts at most three card opens of a plot a day', capped.join() === 'true,true,false', capped.join());
  await call('POST', '/presence/ping', { token: amy.token, body: { visitor: 'amy-device' } });
  check('the tenant opening their own card is not counted', (await intent(Q.id, { step: 'card_open' }, { token: amy.token })).data.verified === false);
  check('a card of an Old Town house is not recorded', (await intent(db.prepare('SELECT id FROM plots WHERE claimable = 0').get().id, { step: 'card_open', visitor: 'visitor-2' })).data.recorded === false);
  check('a leased business\'s card is recorded as demand for an occupied plot', intents("plot_id = ? AND step = 'card_open'", Q.id)[0]?.kind === 'occupied');

  // setting a plot up needs an account: only a card open is taken from a visitor
  await ping('setter-1');
  check('a visitor\'s setup step is refused (the setup form asks to sign in first)', (await intent(T.id, { step: 'hold', visitor: 'setter-1' })).status === 400 && (await intent(T.id, { step: 'quote', visitor: 'setter-1', leaseDays: 7, priceCents: 1 })).status === 400 && !intents('plot_id = ?', T.id).length);
  check('opening a take-over form needs an account too', (await intent(business[1].id, { step: 'open', visitor: 'setter-1' })).status === 401);
  const q1 = await call('POST', `/plots/${T.id}/hold`, { token: carl.token, body: { leaseDays: 7, buildingType: 'office', priceCents: 1 } });
  const want2 = Math.round(leaseQuote({ ...JSON.parse(T.facts), id: T.id, value: T.value, ownerAccount: null, exterior: null }, null, 'office', 7).total * 100);
  check('a quote is priced by the server, never by a number the client sends', q1.data.quote.priceCents === want2 && intents("plot_id = ? AND step = 'quote'", T.id)[0].price_cents === want2);
  await call('DELETE', `/plots/${T.id}/hold`, { token: carl.token });
  check('an empty plot cannot be "opened" for a take-over', (await intent(T.id, { step: 'open' }, { token: carl.token })).data.code === 'not_for_takeover');

  // ================================================================================================================ take-overs
  const [B1] = business;
  await call('POST', '/presence/ping', { token: carl.token, body: { visitor: 'carl-device' } });
  const opened = await intent(B1.id, { step: 'open', buildingType: 'shop' }, { token: carl.token });
  check('opening the take-over form is an attempt, with its price as a quote', opened.data.verified && intents("plot_id = ? AND kind = 'takeover'", B1.id).map((i) => i.step).join() === 'open,quote' && intents("plot_id = ? AND step = 'quote'", B1.id)[0].price_cents > 0);
  const took = await call('POST', `/plots/${B1.id}/takeover`, { token: carl.token, body: biz('Carl Corner') });
  check('the take-over is a step', took.status === 200 && intents("plot_id = ? AND step = 'taken_over'", B1.id).length === 1 && intents("plot_id = ? AND step = 'taken_over'", B1.id)[0].account_id === carl.account.id);
  const leased = await call('POST', `/plots/${Q.id}/takeover`, { token: bob.token, body: biz('Bob Again') });
  check('a take-over the lease refuses is recorded as failed', leased.status === 409 && leased.data.code === 'leased' && intents("plot_id = ? AND step = 'failed' AND kind = 'takeover'", Q.id).length === 1);

  // ================================================================================================================ foot traffic
  const traffic = (area) => db.prepare('SELECT passes, players FROM street_traffic WHERE area_id = ?').get(area) ?? { passes: 0, players: 0 };
  const day = new Date().toISOString().slice(0, 10);
  await ping('walker-1', { areas: ['5:5', '5:6', 'bad', '5:5', '999:1'] });
  check('the areas wait in memory until the flush', api.traffic.size === 2 && traffic('5:5').passes === 0);
  check('the flush writes them', api.traffic.flush(db) === 2 && traffic('5:5').passes === 1 && traffic('5:5').players === 1 && traffic('5:6').players === 1);
  check('nothing is written twice', api.traffic.flush(db) === 0 && traffic('5:5').passes === 1);
  await ping('walker-1', { areas: ['5:5'] });
  api.traffic.flush(db);
  check('passing again in the same hour adds nothing', traffic('5:5').passes === 1 && traffic('5:5').players === 1);
  const later = Date.now() + 3600000;
  if (new Date(later).toISOString().slice(0, 10) === day) {
    api.traffic.note(db, { visitor: 'walker-1', areas: ['5:5'], ctx: { minAgeMs: 0 }, at: later });
    api.traffic.flush(db);
    check('the next hour is another pass by the same player', traffic('5:5').passes === 2 && traffic('5:5').players === 1);
  }
  for (const v of ['walker-2', 'walker-3', 'walker-4']) await ping(v, { areas: ['5:5'] });
  api.traffic.flush(db);
  check('one network counts at most three players in an area a day', traffic('5:5').players === 3, JSON.stringify(traffic('5:5')));
  await ping('crawler-2', { areas: ['6:6'] }, { ua: BOT });
  check('a robot passes nothing', api.traffic.size === 0 && api.traffic.flush(db) === 0 && traffic('6:6').players === 0);
  check('a player who has only just arrived is not counted yet', api.traffic.note(db, { visitor: 'walker-9', areas: ['7:7'], ctx: { minAgeMs: 5000 } }) === 0);
  const own = JSON.parse(db.prepare('SELECT facts FROM plots WHERE id = ?').get(Q.id).facts);
  await call('POST', '/presence/ping', { token: amy.token, body: { visitor: 'amy-device', areas: [areaOf(own.x, own.z), '8:8'] } });
  api.traffic.flush(db);
  check('a tenant walking past their own building is not counted there', traffic(areaOf(own.x, own.z)).players === 0 && traffic('8:8').players === 1);
  check('who passed is kept hashed', db.prepare('SELECT who FROM traffic_seen').all().every((r) => /^[0-9a-f]{16}$/.test(r.who)));
  await ping('walker-5', { areas: ['9:9'] });
  await api.close();
  check('closing the server writes what was still in memory', true);

  // ================================================================================================================ watching
  const w = await start({});
  const wdb = w.db ?? w.api.db;
  const dan = await w.signup('Dan');
  const eve = await w.signup('Eve');
  const fay = await w.signup('Fay');
  wdb.prepare("UPDATE accounts SET email = 'eve@watch.test', email_verified = 1 WHERE id = ?").run(eve.account.id);
  const [WP] = w.empty;
  await w.call('POST', `/plots/${WP.id}/claim`, { token: dan.token, body: biz('Dan Deli') });
  check('watching needs an account', (await w.call('POST', `/plots/${WP.id}/watch`)).status === 401);
  check('a player watches a business', (await w.call('POST', `/plots/${WP.id}/watch`, { token: eve.token })).data.watching === true && (await w.call('GET', `/plots/${WP.id}/watch`, { token: eve.token })).data.watching === true);
  check('watching twice is one watch', (await w.call('POST', `/plots/${WP.id}/watch`, { token: eve.token })).data.watching === true && wdb.prepare('SELECT COUNT(*) AS n FROM plot_watches').get().n === 1);
  check('the tenant cannot watch their own', (await w.call('POST', `/plots/${WP.id}/watch`, { token: dan.token })).data.code === 'own_plot');
  check('an empty plot cannot be watched', (await w.call('POST', `/plots/${w.empty[1].id}/watch`, { token: eve.token })).data.code === 'not_watchable');
  await w.call('POST', `/plots/${WP.id}/watch`, { token: fay.token }); // no email: marked, never sent
  const view = (await w.call('GET', `/plots/${WP.id}`, { token: dan.token })).data;
  check('the plot itself does not say who or how many watch', !JSON.stringify(view).includes('watch'));
  const mine = (await w.call('GET', `/plots/${WP.id}/watch`, { token: dan.token })).data;
  check('the tenant sees how many watch their plot, never who', mine.watchers === 2 && !JSON.stringify(mine).includes('Eve') && (await w.call('GET', `/plots/${WP.id}/watch`, { token: eve.token })).data.watchers === undefined);
  check('who watches is for admins only', (await w.call('GET', `/admin/plots/${WP.id}/watchers`, { token: dan.token })).status === 403);
  const who = (await w.call('GET', `/admin/plots/${WP.id}/watchers`, { token: ADMIN })).data;
  check('...and an admin sees each watcher\'s account and name', who.watchers.map((x) => `${x.accountId}:${x.username}`).join() === `${eve.account.id}:Eve,${fay.account.id}:Fay`, JSON.stringify(who));
  const mails = (kind) => wdb.prepare('SELECT * FROM outbox WHERE kind = ?').all(kind);
  check('nothing is sent while the lease runs', economy.sendWatchNotices(wdb).sent === 0);
  await w.call('POST', `/admin/plots/${WP.id}/lease`, { token: ADMIN, body: { state: 'grace' } });
  check('the lease ends: the watcher with an address is emailed', economy.sendWatchNotices(wdb).sent === 1 && mails('watch_grace').length === 1 && mails('watch_grace')[0].to_email === 'eve@watch.test');
  check('...once', economy.sendWatchNotices(wdb).sent === 0 && mails('watch_grace').length === 1);
  await w.call('POST', `/admin/plots/${WP.id}/lease`, { token: ADMIN, body: { state: 'open' } });
  check('open to a buyout: emailed once more', economy.sendWatchNotices(wdb).sent === 1 && economy.sendWatchNotices(wdb).sent === 0 && mails('watch_open').length === 1 && mails('watch_open')[0].body.includes('take it over'));
  wdb.prepare('UPDATE accounts SET notify = 0 WHERE id = ?').run(eve.account.id);
  await w.call('POST', `/admin/plots/${WP.id}/lease`, { token: ADMIN, body: { state: 'grace' } }); // a new lease end: a new event
  check('a watcher who turned notices off is not emailed', economy.sendWatchNotices(wdb).sent === 0 && mails('watch_grace').length === 1);
  wdb.prepare('UPDATE accounts SET notify = 1 WHERE id = ?').run(eve.account.id);
  await w.call('POST', `/admin/plots/${WP.id}/lease`, { token: ADMIN, body: { state: 'open' } });
  await w.call('POST', `/plots/${WP.id}/takeover`, { token: fay.token, body: biz('Fay Foods') });
  check('a watcher who takes the plot over no longer watches it', !wdb.prepare('SELECT 1 FROM plot_watches WHERE account_id = ?').get(fay.account.id));
  check('a take-over: the other watchers are emailed once', mails('watch_takeover').length === 1 && mails('watch_takeover')[0].to_email === 'eve@watch.test' && mails('watch_takeover')[0].body.includes('still watching'));
  check('...and keep watching the plot under its new lease', (await w.call('GET', `/plots/${WP.id}/watch`, { token: eve.token })).data.watching === true && economy.sendWatchNotices(wdb).sent === 0);
  check('stopping', (await w.call('DELETE', `/plots/${WP.id}/watch`, { token: eve.token })).data.watching === false && (await w.call('GET', `/plots/${WP.id}/watch`, { token: eve.token })).data.watching === false);
  await w.api.close();

  // ================================================================================================================ a paid claim
  const S2 = { sessions: [] };
  const stripe = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const params = Object.fromEntries(new URLSearchParams(body));
      const id = `cs_econ_${S2.sessions.length + 1}`;
      S2.sessions.push({ id, client_reference_id: params.client_reference_id });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, url: `https://checkout.stripe.test/${id}` }));
    });
  });
  await new Promise((r) => stripe.listen(0, r));
  const b = await start({ STRIPE_SECRET_KEY: 'sk_test_econ', STRIPE_WEBHOOK_SECRET: 'whsec_econ', STRIPE_API_URL: `http://localhost:${stripe.address().port}`, PUBLIC_SITE_URL: 'https://voxel.test' });
  const gus = await b.signup('Gus');
  const [BP] = b.empty;
  await b.call('POST', `/plots/${BP.id}/hold`, { token: gus.token, body: { leaseDays: 14 } });
  const co = await b.call('POST', `/plots/${BP.id}/claim`, { token: gus.token, body: biz('Gus Garage', { leaseDays: 14 }) });
  const coRow = b.api.db.prepare("SELECT * FROM plot_intents WHERE step = 'checkout'").get();
  check('with payments on, starting to pay is the checkout step, at the order\'s price and term', co.data.checkout && coRow && coRow.price_cents === co.data.checkout.cents && coRow.term_days === 14);
  b.api.db.prepare('UPDATE plot_holds SET hold_until = ? WHERE plot_id = ?').run(Date.now() - 1000, BP.id);
  check('a hold that ran out during a checkout is not abandoned (the order tells how it ended)', economy.sweepHolds(b.api.db) === 1 && !b.api.db.prepare("SELECT 1 FROM plot_intents WHERE step = 'abandoned'").get());
  const raw = JSON.stringify({ id: 'evt_econ_1', type: 'checkout.session.completed', data: { object: { id: S2.sessions[0].id, object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: String(co.data.checkout.orderId), payment_intent: 'pi_econ', metadata: { order: String(co.data.checkout.orderId) } } } });
  await fetch(`${b.base}/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signPayload(raw, 'whsec_econ') }, body: raw });
  check('the payment arriving is the claimed step', b.api.db.prepare("SELECT COUNT(*) AS n FROM plot_intents WHERE step = 'claimed' AND plot_id = ?").get(BP.id).n === 1);
  await b.api.close();
  stripe.close();

  // ================================================================================================================ the report
  const e = await start({});
  const edb = e.api.db;
  // the world was seeded ten days ago
  edb.prepare('UPDATE plots SET updated_at = updated_at - ?').run(10 * DAY);
  const [ivy, jon, kim] = [await e.signup('Ivy'), await e.signup('Jon'), await e.signup('Kim')];
  check('the report is for admins only', (await e.call('GET', '/admin/economy')).status === 403 && (await e.call('GET', '/admin/economy', { token: ivy.token })).status === 403);
  check('a range the wrong way round is refused', (await e.call('GET', '/admin/economy?from=2026-10-10&to=2026-10-01', { token: ADMIN })).status === 400);
  const X = e.empty[0];
  const Y = e.empty[1];
  const fx = JSON.parse(X.facts);
  for (const v of ['seen-1', 'seen-2']) {
    await e.call('POST', '/presence/ping', { body: { visitor: v, areas: [areaOf(fx.x, fx.z)] } });
    await e.call('POST', `/plots/${X.id}/intent`, { body: { step: 'card_open', visitor: v } });
  }
  e.api.traffic.flush(edb);
  await e.call('POST', '/presence/ping', { token: ivy.token, body: { visitor: 'ivy-device' } });
  await e.call('POST', `/plots/${X.id}/intent`, { token: ivy.token, body: { step: 'card_open' } });
  const held = await e.call('POST', `/plots/${X.id}/hold`, { token: ivy.token, body: { leaseDays: 30 } });
  await e.call('POST', `/plots/${X.id}/claim`, { token: ivy.token, body: biz('Ivy Ink') });
  await e.call('POST', `/plots/${Y.id}/hold`, { token: jon.token, body: { leaseDays: 7 } });
  await e.call('DELETE', `/plots/${Y.id}/hold`, { token: jon.token });
  await e.call('POST', `/plots/${X.id}/watch`, { token: jon.token });
  await e.call('POST', `/plots/${X.id}/watch`, { token: kim.token });
  // a visit and a store entry at Ivy's building (her profile linked to it)
  await e.call('POST', '/events', { body: { plotId: X.id, kind: 'visit', visitor: 'seen-1', seconds: 30 } });
  await e.call('POST', '/businesses', { token: ivy.token, body: { name: 'Ivy Ink', category: 'services', website: 'https://ivy.test', cta: { kind: 'order', url: 'https://ivy.test' } } });
  const slug = edb.prepare('SELECT slug FROM businesses WHERE account_id = ?').get(ivy.account.id)?.slug;
  await e.call('PUT', `/businesses/${slug}/plot`, { token: ivy.token, body: { plotId: X.id } });
  await e.call('POST', `/businesses/${slug}/events`, { body: { kind: 'store', visitor: 'seen-2' } });
  // a renewal (Ivy) and a lapse (Kim's lease ended and was not renewed)
  await e.call('POST', `/admin/plots/${X.id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
  await e.call('POST', `/plots/${X.id}/renew`, { token: ivy.token, body: { leaseDays: 7 } });
  const Z = e.empty[2];
  await e.call('POST', `/plots/${Z.id}/claim`, { token: kim.token, body: biz('Kim Kites') });
  await e.call('POST', `/admin/plots/${Z.id}/lease`, { token: ADMIN, body: { state: 'grace' } });

  const rep = await e.call('GET', '/admin/economy', { token: ADMIN });
  const R0 = rep.data;
  const t = R0.total;
  const plotsLeasable = edb.prepare('SELECT * FROM plots WHERE claimable = 1').all().filter((r) => !JSON.parse(r.facts).admin);
  const vacantNow = plotsLeasable.filter((r) => !r.owner_name).length;
  check('the report covers the last 30 days by default', rep.status === 200 && R0.to === new Date().toISOString().slice(0, 10) && (Date.parse(R0.to) - Date.parse(R0.from)) / DAY === 29 && R0.areaSize === 24);
  check('plots, occupied and vacant now', t.plots === plotsLeasable.length && t.vacant === vacantNow && t.occupied === plotsLeasable.length - vacantNow && t.vacancyRate === Math.round((vacantNow / plotsLeasable.length) * 1000) / 1000, JSON.stringify({ plots: t.plots, vacant: t.vacant }));
  // every plot that is empty now, and the two claimed today, were empty for the ten days since the world began; the city's own businesses never
  const expectMean = Math.round((((vacantNow + 2) * 10) / plotsLeasable.length) * 10) / 10;
  check('mean days empty, from the plots and the ledger', Math.abs(t.meanDaysEmpty - expectMean) <= 0.1 && Math.abs(t.vacantForDays - 10) <= 0.1, `${t.meanDaysEmpty} vs ${expectMean}, ${t.vacantForDays}`);
  check('verified visits and store entries', t.visits === 1 && t.storeEntries === 1, `${t.visits} ${t.storeEntries}`);
  check('street traffic', t.traffic.passes === 2 && t.traffic.players === 2 && R0.topAreas[0].area === areaOf(fx.x, fx.z) && R0.topAreas[0].plots >= 1);
  check('the claim funnel, step by step', JSON.stringify(t.claim.steps) === JSON.stringify({ card_open: 3, hold: 2, quote: 2, checkout: 0, claimed: 2, failed: 0, abandoned: 1 }), JSON.stringify(t.claim.steps));
  check('...with its conversion rates', t.claim.conversion.cardToHold === 0.667 && t.claim.conversion.holdToQuote === 1 && t.claim.conversion.quoteToCheckout === 0 && t.claim.conversion.checkoutToClaim === null && t.claim.conversion.quoteToClaim === 1 && t.claim.conversion.cardToClaim === 0.667, JSON.stringify(t.claim.conversion));
  check('the median quoted price', t.claim.medianQuoteCents === Math.round((held.data.quote.priceCents + edb.prepare("SELECT price_cents FROM plot_intents WHERE plot_id = ? AND step = 'quote'").get(Y.id).price_cents) / 2));
  check('renewals and lapses', t.renewals === 1 && t.lapses === 1, `${t.renewals} ${t.lapses}`);
  check('watchers, for the admin, with who they are', t.watchers === 2 && t.watchedPlots === 1 && R0.topWatched[0].plotId === X.id && R0.topWatched[0].watchers === 2 && R0.topWatched[0].watchedBy.map((x) => x.username).join() === 'Jon,Kim');
  const tier = R0.tiers.find((g) => g.id === `tier:${fx.grand ? 'grand' : fx.luxury ? 'luxury' : fx.prime ? 'prime' : 'ordinary'}`);
  const district = R0.districts.find((g) => g.id === `district:${X.district}`);
  check('per tier and per district, the plot\'s figures are in its own groups', tier.claim.steps.card_open >= 3 && district.claim.steps.card_open >= 3 && district.watchers === 2 && district.traffic.passes === 2 && district.label === fx.district);
  check('the groups add up to the total', R0.tiers.reduce((a, g) => a + g.plots, 0) === t.plots && R0.districts.reduce((a, g) => a + g.plots, 0) === t.plots && R0.tiers.reduce((a, g) => a + g.claim.steps.hold, 0) === t.claim.steps.hold);
  const old = await e.call('GET', '/admin/economy?from=2020-01-01&to=2020-01-31', { token: ADMIN });
  check('a range before the world began has no activity', old.status === 200 && old.data.total.claim.steps.card_open === 0 && old.data.total.meanDaysEmpty === 0 && old.data.total.visits === 0);
  const { validate, ECONOMY_REPORT, PLOT_HOLD_RESULT } = await import('@voxelventure/shared-types');
  check('the report fits its contract', validate(ECONOMY_REPORT, R0).length === 0, JSON.stringify(validate(ECONOMY_REPORT, R0)).slice(0, 300));
  check('the hold answer fits its contract', validate(PLOT_HOLD_RESULT, held.data).length === 0);

  // housekeeping
  edb.prepare('UPDATE plot_intents SET at = ? WHERE id = (SELECT MIN(id) FROM plot_intents)').run(Date.now() - 181 * DAY);
  edb.prepare("INSERT INTO traffic_seen (day, area_id, who, hours) VALUES ('2020-01-01', '0:0', 'abc', 1)").run();
  const pruned = economy.pruneEconomy(edb);
  check('raw intents go after 180 days, the "already counted" traffic rows after two (the daily counts stay)', pruned.intents === 1 && pruned.seen === 1 && edb.prepare('SELECT COUNT(*) AS n FROM street_traffic').get().n > 0);
  await e.api.close();
} catch (err) {
  fails++;
  console.error(err);
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
