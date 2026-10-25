// Disputes and partial refunds (services/api/billing.mjs, docs/monetization/billing.md#disputes-and-partial-refunds), against a stand-in for the Stripe
// API: charge.dispute.created pauses what the payment bought (for each product, and for a cart's lines), tells the admins (an email to each confirmed
// address, and Admin > Disputes) and is audited; charge.dispute.closed restores it when won and ends it when lost; a refund made in the Stripe
// dashboard for part of a payment is allocated to its lines (exactly one line's rest, else latest first), only what is refunded in full is ended,
// a promo code's counted discount follows; every event is applied once.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { signPayload } from '../services/api/billing.mjs';
import { imp } from '../scripts/lib-loader.mjs';
import * as types from '@voxelventure/shared-types';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const fits = (name, contract, value) => { const r = types.check(contract, value); check(`${name} fits ${contract.id} v${contract.version}`, r.ok, r.ok ? '' : `${r.errors.slice(0, 3).join('; ')} in ${JSON.stringify(value).slice(0, 200)}`); };
const DAY = 86400000;
const WHSEC = 'whsec_disputes';
const ADMIN = 'admin';

// ---- a stand-in Stripe: records every call
const S = { sessions: new Map(), refunds: [], calls: [], n: 0 };
const stripeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(req.method === 'GET' ? url.search : body));
    S.calls.push({ method: req.method, path: url.pathname, params });
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const id = `cs_d_${++S.n}`;
      S.sessions.set(id, { id, status: 'open', payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id, params });
      return reply(200, { id, url: `https://checkout.stripe.test/${id}` });
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return reply(200, S.sessions.get(m[1]) ?? {});
    if ((m = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) return reply(200, { id: m[1], status: req.method === 'DELETE' ? 'canceled' : 'active' });
    if (url.pathname === '/v1/invoices') return reply(200, { data: [{ payment_intent: `pi_for_${params.subscription}` }] });
    if (url.pathname === '/v1/refunds') return (S.refunds.push(params), reply(200, { id: `re_${S.refunds.length}`, status: 'succeeded' }));
    if (url.pathname === '/v1/coupons') return reply(200, { id: `co_${++S.n}` });
    return reply(404, { error: { message: 'unknown' } });
  });
});
await new Promise((r) => stripeServer.listen(0, r));

