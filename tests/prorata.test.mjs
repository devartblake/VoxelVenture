// Refunds of unused time, pro rata (the rule: @voxelventure/business-core refunds.js; the server: services/api/prorata.mjs,
// docs/monetization/billing.md#refunds-of-unused-time). First the rule for each kind of line; then, against a stand-in for the Stripe API: deleting an
// account refunds every line's unused time before anything is deleted (and a Stripe failure deletes nothing), the estimate the screen shows is what
// is refunded, an admin's "Refund unused time" (one order, or a whole account) previews, refunds and ends what was refunded, a second call refunds
// nothing more, every refund is in the audit log, and an account closed for breaking the rules gets nothing.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { signPayload } from '../services/api/billing.mjs';
import { imp } from '../scripts/lib-loader.mjs';
import * as types from '@voxelventure/shared-types';
import { PRORATA, monthPeriod, prorataLine, prorataPlan } from '@voxelventure/business-core';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const fits = (name, contract, value) => { const r = types.check(contract, value); check(`${name} fits ${contract.id} v${contract.version}`, r.ok, r.ok ? '' : `${r.errors.slice(0, 3).join('; ')} in ${JSON.stringify(value).slice(0, 200)}`); };
const DAY = 86400000;
const H = 3600000;

// ==== the rule ==========================================================================================================================
{
  const at = Date.UTC(2026, 9, 24, 12);
  const line = (o) => ({ id: 1, status: 'paid', refundedCents: 0, dispute: null, proRataDone: false, ...o });
  const lease = (o = {}) => line({ kind: 'lease', cents: 3000, termDays: 30, start: at - 10 * DAY - H, end: at + 20 * DAY - H, ...o });
  const r = (l, opts) => prorataLine(l, { at, ...opts });
  check('a lease: unused full days ÷ term × paid (19 of 30 days of $30: $19.00)', r(lease()).cents === 1900 && r(lease()).unusedDays === 19 && r(lease()).refund);
  check('rounded down to the cent', r(lease({ cents: 2999 })).cents === Math.floor((2999 * 19) / 30) && r(lease({ cents: 2999 })).cents === 1899);
  check('a line charged less (a promo code, the Pro price, a cart line\'s share) refunds from what was charged', r(lease({ cents: 2550 })).cents === Math.floor((2550 * 19) / 30));
  check('a line refunded in part refunds from what is left of it', r(lease({ refundedCents: 1000 })).cents === Math.floor((2000 * 19) / 30) && r(lease({ refundedCents: 1000 })).paidCents === 2000);
  check('a renewal not started yet gives back all of it', r(line({ kind: 'renewal', cents: 1260, termDays: 7, start: at + 5 * DAY, end: at + 12 * DAY })).cents === 1260 && r(line({ kind: 'renewal', cents: 1260, termDays: 7, start: at + 5 * DAY, end: at + 12 * DAY })).notStarted);
  check('...never more than is left of it', r(line({ kind: 'renewal', cents: 1260, refundedCents: 260, termDays: 7, start: at + DAY, end: at + 8 * DAY })).cents === 1000);
  check('an ad space week: unused days ÷ 7 (3 of 7 days of $12)', r(line({ kind: 'ad', cents: 1200, termDays: 7, start: at - 4 * DAY + H, end: at + 3 * DAY + H })).cents === Math.floor((1200 * 3) / 7));
  check('an ad booking not started yet: all of it', r(line({ kind: 'ad', cents: 1020, termDays: 7, start: at + 2 * DAY, end: at + 9 * DAY })).cents === 1020);
  check('a sponsored week: unused days ÷ 7', r(line({ kind: 'sponsored', cents: 4900, termDays: 7, start: at - DAY - H, end: at + 6 * DAY - H })).cents === Math.floor((4900 * 5) / 7));
  const period = monthPeriod(Date.UTC(2026, 10, 15), Date.UTC(2026, 6, 1));
  check('Pro\'s period is the calendar month before its end (31 days to 15 November)', period.start === Date.UTC(2026, 9, 15) && period.days === 31);
  check('...not before the plan started', monthPeriod(Date.UTC(2026, 10, 15), Date.UTC(2026, 9, 20)).days === 26);
  check('Pro: unused days of the period ÷ its days × paid for it', r(line({ kind: 'pro', cents: 1900, termDays: 30, start: at - 10 * DAY, end: at + 20 * DAY - H })).cents === Math.floor((1900 * 19) / 30));
  check('a market stall not opened yet: all of it', r(line({ kind: 'market', cents: 800, start: at + DAY, end: at + 2 * DAY })).cents === 800);
  check('a market stall that has opened: nothing', !r(line({ kind: 'market', cents: 800, start: at - H, end: at + H })).refund);
  const small = r(lease({ cents: 300, start: at - 25 * DAY, end: at + 5 * DAY + H }));
  check('a line under the $1.00 minimum gives nothing (5 of 30 days of $3: 50¢)', !small.refund && small.cents === 0 && /\$1\.00 minimum/.test(small.why) && PRORATA.minCents === 100);
  const no = (o, opts) => r(lease(o), opts);
  check('nothing for the Launch Pack or a building upgrade (delivered)', !r(line({ kind: 'launch', cents: 900, start: at - DAY, end: at + 6 * DAY, termDays: 7 })).refund && /delivered/.test(r(line({ kind: 'exterior', cents: 2500 })).why));
  check('nothing for a free or complimentary order', /free or complimentary/.test(no({ cents: 0 }).why));
  check('nothing for an order refunded already, in full or for its unused time', /already refunded/.test(no({ status: 'refunded' }).why) && /refunded in full/.test(no({ refundedCents: 3000 }).why) && /unused time/.test(no({ proRataDone: true }).why));
  check('nothing while its payment is disputed, or once charged back', /disputed/.test(no({ dispute: 'open' }).why) && /charged back/.test(no({ status: 'charged_back' }).why) && /charged back/.test(no({ dispute: 'lost' }).why) && no({ dispute: 'won' }).refund);
  check('nothing for an account closed for breaking the rules', /breaking the rules/.test(no({}, { closedForRules: true }).why));
  check('nothing when the time is over, or less than a day is left', !no({ end: at - H }).refund && /less than a full day/.test(no({ end: at + 20 * H }).why));
  const plan = prorataPlan([lease(), lease({ id: 2, cents: 0 }), line({ id: 3, kind: 'ad', cents: 1200, termDays: 7, start: at + DAY, end: at + 8 * DAY })], { at });
  check('a plan adds up what goes back', plan.totalCents === 1900 + 1200 && plan.count === 2 && plan.lines.length === 3);
}

