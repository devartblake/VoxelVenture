// The cart (services/api/cart.mjs, docs/monetization/billing.md#the-cart), against a stand-in for the Stripe API: lines priced on the server when added
// and again at checkout (a changed price is shown before paying), at most 3 plots and each plot once, the $4 minimum, Pro and one-time lines in one
// subscription-mode session, every line held at checkout and let go on expiry, one unavailable line blocking checkout with its reason, line-by-line
// fulfilment with a line-level refund, webhooks applied once, the plot economy's 'checkout' step, what happens without payments, and the contracts.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { signPayload } from '../services/api/billing.mjs';
import { imp } from '../scripts/lib-loader.mjs';
import * as types from '@voxelventure/shared-types';
import { CART, PRODUCTS, PLACEMENTS } from '@voxelventure/business-core';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const fits = (name, contract, value) => {
  const r = types.check(contract, value);
  check(`${name} fits ${contract.id}`, r.ok, r.ok ? '' : `${r.errors.slice(0, 4).join('; ')} in ${JSON.stringify(value).slice(0, 300)}`);
};
const DAY = 86400000;
const WHSEC = 'whsec_cart';
const ADMIN = 'admin';

// ---- a stand-in Stripe: sessions (and closing one), invoices, subscriptions, refunds
const S = { sessions: new Map(), invoices: new Map(), subs: new Map(), refunds: [], expired: [], n: 0 };
const stripeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(req.method === 'GET' ? url.search : body));
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const id = `cs_cart_${++S.n}`;
      S.sessions.set(id, { id, status: 'open', payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id, params });
      return reply(200, { id, url: `https://checkout.stripe.test/${id}` });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)\/expire$/))) {
      S.expired.push(m[1]);
      const s = S.sessions.get(m[1]);
      if (s) s.status = 'expired';
      return reply(200, s ?? {});
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return reply(200, S.sessions.get(m[1]) ?? {});
    if ((m = url.pathname.match(/^\/v1\/invoices\/(.+)$/))) return reply(200, S.invoices.get(m[1]) ?? {});
    if (url.pathname === '/v1/invoices') return reply(200, { data: [{ payment_intent: S.subs.get(params.subscription)?.pi ?? null }] });
    if ((m = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) {
      const sub = S.subs.get(m[1]) ?? { id: m[1], status: 'active' };
      if (req.method === 'DELETE') sub.status = 'canceled';
      S.subs.set(m[1], sub);
      return reply(200, sub);
    }
    if (url.pathname === '/v1/refunds') return (S.refunds.push(params), reply(200, { id: `re_${S.refunds.length}`, status: 'succeeded' }));
    return reply(404, { error: { message: 'unknown' } });
  });
});
await new Promise((r) => stripeServer.listen(0, r));

