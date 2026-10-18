// The Stripe end-to-end check (scripts/stripe-e2e.mjs) against the API and a stand-in Stripe that pays, refunds, renews on a test clock and
// sends signed webhooks the way Stripe does, so the check itself is known to work before it is pointed at staging's real Stripe test mode.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { signPayload } from '../services/api/billing.mjs';
import { stripeE2E } from '../scripts/stripe-e2e.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const WHSEC = 'whsec_e2e';
const KEY = 'sk_test_e2e';
const MONTH = 30 * 86400;

// ---- a stand-in Stripe
const S = { n: 0, sessions: new Map(), subs: new Map(), pis: new Map(), clocks: new Map(), customers: new Map(), events: [] };
const id = (p) => `${p}_${++S.n}`;
let apiBase = null;
const emit = (type, object) => {
  const event = { id: id('evt'), object: 'event', type, livemode: false, data: { object } };
  S.events.unshift(event);
  setImmediate(async () => {
    const raw = JSON.stringify(event);
    await fetch(`${apiBase}/billing/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signPayload(raw, WHSEC) }, body: raw }).catch(() => null);
  });
};
const sessionView = (s) => ({ id: s.id, object: 'checkout.session', livemode: false, url: s.url, mode: s.mode, status: s.status, payment_status: s.payment_status, amount_total: s.amount_total, client_reference_id: s.client_reference_id, payment_intent: s.payment_intent ?? null, subscription: s.subscription ?? null, metadata: s.metadata });
const newPi = (amount) => {
  const pi = { id: id('pi'), amount, amount_refunded: 0 };
  S.pis.set(pi.id, pi);
  return pi;
};
// a paid month of a subscription: its invoice.paid, from the given period start
const invoicePaid = (sub, start) => {
  const pi = newPi(sub.amount);
  sub.invoices.unshift(pi.id);
  Object.assign(sub, { current_period_start: start, current_period_end: start + MONTH });
  emit('invoice.paid', { object: 'invoice', subscription: sub.id, subscription_details: { metadata: sub.metadata }, payment_intent: pi.id, lines: { data: [{ period: { start, end: start + MONTH } }] } });
};
const newSub = (customer, amount, metadata, start) => {
  const sub = { id: id('sub'), object: 'subscription', status: 'active', customer, amount, metadata, invoices: [], cancel_at_period_end: false };
  S.subs.set(sub.id, sub);
  invoicePaid(sub, start);
  return sub;
};
const stripeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(req.method === 'GET' ? url.search : body));
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    if (req.headers.authorization !== `Bearer ${KEY}`) return reply(401, { error: { message: 'bad key' } });
    const p = url.pathname;
    let m;
    if (req.method === 'POST' && p === '/v1/checkout/sessions') {
      const s = { id: `cs_test_${++S.n}`, mode: params.mode, status: 'open', payment_status: 'unpaid', amount_total: Number(params['line_items[0][price_data][unit_amount]']), client_reference_id: params.client_reference_id, metadata: { order: params['metadata[order]'] }, subMeta: { order: params['subscription_data[metadata][order]'] } };
      s.url = `https://checkout.stripe.test/c/pay/${s.id}#fid`;
      S.sessions.set(s.id, s);
      return reply(200, sessionView(s));
    }
    if ((m = p.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/))) {
      const s = S.sessions.get(m[1]);
      if (s.status !== 'open') return reply(400, { error: { message: 'not open' } });
      s.status = 'expired';
      emit('checkout.session.expired', sessionView(s));
      return reply(200, sessionView(s));
    }
    if ((m = p.match(/^\/v1\/checkout\/sessions\/([^/]+)$/))) return S.sessions.has(m[1]) ? reply(200, sessionView(S.sessions.get(m[1]))) : reply(404, { error: { message: 'no session' } });
    if (p === '/v1/events') return reply(200, { data: S.events.filter((e) => !params.type || e.type === params.type).slice(0, Number(params.limit) || 10) });
    if (req.method === 'POST' && p === '/v1/refunds') {
      const pi = S.pis.get(params.payment_intent);
      if (!pi) return reply(404, { error: { message: 'no payment' } });
      pi.amount_refunded = pi.amount;
      emit('charge.refunded', { object: 'charge', payment_intent: pi.id, amount: pi.amount, amount_refunded: pi.amount });
      return reply(200, { id: id('re'), status: 'succeeded' });
    }
    if (p === '/v1/invoices') return reply(200, { data: (S.subs.get(params.subscription)?.invoices ?? []).slice(0, 1).map((pi) => ({ payment_intent: pi })) });
    if ((m = p.match(/^\/v1\/payment_intents\/([^/]+)$/))) {
      const pi = S.pis.get(m[1]);
      return reply(200, { id: pi.id, latest_charge: { amount: pi.amount, amount_refunded: pi.amount_refunded } });
    }
    if (req.method === 'POST' && p === '/v1/test_helpers/test_clocks') {
      const c = { id: id('clock'), status: 'ready', frozen_time: Number(params.frozen_time) };
      S.clocks.set(c.id, c);
      return reply(200, c);
    }
    if ((m = p.match(/^\/v1\/test_helpers\/test_clocks\/([^/]+)\/advance$/))) {
      const c = S.clocks.get(m[1]);
      c.frozen_time = Number(params.frozen_time);
      for (const sub of S.subs.values()) {
        if (S.customers.get(sub.customer)?.test_clock !== c.id || sub.status !== 'active') continue;
        while (sub.current_period_end <= c.frozen_time) invoicePaid(sub, sub.current_period_end);
      }
      return reply(200, c);
    }
    if ((m = p.match(/^\/v1\/test_helpers\/test_clocks\/([^/]+)$/))) {
      const c = S.clocks.get(m[1]);
      if (req.method === 'DELETE') {
        for (const sub of S.subs.values()) if (S.customers.get(sub.customer)?.test_clock === c.id && sub.status !== 'canceled') (sub.status = 'canceled', emit('customer.subscription.deleted', { id: sub.id, object: 'subscription', metadata: sub.metadata }));
        S.clocks.delete(c.id);
        return reply(200, { id: c.id, deleted: true });
      }
      return reply(200, c);
    }
    if (req.method === 'POST' && p === '/v1/products') return reply(200, { id: id('prod'), name: params.name });
    if (req.method === 'POST' && p === '/v1/customers') {
      const c = { id: id('cus'), test_clock: params.test_clock ?? null };
      S.customers.set(c.id, c);
      return reply(200, c);
    }
    if (req.method === 'POST' && p === '/v1/subscriptions') {
      const clock = S.clocks.get(S.customers.get(params.customer)?.test_clock);
      return reply(200, newSub(params.customer, Number(params['items[0][price_data][unit_amount]']), { order: params['metadata[order]'] }, clock?.frozen_time ?? Math.floor(Date.now() / 1000)));
    }
    if ((m = p.match(/^\/v1\/subscriptions\/([^/]+)$/))) {
      const sub = S.subs.get(m[1]);
      if (req.method === 'POST' && params.cancel_at_period_end) sub.cancel_at_period_end = params.cancel_at_period_end === 'true';
      if (req.method === 'DELETE') (sub.status = 'canceled', emit('customer.subscription.deleted', { id: sub.id, object: 'subscription', metadata: sub.metadata }));
      return reply(200, sub);
    }
    return reply(404, { error: { message: `unknown ${req.method} ${p}` } });
  });
});
await new Promise((r) => stripeServer.listen(0, r));

