// Certifies payments end to end on a stack with Stripe in test mode (task 46, deploy/STAGING.md section 7): real Checkout sessions, real
// webhooks from Stripe, refunds and a Pro renewal, each checked in the owner's dashboard. It signs up two accounts and makes two business
// profiles, so it refuses production; run it against staging.
//
//   E2E_STRIPE_SECRET_KEY=sk_test_... VERIFY_ADMIN_TOKEN=<staging's ADMIN_TOKEN> E2E_STRIPE_WEBHOOK_SECRET=whsec_... \
//     npm run verify:stripe -- --api https://api.staging.voxelventure.app --site https://staging.voxelventure.app
//
// - E2E_STRIPE_SECRET_KEY: the same test key staging uses (it must start sk_test_). The script asks Stripe what the server did, refunds
//   from "the dashboard", and drives a test clock for the renewal.
// - VERIFY_ADMIN_TOKEN (optional): staging's admin token, for the admin refund of Pro and reconciliation. Without it those are skipped.
// - E2E_STRIPE_WEBHOOK_SECRET (optional): staging's whsec_, to deliver one of Stripe's real events a second time. Without it, skipped.
// - --pay browser (default when Edge or Chrome is found) fills Stripe's hosted page with the test card 4242 4242 4242 4242; --pay manual
//   prints each Checkout address for you to pay by hand, and waits.
// Secrets come from the environment only: npm prints the command it runs. It exits 1 if anything failed; each line says what was checked.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DAY = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PRODUCTION = /(^|\.)api\.voxelventure\.app$/;

