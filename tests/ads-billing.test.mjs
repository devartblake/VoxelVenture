// Paid ad spaces (services/api/billing.mjs payAd, core.mjs ad_terms, docs/monetization/billing.md#ad-spaces), against a stand-in for the Stripe API:
// with payments on, booking a billboard or banner goes through Stripe Checkout at the catalogue's price (AD_SPACES), less the Pro discount; the space
// is held while the player pays and nobody else can book it while a booking runs; the ad goes up once paid; the holder can add weeks; a booking can
// go in the cart (and gets the Pro price there when Pro is in the cart); promo codes of the group `ads` apply; a refund takes the ad down; a payment
// that comes too late is refunded. Without payments the game's free take-over is unchanged.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { signPayload } from '../services/api/billing.mjs';
import * as types from '@voxelventure/shared-types';
import { AD_SPACES, PRO_DISCOUNT, PRO_PLOT_DISCOUNT, adPriceOf, promoGroupOf } from '@voxelventure/business-core';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const fits = (name, contract, value) => { const r = types.check(contract, value); check(`${name} fits ${contract.id} v${contract.version}`, r.ok, r.ok ? '' : `${r.errors.slice(0, 3).join('; ')} in ${JSON.stringify(value).slice(0, 200)}`); };
const DAY = 86400000;
const WHSEC = 'whsec_ads';
const ADMIN = 'admin';

// ---- a stand-in Stripe
const S = { sessions: new Map(), refunds: [], n: 0 };
const stripeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(req.method === 'GET' ? url.search : body));
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const id = `cs_ads_${++S.n}`;
      S.sessions.set(id, { id, status: 'open', payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id, params });
      return reply(200, { id, url: `https://checkout.stripe.test/${id}` });
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/))) return reply(200, { id: m[1], status: 'expired' });
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return reply(200, S.sessions.get(m[1]) ?? {});
    if (url.pathname === '/v1/refunds') return (S.refunds.push(params), reply(200, { id: `re_${S.refunds.length}`, status: 'succeeded' }));
    if (url.pathname === '/v1/coupons') return reply(200, { id: `co_${++S.n}` });
    return reply(404, { error: { message: 'unknown' } });
  });
});
await new Promise((r) => stripeServer.listen(0, r));