// ==== the server, with a stand-in Stripe ================================================================================================
const WHSEC = 'whsec_prorata';
const ADMIN = 'admin';
const S = { sessions: new Map(), refunds: [], calls: [], n: 0, failRefunds: false, failRefundAt: 0 };
const stripeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(req.method === 'GET' ? url.search : body));
    S.calls.push({ method: req.method, path: url.pathname, params, key: req.headers['idempotency-key'] ?? null });
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const id = `cs_p_${++S.n}`;
      S.sessions.set(id, { id, status: 'open', payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id, params });
      return reply(200, { id, url: `https://checkout.stripe.test/${id}` });
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return reply(200, S.sessions.get(m[1]) ?? {});
    if ((m = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) return reply(200, { id: m[1], status: req.method === 'DELETE' ? 'canceled' : 'active' });
    if (url.pathname === '/v1/invoices') return reply(200, { data: [{ payment_intent: `pi_for_${params.subscription}` }] });
    if (url.pathname === '/v1/refunds') {
      if (S.failRefunds || (S.failRefundAt && S.refunds.length + 1 >= S.failRefundAt)) return reply(500, { error: { message: 'refunds are down' } });
      S.refunds.push({ ...params, key: req.headers['idempotency-key'] ?? null });
      return reply(200, { id: `re_${S.refunds.length}`, status: 'succeeded' });
    }
    if (url.pathname === '/v1/coupons') return reply(200, { id: `co_${++S.n}` });
    return reply(404, { error: { message: 'unknown' } });
  });
});
await new Promise((r) => stripeServer.listen(0, r));

