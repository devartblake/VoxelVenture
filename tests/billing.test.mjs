// Payments (server/api/billing.mjs, docs/billing.md) against a stand-in for the Stripe API: checkout at the catalogue's price, signed
// webhooks applied once, what each product grants, sponsored-spot limits, Pro renewals and cancelling, refunds, reconciliation after a
// lost webhook, what the free plan sees, and the settings check for a live key.
import http from 'node:http';
import { createApi } from '../server/api/server.mjs';
import { signPayload } from '../server/api/billing.mjs';
import { checkApiEnv } from '../server/api/config.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const DAY = 86400000;
const WHSEC = 'whsec_test_secret';

// ---- a stand-in Stripe: records what it is asked, answers like Stripe
const S = { sessions: new Map(), subs: new Map(), refunds: [], calls: [], n: 0, badAuth: 0 };
const stripeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(req.method === 'GET' ? url.search : body));
    S.calls.push({ method: req.method, path: url.pathname, params, idem: req.headers['idempotency-key'] });
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    if (req.headers.authorization !== 'Bearer sk_test_123') return (S.badAuth++, reply(401, { error: { message: 'bad key' } }));
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const id = `cs_test_${++S.n}`;
      S.sessions.set(id, { id, status: 'open', payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id, params });
      return reply(200, { id, url: `https://checkout.stripe.test/${id}` });
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return reply(200, S.sessions.get(m[1]) ?? {});
    if ((m = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) {
      const sub = S.subs.get(m[1]) ?? { id: m[1], status: 'active' };
      if (req.method === 'POST') Object.assign(sub, { cancel_at_period_end: params.cancel_at_period_end === 'true' });
      if (req.method === 'DELETE') sub.status = 'canceled';
      S.subs.set(m[1], sub);
      return reply(200, sub);
    }
    if (url.pathname === '/v1/invoices') return reply(200, { data: [{ payment_intent: `pi_for_${params.subscription}` }] });
    if (url.pathname === '/v1/refunds') return (S.refunds.push(params), reply(200, { id: `re_${S.refunds.length}`, status: 'succeeded' }));
    return reply(404, { error: { message: 'unknown' } });
  });
});
await new Promise((r) => stripeServer.listen(0, r));
const STRIPE = `http://localhost:${stripeServer.address().port}`;

const env = { ADMIN_TOKEN: 'admin', STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_URL: STRIPE, PUBLIC_SITE_URL: 'https://voxel.test', TERMS_URL: 'https://voxel.test/terms', REFUND_POLICY_URL: 'https://voxel.test/refunds' };
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { token, body, headers = {} } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
};
const signup = async (u) => (await call('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
let eventN = 0;
const webhook = (type, object, { id = `evt_${++eventN}`, sign = true, secret = WHSEC } = {}) => {
  const raw = JSON.stringify({ id, type, data: { object } });
  return call('POST', '/billing/webhook', { body: raw, headers: sign ? { 'Stripe-Signature': signPayload(raw, secret) } : {} });
};
const sessionOf = (orderId) => [...S.sessions.values()].find((s) => s.client_reference_id === String(orderId));
const completed = (orderId, extra = {}) => {
  const s = sessionOf(orderId);
  Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: `pi_${orderId}`, ...extra });
  return { id: s.id, object: 'checkout.session', mode: s.mode, status: 'complete', payment_status: 'paid', client_reference_id: String(orderId), payment_intent: s.mode === 'payment' ? `pi_${orderId}` : null, subscription: s.mode === 'subscription' ? `sub_${orderId}` : null, metadata: { order: String(orderId) } };
};