// The run itself. `pay(url, what)` pays one Checkout page; tests pass a stand-in Stripe as stripeApi and their own pay.
export async function stripeE2E({ api, site, stripeKey, stripeApi = 'https://api.stripe.com', adminToken = null, webhookSecret = null, pay, log = console.log, waitMs = 120000, pollMs = 2000, clockWaitMs = 180000 }) {
  const results = [];
  const check = (name, ok, extra = '') => {
    results.push({ name, ok: Boolean(ok) });
    log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
    return Boolean(ok);
  };
  const skip = (name, why) => (results.push({ name, ok: true, skipped: true }), log(`skip ${name}  (${why})`));

  // ---- the API and Stripe
  const call = async (method, p, { token, body, headers = {} } = {}) => {
    try {
      const res = await fetch(api + p, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 stripe-e2e', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch { /* not JSON */ }
      return { status: res.status, data };
    } catch (e) {
      return { status: 0, data: { error: e.message } };
    }
  };
  const form = (obj, prefix = '', out = new URLSearchParams()) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v == null) continue;
      const key = prefix ? `${prefix}[${k}]` : k;
      if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.append(`${key}[]`, String(x))));
      else if (typeof v === 'object') form(v, key, out);
      else out.append(key, String(v));
    }
    return out;
  };
  const stripe = async (method, p, params = null) => {
    const q = params ? form(params).toString() : '';
    const res = await fetch(`${stripeApi}/v1${p}${method === 'GET' && q ? `?${q}` : ''}`, { method, headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'GET' || method === 'DELETE' ? undefined : q, signal: AbortSignal.timeout(30000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe ${method} ${p}: ${data.error?.message ?? res.status}`);
    return data;
  };
  // waits until fn() returns something truthy, or gives up and returns the last answer
  const until = async (fn, ms = waitMs) => {
    const end = Date.now() + ms;
    let last;
    while (Date.now() < end) {
      last = await fn();
      if (last) return last;
      await sleep(pollMs);
    }
    return last;
  };

  const RUN = crypto.randomBytes(3).toString('hex');
  const owner = async (who) => {
    const s = await call('POST', '/auth/signup', { body: { username: `e2e${who}${RUN}`, password: `e2e-${crypto.randomBytes(9).toString('hex')}` } });
    if (s.status !== 200) return null;
    const b = await call('POST', '/businesses', { token: s.data.token, body: { name: `Stripe check ${who} ${RUN}`, category: 'services', website: 'https://example.com', description: 'A test business made by the Stripe end-to-end check. It can be deleted.' } });
    const slug = b.data?.slug ?? b.data?.profile?.slug;
    return slug ? { token: s.data.token, slug } : null;
  };
  const dash = async (o) => (await call('GET', '/me/businesses', { token: o.token })).data?.profiles?.find((x) => x.profile.slug === o.slug) ?? null;
  const orderOf = async (o, id) => (await call('GET', `/me/orders/${id}`, { token: o.token })).data;
  const ordersNamed = async (o, id) => ((await call('GET', '/me/orders', { token: o.token })).data?.orders ?? []).filter((x) => x.id === id);
  const statusIs = (o, id, status) => until(async () => ((await orderOf(o, id))?.status === status ? status : null));
  const sessionId = (url) => String(url ?? '').match(/cs_(test|live)_[A-Za-z0-9]+/)?.[0] ?? null;
  // the payment intent of a subscription's latest invoice, on Stripe API versions before and after invoices lost payment_intent (2025-03-31)
  const subscriptionPayment = async (sub) => {
    const inv = (await stripe('GET', '/invoices', { subscription: sub, limit: 1 })).data?.[0];
    if (inv?.payment_intent) return inv.payment_intent;
    const withPayments = (await stripe('GET', '/invoices', { subscription: sub, limit: 1, expand: ['data.payments'] }).catch(() => null))?.data?.[0];
    return withPayments?.payments?.data?.find((x) => x.payment?.payment_intent)?.payment?.payment_intent ?? null;
  };

  let clock = null;
  try {
    // ---- 0. the stack is ready
    if (!check('the test key is a test key', /^sk_test_|^rk_test_/.test(stripeKey ?? ''))) return finish();
    const config = await call('GET', '/billing/config');
    if (!check('the API has payments on', config.data?.enabled === true, config.status ? `GET /billing/config answered ${JSON.stringify(config.data)}` : `cannot reach ${api}: ${config.data?.error}`)) {
      log('     set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the stack\'s api.env (deploy/STAGING.md section 7), then restart the API');
      return finish();
    }
    const unsigned = await call('POST', '/billing/webhook', { body: JSON.stringify({ id: `evt_forged_${RUN}`, type: 'checkout.session.completed', data: { object: {} } }) });
    check('an unsigned webhook is refused', unsigned.status === 400, `answered ${unsigned.status}`);

    const amy = await owner('a');
    const bob = await owner('b');
    if (!check('two owners sign up and make business profiles', amy && bob)) return finish();

    // ---- 1. the Launch Pack: Checkout, Stripe's webhook, the dashboard
    const launch = await call('POST', `/businesses/${amy.slug}/checkout`, { token: amy.token, body: { product: 'launch' } });
    const launchSession = sessionId(launch.data?.url);
    check('a Launch Pack checkout opens a Stripe page', launch.status === 200 && launchSession, JSON.stringify(launch.data).slice(0, 160));
    if (!launchSession) return finish();
    let s = await stripe('GET', `/checkout/sessions/${launchSession}`);
    check('Stripe has the session in test mode for $9, one payment, for this order', s.livemode === false && s.amount_total === 900 && s.mode === 'payment' && s.client_reference_id === String(launch.data.orderId), `${s.amount_total} ${s.mode} livemode=${s.livemode}`);
    check('the order waits for the payment and grants nothing yet', (await orderOf(amy, launch.data.orderId))?.status === 'pending' && (await dash(amy))?.plan?.launch === false);
    await pay(launch.data.url, 'the $9 Launch Pack');
    check('Stripe\'s webhook marks the Launch Pack paid', await statusIs(amy, launch.data.orderId, 'paid'));
    let d = await dash(amy);
    check('the dashboard shows the launch week, once', d?.plan?.launch === true && d.plan.launchUntil > Date.now() + 6.5 * DAY && (await ordersNamed(amy, launch.data.orderId)).length === 1);

    // the same real event delivered again changes nothing
    if (webhookSecret) {
      const events = await stripe('GET', '/events', { type: 'checkout.session.completed', limit: 50 });
      const event = events.data?.find((e) => e.data?.object?.id === launchSession);
      if (event) {
        const raw = JSON.stringify(event);
        const t = Math.floor(Date.now() / 1000);
        const again = await call('POST', '/billing/webhook', { body: raw, headers: { 'Stripe-Signature': `t=${t},v1=${crypto.createHmac('sha256', webhookSecret).update(`${t}.${raw}`).digest('hex')}` } });
        d = await dash(amy);
        check('Stripe\'s event delivered twice is applied once', again.status === 200 && again.data?.duplicate === true && d?.plan?.launch === true && (await ordersNamed(amy, launch.data.orderId)).length === 1, JSON.stringify(again.data));
      } else check('Stripe\'s checkout.session.completed event can be found', false, 'not among the last 50');
    } else skip('Stripe\'s event delivered twice is applied once', 'no E2E_STRIPE_WEBHOOK_SECRET');

    // ---- 2. a refund from the Stripe dashboard (the same call the dashboard makes)
    s = await stripe('GET', `/checkout/sessions/${launchSession}`);
    if (check('Stripe has the Launch Pack\'s payment', s.payment_status === 'paid' && s.payment_intent)) {
      await stripe('POST', '/refunds', { payment_intent: s.payment_intent });
      check('a refund in Stripe reaches the order (charge.refunded)', await statusIs(amy, launch.data.orderId, 'refunded'));
      check('the refund takes the launch week back', (await dash(amy))?.plan?.launch === false);
    }

    // ---- 3. Pro through Checkout
    const pro = await call('POST', `/businesses/${amy.slug}/checkout`, { token: amy.token, body: { product: 'pro' } });
    const proSession = sessionId(pro.data?.url);
    check('a Pro checkout opens a Stripe page', pro.status === 200 && proSession, JSON.stringify(pro.data).slice(0, 160));
    if (!proSession) return finish();
    s = await stripe('GET', `/checkout/sessions/${proSession}`);
    check('Stripe has a monthly subscription for $19 for this order', s.livemode === false && s.amount_total === 1900 && s.mode === 'subscription' && s.client_reference_id === String(pro.data.orderId), `${s.amount_total} ${s.mode}`);
    await pay(pro.data.url, '$19 Pro');
    check('Stripe\'s webhooks mark Pro paid', await statusIs(amy, pro.data.orderId, 'paid'));
    d = await until(async () => { const x = await dash(amy); return x?.plan?.pro ? x : null; });
    check('the dashboard shows Pro for about a month, once', d?.plan?.pro === true && d.plan.proUntil > Date.now() + 27 * DAY && d.plan.proUntil < Date.now() + 33 * DAY && (await ordersNamed(amy, pro.data.orderId)).length === 1, d?.plan?.proUntil ? new Date(d.plan.proUntil).toISOString() : 'no Pro');
    check('Pro sees its sources and daily chart', Array.isArray(d?.stats?.sources) && Array.isArray(d?.stats?.days));
    check('Pro cannot be bought twice', (await call('POST', `/businesses/${amy.slug}/checkout`, { token: amy.token, body: { product: 'pro' } })).status === 409);
    s = await stripe('GET', `/checkout/sessions/${proSession}`);
    const proSub = s.subscription;

    // ---- 4. an admin refund of Pro: the subscription ends and its payment comes back
    if (adminToken && proSub) {
      const r = await call('POST', `/admin/billing/orders/${pro.data.orderId}/refund`, { token: adminToken });
      check('an admin refunds Pro', r.status === 200 && r.data?.refunded === true, JSON.stringify(r.data).slice(0, 160));
      check('the refund takes Pro back in the dashboard', (await orderOf(amy, pro.data.orderId))?.status === 'refunded' && (await dash(amy))?.plan?.pro === false);
      check('the subscription is cancelled in Stripe', (await stripe('GET', `/subscriptions/${proSub}`)).status === 'canceled');
      const pi = await subscriptionPayment(proSub);
      const charge = pi ? (await stripe('GET', `/payment_intents/${pi}`, { expand: ['latest_charge'] })).latest_charge : null;
      check('the $19 is refunded in Stripe', charge?.amount_refunded === 1900, pi ? `refunded ${charge?.amount_refunded ?? '?'} of ${charge?.amount ?? '?'}` : 'the invoice has no payment intent to refund');
    } else skip('an admin refund of Pro', adminToken ? 'no subscription on the session' : 'no VERIFY_ADMIN_TOKEN');

    // ---- 5. a Pro renewal, on a Stripe test clock a month ahead
    const renew = await call('POST', `/businesses/${bob.slug}/checkout`, { token: bob.token, body: { product: 'pro' } });
    if (check('a second owner starts Pro', renew.status === 200 && renew.data?.orderId)) {
      const start = Math.floor(Date.now() / 1000);
      clock = await stripe('POST', '/test_helpers/test_clocks', { frozen_time: start, name: `VoxelVenture e2e ${RUN}` });
      const product = await stripe('POST', '/products', { name: `VoxelVenture Pro (e2e ${RUN})` });
      const customer = await stripe('POST', '/customers', { test_clock: clock.id, email: 'stripe-e2e@example.com', payment_method: 'pm_card_visa', invoice_settings: { default_payment_method: 'pm_card_visa' } });
      // the subscription Checkout would make, with the order in its metadata as the server writes it
      const sub = await stripe('POST', '/subscriptions', { customer: customer.id, items: [{ price_data: { currency: 'usd', unit_amount: 1900, product: product.id, recurring: { interval: 'month' } } }], metadata: { order: renew.data.orderId } });
      check('the first month\'s invoice.paid marks Pro paid', await statusIs(bob, renew.data.orderId, 'paid'));
      const first = (await until(async () => { const x = await dash(bob); return x?.plan?.pro ? x : null; }))?.plan?.proUntil ?? 0;
      check('Pro runs to the end of the first month', first > Date.now() + 27 * DAY, first ? new Date(first).toISOString() : 'no Pro');
      await stripe('POST', `/test_helpers/test_clocks/${clock.id}/advance`, { frozen_time: start + 32 * 86400 });
      const ready = await until(async () => ((await stripe('GET', `/test_helpers/test_clocks/${clock.id}`)).status === 'ready' ? 'ready' : null), clockWaitMs);
      check('Stripe\'s test clock moves a month on', ready === 'ready');
      const second = await until(async () => { const x = (await dash(bob))?.plan?.proUntil ?? 0; return x > first + 25 * DAY ? x : null; }, clockWaitMs);
      check('the renewal\'s invoice.paid extends Pro by a month', Boolean(second), second ? new Date(second).toISOString() : `still ${new Date(first).toISOString()}`);
      check('the renewal is in the dashboard once', (await ordersNamed(bob, renew.data.orderId)).filter((x) => x.status === 'paid').length === 1);
      // the Checkout page that was never used expires: a late expiry does not undo a paid order
      const unused = sessionId(renew.data.url);
      if (unused) await stripe('POST', `/checkout/sessions/${unused}/expire`).catch(() => null);
      await sleep(Math.min(5000, pollMs * 3));
      check('an expired Checkout page leaves the paid order paid', (await orderOf(bob, renew.data.orderId))?.status === 'paid');

      // ---- 6. reconciliation, and the owner cancelling
      if (adminToken) {
        const rec = await call('POST', '/admin/billing/reconcile', { token: adminToken });
        check('reconciliation asks Stripe and answers', rec.status === 200 && typeof rec.data?.checked === 'number', JSON.stringify(rec.data));
        check('reconciliation keeps the renewed month', ((await dash(bob))?.plan?.proUntil ?? 0) >= (second || first));
      } else skip('reconciliation', 'no VERIFY_ADMIN_TOKEN');
      const cancel = await call('POST', `/businesses/${bob.slug}/pro/cancel`, { token: bob.token });
      check('the owner cancels Pro: it runs to the end of the paid month', cancel.status === 200 && cancel.data?.cancelled === true && (await stripe('GET', `/subscriptions/${sub.id}`)).cancel_at_period_end === true);
    }
  } catch (e) {
    check('the run finished', false, e.message);
  }
  return finish();

  async function finish() {
    // deleting the test clock deletes its customer and subscription
    if (clock) await stripe('DELETE', `/test_helpers/test_clocks/${clock.id}`).catch(() => null);
    const failed = results.filter((r) => !r.ok);
    log(`\n${results.length - failed.length} of ${results.length} passed${results.some((r) => r.skipped) ? ` (${results.filter((r) => r.skipped).length} skipped)` : ''}`);
    return { results, failed: failed.length };
  }
}

// ---- paying a Checkout page
// By hand: print the address, and the run waits for the webhook.
export const payByHand = (log = console.log) => async (url, what) => {
  log(`\n     Pay for ${what} at:\n     ${url}\n     with the card 4242 4242 4242 4242, any future date, any CVC. Waiting for Stripe's webhook...\n`);
};
// In headless Edge or Chrome: fill Stripe's hosted page with the test card and press Pay. Stripe changes its page from time to time;
// if this stops finding the fields, use --pay manual, and a screenshot of what it saw is in artifacts/stripe-e2e/.
export const payInBrowser = (site, log = console.log) => async (url, what) => {
  const { openPage } = await import('../tests/browser-driver.mjs');
  const page = await openPage(url, { width: 1200, height: 900, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  const has = (sel) => page.eval(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  const fill = async (sel, text) => {
    if (!(await has(sel))) return false;
    await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView(); el.focus(); el.select?.(); })()`);
    await page.type(text);
    await sleep(300);
    return true;
  };
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await sleep(500);
      // newer pages put the card behind a "Card" choice
      if (!(await has('#cardNumber')) && (await has('[data-testid="card-accordion-item-button"]'))) await page.eval('document.querySelector(\'[data-testid="card-accordion-item-button"]\').click()');
      ready = await has('#cardNumber');
    }
    if (!ready) throw new Error('Stripe\'s card field did not appear');
    await fill('#email', 'stripe-e2e@example.com');
    await fill('#cardNumber', '4242424242424242');
    await fill('#cardExpiry', '1234');
    await fill('#cardCvc', '123');
    await fill('#billingName', 'Stripe Check');
    await fill('#billingPostalCode', '10001');
    await page.eval('(document.querySelector(\'[data-testid="hosted-payment-submit-button"]\') ?? document.querySelector(\'.SubmitButton\') ?? document.querySelector(\'button[type=submit]\')).click()');
    let back = false;
    for (let i = 0; i < 90 && !back; i++) {
      await sleep(1000);
      back = await page.eval(`location.href.startsWith(${JSON.stringify(site)})`).catch(() => false);
    }
    if (!back) throw new Error('Stripe did not send the browser back to the site after paying');
    log(`     paid for ${what} in the browser`);
  } catch (e) {
    const dir = path.join(process.cwd(), 'artifacts', 'stripe-e2e');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `checkout-${Date.now()}.png`);
    await page.screenshot(file).catch(() => null);
    log(`     could not pay for ${what} in the browser: ${e.message} (screenshot: ${file}). Rerun with --pay manual to pay by hand.`);
  } finally {
    await page.close();
  }
};

// ---- the command line
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : process.env[`VERIFY_${name.toUpperCase().replace(/-/g, '_')}`];
  };
  const api = (opt('api') ?? '').replace(/\/+$/, '');
  const site = (opt('site') ?? '').replace(/\/+$/, '');
  const stripeKey = process.env.E2E_STRIPE_SECRET_KEY ?? '';
  if (!api || !site || !stripeKey) {
    console.error('usage: E2E_STRIPE_SECRET_KEY=sk_test_... npm run verify:stripe -- --api <API address> --site <site address> [--pay browser|manual]\n       (optional: VERIFY_ADMIN_TOKEN, E2E_STRIPE_WEBHOOK_SECRET)');
    process.exit(2);
  }
  if (PRODUCTION.test(new URL(api).hostname)) {
    console.error('This makes accounts, businesses and payments: run it against staging, never production.');
    process.exit(2);
  }
  if (!/^(sk|rk)_test_/.test(stripeKey)) {
    console.error('E2E_STRIPE_SECRET_KEY must be a test key (sk_test_...).');
    process.exit(2);
  }
  const { findBrowser } = await import('../tests/browser-driver.mjs');
  const mode = opt('pay') ?? (findBrowser() ? 'browser' : 'manual');
  const out = await stripeE2E({ api, site, stripeKey, adminToken: opt('admin-token') ?? null, webhookSecret: process.env.E2E_STRIPE_WEBHOOK_SECRET || null, pay: mode === 'manual' ? payByHand() : payInBrowser(site), waitMs: mode === 'manual' ? 15 * 60000 : 120000 });
  process.exit(out.failed ? 1 : 0);
}