const env = { ADMIN_TOKEN: ADMIN, HUMAN_MIN_AGE_MS: '0', STRIPE_SECRET_KEY: 'sk_test_p', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_URL: `http://localhost:${stripeServer.address().port}`, PUBLIC_SITE_URL: 'https://voxel.test' };
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env, rate: { perMinute: 100000, authPerMinute: 100000 } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const db = api.db;
const call = async (method, p, { token, body } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 prorata test', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
const signup = async (u) => (await call('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
let eventN = 0;
const webhook = (type, object, id = `evt_p${++eventN}`) => {
  const raw = JSON.stringify({ id, type, data: { object } });
  return fetch(`${base}/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signPayload(raw, WHSEC) }, body: raw }).then((r) => r.json());
};
const sessionOf = (orderId) => [...S.sessions.values()].find((s) => s.client_reference_id === String(orderId));
const pay = (orderId) => {
  const s = sessionOf(orderId);
  Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: `pi_${orderId}` });
  return webhook('checkout.session.completed', { id: s.id, object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: String(orderId), payment_intent: `pi_${orderId}`, metadata: { order: String(orderId) } });
};
const payPro = (orderId, sub, endMs) => webhook('invoice.paid', { object: 'invoice', subscription: sub, subscription_details: { metadata: { order: String(orderId) } }, payment_intent: `pi_inv_${sub}`, lines: { data: [{ period: { end: Math.floor(endMs / 1000) } }] } });
const order = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
const ent = (orderId) => db.prepare('SELECT * FROM entitlements WHERE order_id = ?').get(orderId);
const plotRow = (id) => db.prepare('SELECT * FROM plots WHERE id = ?').get(id);
const refundsOf = (orderId) => S.refunds.filter((r) => r.key === `vv-prorata-${orderId}`);
const auditOf = (action, id) => db.prepare('SELECT * FROM audit_log WHERE action = ? AND target_id = ?').all(action, String(id));
const AD = (who) => ({ advertiser: who, headline: `${who} sells`, color: '#22aa66' });
const biz = (title) => ({ title, buildingType: 'shop', website: 'https://shop.test', logo: { kind: 'generated' }, description: 'Fresh things all day.', leaseDays: 14 });
const floorDays = (ms) => Math.floor(ms / DAY);

try {
  const { generateCity } = await imp('city/cityGenerator.js');
  const { weekStartOf, addWeeks, weekWindow } = await imp('market/weeks.js');
  const lots = generateCity(20260101).plots.filter((p) => !p.owner && p.districtId !== 'suburb');
  const billboards = (await call('GET', '/ads')).data.slots.filter((s) => s.kind === 'billboard');

  // ==== Amy has a little of everything ==================================================================================================
  const amy = await signup('AmyPro');
  await call('POST', '/businesses', { token: amy.token, body: { name: 'Amy Cafe', category: 'food', district: 'creator', website: 'https://amy.test', description: 'Coffee and cake all day, by the river in Creator Commons.' } });
  // Pro, ten days into a 30-day month
  const pro = (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'pro' } })).data.orderId;
  await payPro(pro, 'sub_amy', Date.now() + 30 * DAY);
  db.prepare('UPDATE entitlements SET starts_at = ?, ends_at = ? WHERE order_id = ?').run(Date.now() - 10 * DAY, Date.now() + 20 * DAY - H, pro);
  // the Launch Pack (delivered: nothing back)
  const launch = (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'launch' } })).data.orderId;
  await pay(launch);
  // a 14-day lease (at the Pro price), with 4 full days left, then renewed for 7 days (not started yet)
  const claim = (await call('POST', `/plots/${lots[0].id}/claim`, { token: amy.token, body: biz('Amy Coffee') })).data.checkout.orderId;
  await pay(claim);
  check('(the lease is Amy\'s)', plotRow(lots[0].id).owner_account === amy.account.id && order(claim).status === 'paid');
  db.prepare('UPDATE plots SET lease_start = ?, lease_end = ? WHERE id = ?').run(Date.now() - 9 * DAY, Date.now() + 5 * DAY - H, lots[0].id);
  const renew = (await call('POST', `/plots/${lots[0].id}/renew`, { token: amy.token, body: { leaseDays: 7 } })).data.checkout?.orderId;
  await pay(renew);
  check('(the renewal is paid and adds 7 days)', order(renew).status === 'paid' && plotRow(lots[0].id).lease_end > Date.now() + 11 * DAY);
  // an ad space, two days in
  const ad = (await call('POST', `/ads/${billboards[0].id}/buy`, { token: amy.token, body: AD('Amy') })).data.checkout.orderId;
  await pay(ad);
  db.prepare('UPDATE ad_terms SET starts_at = ?, ends_at = ? WHERE order_id = ?').run(Date.now() - 2 * DAY - H, Date.now() + 5 * DAY - H, ad);
  // a sponsored week, refunded in part in the Stripe dashboard
  const spon = (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'sponsored', placement: 'category:food' } })).data.orderId;
  await pay(spon);
  await webhook('charge.refunded', { id: `ch_${spon}`, object: 'charge', payment_intent: `pi_${spon}`, amount: 2900, amount_refunded: 900 });
  // a market stall next week (not opened)
  const next = addWeeks(weekStartOf(), 1);
  const w = (await call('GET', `/market/SD-0004/${next}`)).data;
  const stall = (await call('POST', '/market/book', { token: amy.token, body: { siteCode: 'SD-0004', week: next, stallId: w.stalls[0].id, hours: 24, start: weekWindow(next).start + 2 * DAY, brand: 'Amy Bakes', product: 'Bread' } })).data;
  await pay(stall.checkout.orderId);
  const stallOrder = stall.checkout.orderId;

  // what each line should give back, from the rule's own definition
  const leaseEnd = plotRow(lots[0].id).lease_end;
  const expect = {
    [pro]: Math.floor((1900 * floorDays(20 * DAY - H)) / 30),
    [claim]: Math.floor((order(claim).cents * floorDays(leaseEnd - 7 * DAY - Date.now())) / 14),
    [renew]: order(renew).cents,
    [ad]: Math.floor((order(ad).cents * floorDays(5 * DAY - H)) / 7),
    [spon]: Math.floor(((2900 - 900) * floorDays(ent(spon).ends_at - Date.now())) / 7),
    [stallOrder]: order(stallOrder).cents,
  };
  const total = Object.values(expect).reduce((a, b) => a + b, 0);

  // ---- the estimate the deletion screen shows
  const est = await call('GET', '/me/prorata', { token: amy.token });
  fits('the estimate', types.PRORATA_PREVIEW, est.data);
  const line = (id) => est.data.lines.find((l) => l.orderId === id);
  check('the estimate needs a sign-in', (await call('GET', '/me/prorata')).status === 401);
  check('Pro: the unused days of the month paid now', line(pro)?.cents === expect[pro] && line(pro).kind === 'pro' && line(pro).unusedDays === 19 && line(pro).termDays === 30, JSON.stringify(line(pro)));
  check('the lease: its unused days of 14, at what was paid (the Pro price)', line(claim)?.cents === expect[claim] && line(claim).unusedDays === 4 && line(claim).termDays === 14, JSON.stringify(line(claim)));
  check('the renewal not started yet: all of it', line(renew)?.cents === expect[renew] && line(renew).notStarted && line(renew).kind === 'renewal', JSON.stringify(line(renew)));
  check('the ad space: unused days ÷ 7', line(ad)?.cents === expect[ad] && line(ad).unusedDays === 4, JSON.stringify(line(ad)));
  check('the sponsored week refunded in part: from what is left', line(spon)?.cents === expect[spon] && line(spon).paidCents === 2000, JSON.stringify(line(spon)));
  check('the stall to come: all of it', line(stallOrder)?.cents === expect[stallOrder] && line(stallOrder).unusedDays === null);
  check('the Launch Pack: nothing (delivered)', line(launch)?.refund === false && /delivered/.test(line(launch).why));
  check('the estimate adds up', est.data.totalCents === total && est.data.count === 6, `${est.data.totalCents} vs ${total}`);

  // ---- deleting: Stripe refuses: nothing is deleted
  S.failRefunds = true;
  const down = await call('POST', '/me/delete', { token: amy.token, body: { password: 'longenough1', confirm: 'AmyPro' } });
  check('if Stripe cannot refund, nothing is deleted (502)', down.status === 502 && order(claim).refunded_cents === 0 && db.prepare('SELECT deleted_at FROM accounts WHERE id = ?').get(amy.account.id).deleted_at === null && plotRow(lots[0].id).owner_account === amy.account.id && (await call('GET', '/me', { token: amy.token })).status === 200, JSON.stringify(down.data));
  S.failRefunds = false;
  // the second refund fails: the first is kept (the money went back), the rest waits; nothing is deleted
  S.failRefundAt = 2;
  const half = await call('POST', '/me/delete', { token: amy.token, body: { password: 'longenough1', confirm: 'AmyPro' } });
  const firstId = Number(S.refunds[0]?.key?.split('-').pop());
  check('a refund that fails half way: the account is not deleted, the refund made is recorded', half.status === 502 && S.refunds.length === 1 && order(firstId).refunded_cents > 0 && db.prepare('SELECT deleted_at FROM accounts WHERE id = ?').get(amy.account.id).deleted_at === null, JSON.stringify(half.data));
  S.failRefundAt = 0;
  const before = S.refunds.length;
  const del = await call('POST', '/me/delete', { token: amy.token, body: { password: 'longenough1', confirm: 'AmyPro' } });
  fits('the deletion\'s answer', types.PRIVACY_DELETE_RESULT, del.data);
  check('then the deletion goes through', del.status === 200 && del.data.deleted, JSON.stringify(del.data).slice(0, 300));
  check('...without refunding the first line again', refundsOf(firstId).length === 1 && S.refunds.length === before + 5);
  check('every line got back what the estimate said, through Stripe, on its own payment, keyed by its line', Object.entries(expect).every(([id, cents]) => refundsOf(id).length === 1 && Number(refundsOf(id)[0].amount) === cents && order(Number(id)).refunded_cents - (Number(id) === spon ? 900 : 0) === cents), JSON.stringify(S.refunds));
  check('Pro was refunded on its latest invoice', refundsOf(pro)[0]?.payment_intent === 'pi_for_sub_amy' && refundsOf(claim)[0]?.payment_intent === `pi_${claim}`);
  check('the answer says what was refunded (the lines refunded on this try)', del.data.refunds.totalCents === total - expect[firstId] && del.data.refunds.lines.length === 5);
  check('each refund is on its order, noted', Object.keys(expect).every((id) => /pro-rata refund of unused time \(account deleted\)/.test(order(Number(id)).note) && db.prepare("SELECT COUNT(*) AS n FROM order_refunds WHERE order_id = ? AND note LIKE 'pro-rata%'").get(Number(id)).n === 1));
  check('...and in the audit log', Object.keys(expect).every((id) => auditOf('billing.prorata_refunded', id).length === 1) && JSON.parse(auditOf('account.delete', amy.account.id)[0].detail).refundedCents === total - expect[firstId]);
  check('the deletion then ends it all: the lease released, the ad down, Pro cancelled once (no second refund)', plotRow(lots[0].id).owner_account === null && (await call('GET', `/ads/${billboards[0].id}`)).data.ad === null && ent(pro).status === 'revoked' && S.calls.filter((c) => c.method === 'DELETE' && c.path === '/v1/subscriptions/sub_amy').length === 1 && refundsOf(pro).length === 1);
  check('the renewal refunded to its last cent is refunded, the rest stays paid in part', order(renew).status === 'refunded' && order(claim).status === 'paid' && order(stallOrder).status === 'refunded');
  check('nothing for the Launch Pack', refundsOf(launch).length === 0 && order(launch).refunded_cents === 0);
  // Stripe tells us about our own refunds: not counted again
  await webhook('charge.refunded', { id: `ch_${claim}`, object: 'charge', payment_intent: `pi_${claim}`, amount: order(claim).cents, amount_refunded: expect[claim] });
  check('Stripe\'s event for a refund of ours is not counted twice', order(claim).refunded_cents === expect[claim] && db.prepare('SELECT COUNT(*) AS n FROM order_refunds WHERE order_id = ?').get(claim).n === 1);

  // ==== Bob: an admin refunds unused time ===============================================================================================
  const bob = await signup('BobAdm');
  const bobBiz = (await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Builds', category: 'services', district: 'creator', website: 'https://bob.test' } })).data;
  await call('POST', '/admin/promos', { token: ADMIN, body: { code: 'FIVEOFF', kind: 'amount', value: 500, appliesTo: ['all'] } });
  await call('POST', '/cart/items', { token: bob.token, body: { kind: 'claim', plotId: lots[1].id, input: biz('Bob Shop') } });
  await call('POST', '/cart/items', { token: bob.token, body: { kind: 'sponsored', business: bobBiz.slug, placement: 'district:creator' } });
  await call('POST', '/cart/promo', { token: bob.token, body: { code: 'FIVEOFF' } });
  const cart = (await call('POST', '/cart/checkout', { token: bob.token })).data.checkout.orderId;
  await pay(cart);
  const [cLease, cSpon] = db.prepare('SELECT * FROM orders WHERE parent_id = ? ORDER BY id').all(cart);
  check('(Bob\'s cart is paid, the code shared by its lines)', cLease.product === 'lease' && cSpon.product === 'sponsored' && cLease.promo_cents > 0 && cSpon.promo_cents > 0 && plotRow(lots[1].id).owner_account === bob.account.id);
  const pv = await call('GET', `/admin/billing/orders/${cart}/prorata`, { token: ADMIN });
  fits('the admin\'s preview', types.PRORATA_PREVIEW, pv.data);
  check('the preview is admin-only', (await call('GET', `/admin/billing/orders/${cart}/prorata`, { token: bob.token })).status === 403 && (await call('POST', `/admin/billing/orders/${cart}/prorata`, { token: bob.token, body: { reason: 'nope' } })).status === 403);
  const pl = (id) => pv.data.lines.find((l) => l.orderId === id);
  check('a cart: each line, from its own charged amount (after the code)', pv.data.lines.length === 2 && pl(cLease.id).cents === Math.floor((cLease.cents * 13) / 14) && pl(cSpon.id).cents === Math.floor((cSpon.cents * 6) / 7), JSON.stringify(pv.data.lines));
  check('a reason is required', (await call('POST', `/admin/billing/orders/${cart}/prorata`, { token: ADMIN, body: {} })).data.code === 'reason_required' && S.refunds.length === before + 5);
  const done = await call('POST', `/admin/billing/orders/${cart}/prorata`, { token: ADMIN, body: { reason: 'the customer moved away' } });
  fits('the refund\'s answer', types.PRORATA_RESULT, done.data);
  check('the admin\'s refund is the preview', done.status === 200 && done.data.totalCents === pv.data.totalCents && done.data.refunded.length === 2 && done.data.refunded.every((r) => Number(refundsOf(r.orderId)[0].amount) === pl(r.orderId).cents), JSON.stringify(done.data));
  check('both lines refunded on the cart\'s one payment, in part', refundsOf(cLease.id)[0].payment_intent === `pi_${cart}` && refundsOf(cSpon.id)[0].payment_intent === `pi_${cart}` && order(cart).refunded_cents === pv.data.totalCents);
  check('what was refunded ends: the lease is released at once, the sponsored week stops', plotRow(lots[1].id).owner_account === null && ent(cSpon.id).status === 'revoked' && done.data.ended.length === 2);
  check('it is audited: the whole, and line by line, with the reason', auditOf('billing.prorata', cart).length === 1 && JSON.parse(auditOf('billing.prorata', cart)[0].detail).reason === 'the customer moved away' && auditOf('billing.prorata_refunded', cLease.id).length === 1 && /the customer moved away/.test(order(cLease.id).note));
  const again = await call('POST', `/admin/billing/orders/${cart}/prorata`, { token: ADMIN, body: { reason: 'clicked twice' } });
  check('a second call refunds nothing more', again.data.totalCents === 0 && refundsOf(cLease.id).length === 1 && refundsOf(cSpon.id).length === 1);
  check('...and the preview says so', (await call('GET', `/admin/billing/orders/${cart}/prorata`, { token: ADMIN })).data.totalCents === 0);

  // an account-level refund: Pro, an ad booked for later, a disputed ad, and a lease taken over... each as the rule says
  const proB = (await call('POST', `/businesses/${bobBiz.slug}/checkout`, { token: bob.token, body: { product: 'pro' } })).data.orderId;
  await payPro(proB, 'sub_bob', Date.now() + 30 * DAY);
  const adB = (await call('POST', `/ads/${billboards[1].id}/buy`, { token: bob.token, body: AD('Bob') })).data.checkout.orderId;
  await pay(adB);
  const adLater = (await call('POST', `/ads/${billboards[1].id}/buy`, { token: bob.token, body: AD('Bob again') })).data.checkout.orderId;
  await pay(adLater);
  const adDisputed = (await call('POST', `/ads/${billboards[2].id}/buy`, { token: bob.token, body: AD('Bob too') })).data.checkout.orderId;
  await pay(adDisputed);
  await webhook('charge.dispute.created', { id: 'dp_bob', object: 'dispute', charge: `ch_${adDisputed}`, payment_intent: `pi_${adDisputed}`, amount: order(adDisputed).cents, reason: 'fraudulent', status: 'needs_response' });
  const acc = await call('GET', `/admin/accounts/${bob.account.id}/prorata`, { token: ADMIN });
  const al = (id) => acc.data.lines.find((l) => l.orderId === id);
  check('an account\'s preview: every line, with why nothing comes back for some', al(adLater).notStarted && al(adLater).cents === order(adLater).cents && /disputed/.test(al(adDisputed).why) && /unused time/.test(al(cLease.id).why) && al(proB).refund, JSON.stringify(acc.data.lines.map((l) => [l.orderId, l.cents, l.why])));
  check('as if closed for breaking the rules (?rules=1): nothing', (await call('GET', `/admin/accounts/${bob.account.id}/prorata?rules=1`, { token: ADMIN })).data.totalCents === 0);
  const accDone = await call('POST', `/admin/accounts/${bob.account.id}/prorata`, { token: ADMIN, body: { reason: 'goodwill after an outage' } });
  check('the account\'s refund is its preview', accDone.data.totalCents === acc.data.totalCents && accDone.data.refunded.length === acc.data.count, JSON.stringify(accDone.data));
  check('refunded Pro is cancelled in Stripe and stops', ent(proB).status === 'revoked' && S.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/subscriptions/sub_bob') && refundsOf(proB)[0].payment_intent === 'pi_for_sub_bob');
  check('refunded ad bookings end: the space is free', db.prepare('SELECT status FROM ad_terms WHERE order_id = ?').get(adB).status === 'revoked' && db.prepare('SELECT status FROM ad_terms WHERE order_id = ?').get(adLater).status === 'revoked' && (await call('GET', `/ads/${billboards[1].id}`)).data.ad === null);
  check('the disputed one is left alone (paused, not refunded)', refundsOf(adDisputed).length === 0 && db.prepare('SELECT status FROM ad_terms WHERE order_id = ?').get(adDisputed).status === 'paused');
  check('the admin\'s order view shows the refunds', (await call('GET', `/admin/billing/orders/${adB}`, { token: ADMIN })).data.refunds.some((r) => /pro-rata/.test(r.note) && !r.full === (order(adB).status === 'paid')));
  check('a second account-level call refunds nothing more', (await call('POST', `/admin/accounts/${bob.account.id}/prorata`, { token: ADMIN, body: { reason: 'again' } })).data.totalCents === 0);

  // ==== Cat: closed for breaking the rules: no refund ===================================================================================
  const cat = await signup('CatRules');
  const catClaim = (await call('POST', `/plots/${lots[2].id}/claim`, { token: cat.token, body: biz('Cat Corner') })).data.checkout.orderId;
  await pay(catClaim);
  check('(Cat\'s lease would be refunded)', (await call('GET', `/admin/accounts/${cat.account.id}/prorata`, { token: ADMIN })).data.totalCents > 0);
  const closed = await call('POST', `/admin/accounts/${cat.account.id}/delete`, { token: ADMIN, body: { confirm: 'CatRules', reason: 'spam ads', rules: true } });
  fits('the admin deletion\'s body', types.PRIVACY_ADMIN_DELETE, { confirm: 'CatRules', reason: 'spam ads', rules: true });
  check('an account closed for breaking the rules is deleted with no refund', closed.status === 200 && closed.data.refunds.totalCents === 0 && closed.data.refunds.closedForRules === true && refundsOf(catClaim).length === 0 && JSON.parse(auditOf('account.delete', cat.account.id)[0].detail).closedForRules === true);

  // ==== an admin deletion without the flag refunds as the player's own would =============================================================
  const dee = await signup('DeeAsk');
  const deeClaim = (await call('POST', `/plots/${lots[3].id}/claim`, { token: dee.token, body: biz('Dee Shop') })).data.checkout.orderId;
  await pay(deeClaim);
  const deePv = (await call('GET', `/admin/accounts/${dee.account.id}/prorata`, { token: ADMIN })).data;
  const deeDel = await call('POST', `/admin/accounts/${dee.account.id}/delete`, { token: ADMIN, body: { confirm: 'DeeAsk', reason: 'asked by email' } });
  check('an admin deletion for an email request refunds the unused time first', deeDel.status === 200 && deeDel.data.refunds.totalCents === deePv.totalCents && deePv.totalCents > 0 && Number(refundsOf(deeClaim)[0]?.amount) === deePv.totalCents);

  check('the audit chain is intact', (await call('GET', '/admin/audit/verify', { token: ADMIN })).data.ok === true);
} catch (e) {
  fails++;
  console.log('FAIL threw', e.stack);
} finally {
  await api.close();
  stripeServer.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
