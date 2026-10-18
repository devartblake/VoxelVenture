// Payments in the game (services/api/billing.mjs, docs/monetization/billing.md), against a stand-in for the Stripe API: with payments on, claiming, taking
// over and renewing a plot, and booking a market stall, send the player to Stripe and only happen once the payment is confirmed. The plot or
// stall is held while they pay; a payment that arrives too late is refunded; refunds take back what was bought; cancelling a paid stall
// before it opens refunds it.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { signPayload } from '../services/api/billing.mjs';
import { imp } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const DAY = 86400000;
const WHSEC = 'whsec_game';
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
      const id = `cs_game_${++S.n}`;
      S.sessions.set(id, { id, status: 'open', payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id, params });
      return reply(200, { id, url: `https://checkout.stripe.test/${id}` });
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return reply(200, S.sessions.get(m[1]) ?? {});
    if (url.pathname === '/v1/refunds') return (S.refunds.push(params), reply(200, { id: `re_${S.refunds.length}`, status: 'succeeded' }));
    return reply(404, { error: { message: 'unknown' } });
  });
});
await new Promise((r) => stripeServer.listen(0, r));

const env = { ADMIN_TOKEN: ADMIN, STRIPE_SECRET_KEY: 'sk_test_game', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_URL: `http://localhost:${stripeServer.address().port}`, PUBLIC_SITE_URL: 'https://voxel.test' };
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
const webhook = (type, object) => {
  const raw = JSON.stringify({ id: `evt_g${++eventN}`, type, data: { object } });
  return fetch(`${base}/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signPayload(raw, WHSEC) }, body: raw }).then((r) => r.json());
};
const sessionOf = (orderId) => [...S.sessions.values()].find((s) => s.client_reference_id === String(orderId));
const pay = (orderId) => {
  const s = sessionOf(orderId);
  Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: `pi_${orderId}` });
  return webhook('checkout.session.completed', { id: s.id, object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: String(orderId), payment_intent: `pi_${orderId}`, metadata: { order: String(orderId) } });
};
const order = (id) => api.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
const plot = async (id) => (await call('GET', `/plots/${id}`)).data;

try {
  const { generateCity } = await imp('city/cityGenerator.js');
  const { leaseQuote, renewalQuote, takeoverQuote } = await imp('game/claimPrice.js');
  const { weekStartOf, addWeeks, weekWindow } = await imp('market/weeks.js');
  const city = generateCity(20260101);
  const [lot, lot2] = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb');
  const amy = await signup('Amy');
  const bob = await signup('Bob');
  const biz = { title: 'Amy Coffee', buildingType: 'restaurant', website: 'https://amy.test', variant: 'cafe', logo: { kind: 'generated' }, description: 'Fresh coffee all day.', leaseDays: 30 };

  // ---- claiming a plot
  // what the claim form shows for this plot, no outside chosen, 30 days (lib/game/claimPrice.js): the server must charge exactly that
  const shown = leaseQuote(lot, null, biz.buildingType, 30).total;
  const c1 = await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: biz });
  const o1 = c1.data.checkout?.orderId;
  check('a claim returns Stripe\'s page instead of claiming', c1.status === 200 && c1.data.checkout.url.startsWith('https://checkout.stripe.test/') && !(await plot(lot.id)).owner, JSON.stringify(c1.data).slice(0, 160));
  check('it charges the lease price, in cents, and comes back to the game', order(o1).cents === Math.round(shown * 100) && sessionOf(o1).params['line_items[0][price_data][unit_amount]'] === String(Math.round(shown * 100)) && sessionOf(o1).params.success_url === `https://voxel.test/?paid=${o1}`);
  check('nothing is written to the ledger yet', api.db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE plot_id = ? AND kind != \'open\'').get(lot.id).n === 0);
  check('a bad claim is refused before any payment', (await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, leaseDays: 45 } })).status === 400 && S.sessions.size === 1);
  check('the plot is held: nobody else can claim it or start paying for it', (await call('POST', `/plots/${lot.id}/claim`, { token: bob.token, body: { ...biz, title: 'Bob Bikes' } })).data.code === 'held');
  const paid1 = await pay(o1);
  const p1 = await plot(lot.id);
  check('once paid, the plot is the player\'s, with the lease they chose', paid1.received && p1.title === 'Amy Coffee' && p1.lease?.days === 30 && order(o1).status === 'paid');
  check('the claim is in the ledger and the audit trail', api.db.prepare("SELECT price FROM ledger WHERE plot_id = ? AND kind = 'claim'").get(lot.id)?.price === shown && api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'plot.claim' AND target_id = ?").get(String(lot.id)).n === 1);
  check('a second delivery changes nothing', (await pay(o1)).duplicate === false && api.db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE plot_id = ? AND kind != \'open\'').get(lot.id).n === 1);
  const mine = (await call('GET', '/me/orders', { token: amy.token })).data.orders;
  check('the order list says what was bought', mine[0].label.startsWith('Lease: Amy Coffee') && mine[0].business === null && mine[0].target === `plot:${lot.id}`);

  // ---- a payment that arrives after somebody else got the plot is refunded
  const a2 = (await call('POST', `/plots/${lot2.id}/claim`, { token: amy.token, body: { ...biz, title: 'Amy Two' } })).data.checkout.orderId;
  api.db.prepare('UPDATE orders SET hold_until = 0 WHERE id = ?').run(a2); // Amy's half hour ran out while she was paying
  const b2 = (await call('POST', `/plots/${lot2.id}/claim`, { token: bob.token, body: { ...biz, title: 'Bob Bikes' } })).data.checkout.orderId;
  await pay(b2);
  await pay(a2);
  check('the late payment is refunded, and the plot stays with whoever paid first', (await plot(lot2.id)).title === 'Bob Bikes' && order(a2).status === 'refunded' && S.refunds.at(-1).payment_intent === `pi_${a2}` && /could not be done/.test(order(a2).note));

  // ---- an abandoned checkout lets the plot go
  const lot3 = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb')[2];
  const a3 = (await call('POST', `/plots/${lot3.id}/claim`, { token: amy.token, body: { ...biz, title: 'Amy Three' } })).data.checkout.orderId;
  await webhook('checkout.session.expired', { id: sessionOf(a3).id, object: 'checkout.session', status: 'expired', client_reference_id: String(a3) });
  check('an expired checkout frees the plot for others', order(a3).status === 'expired' && (await call('POST', `/plots/${lot3.id}/claim`, { token: bob.token, body: { ...biz, title: 'Bob Three' } })).data.checkout?.orderId > 0);

  // ---- renewing
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
  const endBefore = (await plot(lot.id)).lease.end;
  const r1 = (await call('POST', `/plots/${lot.id}/renew`, { token: amy.token, body: { leaseDays: 90 } })).data.checkout;
  check('a renewal is charged at the renewal price', order(r1.orderId).cents === Math.round(renewalQuote(await plot(lot.id), 90) * 100) && order(r1.orderId).cents === Math.round(lot.price * 0.5 * 0.5 * 100) && (await plot(lot.id)).lease.end === endBefore);
  await pay(r1.orderId);
  const renewed = (await plot(lot.id)).lease;
  check('once paid, the lease runs 90 days longer', Math.abs(renewed.end - (endBefore + 90 * DAY)) < 5000 && renewed.days === 90);
  check('an admin refund of a renewal takes the 90 days back', (await call('POST', `/admin/billing/orders/${r1.orderId}/refund`, { token: ADMIN })).data.refunded && Math.abs((await plot(lot.id)).lease.end - endBefore) < 5000);

  // ---- taking over an ended lease
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'open' } });
  const t1 = await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Takes' } });
  check('a take-over is a checkout too, at 1.25x what the business is worth', t1.data.checkout?.orderId > 0 && (await plot(lot.id)).title === 'Amy Coffee' && order(t1.data.checkout.orderId).cents === Math.round(takeoverQuote(await plot(lot.id), null, biz.buildingType, 30).total * 100) && order(t1.data.checkout.orderId).cents === Math.round(lot.price * 1.25 * 0.2 * 100), String(order(t1.data.checkout.orderId)?.cents));
  await pay(t1.data.checkout.orderId);
  const taken = await plot(lot.id);
  check('once paid, the new tenant has the plot; the old one is not paid out', taken.title === 'Bob Takes' && api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'plot.takeover' AND target_id = ?").get(String(lot.id)).n === 1 && JSON.parse(api.db.prepare("SELECT detail FROM audit_log WHERE action = 'plot.takeover' ORDER BY id DESC").get().detail).paidOut === 0);
  check('an admin refund of a take-over ends that lease at once', (await call('POST', `/admin/billing/orders/${t1.data.checkout.orderId}/refund`, { token: ADMIN })).data.refunded && (await plot(lot.id)).lease.state === 'open');

  // ---- the market
  const next = addWeeks(weekStartOf(), 1);
  const w = (await call('GET', `/market/SD-0004/${next}`)).data;
  const stall = w.stalls[0];
  const start = weekWindow(next).start + 2 * DAY;
  const stallOrder = { siteCode: 'SD-0004', week: next, stallId: stall.id, hours: 24, start, brand: 'Amy Bakes', product: 'Bread' };
  const m1 = await call('POST', '/market/book', { token: amy.token, body: stallOrder });
  check('booking a stall returns Stripe\'s page, at the stall\'s price', m1.data.checkout?.url && order(m1.data.checkout.orderId).cents === stall.cents && m1.data.booking.id > 0);
  check('it is not a booking yet, but nobody else can take the stall', (await call('GET', '/market/mine', { token: amy.token })).data.bookings.length === 0 && (await call('POST', '/market/book', { token: bob.token, body: { ...stallOrder, brand: 'Bob' } })).status === 409);
  await pay(m1.data.checkout.orderId);
  const booked = (await call('GET', '/market/mine', { token: amy.token })).data.bookings;
  check('once paid, it is a booking, shown at the market', booked.length === 1 && booked[0].stallId === stall.id && (await call('GET', `/market/SD-0004/${next}`)).data.bookings.some((b) => b.id === m1.data.booking.id));
  const cancel = await call('POST', `/market/bookings/${m1.data.booking.id}/cancel`, { token: amy.token });
  check('cancelling before it opens refunds it in full and frees the stall', cancel.data.refunded === stall.cents && S.refunds.at(-1).payment_intent === `pi_${m1.data.checkout.orderId}` && order(m1.data.checkout.orderId).status === 'refunded' && (await call('GET', '/market/mine', { token: amy.token })).data.bookings.length === 0);
  const m2 = (await call('POST', '/market/book', { token: bob.token, body: { ...stallOrder, brand: 'Bob Cheese' } })).data.checkout.orderId;
  await webhook('checkout.session.expired', { id: sessionOf(m2).id, object: 'checkout.session', status: 'expired', client_reference_id: String(m2) });
  check('an abandoned stall checkout frees the stall', (await call('POST', '/market/book', { token: amy.token, body: stallOrder })).data.checkout?.orderId > 0);
  check('only the stallholder can cancel', (await call('POST', `/market/bookings/${m1.data.booking.id}/cancel`, { token: bob.token })).status === 404);

  // ---- reconciliation catches a lost webhook for a lease
  const lot4 = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb')[3];
  const a4 = (await call('POST', `/plots/${lot4.id}/claim`, { token: amy.token, body: { ...biz, title: 'Amy Four' } })).data.checkout.orderId;
  Object.assign(sessionOf(a4), { status: 'complete', payment_status: 'paid', payment_intent: `pi_${a4}` });
  api.db.prepare('UPDATE orders SET created_at = created_at - 600000 WHERE id = ?').run(a4);
  const rec = (await call('POST', '/admin/billing/reconcile', { token: ADMIN })).data;
  check('reconciliation claims a plot whose webhook was lost', rec.paid >= 1 && (await plot(lot4.id)).title === 'Amy Four');
  check('the audit chain is intact', (await call('GET', '/admin/audit/verify', { token: ADMIN })).data.ok === true);
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