const env = { ADMIN_TOKEN: ADMIN, STRIPE_SECRET_KEY: 'sk_test_d', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_URL: `http://localhost:${stripeServer.address().port}`, PUBLIC_SITE_URL: 'https://voxel.test' };
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { token, body } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
const signup = async (u) => (await call('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
let eventN = 0;
const webhook = (type, object, id = `evt_d${++eventN}`) => {
  const raw = JSON.stringify({ id, type, data: { object } });
  return fetch(`${base}/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signPayload(raw, WHSEC) }, body: raw }).then((r) => r.json());
};
const sessionOf = (orderId) => [...S.sessions.values()].find((s) => s.client_reference_id === String(orderId));
const pay = (orderId) => {
  const s = sessionOf(orderId);
  Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: `pi_${orderId}` });
  return webhook('checkout.session.completed', { id: s.id, object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: String(orderId), payment_intent: `pi_${orderId}`, metadata: { order: String(orderId) } });
};
const order = (id) => api.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
const ent = (orderId) => api.db.prepare('SELECT * FROM entitlements WHERE order_id = ?').get(orderId);
const plot = async (id) => (await call('GET', `/plots/${id}`)).data;
const slot = async (id) => (await call('GET', `/ads/${id}`)).data;
let disputeN = 0;
const dispute = (pi, amount, status = 'needs_response') => ({ id: `dp_${++disputeN}`, object: 'dispute', charge: `ch_${pi}`, payment_intent: pi, amount, reason: 'fraudulent', status });
const closeDispute = (d, status) => webhook('charge.dispute.closed', { ...d, status });
const outbox = (subject) => api.db.prepare('SELECT * FROM outbox WHERE kind = ? AND subject LIKE ?').all('admin_dispute', `%${subject}%`);
const AD = (who) => ({ advertiser: who, headline: `${who} sells`, color: '#22aa66' });

try {
  const { generateCity } = await imp('city/cityGenerator.js');
  const { weekStartOf, addWeeks, weekWindow } = await imp('market/weeks.js');
  const city = generateCity(20260101);
  const lots = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb');
  // two admins: one with a confirmed email (gets the alerts), one without
  api.db.prepare("INSERT INTO admin_accounts (username, password_hash, created_at, email, email_verified_at) VALUES ('boss', 'x', ?, 'boss@voxel.test', ?)").run(Date.now(), Date.now());
  api.db.prepare("INSERT INTO admin_accounts (username, password_hash, created_at, email) VALUES ('helper', 'x', ?, 'helper@voxel.test')").run(Date.now());
  const amy = await signup('Amy');
  const bob = await signup('Bob');
  await call('POST', '/businesses', { token: amy.token, body: { name: 'Amy Cafe', category: 'food', district: 'creator', website: 'https://amy.test', description: 'Coffee and cake all day, by the river in Creator Commons.' } });
  const biz = { title: 'Amy Coffee', buildingType: 'restaurant', website: 'https://amy.test', variant: 'cafe', logo: { kind: 'generated' }, description: 'Fresh coffee all day.', leaseDays: 14 };

  // ==== disputes, product by product ==================================================================================================
  // ---- the Launch Pack: stops showing; won: back
  const launch = (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'launch' } })).data.orderId;
  await pay(launch);
  const dLaunch = dispute(`pi_${launch}`, 900);
  const opened = await webhook('charge.dispute.created', dLaunch, 'evt_dispute_launch');
  check('a dispute of the Launch Pack takes it off Discover', opened.received && ent(launch).status === 'paused' && (await call('GET', '/businesses/featured?placement=discover')).data.launches.length === 0 && (await call('GET', '/businesses/amy-cafe')).data.launch === false);
  check('it is recorded and the order points at it', api.db.prepare('SELECT * FROM disputes WHERE stripe_dispute = ?').get(dLaunch.id)?.status === 'open' && order(launch).dispute_id > 0 && order(launch).status === 'paid');
  const mail = outbox('A payment is disputed');
  check('the admins with a confirmed email are emailed (and only they)', mail.length === 1 && mail[0].to_email === 'boss@voxel.test' && /order \d+/.test(mail[0].body) && /\(launch\): paused/.test(mail[0].body), JSON.stringify(mail.map((m) => m.to_email)));
  check('it is in the audit trail', api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'billing.dispute_opened'").get().n === 1);
  check('the same event again is applied once', (await webhook('charge.dispute.created', dLaunch, 'evt_dispute_launch')).duplicate === true);
  check('a second event for the same dispute changes nothing', (await webhook('charge.dispute.created', dLaunch)).received && api.db.prepare('SELECT COUNT(*) AS n FROM disputes').get().n === 1 && outbox('A payment is disputed').length === 1);
  const list = (await call('GET', '/admin/billing/disputes', { token: ADMIN }));
  fits('the admin\'s list', types.BILLING_DISPUTES, list.data);
  check('the admin sees it open, with what was paused', list.data.open === 1 && list.data.disputes[0].stripeDispute === dLaunch.id && list.data.disputes[0].paused[0].what === 'paused' && list.data.disputes[0].orderId === launch);
  check('the list is admin-only', (await call('GET', '/admin/billing/disputes', { token: amy.token })).status === 403);
  await webhook('charge.dispute.updated', { ...dLaunch, status: 'under_review' });
  check('an update records Stripe\'s status', api.db.prepare('SELECT stripe_status FROM disputes WHERE stripe_dispute = ?').get(dLaunch.id).stripe_status === 'under_review');
  await closeDispute(dLaunch, 'won');
  check('won: the Launch Pack is back', ent(launch).status === 'active' && (await call('GET', '/businesses/amy-cafe')).data.launch === true && api.db.prepare('SELECT status FROM disputes WHERE stripe_dispute = ?').get(dLaunch.id).status === 'won' && order(launch).status === 'paid');
  check('closing again changes nothing', (await closeDispute(dLaunch, 'lost')).received && ent(launch).status === 'active' && outbox('Dispute won').length === 1 && outbox('Dispute lost').length === 0);

  // ---- a sponsored week: lost: ended, charged back
  const spon = (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'sponsored', placement: 'category:food' } })).data.orderId;
  await pay(spon);
  const dSpon = dispute(`pi_${spon}`, 2900);
  await webhook('charge.dispute.created', dSpon);
  check('a disputed sponsored week stops showing, but keeps its slot', (await call('GET', '/businesses/featured?placement=category:food')).data.sponsored.length === 0 && (await call('GET', '/billing/availability?placement=category:food')).data.free === 2);
  await closeDispute(dSpon, 'lost');
  check('lost: it is ended for good and the order is charged back', ent(spon).status === 'revoked' && order(spon).status === 'charged_back' && (await call('GET', '/billing/availability?placement=category:food')).data.free === 3 && outbox('Dispute lost').length === 1);
  check('a charged-back order cannot be refunded again', (await call('POST', `/admin/billing/orders/${spon}/refund`, { token: ADMIN })).status === 409);

  // ---- Pro: its features stop and its billing is paused at Stripe; lost: cancelled
  const pro = (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'pro' } })).data.orderId;
  await webhook('invoice.paid', { object: 'invoice', subscription: 'sub_amy', subscription_details: { metadata: { order: String(pro) } }, payment_intent: 'pi_pro_amy', lines: { data: [{ period: { end: Math.floor((Date.now() + 30 * DAY) / 1000) } }] } });
  const proMe = async () => (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].plan.pro;
  check('(Amy has Pro)', (await proMe()) === true);
  const dPro = dispute('pi_pro_amy', 1900);
  await webhook('charge.dispute.created', dPro);
  const pause = S.calls.find((c) => c.path === '/v1/subscriptions/sub_amy' && c.params['pause_collection[behavior]'] === 'void');
  check('a disputed Pro payment pauses Pro and its billing', (await proMe()) === false && ent(pro).status === 'paused' && Boolean(pause));
  await closeDispute(dPro, 'won');
  check('won: Pro is back and its billing resumes', (await proMe()) === true && S.calls.some((c) => c.path === '/v1/subscriptions/sub_amy' && c.method === 'POST' && c.params.pause_collection === ''));
  const dPro2 = dispute('pi_pro_amy', 1900);
  await webhook('charge.dispute.created', dPro2);
  await closeDispute(dPro2, 'lost');
  check('lost: Pro ends and its plan is cancelled', (await proMe()) === false && order(pro).status === 'charged_back' && S.calls.some((c) => c.path === '/v1/subscriptions/sub_amy' && c.method === 'DELETE'));

  // ---- a lease: frozen (the building stays, nothing can be changed); lost: the lease ends
  const claim = (await call('POST', `/plots/${lots[0].id}/claim`, { token: amy.token, body: biz })).data.checkout.orderId;
  await pay(claim);
  const dLease = dispute(`pi_${claim}`, order(claim).cents);
  await webhook('charge.dispute.created', dLease);
  const frozen = await call('PATCH', `/plots/${lots[0].id}`, { token: amy.token, body: { description: 'New words' } });
  check('a disputed lease keeps the building in the city', (await plot(lots[0].id)).title === 'Amy Coffee' && (await plot(lots[0].id)).owner === 'Amy');
  check('...but its owner cannot change it, redesign it, upgrade or renew it', frozen.status === 409 && frozen.data.code === 'disputed' && (await call('POST', `/plots/${lots[0].id}/exterior`, { token: amy.token, body: { exterior: { crown: 'spire' } } })).data.code === 'disputed' && (await call('PUT', `/plots/${lots[0].id}/interior`, { token: amy.token, body: { design: {}, revision: 0 } })).data.code === 'disputed', JSON.stringify(frozen.data));
  await call('POST', `/admin/plots/${lots[0].id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
  check('(renewing too)', (await call('POST', `/plots/${lots[0].id}/renew`, { token: amy.token, body: { leaseDays: 7 } })).data.code === 'disputed');
  await closeDispute(dLease, 'won');
  check('won: the owner can change it again', (await call('PATCH', `/plots/${lots[0].id}`, { token: amy.token, body: { description: 'New words' } })).status === 200);
  const dLease2 = dispute(`pi_${claim}`, order(claim).cents);
  await webhook('charge.dispute.created', dLease2);
  await closeDispute(dLease2, 'lost');
  check('lost: the lease ends and the plot opens to others', (await plot(lots[0].id)).lease.state === 'open' && order(claim).status === 'charged_back' && api.db.prepare('SELECT disputed FROM plots WHERE id = ?').get(lots[0].id).disputed === 0);

  // ---- a market stall still to come: cancelled; won: booked again
  const next = addWeeks(weekStartOf(), 1);
  const w = (await call('GET', `/market/SD-0004/${next}`)).data;
  const stallOrder = { siteCode: 'SD-0004', week: next, stallId: w.stalls[0].id, hours: 24, start: weekWindow(next).start + 2 * DAY, brand: 'Amy Bakes', product: 'Bread' };
  const m1 = (await call('POST', '/market/book', { token: amy.token, body: stallOrder })).data;
  await pay(m1.checkout.orderId);
  const booking = () => api.db.prepare('SELECT status FROM market_bookings WHERE id = ?').get(m1.booking.id).status;
  const dStall = dispute(`pi_${m1.checkout.orderId}`, order(m1.checkout.orderId).cents);
  await webhook('charge.dispute.created', dStall);
  check('a disputed stall that has not opened is cancelled', booking() === 'cancelled' && (await call('GET', '/market/mine', { token: amy.token })).data.bookings.length === 0);
  await closeDispute(dStall, 'won');
  check('won: the stall is booked again (it is still free)', booking() === 'booked');

  // ---- an ad space: taken down, still booked; lost: ended
  const bb = (await call('GET', '/ads')).data.slots.find((s) => s.kind === 'billboard');
  const ad = (await call('POST', `/ads/${bb.id}/buy`, { token: amy.token, body: AD('Amy') })).data.checkout.orderId;
  await pay(ad);
  const dAd = dispute(`pi_${ad}`, 1200);
  await webhook('charge.dispute.created', dAd);
  check('a disputed ad space is taken down, and nobody else can book it meanwhile', (await slot(bb.id)).ad === null && (await call('POST', `/ads/${bb.id}/buy`, { token: bob.token, body: AD('Bob') })).data.code === 'ad_taken');
  await closeDispute(dAd, 'won');
  check('won: the ad is back', (await slot(bb.id)).ad?.advertiser === 'Amy');
  const dAd2 = dispute(`pi_${ad}`, 1200);
  await webhook('charge.dispute.created', dAd2);
  await closeDispute(dAd2, 'lost');
  check('lost: the booking ends and the space is free', (await slot(bb.id)).ad === null && order(ad).status === 'charged_back' && (await call('POST', `/ads/${bb.id}/buy`, { token: bob.token, body: AD('Bob') })).data.checkout?.orderId > 0);

  // ---- a dispute of a payment we do not know: recorded, the admins told
  await webhook('charge.dispute.created', dispute('pi_unknown', 500));
  const unknown = api.db.prepare("SELECT * FROM outbox WHERE subject = 'A payment is disputed: $5.00'").all();
  check('a dispute of an unknown payment is recorded and the admins are told', api.db.prepare("SELECT order_id FROM disputes WHERE payment_intent = 'pi_unknown'").get()?.order_id === null && unknown.length === 1 && /no order of ours/.test(unknown[0].body));
  const lostOnly = dispute('pi_unknown2', 700, 'lost');
  await closeDispute(lostOnly, 'lost');
  check('a dispute whose first event never came is opened and closed', api.db.prepare('SELECT status FROM disputes WHERE stripe_dispute = ?').get(lostOnly.id)?.status === 'lost');

  // ==== a cart: every line paused; lost: every line charged back ========================================================================
  await call('POST', '/cart/items', { token: amy.token, body: { kind: 'launch', business: 'amy-cafe' } });
  await call('POST', '/cart/items', { token: amy.token, body: { kind: 'claim', plotId: lots[1].id, input: { ...biz, title: 'Amy Two' } } });
  const cartA = (await call('POST', '/cart/checkout', { token: amy.token })).data.checkout.orderId;
  await pay(cartA);
  const linesA = api.db.prepare('SELECT * FROM orders WHERE parent_id = ? ORDER BY id').all(cartA);
  const dCart = dispute(`pi_${cartA}`, order(cartA).cents);
  await webhook('charge.dispute.created', dCart);
  const launchLine = linesA.find((l) => l.product === 'launch');
  check('a disputed cart pauses each line', ent(launchLine.id).status === 'paused' && api.db.prepare('SELECT disputed FROM plots WHERE id = ?').get(lots[1].id).disputed === 1 && linesA.every((l) => order(l.id).dispute_id > 0));
  const detail = (await call('GET', `/admin/billing/orders/${cartA}`, { token: ADMIN })).data;
  fits('the admin\'s order', types.BILLING_ORDER, detail);
  check('the admin sees the cart, its lines and its dispute', detail.lines.length === 2 && detail.disputes.length === 1 && detail.disputes[0].paused.length === 2 && detail.disputes[0].status === 'open');
  await closeDispute(dCart, 'lost');
  check('lost: every line and the cart are charged back', linesA.every((l) => order(l.id).status === 'charged_back') && order(cartA).status === 'charged_back' && ent(launchLine.id).status === 'revoked' && (await plot(lots[1].id)).lease.state === 'open');

  // ==== partial refunds in the Stripe dashboard =========================================================================================
  // ---- a single order: in part, then the rest
  const l2 = (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'launch' } })).data.orderId;
  await pay(l2);
  await webhook('charge.refunded', { id: `ch_${l2}`, object: 'charge', payment_intent: `pi_${l2}`, amount: 900, amount_refunded: 300 }, 'evt_part_1');
  check('part of a single order refunded: recorded, and it goes on', order(l2).status === 'paid' && order(l2).refunded_cents === 300 && ent(l2).status === 'active' && /\$3\.00 of \$9\.00 refunded/.test(order(l2).note));
  check('the same event again changes nothing', (await webhook('charge.refunded', { id: `ch_${l2}`, object: 'charge', payment_intent: `pi_${l2}`, amount: 900, amount_refunded: 300 }, 'evt_part_1')).duplicate && order(l2).refunded_cents === 300);
  await webhook('charge.refunded', { id: `ch_${l2}`, object: 'charge', payment_intent: `pi_${l2}`, amount: 900, amount_refunded: 300 });
  check('another event with the same total changes nothing either', order(l2).refunded_cents === 300 && api.db.prepare('SELECT COUNT(*) AS n FROM order_refunds WHERE order_id = ?').get(l2).n === 1);
  const rest = await call('POST', `/admin/billing/orders/${l2}/refund`, { token: ADMIN });
  check('an admin refund afterwards refunds only what is left', rest.data.refunded && S.refunds.at(-1).amount === '600' && order(l2).status === 'refunded' && order(l2).refunded_cents === 900 && ent(l2).status === 'revoked');
  await webhook('charge.refunded', { id: `ch_${l2}`, object: 'charge', payment_intent: `pi_${l2}`, amount: 900, amount_refunded: 900 });
  check('Stripe\'s event for our own refund is not counted twice', api.db.prepare('SELECT SUM(cents) AS n FROM order_refunds WHERE order_id = ?').get(l2).n === 900);

  // ---- a cart: launch ($9), a sponsored week ($49 district) and an ad space ($12), with a $10 code on everything
  await call('POST', '/admin/promos', { token: ADMIN, body: { code: 'TENOFF', kind: 'amount', value: 1000, appliesTo: ['all'] } });
  const bb2 = (await call('GET', '/ads')).data.slots.filter((s) => s.kind === 'billboard')[1];
  await call('POST', '/cart/items', { token: amy.token, body: { kind: 'launch', business: 'amy-cafe' } });
  await call('POST', '/cart/items', { token: amy.token, body: { kind: 'sponsored', business: 'amy-cafe', placement: 'district:creator' } });
  await call('POST', '/cart/items', { token: amy.token, body: { kind: 'ad', slotId: bb2.id, input: AD('Amy') } });
  await call('POST', '/cart/promo', { token: amy.token, body: { code: 'TENOFF' } });
  const cartB = (await call('POST', '/cart/checkout', { token: amy.token })).data.checkout.orderId;
  await pay(cartB);
  const [lLaunch, lSpon, lAd] = api.db.prepare('SELECT * FROM orders WHERE parent_id = ? ORDER BY id').all(cartB);
  const total = order(cartB).cents;
  const used = () => api.db.prepare('SELECT * FROM promo_redemptions WHERE order_id = ?').get(cartB);
  check('(the cart is paid, with the code on its three lines)', lLaunch.product === 'launch' && lSpon.product === 'sponsored' && lAd.product === 'ad' && total === 900 + 4900 + 1200 - 1000 && used().cents_off === 1000 && [lLaunch, lSpon, lAd].every((l) => l.promo_cents > 0), JSON.stringify([lLaunch.cents, lSpon.cents, lAd.cents, total]));
  const charge = (refunded) => ({ id: `ch_${cartB}`, object: 'charge', payment_intent: `pi_${cartB}`, amount: total, amount_refunded: refunded });
  // 1. exactly the Launch Pack's amount: that line, whichever it is
  await webhook('charge.refunded', charge(lLaunch.cents));
  check('a refund of exactly one line\'s amount ends that line only', order(lLaunch.id).status === 'refunded' && ent(lLaunch.id).status === 'revoked' && order(lSpon.id).status === 'paid' && order(lAd.id).status === 'paid' && order(cartB).status === 'paid');
  check('...and takes its share off what the code is counted as giving', used().cents_off === 1000 - lLaunch.promo_cents && used().status === 'redeemed');
  // 2. $5 more: the latest line (the ad space) is refunded in part and keeps running
  await webhook('charge.refunded', charge(lLaunch.cents + 500));
  check('a refund that matches no line goes to the latest line first, in part: it keeps running', order(lAd.id).status === 'paid' && order(lAd.id).refunded_cents === 500 && (await slot(bb2.id)).ad?.advertiser === 'Amy' && order(lSpon.id).refunded_cents === 0);
  const shareAfter = (o, refunded) => Math.round((o.promo_cents * refunded) / o.cents);
  check('...its share of the code is taken off in proportion', used().cents_off === 1000 - lLaunch.promo_cents - shareAfter(lAd, 500), JSON.stringify(used()));
  check('the cart counts what its lines had refunded', order(cartB).refunded_cents === lLaunch.cents + 500);
  // 3. the rest of the ad line and $10 of the sponsored week: the ad ends, the sponsored week is refunded in part
  await webhook('charge.refunded', charge(lLaunch.cents + lAd.cents + 1000));
  check('a refund covering the latest line in full ends it, the rest goes to the next line', order(lAd.id).status === 'refunded' && (await slot(bb2.id)).ad === null && order(lSpon.id).status === 'paid' && order(lSpon.id).refunded_cents === 1000 && ent(lSpon.id).status === 'active');
  const admin = (await call('GET', `/admin/billing/orders/${lSpon.id}`, { token: ADMIN })).data;
  check('the admin sees each refund of the cart, full or in part, from Stripe', admin.cart?.id === cartB && admin.refunds.length === 4 && admin.refunds.filter((r) => r.full).length === 2 && admin.refunds.every((r) => r.source === 'stripe'), JSON.stringify(admin.refunds));
  // 4. all of it: everything still paid ends, and the cart too
  await webhook('charge.refunded', charge(total));
  check('the whole payment refunded: every line and the cart are refunded, the code\'s use voided', [lLaunch, lSpon, lAd].every((l) => order(l.id).status === 'refunded') && order(cartB).status === 'refunded' && ent(lSpon.id).status === 'revoked' && used().status === 'voided');
  const disputes = (await call('GET', '/admin/billing/disputes', { token: ADMIN })).data;
  check('the admin\'s refunds list has them, newest first', disputes.refunds[0].orderId === lSpon.id && disputes.refunds.some((r) => !r.full && r.orderId === lAd.id));

  // ---- a cart with Pro: Pro is allocated last; refunded in full, its plan is cancelled
  const bobBiz = (await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Builds', category: 'services', website: 'https://bob.test' } })).data;
  await call('POST', '/cart/items', { token: bob.token, body: { kind: 'pro', business: bobBiz.slug } });
  await call('POST', '/cart/items', { token: bob.token, body: { kind: 'launch', business: bobBiz.slug } });
  const cartC = (await call('POST', '/cart/checkout', { token: bob.token })).data.checkout.orderId;
  const sc = sessionOf(cartC);
  Object.assign(sc, { status: 'complete', payment_status: 'paid' });
  await webhook('checkout.session.completed', { id: sc.id, object: 'checkout.session', mode: 'subscription', status: 'complete', payment_status: 'paid', client_reference_id: String(cartC), payment_intent: null, subscription: 'sub_bob_cart', metadata: { order: String(cartC) } });
  await webhook('invoice.paid', { object: 'invoice', subscription: 'sub_bob_cart', subscription_details: { metadata: { order: String(cartC) } }, payment_intent: `pi_${cartC}`, lines: { data: [{ period: { end: Math.floor((Date.now() + 30 * DAY) / 1000) } }] } });
  const [cPro, cLaunch] = api.db.prepare('SELECT * FROM orders WHERE parent_id = ? ORDER BY id').all(cartC);
  const cTotal = order(cartC).cents;
  await webhook('charge.refunded', { id: `ch_${cartC}`, object: 'charge', payment_intent: `pi_${cartC}`, amount: cTotal, amount_refunded: 1000 });
  check('in a cart with Pro, a part refund goes to the one-time lines first', order(cLaunch.id).status === 'refunded' && order(cPro.id).status === 'paid' && order(cPro.id).refunded_cents === 100 && !S.calls.some((c) => c.path === '/v1/subscriptions/sub_bob_cart' && c.method === 'DELETE'), JSON.stringify([order(cLaunch.id).status, order(cPro.id).refunded_cents]));
  await webhook('charge.refunded', { id: `ch_${cartC}`, object: 'charge', payment_intent: `pi_${cartC}`, amount: cTotal, amount_refunded: cTotal });
  check('Pro refunded in full: its plan is cancelled', order(cPro.id).status === 'refunded' && S.calls.some((c) => c.path === '/v1/subscriptions/sub_bob_cart' && c.method === 'DELETE'));

  check('owners see what was refunded of their orders', (await call('GET', '/me/orders', { token: amy.token })).data.orders.find((o) => o.id === lAd.id).refundedCents === lAd.cents);
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