try {
  const amy = await signup('Amy');
  const bob = await signup('Bob');
  await call('POST', '/businesses', { token: amy.token, body: { name: 'Amy Cafe', category: 'food', district: 'creator', website: 'https://amy.test', description: 'Coffee and cake all day, by the river in Creator Commons.' } });
  await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Builds', category: 'services', website: 'https://bob.test' } });
  check('billing reports it is on', (await call('GET', '/billing/config')).data.enabled === true);

  // ---- checkout
  check('checkout needs the owner', (await call('POST', '/businesses/amy-cafe/checkout', { body: { product: 'launch' } })).status === 401 && (await call('POST', '/businesses/amy-cafe/checkout', { token: bob.token, body: { product: 'launch' } })).status === 403);
  check('an unknown product or placement is refused', (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'gold' } })).status === 400 && (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'sponsored', placement: 'category:casino' } })).status === 400);
  const launch = await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'launch', cents: 1, price: 1 } });
  const ls = sessionOf(launch.data.orderId);
  check('checkout returns Stripe\'s page and charges the catalogue price, whatever the browser sends', launch.status === 200 && launch.data.url.startsWith('https://checkout.stripe.test/') && ls.params['line_items[0][price_data][unit_amount]'] === '900' && ls.params.mode === 'payment', JSON.stringify(ls?.params).slice(0, 200));
  check('the session carries the order, return addresses, the terms and an idempotency key', ls.params.client_reference_id === String(launch.data.orderId) && ls.params.success_url === `https://voxel.test/business/manage?paid=${launch.data.orderId}` && /terms \(https:\/\/voxel\.test\/terms\) and the refund policy/.test(ls.params['custom_text[submit][message]']) && S.calls.find((c) => c.path === '/v1/checkout/sessions').idem === `vv-order-${launch.data.orderId}`);
  check('a pending order grants nothing', (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].plan.launch === false && (await call('GET', '/me/orders', { token: amy.token })).data.orders[0].status === 'pending');

  // ---- the webhook
  check('an unsigned or wrongly signed webhook is refused', (await webhook('checkout.session.completed', completed(launch.data.orderId), { sign: false })).status === 400 && (await webhook('checkout.session.completed', completed(launch.data.orderId), { secret: 'whsec_wrong' })).status === 400);
  check('(and granted nothing)', (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].plan.launch === false);
  const paid = await webhook('checkout.session.completed', completed(launch.data.orderId), { id: 'evt_launch' });
  const again = await webhook('checkout.session.completed', completed(launch.data.orderId), { id: 'evt_launch' });
  const me = (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0];
  check('a signed webhook marks the order paid and starts the launch week', paid.status === 200 && me.plan.launch === true && me.plan.launchUntil > Date.now() + 6.9 * DAY && (await call('GET', `/me/orders/${launch.data.orderId}`, { token: amy.token })).data.status === 'paid');
  check('the same event delivered twice is applied once', again.data.duplicate === true && api.db.prepare('SELECT COUNT(*) AS n FROM entitlements').get().n === 1);
  check('the public page shows the Launch badge and Discover lists it as new this week', (await call('GET', '/businesses/amy-cafe')).data.launch === true && (await call('GET', '/businesses/featured?placement=discover')).data.launches.map((b) => b.slug).join() === 'amy-cafe');
  check('the featured list carries public profile fields only', !('account_id' in (await call('GET', '/businesses/featured?placement=discover')).data.launches[0]));
  check('the launch summary counts the week', me.launchSummary?.running === true && me.launchSummary.views === 0);
  check('the Launch prompt is not offered again during the launch', !me.prompts.some((p) => p.plan.id === 'launch'));
  check('payment is in the audit trail', (await call('GET', '/admin/audit?action=billing.paid', { token: 'admin' })).data.entries.length === 1);

  // ---- free plan versus Pro
  check('the free plan sees totals, not sources, campaigns or the daily chart', me.stats.views === 0 && me.stats.sources === undefined && me.stats.campaigns === undefined && me.stats.days === undefined && me.stats.pro === false);
  check('CSV export needs Pro', (await call('GET', '/businesses/amy-cafe/export.csv', { token: amy.token })).status === 402);
  const pro = await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'pro' } });
  const ps = sessionOf(pro.data.orderId);
  check('Pro is a monthly subscription at $19', ps.params.mode === 'subscription' && ps.params['line_items[0][price_data][unit_amount]'] === '1900' && ps.params['line_items[0][price_data][recurring][interval]'] === 'month' && ps.params['subscription_data[metadata][order]'] === String(pro.data.orderId));
  // Stripe may send the first invoice before the checkout event
  const periodEnd = Math.floor((Date.now() + 30 * DAY) / 1000);
  await webhook('invoice.paid', { object: 'invoice', subscription: `sub_${pro.data.orderId}`, subscription_details: { metadata: { order: String(pro.data.orderId) } }, payment_intent: 'pi_inv1', lines: { data: [{ period: { end: periodEnd } }] } });
  await webhook('checkout.session.completed', completed(pro.data.orderId));
  const withPro = (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0];
  check('Pro runs to the end of the paid period, whichever event comes first', withPro.plan.pro && Math.abs(withPro.plan.proUntil - periodEnd * 1000) < 1000);
  check('Pro sees sources, campaigns and the daily chart', Array.isArray(withPro.stats.sources) && Array.isArray(withPro.stats.campaigns) && withPro.stats.days.length === 30);
  const csv = await call('GET', '/businesses/amy-cafe/export.csv', { token: amy.token });
  check('Pro downloads its figures as CSV', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type')) && /attachment; filename="amy-cafe-figures.csv"/.test(csv.headers.get('content-disposition')) && csv.data.startsWith('"Date","Verified views"'));
  check('Pro cannot be bought twice', (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'pro' } })).status === 409);
  const nextEnd = periodEnd + 30 * 86400;
  await webhook('invoice.paid', { object: 'invoice', subscription: `sub_${pro.data.orderId}`, lines: { data: [{ period: { end: nextEnd } }] } });
  check('each paid month extends Pro', (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].plan.proUntil === nextEnd * 1000);
  const cancel = await call('POST', '/businesses/amy-cafe/pro/cancel', { token: amy.token });
  check('cancelling asks Stripe to stop at the period end; Pro runs until then', cancel.data.cancelled && S.subs.get(`sub_${pro.data.orderId}`).cancel_at_period_end === true && (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].plan.pro === true);
  await webhook('customer.subscription.deleted', { object: 'subscription', id: `sub_${pro.data.orderId}`, metadata: { order: String(pro.data.orderId) } });
  check('when Stripe ends the subscription, Pro ends', (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].plan.pro === false);

  // ---- sponsored placements
  const spot = 'category:food';
  check('a placement shows its free slots', (await call('GET', `/billing/availability?placement=${spot}`)).data.free === 3 && (await call('GET', `/billing/availability?placement=${spot}`)).data.cents === 2900);
  const owners = [];
  for (let i = 0; i < 3; i++) {
    const o = await signup(`Owner${i}`);
    await call('POST', '/businesses', { token: o.token, body: { name: `Food Place ${i}`, category: 'food', website: 'https://f.test' } });
    owners.push({ ...o, slug: `food-place-${i}` });
  }
  const orders = [];
  for (const o of owners) orders.push((await call('POST', `/businesses/${o.slug}/checkout`, { token: o.token, body: { product: 'sponsored', placement: spot } })).data.orderId);
  check('checkouts in progress hold the spot: the fourth is refused while three are held', (await call('POST', '/businesses/amy-cafe/checkout', { token: amy.token, body: { product: 'sponsored', placement: spot } })).status === 409 && (await call('GET', `/billing/availability?placement=${spot}`)).data.free === 0);
  await webhook('checkout.session.completed', completed(orders[0]));
  await webhook('checkout.session.expired', { object: 'checkout.session', client_reference_id: String(orders[1]), metadata: { order: String(orders[1]) } });
  check('an expired checkout frees its spot', (await call('GET', `/billing/availability?placement=${spot}`)).data.free === 1);
  const page = (await call('GET', `/businesses/featured?placement=${spot}`)).data;
  check('the category page lists the paid placement as sponsored', page.sponsored.map((b) => b.slug).join() === 'food-place-0' && page.launches.length === 0);
  check('the placement is $29 a week', sessionOf(orders[0]).params['line_items[0][price_data][unit_amount]'] === '2900');

  // ---- refunds
  const refund = await call('POST', `/admin/billing/orders/${orders[0]}/refund`, { token: 'admin' });
  check('an admin refund goes to Stripe once and takes the placement down', refund.data.refunded && S.refunds.at(-1).payment_intent === `pi_${orders[0]}` && S.calls.filter((c) => c.path === '/v1/refunds').at(-1).idem === `vv-refund-${orders[0]}` && (await call('GET', `/businesses/featured?placement=${spot}`)).data.sponsored.length === 0);
  check('refunds are admin-only and recorded', (await call('POST', `/admin/billing/orders/${orders[0]}/refund`, { token: amy.token })).status === 403 && (await call('GET', '/admin/audit?action=billing.refunded', { token: 'admin' })).data.entries.length === 1);
  await webhook('charge.refunded', { object: 'charge', payment_intent: `pi_${launch.data.orderId}`, amount: 900, amount_refunded: 900 });
  check('a refund made in the Stripe dashboard ends the Launch Pack too', (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].plan.launch === false);
  await webhook('checkout.session.completed', completed(launch.data.orderId), { id: 'evt_late_retry' });
  check('a late retry of the payment event does not bring a refunded order back', (await call('GET', `/me/orders/${launch.data.orderId}`, { token: amy.token })).data.status === 'refunded');

  // ---- reconciliation: the webhook never arrived
  const lost = (await call('POST', '/businesses/bob-builds/checkout', { token: bob.token, body: { product: 'launch' } })).data.orderId;
  completed(lost); // paid at Stripe, but no webhook reaches us
  api.db.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(Date.now() - 10 * 60000, lost);
  const rec = await call('POST', '/admin/billing/reconcile', { token: 'admin' });
  check('reconciliation finds a payment whose webhook was lost and grants it', rec.data.paid >= 1 && (await call('GET', '/me/businesses', { token: bob.token })).data.profiles[0].plan.launch === true, JSON.stringify(rec.data));
  check('Stripe was always called with the secret key', S.badAuth === 0);

  // ---- settings
  const live = { ADMIN_TOKEN: 'a'.repeat(40), IP_SALT: 'b'.repeat(40), MP_NOTIFY_SECRET: 'c'.repeat(40), REFERRAL_SECRET: 'd'.repeat(40), API_ORIGIN: 'https://voxel.test', PUBLIC_API_URL: 'https://api.voxel.test', API_DB: '/srv/db', STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' };
  check('a live Stripe key needs the terms and refund policy addresses', checkApiEnv(live).errors.some((e) => /TERMS_URL and REFUND_POLICY_URL/.test(e)) && !checkApiEnv({ ...live, TERMS_URL: 'https://v.test/t', REFUND_POLICY_URL: 'https://v.test/r' }).errors.length);
  check('a Stripe key without the webhook secret is refused', checkApiEnv({ ...live, STRIPE_WEBHOOK_SECRET: '' }).errors.some((e) => /STRIPE_WEBHOOK_SECRET/.test(e)));
} catch (e) {
  fails++;
  console.log('FAIL threw', e);
} finally {
  await api.close();
  stripeServer.close();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
