// Promo codes (services/api/promo.mjs, docs/monetization/billing.md#promo-codes), against a stand-in for the Stripe API: the admin makes, lists,
// edits, switches off and exports codes (admin only, every change audited); generated codes are unique; the pricing (percent and amount, eligible lines
// only, after the Pro and renewal discounts, Stripe's 50-cent floor); every validation reason, with generic errors where a guesser could learn something;
// limits in all and per account, held by checkouts in progress; new customers only; dates; a single checkout and the cart, with the amounts sent to
// Stripe; Pro's first month as a one-off coupon in subscription mode; 100% codes (a free order with no Stripe, except with Pro); release on expiry, void on
// refund, a cart line's refund; rate limiting; the contracts.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { signPayload } from '../services/api/billing.mjs';
import * as promo from '../services/api/promo.mjs';
import { imp } from '../scripts/lib-loader.mjs';
import * as types from '@voxelventure/shared-types';
import { CART, PRODUCTS, PROMO_ALPHABET, PROMO_GROUPS, PROMO_GROUP_IDS, STRIPE_MIN_CENTS, promoDiscount, promoGroupOf } from '@voxelventure/business-core';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const fits = (name, contract, value) => {
  const r = types.check(contract, value);
  check(`${name} fits ${contract.id}`, r.ok, r.ok ? '' : `${r.errors.slice(0, 4).join('; ')} in ${JSON.stringify(value).slice(0, 300)}`);
};
const DAY = 86400000;
const WHSEC = 'whsec_promo';
const ADMIN = 'admin-promo';