const env = { ADMIN_TOKEN: ADMIN, STRIPE_SECRET_KEY: 'sk_test_ads', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_URL: `http://localhost:${stripeServer.address().port}`, PUBLIC_SITE_URL: 'https://voxel.test' };
const start = async (e) => {
  const a = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: e });
  await new Promise((r) => a.server.listen(0, r));
  const b = `http://localhost:${a.server.address().port}`;
  const call = async (method, p, { token, body } = {}) => {
    const res = await fetch(b + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return { api: a, base: b, call };
};
const { api, base, call } = await start(env);
const signup = async (u, c = call) => (await c('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
let eventN = 0;
const webhook = (type, object, id = `evt_a${++eventN}`) => {
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
const slot = async (id) => (await call('GET', `/ads/${id}`)).data;
const AD = (who) => ({ advertiser: who, headline: `${who} sells things`, tagline: 'Best in town', url: 'https://ads.test', color: '#3366ff' });

try {
  // ---- the catalogue
  check('a billboard is $12 and an aerial banner $29, for 7 days', AD_SPACES.billboard.cents === 1200 && AD_SPACES.banner.cents === 2900 && AD_SPACES.billboard.days === 7 && AD_SPACES.banner.days === 7);
  check('Pro takes the same 15% off ad spaces as off plots (one constant)', PRO_DISCOUNT === 0.15 && PRO_PLOT_DISCOUNT === PRO_DISCOUNT && adPriceOf('billboard', { pro: true }) === 1020 && adPriceOf('banner', { pro: true }) === 2465 && adPriceOf('nothing') === null);
  check('an ad space is the promo group "ads"', promoGroupOf('ad') === 'ads');

  const slots = (await call('GET', '/ads')).data.slots;
  const billboard = slots.find((s) => s.kind === 'billboard');
  const banner = slots.find((s) => s.kind === 'banner');
  check('each space says what a booking costs, with Pro, and that it is free to book', billboard.sale.cents === 1200 && billboard.sale.proCents === 1020 && billboard.sale.days === 7 && billboard.sale.bookedUntil === null && banner.sale.cents === 2900, JSON.stringify(billboard.sale));

  const amy = await signup('Amy');
  const bob = await signup('Bob');
  const cara = await signup('Cara');

  // ---- a single booking through Stripe
  check('booking needs an account', (await call('POST', `/ads/${billboard.id}/buy`, { body: AD('Nobody') })).status === 401);
  check('a bad ad is refused before any payment', (await call('POST', `/ads/${billboard.id}/buy`, { token: amy.token, body: { ...AD('Amy'), color: 'red' } })).status === 400 && S.sessions.size === 0);
  fits('the body', types.AD_BUY, AD('Amy'));
  const b1 = await call('POST', `/ads/${billboard.id}/buy`, { token: amy.token, body: { ...AD('Amy'), expectedPrice: 1 } });
  fits('a booking', types.AD_BUY_RESULT, b1.data);
  const o1 = b1.data.checkout?.orderId;
  check('booking a billboard returns Stripe\'s page at $12, whatever the game sent', b1.status === 200 && b1.data.checkout.url.startsWith('https://checkout.stripe.test/') && order(o1).cents === 1200 && order(o1).product === 'ad' && sessionOf(o1).params['line_items[0][price_data][unit_amount]'] === '1200' && sessionOf(o1).params.success_url === `https://voxel.test/?paid=${o1}`, JSON.stringify(b1.data));
  check('the order says what is bought', order(o1).label === `Ad space: ${billboard.label} (7 days)` && order(o1).target === `ad:${billboard.id}`);
  check('nothing changes on the space until it is paid', (await slot(billboard.id)).ad?.advertiser !== 'Amy');
  check('the space is held: nobody else can book it while Amy pays', (await call('POST', `/ads/${billboard.id}/buy`, { token: bob.token, body: AD('Bob') })).data.code === 'held');
  await pay(o1);
  const s1 = await slot(billboard.id);
  check('once paid, the ad is up for 7 days', s1.ad?.advertiser === 'Amy' && s1.ownerAccount === amy.account.id && Math.abs(s1.sale.paidUntil - (Date.now() + 7 * DAY)) < 60000 && order(o1).status === 'paid', JSON.stringify(s1.sale));
  check('it is in the ledger and the audit trail', api.db.prepare('SELECT price FROM ad_ledger WHERE slot_id = ? ORDER BY id DESC').get(billboard.id).price === 12 && api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'ad.buy' AND target_id = ?").get(billboard.id).n === 1);
  check('a second delivery changes nothing', (await pay(o1)).received && api.db.prepare('SELECT COUNT(*) AS n FROM ad_terms WHERE slot_id = ?').get(billboard.id).n === 1);
  const taken = await call('POST', `/ads/${billboard.id}/buy`, { token: bob.token, body: AD('Bob') });
  check('while it runs nobody else can book the space', taken.status === 409 && taken.data.code === 'ad_taken' && /booked until/.test(taken.data.error));
  // the holder adds a week, with a new ad
  const o2 = (await call('POST', `/ads/${billboard.id}/buy`, { token: amy.token, body: { ...AD('Amy'), headline: 'Amy, week two' } })).data.checkout.orderId;
  await pay(o2);
  const s2 = await slot(billboard.id);
  check('the holder can add a week: it starts when the first ends, and the new ad shows', s2.ad.headline === 'Amy, week two' && Math.abs(s2.sale.paidUntil - (Date.now() + 14 * DAY)) < 60000);

  // ---- a refund takes the booking back; the week after moves forward
  check('an admin refund of the first week goes to Stripe', (await call('POST', `/admin/billing/orders/${o1}/refund`, { token: ADMIN })).data.refunded && S.refunds.at(-1).payment_intent === `pi_${o1}`);
  const s3 = await slot(billboard.id);
  check('...and its days are given back: the second week now runs from today', s3.ad.headline === 'Amy, week two' && Math.abs(s3.sale.paidUntil - (Date.now() + 7 * DAY)) < 60000, JSON.stringify(s3.sale));
  await call('POST', `/admin/billing/orders/${o2}/refund`, { token: ADMIN });
  const s4 = await slot(billboard.id);
  check('refunding the last week takes the ad down and frees the space', s4.ad === null && s4.sale.paidUntil === null && s4.sale.bookedUntil === null && order(o2).status === 'refunded');

  // ---- a booking that ends leaves the space empty
  const o3 = (await call('POST', `/ads/${billboard.id}/buy`, { token: bob.token, body: AD('Bob') })).data.checkout.orderId;
  await pay(o3);
  api.db.prepare('UPDATE ad_terms SET ends_at = ? WHERE order_id = ?').run(Date.now() - 1000, o3);
  api.db.prepare('UPDATE ad_slots SET paid_until = ? WHERE id = ?').run(Date.now() - 1000, billboard.id);
  check('when the booked time is over the ad comes down and anyone can book', (await slot(billboard.id)).ad === null && (await call('POST', `/ads/${billboard.id}/buy`, { token: amy.token, body: AD('Amy') })).data.checkout?.orderId > 0);

  // ---- a payment that comes after the hold ran out and someone else booked: refunded
  const late = (await call('POST', `/ads/${banner.id}/buy`, { token: amy.token, body: AD('Amy') })).data.checkout.orderId;
  api.db.prepare('UPDATE orders SET hold_until = 0 WHERE id = ?').run(late);
  const first = (await call('POST', `/ads/${banner.id}/buy`, { token: bob.token, body: AD('Bob') })).data.checkout.orderId;
  check('a banner is $29', order(first).cents === 2900);
  await pay(first);
  await pay(late);
  check('the late payment is refunded and the banner stays with whoever paid first', (await slot(banner.id)).ad.advertiser === 'Bob' && order(late).status === 'refunded' && /booked by someone else/.test(order(late).note) && S.refunds.at(-1).payment_intent === `pi_${late}`);

  // ---- Pro: 15% off
  const prof = (await call('POST', '/businesses', { token: cara.token, body: { name: 'Cara Bakes', category: 'food', district: 'creator', tagline: 'Bread', description: 'Sourdough, rye and buns, baked every morning before seven.', website: 'https://cara.test' } })).data;
  await call('POST', `/admin/billing/grant/${prof.slug}`, { token: ADMIN, body: { product: 'pro', days: 30, reason: 'test' } });
  const other = slots.filter((s) => s.kind === 'billboard')[1];
  const c1 = (await call('POST', `/ads/${other.id}/buy`, { token: cara.token, body: AD('Cara') })).data.checkout.orderId;
  check('with Pro a billboard costs 15% less ($10.20)', order(c1).cents === 1020 && sessionOf(c1).params['line_items[0][price_data][unit_amount]'] === '1020');
  await webhook('checkout.session.expired', { id: sessionOf(c1).id, object: 'checkout.session', status: 'expired', client_reference_id: String(c1) });
  check('an abandoned checkout frees the space', order(c1).status === 'expired' && (await call('POST', `/ads/${other.id}/buy`, { token: bob.token, body: AD('Bob') })).data.checkout?.orderId > 0);
  const bobHold = api.db.prepare("SELECT id FROM orders WHERE account_id = ? AND target = ? AND status = 'pending'").get(bob.account.id, `ad:${other.id}`).id;
  await webhook('checkout.session.expired', { id: sessionOf(bobHold).id, object: 'checkout.session', status: 'expired', client_reference_id: String(bobHold) });

  // ---- promo codes: the group `ads`
  await call('POST', '/admin/promos', { token: ADMIN, body: { code: 'ADSHALF', kind: 'percent', value: 50, appliesTo: ['ads'] } });
  await call('POST', '/admin/promos', { token: ADMIN, body: { code: 'PLOTSONLY', kind: 'percent', value: 50, appliesTo: ['plots'] } });
  check('a code for plots does not apply to an ad space', (await call('POST', `/ads/${other.id}/buy`, { token: bob.token, body: { ...AD('Bob'), promoCode: 'PLOTSONLY' } })).data.code === 'promo_not_applicable');
  const half = (await call('POST', `/ads/${other.id}/buy`, { token: bob.token, body: { ...AD('Bob'), promoCode: 'ADSHALF' } })).data.checkout;
  check('a code for ad spaces takes its share off', order(half.orderId).cents === 600 && order(half.orderId).promo_cents === 600 && half.promo?.code === 'ADSHALF' && sessionOf(half.orderId).params['line_items[0][price_data][unit_amount]'] === '600');
  await pay(half.orderId);
  check('...and its use is redeemed with the payment', api.db.prepare('SELECT status FROM promo_redemptions WHERE order_id = ?').get(half.orderId).status === 'redeemed' && (await slot(other.id)).ad.advertiser === 'Bob');
  check('the ledger records the price before the code', api.db.prepare('SELECT price FROM ad_ledger WHERE slot_id = ? ORDER BY id DESC').get(other.id).price === 12);

  // ---- the cart: an ad space with Pro in the same cart gets the Pro price
  const dan = await signup('Dan');
  await call('POST', '/businesses', { token: dan.token, body: { name: 'Dan Draws', category: 'services', website: 'https://dan.test' } });
  const third = slots.filter((s) => s.kind === 'billboard')[2];
  const added = await call('POST', '/cart/items', { token: dan.token, body: { kind: 'ad', slotId: third.id, input: AD('Dan') } });
  fits('an ad line', types.CART_ITEM, { kind: 'ad', slotId: third.id, input: AD('Dan') });
  fits('the cart with an ad space', types.CART_VIEW, added.data.cart);
  check('an ad space goes in the cart at its price', added.status === 200 && added.data.cart.items[0].kind === 'ad' && added.data.cart.items[0].cents === 1200 && added.data.cart.items[0].label === `Ad space: ${third.label} (7 days)`, JSON.stringify(added.data).slice(0, 300));
  check('a bad ad cannot go in the cart', (await call('POST', '/cart/items', { token: dan.token, body: { kind: 'ad', slotId: banner.id, input: { advertiser: 'D' } } })).status === 400);
  check('the same space twice is refused', (await call('POST', '/cart/items', { token: dan.token, body: { kind: 'ad', slotId: third.id, input: AD('Dan') } })).data.code === 'already_in_cart');
  const withPro = (await call('POST', '/cart/items', { token: dan.token, body: { kind: 'pro', business: 'dan-draws' } })).data.cart;
  const adLine = withPro.items.find((i) => i.kind === 'ad');
  check('with Pro in the cart the ad line gets the Pro price, shown as a discount', adLine.cents === 1020 && adLine.discountCents === 180, JSON.stringify(adLine));
  await call('DELETE', `/cart/items/${withPro.items.find((i) => i.kind === 'pro').id}`, { token: dan.token });
  check('...and loses it when Pro leaves the cart', (await call('GET', '/cart', { token: dan.token })).data.items[0].cents === 1200);
  const co = await call('POST', '/cart/checkout', { token: dan.token });
  fits('the cart checkout', types.CART_CHECKOUT_RESULT, co.data);
  const parent = co.data.checkout.orderId;
  const child = api.db.prepare('SELECT * FROM orders WHERE parent_id = ?').get(parent);
  check('the cart checkout holds the space (a child order) and opens one session', co.status === 200 && child.product === 'ad' && child.hold_until > Date.now() && sessionOf(parent).params['line_items[0][price_data][unit_amount]'] === '1200' && (await call('POST', `/ads/${third.id}/buy`, { token: amy.token, body: AD('Amy') })).data.code === 'held');
  await pay(parent);
  check('once the cart is paid the ad is up and the line has left the cart', (await slot(third.id)).ad.advertiser === 'Dan' && order(child.id).status === 'paid' && (await call('GET', '/cart', { token: dan.token })).data.count === 0);
  check('an admin refund of the cart line takes it down', (await call('POST', `/admin/billing/orders/${child.id}/refund`, { token: ADMIN })).data.refunded && (await slot(third.id)).ad === null && S.refunds.at(-1).amount === '1200');
  check('the audit chain is intact', (await call('GET', '/admin/audit/verify', { token: ADMIN })).data.ok === true);

  // ---- without payments: the game's free take-over, as before
  const off = await start({ ADMIN_TOKEN: ADMIN });
  try {
    const ed = await signup('Eddy', off.call);
    const offSlot = (await off.call('GET', '/ads')).data.slots.find((s) => s.kind === 'billboard' && s.ad);
    const r = await off.call('POST', `/ads/${offSlot.id}/buy`, { token: ed.token, body: { ...AD('Ed'), expectedPrice: offSlot.price } });
    fits('a free take-over', types.AD_BUY_RESULT, r.data);
    check('without payments a billboard is taken over at once for its game price', r.status === 200 && !r.data.checkout && r.data.slot.ad.advertiser === 'Ed' && r.data.paidOut === offSlot.price && r.data.slot.value === offSlot.price, JSON.stringify(r.data).slice(0, 200));
    const fay = await signup('Fay', off.call);
    const empty = (await off.call('GET', '/ads')).data.slots.find((s) => s.id !== offSlot.id && s.kind === 'billboard');
    await off.call('POST', '/cart/items', { token: fay.token, body: { kind: 'ad', slotId: empty.id, input: AD('Fay') } });
    const done = await off.call('POST', '/cart/checkout', { token: fay.token });
    check('without payments a cart\'s ad line is done at once, like the game\'s own route', done.status === 200 && done.data.done?.[0]?.kind === 'ad' && (await off.call('GET', `/ads/${empty.id}`)).data.ad.advertiser === 'Fay', JSON.stringify(done.data).slice(0, 200));
    check('nothing went to Stripe', off.api.db.prepare("SELECT COUNT(*) AS n FROM orders WHERE product = 'ad'").get().n === 0);
  } finally {
    await off.api.close();
  }
} catch (e) {
  fails++;
  console.log('FAIL threw', e.stack);
} finally {
  await api.close();
  stripeServer.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