// paying on Stripe's page: the session completes, and Stripe sends its webhooks (for Pro, the first invoice first, as it may)
const pay = async (url) => {
  const s = S.sessions.get(url.match(/cs_test_\d+/)[0]);
  Object.assign(s, { status: 'complete', payment_status: 'paid' });
  if (s.mode === 'payment') s.payment_intent = newPi(s.amount_total).id;
  else s.subscription = newSub(id('cus'), s.amount_total, s.subMeta, Math.floor(Date.now() / 1000)).id;
  emit('checkout.session.completed', sessionView(s));
};

const env = { ADMIN_TOKEN: 'admin', STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_URL: `http://localhost:${stripeServer.address().port}`, PUBLIC_SITE_URL: 'https://voxel.test' };
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env });
await new Promise((r) => api.server.listen(0, r));
apiBase = `http://localhost:${api.server.address().port}`;

const lines = [];
const common = { api: apiBase, site: 'https://voxel.test', stripeKey: KEY, stripeApi: env.STRIPE_API_URL, pay, log: (l) => lines.push(l), waitMs: 5000, pollMs: 50, clockWaitMs: 5000 };
try {
  const full = await stripeE2E({ ...common, adminToken: 'admin', webhookSecret: WHSEC });
  check('the whole check passes against a stack whose payments work', full.failed === 0 && full.results.length >= 30, `${full.failed} failed of ${full.results.length}\n${lines.filter((l) => l.startsWith('FAIL')).join('\n')}`);
  check('nothing was skipped with the admin token and the webhook secret', !full.results.some((r) => r.skipped));
  check('the test clock was deleted after the run', S.clocks.size === 0);

  lines.length = 0;
  const bare = await stripeE2E({ ...common });
  check('without the admin token or webhook secret it skips those steps and passes the rest', bare.failed === 0 && bare.results.filter((r) => r.skipped).length === 3, lines.filter((l) => /^(FAIL|skip)/.test(l)).join('; '));

  lines.length = 0;
  const live = await stripeE2E({ ...common, stripeKey: 'sk_live_nope' });
  check('a live key is refused before anything is made', live.failed === 1 && live.results.length === 1);

  // a stack whose webhook secret is wrong: payments never arrive, and the check says so
  lines.length = 0;
  const wrong = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ...env, STRIPE_WEBHOOK_SECRET: 'whsec_other' } });
  await new Promise((r) => wrong.server.listen(0, r));
  const was = apiBase;
  apiBase = `http://localhost:${wrong.server.address().port}`;
  const broken = await stripeE2E({ ...common, api: apiBase, waitMs: 600 });
  apiBase = was;
  wrong.server.close();
  check('a stack that never receives the webhook fails the check', broken.failed > 0 && lines.some((l) => l.startsWith('FAIL') && /webhook marks the Launch Pack paid/.test(l)));
} finally {
  api.server.close();
  stripeServer.close();
  api.close?.();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