// ---- a stand-in Stripe: sessions (and closing one), coupons, invoices, subscriptions, refunds
const S = { sessions: new Map(), coupons: [], refunds: [], expired: [], subs: new Map(), n: 0 };
const stripeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(req.method === 'GET' ? url.search : body));
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const id = `cs_promo_${++S.n}`;
      S.sessions.set(id, { id, status: 'open', payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id, params });
      return reply(200, { id, url: `https://checkout.stripe.test/${id}` });
    }
    if (req.method === 'POST' && url.pathname === '/v1/coupons') {
      const c = { id: `co_${S.coupons.length + 1}`, params, key: req.headers['idempotency-key'] };
      S.coupons.push(c);
      return reply(200, { id: c.id });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)\/expire$/))) {
      S.expired.push(m[1]);
      const s = S.sessions.get(m[1]);
      if (s) s.status = 'expired';
      return reply(200, s ?? {});
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return reply(200, S.sessions.get(m[1]) ?? {});
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

const env = { ADMIN_TOKEN: ADMIN, STRIPE_SECRET_KEY: 'sk_test_promo', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_URL: `http://localhost:${stripeServer.address().port}`, PUBLIC_SITE_URL: 'https://voxel.test', PROMO_TRIES: '1000' };
const start = async (e) => {
  const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: e, rate: { perMinute: 100000, authPerMinute: 1000 } });
  await new Promise((r) => api.server.listen(0, r));
  const base = `http://localhost:${api.server.address().port}`;
  const call = async (method, p, { token, body } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return { api, base, call };
};
const { api, base, call } = await start(env);
const signup = async (u, c = call) => (await c('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
let eventN = 0;
const webhook = (type, object) => {
  const raw = JSON.stringify({ id: `evt_p${++eventN}`, type, data: { object } });
  return fetch(`${base}/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signPayload(raw, WHSEC) }, body: raw }).then((r) => r.json());
};
const sessionOf = (orderId) => [...S.sessions.values()].find((s) => s.client_reference_id === String(orderId));
const pay = (orderId, mode = 'payment') => {
  const s = sessionOf(orderId);
  Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: `pi_${orderId}` });
  return webhook('checkout.session.completed', { id: s.id, object: 'checkout.session', mode, status: 'complete', payment_status: 'paid', client_reference_id: String(orderId), payment_intent: mode === 'payment' ? `pi_${orderId}` : null, subscription: mode === 'subscription' ? `sub_${orderId}` : null, metadata: { order: String(orderId) } });
};
const order = (id) => api.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
const redemption = (orderId) => api.db.prepare('SELECT * FROM promo_redemptions WHERE order_id = ?').get(orderId);
const plot = async (id) => (await call('GET', `/plots/${id}`)).data;
const cents = (d) => Math.round(d * 100);
const admin = (method, p, body) => call(method, p, { token: ADMIN, body });
const make = async (body) => (await admin('POST', '/admin/promos', body)).data.promos?.[0];

try {
  const { generateCity } = await imp('city/cityGenerator.js');
  const { leaseQuote, renewalQuote } = await imp('game/claimPrice.js');
  const city = generateCity(20260101);
  const lots = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb');
  let lotN = 0;
  const nextLot = () => lots[lotN++];
  const biz = (title, leaseDays = 30) => ({ title, buildingType: 'shop', website: 'https://shop.test', variant: 'corner', logo: { kind: 'generated' }, description: 'A small shop.', leaseDays });
  const amy = await signup('Amy');
  const bob = await signup('Bob');
  const cara = await signup('Cara');
  const dan = await signup('Dan');
  const eve = await signup('Eve');
  const fay = await signup('Fay');

  // ---- the pricing (business-core, the same function the pages use)
  const two = [{ group: 'plots', cents: 1000 }, { group: 'launch', cents: 900 }];
  check('percent: only the eligible lines', JSON.stringify(promoDiscount({ kind: 'percent', value: 25, groups: ['plots'] }, two)) === JSON.stringify({ lines: [250, 0], cents: 250, eligibleCents: 1000, totalCents: 1650, free: false }));
  const amt = promoDiscount({ kind: 'amount', value: 500, groups: ['plots', 'launch'] }, [{ group: 'plots', cents: 1000 }, { group: 'launch', cents: 900 }, { group: 'market', cents: 300 }]);
  check('amount: shared out in proportion over the eligible lines, to the cent', amt.cents === 500 && amt.lines[0] + amt.lines[1] === 500 && amt.lines[2] === 0 && amt.lines[0] === 263, JSON.stringify(amt));
  check('amount: never more than the eligible lines cost', promoDiscount({ kind: 'amount', value: 5000, groups: ['launch'] }, two).cents === 900);
  const floor = promoDiscount({ kind: 'amount', value: 480, groups: ['plots'] }, [{ group: 'plots', cents: 500 }]);
  check(`a payment is never left under Stripe's ${STRIPE_MIN_CENTS}¢ (except nothing at all)`, floor.totalCents === STRIPE_MIN_CENTS && floor.cents === 450 && !floor.free, JSON.stringify(floor));
  check('100% makes it free', promoDiscount({ kind: 'percent', value: 100, groups: ['plots'] }, [{ group: 'plots', cents: 1234 }]).free === true);
  check('the product groups cover every purchase kind exactly once', types.CART_KINDS.every((k) => PROMO_GROUP_IDS.filter((g) => PROMO_GROUPS[g].kinds.includes(k)).length === 1) && JSON.stringify(PROMO_GROUP_IDS) === JSON.stringify(types.PROMO_GROUP_IDS));
  check('a lease order maps by its action, a stall by its product', promoGroupOf('lease', 'renew') === 'plots' && promoGroupOf('lease', 'exterior') === 'outside' && promoGroupOf('market') === 'market' && promoGroupOf('pro') === 'pro');

  // ---- the admin side: admin only, made, listed, edited, switched off, exported, audited
  const draft = { kind: 'percent', value: 25, appliesTo: ['plots'], note: 'spring' };
  check('making codes is for the admin only', (await call('POST', '/admin/promos', { body: draft })).status === 403 && (await call('POST', '/admin/promos', { token: amy.token, body: draft })).status === 403 && (await call('GET', '/admin/promos', { token: amy.token })).status === 403);
  fits('the create body', types.PROMO_CREATE, { code: 'Spring25', ...draft });
  const made = await admin('POST', '/admin/promos', { code: 'Spring25', ...draft });
  fits('the answer to creating', types.PROMO_LIST, made.data);
  const spring = made.data.promos[0];
  check('a custom code is stored upper case with the defaults: 1 use per account, no total limit, no end', made.status === 200 && spring.code === 'SPRING25' && spring.perAccountLimit === 1 && spring.maxRedemptions === null && spring.expiresAt === null && spring.status === 'active' && spring.label === '25% off', JSON.stringify(made.data).slice(0, 300));
  check('codes are unique whatever the case', (await admin('POST', '/admin/promos', { code: 'spring25', value: 10 })).data.code === 'promo_exists');
  check('a bad code, value or group is refused', (await admin('POST', '/admin/promos', { code: 'x!', value: 10 })).data.code === 'bad_code' && (await admin('POST', '/admin/promos', { value: 101 })).status === 400 && (await admin('POST', '/admin/promos', { value: 10, appliesTo: ['gold'] })).status === 400 && (await admin('POST', '/admin/promos', { value: 0, kind: 'amount' })).status === 400);
  const batch = await admin('POST', '/admin/promos', { count: 60, kind: 'amount', value: 300, appliesTo: ['market', 'launch'], campaign: 'fair' });
  const batchCodes = batch.data.promos.map((p) => p.code);
  const shape = new RegExp(`^VV-[${PROMO_ALPHABET}]{4}-[${PROMO_ALPHABET}]{4}$`);
  check('a batch of generated codes: all different, VV-XXXX-XXXX from letters nobody misreads, one campaign', batchCodes.length === 60 && new Set(batchCodes).size === 60 && batchCodes.every((c) => shape.test(c) && !/[01OIL]/.test(c.slice(3))) && batch.data.promos.every((p) => p.campaign === 'fair'), batchCodes.slice(0, 3).join());
  const own = promo.generateCode(api.db, 'VV', new Set());
  check('a generated code is never one that exists', !promo.byCode(api.db, own));
  check('one chosen code or a number of generated ones, not both', (await admin('POST', '/admin/promos', { code: 'BOTH1', count: 2, value: 5 })).status === 400);
  const list = await admin('GET', '/admin/promos');
  fits('the list', types.PROMO_LIST, list.data);
  check('the list has every code, newest first, with usage', list.data.promos.length === 61 && list.data.promos.at(-1).code === 'SPRING25' && list.data.promos[0].usage.redeemed === 0);
  check('the list filters by campaign, group, text and status', (await admin('GET', '/admin/promos?campaign=fair')).data.promos.length === 60 && (await admin('GET', '/admin/promos?group=plots')).data.promos.length === 1 && (await admin('GET', '/admin/promos?q=spring')).data.promos.length === 1 && (await admin('GET', '/admin/promos?status=inactive')).data.promos.length === 0);
  const off = await admin('POST', `/admin/promos/${spring.id}/deactivate`);
  check('a code can be switched off, and on again', off.data.promo.active === false && off.data.promo.status === 'inactive' && (await admin('POST', `/admin/promos/${spring.id}/reactivate`)).data.promo.active === true);
  const edited = await admin('PATCH', `/admin/promos/${spring.id}`, { maxRedemptions: 50, perAccountLimit: 2, expiresAt: Date.now() + 30 * DAY });
  check('its limits and end can be changed', edited.data.promo.maxRedemptions === 50 && edited.data.promo.perAccountLimit === 2 && edited.data.promo.expiresAt > Date.now());
  check('what it takes off cannot', (await admin('PATCH', `/admin/promos/${spring.id}`, { value: 90 })).data.code === 'promo_fixed' && (await admin('PATCH', `/admin/promos/${spring.id}`, { expiresAt: 1000, startsAt: 5000 })).status === 400);
  await admin('PATCH', `/admin/promos/${spring.id}`, { perAccountLimit: 1 });
  const trail = api.db.prepare("SELECT action, target_id, actor_kind FROM audit_log WHERE action LIKE 'promo.%' ORDER BY id").all();
  check('every change is in the audit trail, by the admin', trail.filter((t) => t.action === 'promo.create').length === 61 && ['promo.deactivate', 'promo.reactivate', 'promo.update'].every((a) => trail.some((t) => t.action === a && t.target_id === 'SPRING25')) && trail.every((t) => t.actor_kind === 'admin'));
  const csv = await fetch(`${base}/admin/promos.csv?campaign=fair`, { headers: { Authorization: `Bearer ${ADMIN}` } });
  const csvText = await csv.text();
  check('the CSV export: a header and a row per code, as a download', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type')) && /attachment; filename="promo-codes-/.test(csv.headers.get('content-disposition')) && csvText.trim().split('\r\n').length === 61 && csvText.startsWith('"code","kind","value"') && csvText.includes(`"${batchCodes[0]}","amount","300","launch market"`), csvText.slice(0, 200));
  check('the CSV is for the admin only', (await fetch(`${base}/admin/promos.csv`)).status === 403);

  // ---- checking a code: every reason, and what the player is told
  const at = Date.now();
  const lines = [{ group: 'plots', cents: 2000 }];
  const reason = (code, l = lines, who = amy.account) => promo.check(api.db, who, code, l, { at }).reason ?? 'ok';
  await make({ code: 'OFFNOW', value: 10 }).then((p) => admin('POST', `/admin/promos/${p.id}/deactivate`));
  await make({ code: 'LATER', value: 10, startsAt: at + DAY });
  await make({ code: 'GONE', value: 10, expiresAt: at - 1000, startsAt: at - DAY });
  await make({ code: 'BIG', value: 10, minSubtotalCents: 5000 });
  await make({ code: 'NEWBIE', value: 10, newCustomersOnly: true });
  check('the reasons: format, unknown, switched off, not started, ended, other products, under the minimum', reason('a') === 'format' && reason('NOSUCH') === 'unknown' && reason('OFFNOW') === 'inactive' && reason('LATER') === 'not_started' && reason('GONE') === 'expired' && reason('SPRING25', [{ group: 'launch', cents: 900 }]) === 'not_applicable' && reason('BIG') === 'minimum' && reason('spring25') === 'ok');
  const ask = (code, kind = 'claim', token = amy.token, extra = {}) => call('POST', '/promo/check', { token, body: { code, kind, ...extra } });
  const generic = await Promise.all(['NOSUCH', 'OFFNOW', 'LATER', 'GONE'].map((c) => ask(c)));
  check('every reason a guesser could learn from gets the same answer', generic.every((g) => g.status === 400 && g.data.code === 'promo_invalid' && g.data.error === "That code isn't valid."), JSON.stringify(generic.map((g) => g.data)));
  fits('a refused code', types.PROMO_REFUSED, generic[0].data);
  check('a code for other products, or under its minimum, says so', (await ask('SPRING25', 'launch')).data.code === 'promo_not_applicable' && (await ask('BIG', 'claim', amy.token, { cents: 1000 })).data.error === 'This code needs a total of at least $50 before the discount.');
  const ok = await ask('spring25', 'renew');
  fits('the check body', types.PROMO_CHECK, { code: 'spring25', kind: 'renew' });
  fits('a code that works', types.PROMO_CHECK_RESULT, ok.data);
  check('a code that works says what it takes off and covers (never its limits)', ok.status === 200 && ok.data.code === 'SPRING25' && ok.data.label === '25% off' && ok.data.groups.join() === 'plots' && ok.data.maxRedemptions === undefined);
  check('checking needs an account', (await call('POST', '/promo/check', { body: { code: 'SPRING25', kind: 'claim' } })).status === 401);

  // ---- a single checkout: a claim with 25% off
  const lot1 = nextLot();
  const full1 = cents(leaseQuote(lot1, null, 'shop', 14).total);
  const c1 = await call('POST', `/plots/${lot1.id}/claim`, { token: amy.token, body: { ...biz('Amy One', 14), promoCode: 'spring25' } });
  const o1 = c1.data.checkout?.orderId;
  const off1 = Math.round(full1 * 0.25);
  check('a claim with a code: Stripe is asked for the price less the code', c1.status === 200 && sessionOf(o1).params['line_items[0][price_data][unit_amount]'] === String(full1 - off1) && order(o1).cents === full1 - off1 && order(o1).promo_cents === off1 && order(o1).promo_code === 'SPRING25' && c1.data.checkout.promo.code === 'SPRING25' && c1.data.checkout.promo.cents === off1, JSON.stringify([c1.data, full1, order(o1)]).slice(0, 400));
  check('the code is kept out of what the claim does', !('promoCode' in JSON.parse(order(o1).request).input));
  check('its use is reserved while the checkout is open', redemption(o1).status === 'reserved' && redemption(o1).cents_off === off1 && redemption(o1).account_id === amy.account.id);
  check('the checkout is in the audit trail with the code', JSON.parse(api.db.prepare("SELECT detail FROM audit_log WHERE action = 'billing.checkout' ORDER BY id DESC LIMIT 1").get().detail).promo === 'SPRING25');
  // starting again with the same code replaces the first checkout (its plot is let go, its Stripe page closed)
  const c1b = await call('POST', `/plots/${lot1.id}/claim`, { token: amy.token, body: { ...biz('Amy One', 14), promoCode: 'SPRING25' } });
  const o1b = c1b.data.checkout?.orderId;
  await new Promise((r) => setTimeout(r, 100));
  check('the same code again replaces the open checkout that held it', o1b > o1 && order(o1).status === 'expired' && redemption(o1).status === 'released' && redemption(o1b).status === 'reserved' && S.expired.includes(sessionOf(o1).id), JSON.stringify([c1b.data, order(o1)?.status]));
  await pay(o1b);
  check('paid: the use is redeemed and the plot is claimed', redemption(o1b).status === 'redeemed' && (await plot(lot1.id)).owner === 'Amy');
  check('a code used up for this account says so', (await ask('SPRING25')).data.code === 'promo_used' && (await call('POST', `/plots/${nextLot().id}/claim`, { token: amy.token, body: { ...biz('Amy Two'), promoCode: 'SPRING25' } })).data.code === 'promo_used');
  const detail = await admin('GET', `/admin/promos/${spring.id}`);
  fits('a code with its uses', types.PROMO_DETAIL, detail.data);
  check('the admin sees each use and the usage', detail.data.redemptions.length === 2 && detail.data.redemptions[0].status === 'redeemed' && detail.data.redemptions[0].username === 'Amy' && detail.data.promo.usage.redeemed === 1 && detail.data.promo.usage.discountedCents === off1 && detail.data.promo.usage.revenueCents === full1 - off1);
  check('an invalid code stops the checkout before anything is held', (await call('POST', `/plots/${lots[lotN].id}/claim`, { token: bob.token, body: { ...biz('Bob One'), promoCode: 'NOSUCH' } })).data.code === 'promo_invalid' && !api.db.prepare("SELECT 1 FROM orders WHERE account_id = ? AND target = ?").get(bob.account.id, `plot:${lots[lotN].id}`));

  // ---- a full refund voids the use (it can be used again)
  await admin('POST', `/admin/billing/orders/${o1b}/refund`);
  check('a full refund voids the use', redemption(o1b).status === 'voided' && (await ask('SPRING25')).status === 200);

  // ---- after the Pro discount and the renewal discount
  const dprof = (await call('POST', '/businesses', { token: dan.token, body: { name: 'Dan Deli', category: 'food', district: 'creator', website: 'https://dan.test', description: 'Sandwiches and soup, made fresh every morning in Creator Commons.' } })).data;
  await admin('POST', `/admin/billing/grant/${dprof.slug}`, { product: 'pro', days: 30, reason: 'test' });
  const lot2 = nextLot();
  const pro2 = cents(leaseQuote(lot2, null, 'shop', 30, { pro: true }).total);
  await make({ code: 'TENOFF', value: 10, appliesTo: ['plots'], perAccountLimit: 5 });
  const c2 = (await call('POST', `/plots/${lot2.id}/claim`, { token: dan.token, body: { ...biz('Dan Two'), promoCode: 'TENOFF' } })).data.checkout;
  check('with Pro the code comes off the Pro price', order(c2.orderId).cents === pro2 - Math.round(pro2 * 0.1) && order(c2.orderId).promo_cents === Math.round(pro2 * 0.1), JSON.stringify([order(c2.orderId)?.cents, pro2]));
  await pay(c2.orderId);
  await admin('POST', `/admin/plots/${lot2.id}/lease`, { state: 'renewal' });
  const ren = cents(renewalQuote(await plot(lot2.id), 7, { pro: true }).total);
  const r2 = (await call('POST', `/plots/${lot2.id}/renew`, { token: dan.token, body: { leaseDays: 7, promoCode: 'TENOFF' } })).data.checkout;
  check('a renewal: the code comes off the renewal price (with Pro, after both)', order(r2.orderId).cents === ren - Math.round(ren * 0.1) && sessionOf(r2.orderId).params['line_items[0][price_data][unit_amount]'] === String(order(r2.orderId).cents), JSON.stringify([order(r2.orderId)?.cents, ren]));

  // ---- the total limit, held by checkouts in progress
  await make({ code: 'ONEUSE', value: 20, maxRedemptions: 1 });
  const lot3 = nextLot();
  const lot4 = nextLot();
  const e1 = (await call('POST', `/plots/${lot3.id}/claim`, { token: eve.token, body: { ...biz('Eve One'), promoCode: 'ONEUSE' } })).data.checkout;
  const f1 = await call('POST', `/plots/${lot4.id}/claim`, { token: fay.token, body: { ...biz('Fay One'), promoCode: 'ONEUSE' } });
  check('a code with one use left cannot be used twice at once', e1.orderId > 0 && f1.status === 400 && f1.data.code === 'promo_invalid');
  await webhook('checkout.session.expired', { id: sessionOf(e1.orderId).id, object: 'checkout.session', status: 'expired', client_reference_id: String(e1.orderId) });
  check('a checkout that expires releases its use', redemption(e1.orderId).status === 'released');
  const f2 = await call('POST', `/plots/${lot4.id}/claim`, { token: fay.token, body: { ...biz('Fay One'), promoCode: 'ONEUSE' } });
  check('...and someone else can use it then', f2.data.checkout?.orderId > 0 && redemption(f2.data.checkout.orderId).status === 'reserved');
  check('the list shows it used up', (await admin('GET', '/admin/promos?q=ONEUSE')).data.promos[0].status === 'used_up');

  // ---- new customers only (Fay has not paid for anything yet; Dan has)
  check('new customers only: refused for someone who has paid before, with the generic answer', (await ask('NEWBIE', 'claim', dan.token)).data.code === 'promo_invalid' && (await ask('NEWBIE', 'claim', fay.token)).status === 200);
  check('a free or complimentary order does not make a customer', !promo.isCustomer(api.db, fay.account.id));

  // ---- the end date: an ended code is refused, a later end brings it back
  const ending = await make({ code: 'ENDING', value: 10, expiresAt: Date.now() + 60000 });
  api.db.prepare('UPDATE promo_codes SET expires_at = ? WHERE id = ?').run(Date.now() - 1, ending.id);
  check('an ended code is refused', (await ask('ENDING')).data.code === 'promo_invalid');
  await admin('PATCH', `/admin/promos/${ending.id}`, { expiresAt: Date.now() + DAY });
  check('a later end brings it back', (await ask('ENDING')).status === 200);

  // ---- a 100% code: a free order, no Stripe
  await make({ code: 'FREEPLOT', value: 100, appliesTo: ['plots'] });
  const lot5 = nextLot();
  const sessionsBefore = S.sessions.size;
  const free = await call('POST', `/plots/${lot5.id}/claim`, { token: cara.token, body: { ...biz('Cara Free', 7), promoCode: 'FREEPLOT' } });
  const fo = free.data.checkout?.orderId;
  check('a 100% code: no Stripe session, the claim is done at once as a free order', free.status === 200 && free.data.checkout.free === true && free.data.checkout.cents === 0 && free.data.checkout.url === `https://voxel.test/?paid=${fo}` && S.sessions.size === sessionsBefore && order(fo).status === 'paid' && order(fo).cents === 0 && order(fo).promo_code === 'FREEPLOT' && (await plot(lot5.id)).owner === 'Cara', JSON.stringify(free.data));
  check('...its use is redeemed, and the free order is audited', redemption(fo).status === 'redeemed' && api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'billing.free_order' AND target_id = ?").get(String(fo)).n === 1);
  check('a free order does not make a customer either', !promo.isCustomer(api.db, cara.account.id));
  await admin('POST', `/admin/billing/orders/${fo}/refund`);
  check('refunding a free order voids the use, with no Stripe refund', redemption(fo).status === 'voided' && order(fo).status === 'refunded' && !S.refunds.some((r) => r.payment_intent === `pi_${fo}`));

  // ---- Pro: the first month only, as a one-off coupon, in subscription mode
  const aprof = (await call('POST', '/businesses', { token: amy.token, body: { name: 'Amy Cafe', category: 'food', district: 'creator', website: 'https://amy.test', description: 'Coffee and cake all day, by the river in Creator Commons.' } })).data;
  await make({ code: 'PROHALF', value: 50, appliesTo: ['pro'] });
  const pc = await call('POST', `/businesses/${aprof.slug}/checkout`, { token: amy.token, body: { product: 'pro', promoCode: 'PROHALF' } });
  const ps = sessionOf(pc.data.orderId);
  const coupon = S.coupons.at(-1);
  const halfPro = Math.round(PRODUCTS.pro.cents / 2);
  check('Pro with a code: a subscription at the full monthly price, the first month less the code', ps.params.mode === 'subscription' && ps.params['line_items[0][price_data][unit_amount]'] === String(PRODUCTS.pro.cents) && ps.params['line_items[0][price_data][recurring][interval]'] === 'month' && ps.params['discounts[0][coupon]'] === coupon.id && order(pc.data.orderId).cents === PRODUCTS.pro.cents - halfPro, JSON.stringify(ps.params).slice(0, 400));
  check('...the coupon: that amount off, once, for this order alone', coupon.params.amount_off === String(halfPro) && coupon.params.duration === 'once' && coupon.params.currency === 'usd' && coupon.params.max_redemptions === '1' && coupon.key === `vv-promo-coupon-${pc.data.orderId}`);
  check('the Launch Pack is not covered by a Pro code', (await call('POST', `/businesses/${aprof.slug}/checkout`, { token: amy.token, body: { product: 'launch', promoCode: 'PROHALF' } })).data.code === 'promo_not_applicable');
  await make({ code: 'PROFREE', value: 100, appliesTo: ['pro'] });
  const bprof = (await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Bikes', category: 'food', district: 'creator', website: 'https://bob.test', description: 'Bikes fixed while you wait, by the canal in Creator Commons.' } })).data;
  const pf = await call('POST', `/businesses/${bprof.slug}/checkout`, { token: bob.token, body: { product: 'pro', promoCode: 'PROFREE' } });
  check('Pro free for its first month still goes through Stripe (a card is saved for the months after)', pf.status === 200 && sessionOf(pf.data.orderId)?.params.mode === 'subscription' && S.coupons.at(-1).params.amount_off === String(PRODUCTS.pro.cents) && order(pf.data.orderId).cents === 0 && order(pf.data.orderId).status === 'pending', JSON.stringify(pf.data));
  // the session completes with nothing to pay
  const pfs = sessionOf(pf.data.orderId);
  await webhook('checkout.session.completed', { id: pfs.id, object: 'checkout.session', mode: 'subscription', status: 'complete', payment_status: 'no_payment_required', client_reference_id: String(pf.data.orderId), subscription: 'sub_bob', metadata: { order: String(pf.data.orderId) } });
  check('...and once Stripe completes it, Pro starts and the use is redeemed', order(pf.data.orderId).status === 'paid' && redemption(pf.data.orderId).status === 'redeemed' && (await call('GET', '/me', { token: bob.token })).data.account.pro === true);
  // the Launch Pack free with an amount code
  await make({ code: 'LAUNCH9', kind: 'amount', value: PRODUCTS.launch.cents, appliesTo: ['launch'] });
  const lf = await call('POST', `/businesses/${aprof.slug}/checkout`, { token: amy.token, body: { product: 'launch', promoCode: 'LAUNCH9' } });
  check('the Launch Pack free: no Stripe, the week starts at once, back to the profiles page', lf.data.free === true && lf.data.url === `https://voxel.test/business/manage?paid=${lf.data.orderId}` && order(lf.data.orderId).status === 'paid' && api.db.prepare("SELECT COUNT(*) AS n FROM entitlements WHERE order_id = ? AND kind = 'launch'").get(lf.data.orderId).n === 1);

  // ---- a market stall: an amount code that would leave 20¢ leaves Stripe's 50¢
  const { weekStartOf, addWeeks, weekWindow } = await imp('market/weeks.js');
  const nextWeek = addWeeks(weekStartOf(), 1);
  const stall = (await call('GET', `/market/SD-0004/${nextWeek}`)).data.stalls[0];
  await make({ code: 'STALLX', kind: 'amount', value: stall.cents - 20, appliesTo: ['market'] });
  const sb = await call('POST', '/market/book', { token: cara.token, body: { siteCode: 'SD-0004', week: nextWeek, stallId: stall.id, hours: 24, start: weekWindow(nextWeek).start + 2 * DAY, brand: 'Cara Cakes', product: 'Cakes', promoCode: 'STALLX' } });
  check('a stall with a code that would leave under 50¢ is charged 50¢', sb.status === 200 && order(sb.data.checkout.orderId).cents === STRIPE_MIN_CENTS && sessionOf(sb.data.checkout.orderId).params['line_items[0][price_data][unit_amount]'] === String(STRIPE_MIN_CENTS) && order(sb.data.checkout.orderId).promo_cents === stall.cents - STRIPE_MIN_CENTS, JSON.stringify([sb.data, stall.cents]).slice(0, 300));

  // ---- the cart: one code, on the lines it covers, after the Pro discount; the $4 minimum before the code
  const gprof = (await call('POST', '/businesses', { token: eve.token, body: { name: 'Eve Ink', category: 'food', district: 'creator', website: 'https://eve.test', description: 'Tattoos and lettering, booked a week ahead in Creator Commons.' } })).data;
  const add = (token, item) => call('POST', '/cart/items', { token, body: item });
  const lot6 = nextLot();
  const lot7 = nextLot();
  await add(eve.token, { kind: 'claim', plotId: lot6.id, input: biz('Eve Six', 14) });
  await add(eve.token, { kind: 'launch', business: gprof.slug });
  await make({ code: 'CARTPLOT', value: 20, appliesTo: ['plots'] });
  const applied = await call('POST', '/cart/promo', { token: eve.token, body: { code: 'cartplot' } });
  fits('the cart with a code', types.CART_VIEW, applied.data);
  const v = applied.data;
  const plotLine = v.items.find((i) => i.kind === 'claim');
  check('the cart shows the code as its own line, on the plot only', v.promo.code === 'CARTPLOT' && v.promo.label === '20% off' && v.promo.cents === Math.round(plotLine.cents * 0.2) && plotLine.promoCents === v.promo.cents && v.items.find((i) => i.kind === 'launch').promoCents === 0 && v.totalCents === v.items.reduce((a, i) => a + i.cents, 0) - v.promo.cents, JSON.stringify(v).slice(0, 400));
  check('one code per cart: another replaces it, a bad one is refused and changes nothing', (await call('POST', '/cart/promo', { token: eve.token, body: { code: 'NOSUCH' } })).data.code === 'promo_invalid' && (await call('GET', '/cart', { token: eve.token })).data.promo.code === 'CARTPLOT');
  const co = await call('POST', '/cart/checkout', { token: eve.token });
  fits('the checkout', types.CART_CHECKOUT_RESULT, co.data);
  const parent = co.data.checkout.orderId;
  const kids = api.db.prepare('SELECT * FROM orders WHERE parent_id = ? ORDER BY id').all(parent);
  const cs = sessionOf(parent);
  const plotKid = kids.find((k) => k.product === 'lease');
  check('checkout: each line is sent to Stripe at its price less its share', cs.params.mode === 'payment' && cs.params['line_items[0][price_data][unit_amount]'] === String(plotLine.cents - v.promo.cents) && cs.params['line_items[1][price_data][unit_amount]'] === String(PRODUCTS.launch.cents) && order(parent).cents === v.totalCents && order(parent).promo_cents === v.promo.cents && plotKid.promo_cents === v.promo.cents && co.data.checkout.promo.cents === v.promo.cents, JSON.stringify(cs.params).slice(0, 300));
  check('the parent order reserves the use', redemption(parent).status === 'reserved' && redemption(parent).cents_off === v.promo.cents && !redemption(plotKid.id));
  await pay(parent);
  check('paid: redeemed, and the code leaves the cart', redemption(parent).status === 'redeemed' && (await call('GET', '/cart', { token: eve.token })).data.promo === null);
  await admin('POST', `/admin/billing/orders/${plotKid.id}/refund`);
  check('a line refunded: its share comes off what the code gave, the refund is that line\'s amount', redemption(parent).cents_off === 0 && redemption(parent).status === 'redeemed' && S.refunds.at(-1).amount === String(plotKid.cents));
  await admin('POST', `/admin/billing/orders/${parent}/refund`);
  check('the whole cart refunded: the use is voided', redemption(parent).status === 'voided');

  // the minimum is before the code; Pro in the cart with a code that covers everything: subscription mode, Pro at its full price plus a coupon
  await make({ code: 'ALLHALF', value: 50, appliesTo: ['all'], perAccountLimit: 3 });
  await add(eve.token, { kind: 'claim', plotId: lot7.id, input: biz('Eve Seven', 7) });
  await add(eve.token, { kind: 'pro', business: gprof.slug });
  const pv = (await call('POST', '/cart/promo', { token: eve.token, body: { code: 'ALLHALF' } })).data;
  const proItem = pv.items.find((i) => i.kind === 'pro');
  const plot7 = pv.items.find((i) => i.kind === 'claim');
  check('with Pro in the cart the code comes off the Pro plot price, and off Pro', plot7.discountCents > 0 && plot7.promoCents === Math.round(plot7.cents * 0.5) && proItem.promoCents === Math.round(PRODUCTS.pro.cents * 0.5));
  const pco = (await call('POST', '/cart/checkout', { token: eve.token })).data.checkout;
  const pcs = sessionOf(pco.orderId);
  const proIdx = [0, 1].find((i) => pcs.params[`line_items[${i}][price_data][recurring][interval]`] === 'month');
  check('...subscription mode: Pro at the full monthly price with a once-off coupon, the plot line less its share', pco.mode === 'subscription' && pcs.params[`line_items[${proIdx}][price_data][unit_amount]`] === String(PRODUCTS.pro.cents) && pcs.params[`line_items[${1 - proIdx}][price_data][unit_amount]`] === String(plot7.cents - plot7.promoCents) && pcs.params['discounts[0][coupon]'] === S.coupons.at(-1).id && S.coupons.at(-1).params.amount_off === String(proItem.promoCents) && pco.cents === pv.totalCents, JSON.stringify([pcs.params, pv.totalCents]).slice(0, 500));
  await call('DELETE', '/cart', { token: eve.token });

  // a cart a 100% code makes free: no Stripe, every line done at once
  await make({ code: 'FREECART', value: 100, appliesTo: ['plots', 'market'] });
  const lot8 = nextLot();
  await add(fay.token, { kind: 'claim', plotId: lot8.id, input: biz('Fay Eight', 30) });
  const fv = (await call('POST', '/cart/promo', { token: fay.token, body: { code: 'FREECART' } })).data;
  check('a free cart is still at least the minimum before the code', fv.totalCents === 0 && fv.ready === (fv.subtotalCents >= CART.minimumCents) && fv.missingCents === Math.max(0, CART.minimumCents - fv.items[0].cents));
  const sessions2 = S.sessions.size;
  const fco = await call('POST', '/cart/checkout', { token: fay.token });
  fits('a free cart checkout', types.CART_CHECKOUT_RESULT, fco.data);
  check('a free cart: no Stripe session, the plot is Fay\'s, the cart is empty', fco.data.checkout?.mode === 'free' && fco.data.checkout.url === `https://voxel.test/cart?paid=${fco.data.checkout.orderId}` && S.sessions.size === sessions2 && order(fco.data.checkout.orderId).status === 'paid' && (await plot(lot8.id)).owner === 'Fay' && (await call('GET', '/cart', { token: fay.token })).data.count === 0 && redemption(fco.data.checkout.orderId).status === 'redeemed', JSON.stringify(fco.data));

  // a code the cart can no longer use stops its checkout, with the reason and the cart
  await add(cara.token, { kind: 'claim', plotId: nextLot().id, input: biz('Cara Nine', 30) });
  await make({ code: 'SHORT', value: 10, appliesTo: ['plots'] }).then(async (p) => {
    await call('POST', '/cart/promo', { token: cara.token, body: { code: 'SHORT' } });
    await admin('POST', `/admin/promos/${p.id}/deactivate`);
  });
  const shownBad = (await call('GET', '/cart', { token: cara.token })).data;
  const stopped = await call('POST', '/cart/checkout', { token: cara.token });
  check('a code switched off after it was applied: the cart says so, and checkout stops with the cart', shownBad.promo.error === "That code isn't valid." && shownBad.promo.cents === 0 && stopped.status === 400 && stopped.data.code === 'promo_invalid' && stopped.data.cart?.promo?.code === 'SHORT');
  check('...and taking the code off lets it go through', (await call('DELETE', '/cart/promo', { token: cara.token })).data.promo === null && (await call('POST', '/cart/checkout', { token: cara.token })).data.checkout?.orderId > 0);

  // ---- guessing: failed tries are limited per account and per network
  const g = await start({ ...env, PROMO_TRIES: '3', PROMO_TRY_MINUTES: '15' });
  const gu = await signup('Guess', g.call);
  const gadmin = (body) => g.call('POST', '/admin/promos', { token: ADMIN, body });
  await gadmin({ code: 'REAL10', value: 10 });
  const tries = [];
  for (const c of ['AAA1', 'AAA2', 'AAA3']) tries.push((await g.call('POST', '/promo/check', { token: gu.token, body: { code: c, kind: 'claim' } })).data.code);
  const blocked = await g.call('POST', '/promo/check', { token: gu.token, body: { code: 'REAL10', kind: 'claim' } });
  check('after the allowed failed tries, every code is refused for a while, even a real one', tries.every((t) => t === 'promo_invalid') && blocked.status === 429 && blocked.data.code === 'promo_rate_limited' && blocked.data.retryAfterMs > 0 && /Try again in 15 minutes/.test(blocked.data.error), JSON.stringify(blocked.data));
  fits('a limited try', types.PROMO_REFUSED, blocked.data);
  const gu2 = await signup('Guess2', g.call);
  check('...from the same network too (another account)', (await g.call('POST', '/promo/check', { token: gu2.token, body: { code: 'REAL10', kind: 'claim' } })).status === 429);
  check('a right code is not counted as a failure', promo.isGeneric('used') === false && promo.isGeneric('unknown') === true);
  g.api.close?.();
  g.api.server.close();
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