const env = { ADMIN_TOKEN: ADMIN, STRIPE_SECRET_KEY: 'sk_test_cart', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_URL: `http://localhost:${stripeServer.address().port}`, PUBLIC_SITE_URL: 'https://voxel.test' };
const start = async (e) => {
  const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: e });
  await new Promise((r) => api.server.listen(0, r));
  const base = `http://localhost:${api.server.address().port}`;
  const call = async (method, p, { token, body } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return { api, base, call };
};
const { api, base, call } = await start(env);
const signup = async (u, c = call) => (await c('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
let eventN = 0;
const send = (raw) => fetch(`${base}/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signPayload(raw, WHSEC) }, body: raw }).then((r) => r.json());
const event = (type, object, id = `evt_c${++eventN}`) => JSON.stringify({ id, type, data: { object } });
const sessionOf = (orderId) => [...S.sessions.values()].find((s) => s.client_reference_id === String(orderId));
const order = (id) => api.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
const childrenOf = (id) => api.db.prepare('SELECT * FROM orders WHERE parent_id = ? ORDER BY id').all(id);
const plot = async (id) => (await call('GET', `/plots/${id}`)).data;
const cents = (dollars) => Math.round(dollars * 100);
const bizId = (slug) => api.db.prepare('SELECT id FROM businesses WHERE slug = ?').get(slug).id;

try {
  const { generateCity } = await imp('city/cityGenerator.js');
  const { leaseQuote } = await imp('game/claimPrice.js');
  const { weekStartOf, addWeeks, weekWindow } = await imp('market/weeks.js');
  const city = generateCity(20260101);
  const lots = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb');
  const amy = await signup('Amy');
  const bob = await signup('Bob');
  const dan = await signup('Dan');
  const cara = await signup('Cara');
  const biz = (title, leaseDays = 30) => ({ title, buildingType: 'shop', website: 'https://shop.test', variant: 'corner', logo: { kind: 'generated' }, description: 'A small shop.', leaseDays });
  const prof = (await call('POST', '/businesses', { token: amy.token, body: { name: 'Amy Cafe', category: 'food', district: 'creator', website: 'https://amy.test', description: 'Coffee and cake all day, by the river in Creator Commons.' } })).data;
  const add = (token, item) => call('POST', '/cart/items', { token, body: item });
  const cartOf = async (token) => (await call('GET', '/cart', { token })).data;

  // ---- an empty cart, and what a line costs when it is added
  const empty = await call('GET', '/cart', { token: amy.token });
  fits('an empty cart', types.CART_VIEW, empty.data);
  check('an empty cart: nothing to pay, the minimum still to reach', empty.data.count === 0 && empty.data.missingCents === CART.minimumCents && !empty.data.ready && empty.data.payments === true);
  check('the cart needs an account', (await call('GET', '/cart')).status === 401);
  const a1 = await add(amy.token, { kind: 'claim', plotId: lots[0].id, input: biz('Amy One', 14) });
  fits('adding a line', types.CART_ADD_RESULT, a1.data);
  fits('the cart after adding', types.CART_VIEW, a1.data.cart);
  const full0 = cents(leaseQuote(lots[0], null, 'shop', 14).total);
  check('a line is priced on the server, as the claim form shows it', a1.status === 200 && a1.data.cart.items[0].cents === full0 && a1.data.cart.items[0].discountCents === 0 && /^Lease: Amy One \(plot \d+, 14 days\)$/.test(a1.data.cart.items[0].label), JSON.stringify(a1.data).slice(0, 300));
  check('a price sent by the browser is ignored', (await add(amy.token, { kind: 'claim', plotId: lots[1].id, input: { ...biz('Amy Two'), price: 1, cents: 1 } })).data.cart.items[1].cents === cents(leaseQuote(lots[1], null, 'shop', 30).total));
  check('adding holds nothing: anyone can still claim the plot', api.db.prepare("SELECT COUNT(*) AS n FROM orders WHERE account_id = ?").get(amy.account.id).n === 0 && (await call('GET', `/plots/${lots[0].id}/hold`)).data.held === false);
  check('the same plot only once', (await add(amy.token, { kind: 'renew', plotId: lots[0].id })).data.code === 'plot_in_cart');
  check('a bad line is refused when added, with the purchase\'s own reason', (await add(amy.token, { kind: 'claim', plotId: lots[2].id, input: { ...biz('Amy Bad'), leaseDays: 45 } })).data.code === 'bad_term');
  await add(amy.token, { kind: 'claim', plotId: lots[2].id, input: biz('Amy Three', 7) });
  const fourth = await add(amy.token, { kind: 'claim', plotId: lots[3].id, input: biz('Amy Four') });
  check('at most 3 plots in a cart', fourth.status === 409 && fourth.data.code === 'too_many_plots', JSON.stringify(fourth.data).slice(0, 200));
  check('a plot line needs a plot', (await add(amy.token, { kind: 'claim', input: biz('No plot') })).data.code === 'bad_plot');
  check('an unknown kind is refused', (await add(amy.token, { kind: 'gold', input: {} })).data.code === 'bad_kind');

  // ---- Pro in the cart: the plot lines get the Pro discount at once
  const pro = await add(amy.token, { kind: 'pro', business: prof.slug });
  const lines = pro.data.cart.items;
  const pro0 = cents(leaseQuote(lots[0], null, 'shop', 14, { pro: true }).total);
  check('with Pro in the cart the plots cost 15% less, shown as a discount', lines[0].cents === pro0 && lines[0].discountCents === full0 - pro0 && pro.data.cart.discountCents > 0 && pro.data.cart.subtotalCents === pro.data.cart.totalCents + pro.data.cart.discountCents, JSON.stringify(lines[0]));
  check('Pro is in the cart at the catalogue price', lines.at(-1).kind === 'pro' && lines.at(-1).cents === PRODUCTS.pro.cents && lines.at(-1).business.slug === prof.slug);
  check('Pro only once', (await add(amy.token, { kind: 'pro', business: prof.slug })).data.code === 'pro_in_cart');
  check('only for your own business', (await add(bob.token, { kind: 'launch', business: prof.slug })).status === 403);
  await add(amy.token, { kind: 'launch', business: prof.slug });
  check('the same business product only once', (await add(amy.token, { kind: 'launch', business: prof.slug })).data.code === 'already_in_cart');
  await add(amy.token, { kind: 'sponsored', business: prof.slug, placement: 'category:food' });
  const next = addWeeks(weekStartOf(), 1);
  const stall = (await call('GET', `/market/SD-0004/${next}`)).data.stalls[0];
  const booking = { siteCode: 'SD-0004', week: next, stallId: stall.id, hours: 24, start: weekWindow(next).start + 2 * DAY, brand: 'Amy Bakes', product: 'Bread' };
  const st = await add(amy.token, { kind: 'stall', input: booking });
  check('a market stall goes in at its price', st.status === 200 && st.data.cart.items.at(-1).cents === stall.cents && st.data.cart.items.at(-1).kind === 'stall', JSON.stringify(st.data).slice(0, 200));
  const removed = await call('DELETE', `/cart/items/${pro.data.added}`, { token: amy.token });
  check('taking Pro out puts the plots back at their full price', removed.data.items[0].cents === full0 && removed.data.discountCents === 0);
  const pro2 = await add(amy.token, { kind: 'pro', business: prof.slug });
  const before = pro2.data.cart;
  check('the cart: 7 lines, 3 of them plots, the total and the fee saved', before.count === 7 && before.plots === 3 && before.totalCents === before.items.reduce((a, i) => a + i.cents, 0) && before.feeSavedCents === 6 * CART.feeCents && before.ready);

  // ---- one unavailable line blocks the checkout, with the reason; nothing is held
  const held = await call('POST', `/plots/${lots[2].id}/hold`, { token: bob.token, body: {} }); // Bob is setting the third plot up (economy.mjs)
  const blocked = await call('POST', '/cart/checkout', { token: amy.token });
  fits('a checkout refused', types.CART_CHECKOUT_REFUSED, blocked.data);
  check('a plot someone else holds stops the checkout and says which line and why', held.status === 200 && blocked.status === 409 && blocked.data.code === 'cart_unavailable' && blocked.data.problems.length === 1 && blocked.data.problems[0].code === 'held' && /Amy Three/.test(blocked.data.problems[0].label), JSON.stringify(blocked.data).slice(0, 300));
  check('...and nothing is held or ordered', api.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE account_id = ?').get(amy.account.id).n === 0 && api.db.prepare("SELECT COUNT(*) AS n FROM market_bookings WHERE account_id = ?").get(amy.account.id).n === 0 && S.sessions.size === 0);
  check('...and the refused line is a failed step of the plot economy', api.db.prepare("SELECT COUNT(*) AS n FROM plot_intents WHERE plot_id = ? AND account_id = ? AND step = 'failed'").get(lots[2].id, amy.account.id).n === 1);
  await call('DELETE', `/plots/${lots[2].id}/hold`, { token: bob.token });

  // ---- checkout: one subscription-mode session, Pro recurring, the rest one-time; every line held
  const co = await call('POST', '/cart/checkout', { token: amy.token });
  fits('a checkout', types.CART_CHECKOUT_RESULT, co.data);
  const parentId = co.data.checkout?.orderId;
  const kids = childrenOf(parentId);
  const s1 = sessionOf(parentId);
  const item = (i, k) => s1?.params[`line_items[${i}][${k}]`];
  check('checkout opens one Stripe session for the whole cart', co.status === 200 && co.data.checkout.mode === 'subscription' && s1.params.mode === 'subscription' && order(parentId).product === 'cart' && order(parentId).cents === before.totalCents && co.data.checkout.cents === before.totalCents, JSON.stringify(co.data).slice(0, 300));
  check('a line per item, each at the line\'s price, adding up to the total', kids.length === 7 && kids.every((k, i) => item(i, 'price_data][unit_amount') === String(k.cents) && item(i, 'quantity') === '1') && kids.reduce((a, k) => a + k.cents, 0) === order(parentId).cents);
  const proIndex = kids.findIndex((k) => k.product === 'pro');
  check('Pro is the recurring line, the others one-time', item(proIndex, 'price_data][recurring][interval') === 'month' && kids.every((k, i) => i === proIndex || item(i, 'price_data][recurring][interval') === undefined), JSON.stringify(s1.params).slice(0, 400));
  check('the subscription carries the cart\'s order', s1.params['subscription_data[metadata][order]'] === String(parentId) && s1.params.client_reference_id === String(parentId) && s1.params.success_url === `https://voxel.test/cart?paid=${parentId}`);
  check('the lines are the orders a single purchase makes', JSON.stringify(kids.map((k) => k.product)) === JSON.stringify(['lease', 'lease', 'lease', 'launch', 'sponsored', 'market', 'pro']) && kids.filter((k) => k.product === 'lease').every((k) => JSON.parse(k.request).pro === true));
  check('every line is held: the plots, the stall and the sponsored slot', (await call('POST', `/plots/${lots[0].id}/claim`, { token: bob.token, body: biz('Bob') })).data.code === 'held' && (await call('POST', `/plots/${lots[1].id}/hold`, { token: bob.token, body: {} })).data.code === 'held' && (await call('POST', '/market/book', { token: bob.token, body: { ...booking, brand: 'Bob' } })).status === 409 && (await call('GET', '/billing/availability?placement=category:food')).data.free === PLACEMENTS.category.slots - 1);
  const steps = api.db.prepare("SELECT plot_id, price_cents, term_days FROM plot_intents WHERE account_id = ? AND step = 'checkout' ORDER BY plot_id").all(amy.account.id);
  check('each plot line is a checkout step of the plot economy, at its price and term', steps.length === 3 && steps.some((s) => s.plot_id === lots[0].id && s.price_cents === pro0 && s.term_days === 14), JSON.stringify(steps));
  check('the cart shows the checkout in progress', (await cartOf(amy.token)).pending?.orderId === parentId);

  // ---- an expired checkout lets everything go, and keeps the cart
  await send(event('checkout.session.expired', { id: s1.id, object: 'checkout.session', status: 'expired', client_reference_id: String(parentId) }));
  check('expired: the cart and every line expire, the holds are let go', order(parentId).status === 'expired' && childrenOf(parentId).every((k) => k.status === 'expired' && k.hold_until == null) && api.db.prepare("SELECT status FROM market_bookings WHERE id = ?").get(Number(kids.find((k) => k.product === 'market').target.split(':')[1])).status === 'cancelled' && (await call('GET', '/billing/availability?placement=category:food')).data.free === PLACEMENTS.category.slots);
  check('...and the cart is kept', (await cartOf(amy.token)).count === 7);

  // ---- paid: line by line; a line that can no longer be done is refunded on its own
  const co2 = (await call('POST', '/cart/checkout', { token: amy.token })).data.checkout;
  const kids2 = childrenOf(co2.orderId);
  const lot2Line = kids2.find((k) => k.target === `plot:${lots[1].id}`);
  api.db.prepare('UPDATE orders SET hold_until = 0 WHERE id = ?').run(lot2Line.id); // Amy took too long: the hold on the second plot ran out...
  const bobs = (await call('POST', `/plots/${lots[1].id}/claim`, { token: bob.token, body: biz('Bob Bikes') })).data.checkout.orderId; // ...and Bob paid for it
  Object.assign(sessionOf(bobs), { status: 'complete', payment_status: 'paid', payment_intent: `pi_${bobs}` });
  await send(event('checkout.session.completed', { id: sessionOf(bobs).id, object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: String(bobs), payment_intent: `pi_${bobs}` }));
  const s2 = sessionOf(co2.orderId);
  Object.assign(s2, { status: 'complete', payment_status: 'paid', subscription: 'sub_amy', invoice: 'in_amy', payment_intent: null });
  S.invoices.set('in_amy', { id: 'in_amy', payment_intent: 'pi_amy_cart' });
  S.subs.set('sub_amy', { id: 'sub_amy', status: 'active', pi: 'pi_amy_cart' });
  const paidEvent = event('checkout.session.completed', { id: s2.id, object: 'checkout.session', mode: 'subscription', status: 'complete', payment_status: 'paid', client_reference_id: String(co2.orderId), subscription: 'sub_amy', invoice: 'in_amy', payment_intent: null, metadata: { order: String(co2.orderId) } });
  const refundsBefore = S.refunds.length;
  const w1 = await send(paidEvent);
  const after = childrenOf(co2.orderId);
  check('paid: the plots that are still free are Amy\'s, at the Pro price', w1.received && (await plot(lots[0].id)).title === 'Amy One' && (await plot(lots[2].id)).title === 'Amy Three' && api.db.prepare("SELECT price FROM ledger WHERE plot_id = ? AND kind = 'claim'").get(lots[0].id).price * 100 === pro0);
  check('the plot Bob got first is refunded on its own, for that line\'s amount', (await plot(lots[1].id)).title === 'Bob Bikes' && after.find((k) => k.id === lot2Line.id).status === 'refunded' && S.refunds.length === refundsBefore + 1 && S.refunds.at(-1).payment_intent === 'pi_amy_cart' && S.refunds.at(-1).amount === String(lot2Line.cents), JSON.stringify(S.refunds.at(-1)));
  const ents = api.db.prepare('SELECT kind, placement FROM entitlements WHERE business_id = ? ORDER BY id').all(bizId(prof.slug));
  check('the rest goes through: Pro, the Launch Pack, the sponsored week, the stall', JSON.stringify(ents.map((e) => e.kind).sort()) === JSON.stringify(['launch', 'pro', 'sponsored']) && (await call('GET', '/market/mine', { token: amy.token })).data.bookings.length === 1 && after.filter((k) => k.id !== lot2Line.id).every((k) => k.status === 'paid'));
  check('the Pro line keeps its subscription', after.find((k) => k.product === 'pro').stripe_subscription === 'sub_amy' && (await call('GET', '/me', { token: amy.token })).data.account.pro === true);
  check('the cart is emptied, the cart\'s own order is paid', (await cartOf(amy.token)).count === 0 && order(co2.orderId).status === 'paid');

  // ---- webhooks are applied once
  const again = await send(paidEvent);
  const sameAgain = await send(event('checkout.session.completed', JSON.parse(paidEvent).data.object));
  check('the same event twice is applied once; a second event for a paid cart changes nothing', again.duplicate === true && sameAgain.duplicate === false && S.refunds.length === refundsBefore + 1 && api.db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE plot_id IN (?, ?) AND kind = 'claim'").get(lots[0].id, lots[2].id).n === 2 && api.db.prepare('SELECT COUNT(*) AS n FROM entitlements WHERE business_id = ?').get(bizId(prof.slug)).n === 3);
  const periodEnd = Math.floor((Date.now() + 32 * DAY) / 1000);
  await send(event('invoice.paid', { id: 'in_amy', subscription: 'sub_amy', payment_intent: 'pi_amy_cart', lines: { data: [{ period: { start: Math.floor(Date.now() / 1000), end: periodEnd } }] }, subscription_details: { metadata: { order: String(co2.orderId) } } }));
  const proLine = after.find((k) => k.product === 'pro');
  check('the first invoice sets Pro\'s period and is not a renewal', api.db.prepare('SELECT ends_at FROM entitlements WHERE order_id = ?').get(proLine.id).ends_at === periodEnd * 1000 && order(proLine.id).renewals === 0);
  await send(event('invoice.paid', { id: 'in_amy2', subscription: 'sub_amy', payment_intent: 'pi_amy_m2', lines: { data: [{ period: { start: periodEnd, end: periodEnd + 30 * 86400 } }] }, subscription_details: { metadata: { order: String(co2.orderId) } } }));
  check('a later month extends the cart\'s Pro and counts as a renewal', order(proLine.id).renewals === 1 && api.db.prepare('SELECT ends_at FROM entitlements WHERE order_id = ?').get(proLine.id).ends_at === (periodEnd + 30 * 86400) * 1000);

  // ---- the order lists and refunds, line by line
  const mine = (await call('GET', '/me/orders', { token: amy.token })).data.orders;
  check('the order list shows the cart and each line under it', mine.some((o) => o.id === co2.orderId && o.product === 'cart') && mine.filter((o) => o.parentId === co2.orderId).length === 7);
  check('admins see the lines too', (await call('GET', '/admin/billing/orders', { token: ADMIN })).data.orders.filter((o) => o.parentId === co2.orderId).length === 7);
  const refundPro = await call('POST', `/admin/billing/orders/${proLine.id}/refund`, { token: ADMIN });
  check('refunding the Pro line cancels the plan and refunds Pro\'s amount only', refundPro.data.refunded && S.subs.get('sub_amy').status === 'canceled' && S.refunds.at(-1).amount === String(PRODUCTS.pro.cents) && order(proLine.id).status === 'refunded', JSON.stringify(S.refunds.at(-1)));
  check('...and the plots keep the Pro price they were bought at', (await plot(lots[0].id)).title === 'Amy One' && api.db.prepare("SELECT price FROM ledger WHERE plot_id = ? AND kind = 'claim'").get(lots[0].id).price * 100 === pro0 && order(co2.orderId).status === 'paid');

  // ---- a cart without Pro: one payment, and the $4 minimum
  const cheap = lots.slice(9).find((l) => cents(leaseQuote(l, null, 'shop', 7).total) < CART.minimumCents);
  await add(dan.token, { kind: 'claim', plotId: cheap.id, input: biz('Dan One', 7) });
  const small = await call('POST', '/cart/checkout', { token: dan.token });
  const danCents = cents(leaseQuote(cheap, null, 'shop', 7).total);
  check('under $4 the checkout is refused and says what is missing', danCents < CART.minimumCents && small.status === 409 && small.data.code === 'below_minimum' && small.data.missingCents === CART.minimumCents - danCents && small.data.cart.missingCents === CART.minimumCents - danCents, JSON.stringify(small.data).slice(0, 200));
  fits('below the minimum', types.CART_CHECKOUT_REFUSED, small.data);
  check('"Buy now" on one item has no minimum', (await call('POST', `/plots/${lots[5].id}/claim`, { token: dan.token, body: biz('Dan Now', 7) })).data.checkout?.cents === cents(leaseQuote(lots[5], null, 'shop', 7).total));
  await add(dan.token, { kind: 'claim', plotId: lots[6].id, input: biz('Dan Two') });
  const dco = (await call('POST', '/cart/checkout', { token: dan.token })).data.checkout;
  check('without Pro it is one payment-mode session', dco.mode === 'payment' && sessionOf(dco.orderId).params.mode === 'payment' && sessionOf(dco.orderId).params['payment_intent_data[metadata][order]'] === String(dco.orderId));
  const dkids = childrenOf(dco.orderId);
  api.db.prepare('UPDATE plots SET claimable = 0 WHERE id = ?').run(lots[6].id); // the second plot can no longer be leased by the time the payment lands
  Object.assign(sessionOf(dco.orderId), { status: 'complete', payment_status: 'paid', payment_intent: 'pi_dan' });
  api.db.prepare('UPDATE orders SET created_at = created_at - 600000 WHERE id = ?').run(dco.orderId);
  const rec = (await call('POST', '/admin/billing/reconcile', { token: ADMIN })).data; // the webhook was lost: reconciliation finds the payment
  check('reconciliation pays a cart whose webhook was lost, line by line', rec.paid >= 1 && (await plot(cheap.id)).title === 'Dan One' && order(dkids[0].id).status === 'paid');
  check('the line that can no longer be done is refunded from the one payment, partly', order(dkids[1].id).status === 'refunded' && S.refunds.at(-1).payment_intent === 'pi_dan' && S.refunds.at(-1).amount === String(dkids[1].cents) && order(dco.orderId).status === 'paid');
  api.db.prepare('UPDATE plots SET claimable = 1 WHERE id = ?').run(lots[6].id);
  check('refunding the whole cart refunds the lines still paid', (await call('POST', `/admin/billing/orders/${dco.orderId}/refund`, { token: ADMIN })).data.refunded && order(dkids[0].id).status === 'refunded' && order(dco.orderId).status === 'refunded' && (await plot(cheap.id)).lease.state === 'open');

  // ---- a price that changed between adding and checkout is shown before paying
  const cprof = (await call('POST', '/businesses', { token: cara.token, body: { name: 'Cara Bakes', category: 'food', district: 'creator', website: 'https://cara.test', description: 'Sourdough, rye and buns, baked every morning before seven.' } })).data;
  await add(cara.token, { kind: 'claim', plotId: lots[7].id, input: biz('Cara One') });
  await add(cara.token, { kind: 'claim', plotId: lots[8].id, input: biz('Cara Two') });
  const shown = (await cartOf(cara.token)).totalCents;
  await call('POST', `/admin/billing/grant/${cprof.slug}`, { token: ADMIN, body: { product: 'pro', days: 30, reason: 'test' } }); // Cara got Pro: her plots now cost less
  const changed = await call('POST', '/cart/checkout', { token: cara.token });
  fits('a price change', types.CART_CHECKOUT_REFUSED, changed.data);
  check('the checkout stops once and the cart shows the new price beside the old', changed.status === 409 && changed.data.code === 'price_changed' && changed.data.changed.length === 2 && changed.data.cart.totalCents < shown && changed.data.cart.items.every((i) => i.previousCents > i.cents) && api.db.prepare("SELECT COUNT(*) AS n FROM orders WHERE account_id = ? AND product = 'cart'").get(cara.account.id).n === 0, JSON.stringify(changed.data).slice(0, 300));
  const cco = await call('POST', '/cart/checkout', { token: cara.token });
  check('checking out again charges the new price', cco.data.checkout?.cents === changed.data.cart.totalCents && (await cartOf(cara.token)).items.every((i) => i.previousCents === null));
  const cco2 = await call('POST', '/cart/checkout', { token: cara.token });
  check('a second checkout replaces the first: its holds are let go and its Stripe page closed', cco2.data.checkout?.orderId > cco.data.checkout.orderId && order(cco.data.checkout.orderId).status === 'expired' && S.expired.includes(sessionOf(cco.data.checkout.orderId).id) && childrenOf(cco2.data.checkout.orderId).every((k) => k.status === 'pending'));

  // ---- removing and emptying
  check('removing a line that is not yours is refused', (await call('DELETE', `/cart/items/${(await cartOf(cara.token)).items[0].id}`, { token: dan.token })).status === 404);
  const cleared = await call('DELETE', '/cart', { token: cara.token });
  fits('an emptied cart', types.CART_VIEW, cleared.data);
  check('DELETE /cart empties it', cleared.data.count === 0);
  check('checking out an empty cart is refused', (await call('POST', '/cart/checkout', { token: cara.token })).data.code === 'empty_cart');
  check('the audit chain is intact', (await call('GET', '/admin/audit/verify', { token: ADMIN })).data.ok === true);

  // ---- without payments: the game's lines are done at once, the business products cannot be bought
  const off = await start({ ADMIN_TOKEN: ADMIN });
  const eve = await signup('Eve', off.call);
  const eprof = (await off.call('POST', '/businesses', { token: eve.token, body: { name: 'Eve Books', category: 'retail', website: 'https://eve.test' } })).data;
  const offPro = await off.call('POST', '/cart/items', { token: eve.token, body: { kind: 'pro', business: eprof.slug } });
  check('without payments the business products cannot go in the cart (503, as their own checkout)', offPro.status === 503 && offPro.data.code === 'billing_off');
  await off.call('POST', '/cart/items', { token: eve.token, body: { kind: 'claim', plotId: lots[0].id, input: biz('Eve One') } });
  await off.call('POST', '/cart/items', { token: eve.token, body: { kind: 'claim', plotId: lots[1].id, input: biz('Eve Two') } });
  const offCart = (await off.call('GET', '/cart', { token: eve.token })).data;
  const offDone = await off.call('POST', '/cart/checkout', { token: eve.token });
  fits('a checkout without payments', types.CART_CHECKOUT_RESULT, offDone.data);
  check('without payments the checkout does every line at once and empties the cart', offCart.payments === false && offDone.status === 200 && offDone.data.done.length === 2 && (await off.call('GET', `/plots/${lots[0].id}`)).data.title === 'Eve One' && (await off.call('GET', `/plots/${lots[1].id}`)).data.title === 'Eve Two' && offDone.data.cart.count === 0, JSON.stringify(offDone.data).slice(0, 200));
  check('...written to the ledger and the audit trail, and as claims in the plot economy', off.api.db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'claim'").get().n === 2 && off.api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'plot.claim'").get().n === 2 && off.api.db.prepare("SELECT COUNT(*) AS n FROM plot_intents WHERE step = 'claimed'").get().n === 2);
  await off.call('POST', '/cart/items', { token: eve.token, body: { kind: 'claim', plotId: lots[2].id, input: biz('Eve Three') } });
  off.api.db.prepare("UPDATE plots SET owner_name = 'Someone', owner_account = NULL WHERE id = ?").run(lots[2].id);
  const offBlocked = await off.call('POST', '/cart/checkout', { token: eve.token });
  check('...all or nothing: a line that cannot be done stops the checkout', offBlocked.status === 409 && offBlocked.data.problems[0].code === 'already_owned' && offBlocked.data.cart.count === 1);
  off.api.close?.();
  off.api.server.close();
} catch (e) {
  fails++;
  console.log('FAIL', e.stack);
} finally {
  api.close?.();
  api.server.close();
  stripeServer.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
