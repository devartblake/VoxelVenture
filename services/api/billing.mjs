import crypto from 'node:crypto';
import { attempt, dryRun, transaction } from './db.mjs';
import * as core from './core.mjs';
import * as community from './community.mjs';
import * as market from './market.mjs';
import { ApiError, fail, requireAccount } from './core.mjs';
import { audit, ADMIN, SYSTEM, byAccount } from './audit.mjs';
import * as promo from './promo.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// Payments through Stripe Checkout (phase 4, docs/monetization/billing.md): the Launch Pack (once), Pro (monthly) and sponsored placements (a week),
// each for one business profile; and, in the game, leases (claiming, taking over or renewing a plot), market stalls and ad spaces (a billboard or
// banner for its days, payAd). A lease, a stall or an ad space is held for the player while they pay and only happens once the payment is confirmed
// (step 2): what an order does is in fulfil(). A disputed payment pauses what it bought until the dispute closes, and a part refund made in the
// Stripe dashboard is allocated to what the payment bought (refundedInStripe, disputeOpened, disputeClosed below).
// The cart (cart.mjs) pays for several of these at once: one parent order (product 'cart', the Stripe session) and a child order per line
// (orders.parent_id), each the order a single purchase makes; markCartPaid carries them out line by line and a line that cannot be done is refunded alone.
//
//   1. checkout   the owner asks for a product; the server makes a pending order at the catalogue's price (@voxelventure/business-core) and a
//                 Stripe Checkout session for exactly that amount, and sends the owner to Stripe's page
//   2. webhook    Stripe tells the server what happened, signed with STRIPE_WEBHOOK_SECRET. Only this (or step 4) marks an order paid,
//                 and each Stripe event is applied once however many times it is delivered
//   3. grant      a paid order makes an entitlement: the Launch Pack and a placement for 7 days, Pro until the end of the paid month
//   4. reconcile  every hour (and on demand) the server asks Stripe about orders still pending and Pro plans still active, so a lost
//                 webhook cannot leave a customer paid but without what they bought, or a cancelled plan still running
//
// Promo codes (promo.mjs): any checkout here takes an optional `promoCode`. The server prices it (on the eligible lines, after the Pro and renewal
// discounts), reserves the use with the order and charges Stripe the lower amount: a one-time line costs less; Pro's first month is taken off with a
// Stripe coupon (duration once) so the plan renews at its full price. A checkout a code makes free opens no Stripe session (comp below), except one
// with Pro, which still goes through Stripe to save a card for the months after.
//
// Settings: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PUBLIC_SITE_URL (where Stripe sends the owner back), STRIPE_API_URL (tests only),
// TERMS_URL and REFUND_POLICY_URL (shown at checkout; both required with a live key).
import { PRODUCTS, placementOf, priceOf, planOf, promoGroupOf, DAY_MS } from '@voxelventure/business-core';
import { categoryOf, districtOf, isSlug } from '@voxelventure/business-core';

const { termLabel } = await imp('game/leases.js');
export const HOLD_MS = 30 * 60000; // Stripe's shortest checkout expiry: a sponsored spot, a plot or a stall is held this long for a checkout in progress
const TOLERANCE_S = 300; // a webhook signed longer ago than this is refused (a replay)
const now = () => Date.now();

export const billingOn = (env = process.env) => Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && siteOf(env));
const siteOf = (env) => String(env.PUBLIC_SITE_URL || env.API_ORIGIN || '').replace(/\/+$/, '').replace(/^\*$/, '');

// ---- the Stripe API (form-encoded, as Stripe expects; no SDK needed) ---------------------------------------------------------------
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
export async function stripe(env, method, path, params = null, { idempotencyKey, fetchImpl = fetch } = {}) {
  const base = String(env.STRIPE_API_URL || 'https://api.stripe.com').replace(/\/+$/, '');
  const body = params ? formEncode(params).toString() : '';
  const url = `${base}/v1${path}${method === 'GET' && body ? `?${body}` : ''}`;
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: method === 'GET' ? undefined : body,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(502, 'The payment service cannot be reached. Try again in a moment.', 'stripe_unreachable');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(502, `The payment service refused: ${data.error?.message ?? res.status}`, 'stripe_error');
  return data;
}

// ---- 1. checkout ----------------------------------------------------------------------------------------------------------------
const ownBusiness = (db, account, slug) => {
  const b = (isSlug(slug) ? db.prepare("SELECT * FROM businesses WHERE slug = ? AND status = 'published'").get(String(slug)) : null) ?? fail(404, 'No such business.', 'no_business');
  if (b.account_id !== account.id) fail(403, 'This is not your business.', 'forbidden');
  return b;
};
const entitlementsOf = (db, businessId) => db.prepare('SELECT * FROM entitlements WHERE business_id = ?').all(businessId);
export const planFor = (db, businessId, at = now()) => planOf(entitlementsOf(db, businessId), at);

// How many of a placement's slots are taken now: paid weeks still running (or paused by a dispute, which may come back), and checkouts in progress
// still holding a spot.
export function taken(db, key, at = now()) {
  const paid = db.prepare("SELECT COUNT(*) AS n FROM entitlements WHERE placement = ? AND status IN ('active', 'paused') AND ends_at > ?").get(key, at).n;
  const held = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE placement = ? AND status = 'pending' AND hold_until > ?").get(key, at).n;
  return paid + held;
}
export function availability(db, key, at = now()) {
  const p = placementOf(key) ?? fail(400, 'No such placement.', 'bad_placement');
  return { placement: p.key, label: p.label, cents: p.cents, slots: p.slots, free: Math.max(0, p.slots - taken(db, p.key, at)) };
}

export async function createCheckout(db, account, slug, input, env = process.env, fetchImpl = fetch, opts = {}) {
  requireAccount(account);
  if (!billingOn(env)) fail(503, 'Payments are not set up yet.', 'billing_off');
  const b = ownBusiness(db, account, slug);
  const product = PRODUCTS[input.product] ? input.product : fail(400, 'product must be launch, pro or sponsored.', 'bad_product');
  let placement = null;
  if (product === 'sponsored') {
    const p = placementOf(input.placement) ?? fail(400, 'Choose where the placement goes.', 'bad_placement');
    if (p.kind === 'category' && !categoryOf(p.target)) fail(400, 'No such category.', 'bad_placement');
    if (p.kind === 'district' && !districtOf(p.target)) fail(400, 'No such district.', 'bad_placement');
    placement = p.key;
  }
  const cents = priceOf(product, placement) ?? fail(400, 'That is not for sale.', 'bad_product');
  const closing = [];
  // the order (and, for a placement, the held spot) is made atomically, so two owners cannot both take the last spot
  const order = transaction(db, () => {
    if (product === 'pro' && planFor(db, b.id).pro) fail(409, 'This business already has Pro.', 'already_pro');
    if (placement && taken(db, placement) >= placementOf(placement).slots) fail(409, 'That spot is full right now. Try another, or come back when a week ends.', 'placement_full');
    const code = applyPromo(db, account, input.promoCode, [{ group: promoGroupOf(product), cents }], { ip: opts.ip, env }, closing);
    return insertOrder(db, account, code, { business_id: b.id, product, placement, cents, hold_until: placement ? now() + HOLD_MS : null });
  });
  closeSessions(env, closing, fetchImpl);
  const item = PRODUCTS[product];
  const name = `${item.name}${placement ? ` (${placementOf(placement).label}${placementOf(placement).target ? `: ${placementOf(placement).target}` : ''})` : ''} for ${b.name}`;
  if (order.cents === 0 && item.mode !== 'subscription') return { orderId: order.id, ...(await comp(db, account, order, '/business/manage', env, fetchImpl, opts.after)) };
  // Pro: the recurring price stays the catalogue's; a code takes its first month down with a one-off Stripe coupon
  const lines = item.mode === 'subscription' ? [{ name, cents, interval: item.interval }] : null;
  const url = await openSession(db, account, order, { name, mode: item.mode, interval: item.interval, back: '/business/manage', metadata: { business: b.slug, product }, lines, couponCents: item.mode === 'subscription' ? order.promo_cents : 0 }, env, fetchImpl);
  audit(db, byAccount(account), 'billing.checkout', { kind: 'order', id: order.id }, { product, placement, cents: order.cents, business: b.slug, ...promoDetail(order) });
  return { orderId: order.id, url, cents: order.cents, ...shownPromo(order) };
}

// ---- promo codes at checkout (promo.mjs) ------------------------------------------------------------------------------------------------
// A code for a checkout's lines ([{ group, cents }]), inside the checkout's transaction: checked (rate limited; a failure is thrown as the player sees it).
// An open checkout of this account that holds the same code is given up first (the new one replaces it); its Stripe page is closed afterwards (`closing`).
export function applyPromo(db, account, rawCode, lines, ctx, closing) {
  if (rawCode == null || String(rawCode).trim() === '') return null;
  const r = promo.evaluate(db, account, rawCode, lines, ctx);
  for (const o of db.prepare("SELECT o.* FROM promo_redemptions r JOIN orders o ON o.id = r.order_id WHERE r.promo_id = ? AND r.account_id = ? AND r.status = 'reserved' AND o.status = 'pending'").all(r.promo.id, account.id)) {
    expire(db, o, 'expired');
    if (o.stripe_session) closing.push(o.stripe_session);
  }
  return r;
}
export const closeSessions = (env, sessions, fetchImpl) => {
  for (const s of sessions) stripe(env, 'POST', `/checkout/sessions/${encodeURIComponent(s)}/expire`, {}, { fetchImpl }).catch(() => {});
};
// A single purchase's order, at its price less the code (`code`: applyPromo's answer, or null), with the code's use reserved.
function insertOrder(db, account, code, o) {
  const off = code?.discount.cents ?? 0;
  const cols = { account_id: account.id, ...o, cents: o.cents - off, promo_code: code ? code.promo.code : null, promo_cents: off, created_at: now() };
  const id = Number(db.prepare(`INSERT INTO orders (${Object.keys(cols).join(', ')}) VALUES (${Object.keys(cols).map(() => '?').join(', ')})`).run(...Object.values(cols)).lastInsertRowid);
  if (code) promo.reserve(db, account, code.promo, id, off);
  return orderById(db, id);
}
export const promoDetail = (order) => (order.promo_code ? { promo: order.promo_code, promoCents: order.promo_cents } : {});
export const shownPromo = (order) => (order.promo_code ? { promo: { code: order.promo_code, cents: order.promo_cents } } : {});

// A checkout a code made free (nothing to pay, and no subscription to start): no Stripe session. The order is paid at 0 cents and carried out at once,
// exactly as a payment would carry it out; the player is sent to the same "paid" page. A cart's order does the same for every line.
export async function comp(db, account, order, back, env, fetchImpl, after) {
  const r = transaction(db, () => {
    audit(db, byAccount(account), 'billing.free_order', { kind: 'order', id: order.id }, { product: order.product, ...promoDetail(order) });
    return markPaid(db, orderById(db, order.id), {});
  });
  for (const f of [].concat(r?.fulfilled ?? [])) after?.(f);
  for (const id of [].concat(r?.refund ?? [])) await refundOrder(db, id, SYSTEM, env, fetchImpl, refundWhy(db, id));
  return { url: `${siteOf(env)}${back}?paid=${order.id}`, cents: 0, free: true, ...shownPromo(order) };
}

// The Stripe Checkout session for an order, for exactly its amount. If Stripe refuses, the order fails and anything it held is let go.
// A cart's order passes `lines` (one per child order: { name, cents, interval? }; a line with an interval is the recurring one, Pro), which
// add up to the order's amount; in subscription mode the other lines are one-time items on the first invoice.
// `couponCents`: Pro's first month less a promo code, as a Stripe coupon made for this order alone (duration once, amount_off): the recurring price stays
// the catalogue's, so the months after are charged in full.
export async function openSession(db, account, order, { name, mode = 'payment', interval, back, metadata = {}, lines = null, couponCents = 0 }, env, fetchImpl) {
  const site = siteOf(env);
  const email = db.prepare('SELECT email, email_verified FROM accounts WHERE id = ?').get(account.id);
  let session;
  try {
    const coupon = couponCents > 0 ? await stripe(env, 'POST', '/coupons', { amount_off: couponCents, currency: 'usd', duration: 'once', max_redemptions: 1, name: `Code ${order.promo_code ?? ''}`.trim().slice(0, 40), metadata: { order: order.id } }, { idempotencyKey: `vv-promo-coupon-${order.id}`, fetchImpl }) : null;
    session = await stripe(env, 'POST', '/checkout/sessions', {
      ...(coupon ? { discounts: { 0: { coupon: coupon.id } } } : {}),
      mode,
      client_reference_id: String(order.id),
      customer_email: email?.email_verified ? email.email : undefined,
      line_items: Object.fromEntries((lines ?? [{ name, cents: order.cents, interval: mode === 'subscription' ? interval : null }]).map((l, i) => [i, { quantity: 1, price_data: { currency: 'usd', unit_amount: l.cents, product_data: { name: String(l.name).slice(0, 250) }, recurring: l.interval ? { interval: l.interval } : undefined } }])),
      metadata: { order: order.id, ...metadata },
      ...(mode === 'subscription' ? { subscription_data: { metadata: { order: order.id } } } : { payment_intent_data: { metadata: { order: order.id } } }),
      success_url: `${site}${back}?paid=${order.id}`,
      cancel_url: `${site}${back}?canceled=${order.id}`,
      expires_at: Math.floor((now() + HOLD_MS) / 1000) + 60,
      // the terms and refund policy, beside the pay button (Stripe's own terms checkbox needs a dashboard setting, this does not)
      ...(env.TERMS_URL ? { custom_text: { submit: { message: `By paying you agree to the terms (${env.TERMS_URL})${env.REFUND_POLICY_URL ? ` and the refund policy (${env.REFUND_POLICY_URL})` : ''}.` } } } : {}),
    }, { idempotencyKey: `vv-order-${order.id}`, fetchImpl });
  } catch (e) {
    transaction(db, () => {
      db.prepare('UPDATE orders SET note = ? WHERE id = ?').run(String(e.message).slice(0, 200), order.id);
      expire(db, orderById(db, order.id), 'failed');
    });
    throw e;
  }
  db.prepare('UPDATE orders SET stripe_session = ? WHERE id = ?').run(session.id, order.id);
  return session.url;
}

// ---- in the game: leases and market stalls ----------------------------------------------------------------------------------------------
// Claim, take over or renew a plot, or build onto its outside, paid for. Everything the action checks is checked now (by doing it and undoing it), the
// price is what it would write in the ledger, and the plot is held for the player while they pay. The action itself runs when the payment arrives (fulfil).
// An outside change that turns out to cost nothing (it is no dearer than the one the building has) needs no payment: it is done at once.
// A take-over is charged like any lease: no money goes to the tenant it replaces (the 1.25x payout waits for a legal, tax and fraud review).
// opts.pro: price as Pro (a cart that buys Pro in the same payment, cart.mjs), or not; left out, the account's own plan decides.
export const LEASE_ACTIONS = {
  claim: (db, account, plotId, input, opts) => core.claimPlot(db, account, plotId, input, opts),
  takeover: (db, account, plotId, input, opts) => core.takeOverPlot(db, account, plotId, input, opts),
  renew: (db, account, plotId, input, opts) => community.renewLease(db, account, plotId, input, opts),
  exterior: (db, account, plotId, input) => core.upgradeExterior(db, account, plotId, input),
};
// What a lease action would charge (dollars), for which plot title and term: it is done and undone (db.mjs dryRun), so everything it checks is checked.
export function leaseWould(db, account, plotId, action, input, opts = {}) {
  const run = LEASE_ACTIONS[action] ?? fail(400, 'Unknown action.', 'bad_action');
  const id = Number(plotId);
  return dryRun(db, () => {
    const out = run(db, account, id, input, opts);
    const plot = out.plot ?? out;
    const price = out.paid ?? db.prepare('SELECT price FROM ledger WHERE plot_id = ? ORDER BY id DESC LIMIT 1').get(id).price;
    return { price, title: plot.title, days: plot.lease?.days ?? null };
  });
}
export const leaseLabel = (action, id, would) => (action === 'exterior' ? `${LEASE_LABEL[action]}: ${would.title} (plot ${id})` : `${LEASE_LABEL[action]}: ${would.title} (plot ${id}, ${termLabel(would.days)})`);
const LEASE_LABEL = { claim: 'Lease', takeover: 'Take-over lease', renew: 'Lease renewal', exterior: 'Building upgrade' };
export async function payLease(db, account, plotId, action, body = {}, env = process.env, fetchImpl = fetch, opts = {}) {
  requireAccount(account);
  if (!billingOn(env)) fail(503, 'Payments are not set up yet.', 'billing_off');
  const run = LEASE_ACTIONS[action] ?? fail(400, 'Unknown action.', 'bad_action');
  const id = Number(plotId);
  const { promoCode, ...input } = body ?? {};
  const closing = [];
  const order = transaction(db, () => {
    const would = leaseWould(db, account, id, action, input);
    if (!(would.price > 0)) return null; // nothing to pay (a free outside change): done below, without a checkout
    const label = leaseLabel(action, id, would);
    const cents = Math.round(would.price * 100);
    const code = applyPromo(db, account, promoCode, [{ group: promoGroupOf(action), cents }], { ip: opts.ip, env }, closing);
    return insertOrder(db, account, code, { product: 'lease', target: `plot:${id}`, request: JSON.stringify({ action, input, days: would.days }), label, cents, hold_until: now() + HOLD_MS });
  });
  closeSessions(env, closing, fetchImpl);
  if (!order) {
    return transaction(db, () => {
      const out = run(db, account, id, input);
      audit(db, byAccount(account), `plot.${action}`, { kind: 'plot', id }, leaseDetail(action, out));
      return out;
    });
  }
  if (order.cents === 0) return { checkout: { orderId: order.id, ...(await comp(db, account, order, '/', env, fetchImpl, opts.after)) } };
  const url = await openSession(db, account, order, { name: order.label, back: '/', metadata: { plot: id, action } }, env, fetchImpl);
  audit(db, byAccount(account), 'billing.checkout', { kind: 'order', id: order.id }, { product: 'lease', action, plot: id, cents: order.cents, ...promoDetail(order) });
  return { checkout: { orderId: order.id, url, cents: order.cents, ...shownPromo(order) } };
}

// Book a market stall, paid for: a pending booking holds the stall while the player pays; it becomes a booking when the payment arrives.
export async function payStall(db, seed, account, body = {}, env = process.env, fetchImpl = fetch, opts = {}) {
  requireAccount(account);
  if (!billingOn(env)) fail(503, 'Payments are not set up yet.', 'billing_off');
  const { promoCode, ...input } = body ?? {};
  const closing = [];
  const { order, booked } = transaction(db, () => {
    const booked = market.book(db, seed, account, input, { holdUntil: now() + HOLD_MS });
    const label = `Market stall ${booked.stall.id} (${booked.siteCode}), ${booked.booking.hours} hours from ${new Date(booked.booking.start).toUTCString().slice(0, 22)}`;
    const code = applyPromo(db, account, promoCode, [{ group: 'market', cents: booked.paid }], { ip: opts.ip, env }, closing);
    return { booked, order: insertOrder(db, account, code, { product: 'market', target: `booking:${booked.booking.id}`, label, cents: booked.paid, hold_until: now() + HOLD_MS }) };
  });
  closeSessions(env, closing, fetchImpl);
  if (order.cents === 0) return { checkout: { orderId: order.id, ...(await comp(db, account, order, '/', env, fetchImpl, opts.after)) }, booking: booked.booking, stall: booked.stall };
  const url = await openSession(db, account, order, { name: order.label, back: '/', metadata: { booking: booked.booking.id } }, env, fetchImpl);
  audit(db, byAccount(account), 'billing.checkout', { kind: 'order', id: order.id }, { product: 'market', booking: booked.booking.id, cents: order.cents, ...promoDetail(order) });
  return { checkout: { orderId: order.id, url, cents: order.cents, ...shownPromo(order) }, booking: booked.booking, stall: booked.stall };
}

// Book an ad space in the 3D city (a billboard or an aerial banner), paid for: AD_SPACES in @voxelventure/business-core, for its days, less the Pro
// discount for an account with Pro. The space is held for the player while they pay (the pending order on `ad:<slot>`); the ad goes up when the
// payment arrives (fulfil). Everything a booking checks is checked first (core.adQuote: the space is not booked or held by someone else, the ad is valid).
export async function payAd(db, account, slotId, body = {}, env = process.env, fetchImpl = fetch, opts = {}) {
  requireAccount(account);
  if (!billingOn(env)) fail(503, 'Payments are not set up yet.', 'billing_off');
  const { promoCode, ...input } = body ?? {};
  const ad = core.cleanAd(input); // (an expectedPrice the game sends is the free game's: with payments the server's price is the one charged)
  const closing = [];
  const order = transaction(db, () => {
    const pro = core.hasPro(db, account.id);
    const q = core.adQuote(db, account, slotId, { pro });
    const code = applyPromo(db, account, promoCode, [{ group: promoGroupOf('ad'), cents: q.cents }], { ip: opts.ip, env }, closing);
    return insertOrder(db, account, code, { product: 'ad', target: `ad:${q.slotId}`, request: JSON.stringify({ slotId: q.slotId, ad, days: q.days, pro }), label: q.label, cents: q.cents, hold_until: now() + HOLD_MS });
  });
  closeSessions(env, closing, fetchImpl);
  if (order.cents === 0) return { checkout: { orderId: order.id, ...(await comp(db, account, order, '/', env, fetchImpl, opts.after)) } };
  const url = await openSession(db, account, order, { name: order.label, back: '/', metadata: { ad: JSON.parse(order.request).slotId } }, env, fetchImpl);
  audit(db, byAccount(account), 'billing.checkout', { kind: 'order', id: order.id }, { product: 'ad', slot: JSON.parse(order.request).slotId, cents: order.cents, ...promoDetail(order) });
  return { checkout: { orderId: order.id, url, cents: order.cents, ...shownPromo(order) } };
}

// The paid order is carried out. { fulfilled } tells the server what changed (to tell the other players); { refund } when it can no longer
// be done (somebody else claimed the plot, booked the stall or the ad space after the hold ran out): the payment goes back.
const targetId = (order) => Number(String(order.target ?? '').split(':')[1]);
function fulfil(db, order) {
  const req = JSON.parse(order.request || '{}');
  if (req.done) return null;
  if (order.product === 'ad') {
    const r = core.startAdTerm(db, order, req);
    if (r.refund) return (db.prepare("UPDATE orders SET note = 'the ad space was booked by someone else before the payment completed: refunded' WHERE id = ?").run(order.id), { refund: order.id });
    db.prepare('UPDATE orders SET request = ? WHERE id = ?').run(JSON.stringify({ ...req, done: true }), order.id);
    audit(db, SYSTEM, 'ad.buy', { kind: 'ad', id: req.slotId }, { advertiser: r.slot.ad?.advertiser ?? null, order: order.id, until: r.until });
    return { fulfilled: { kind: 'ad', slotId: req.slotId } };
  }
  if (order.product === 'market') {
    const r = market.confirmBooking(db, targetId(order));
    if (r.refund) return (db.prepare("UPDATE orders SET note = 'the stall was booked by someone else before the payment completed: refunded' WHERE id = ?").run(order.id), { refund: order.id });
    db.prepare('UPDATE orders SET request = ? WHERE id = ?').run(JSON.stringify({ done: true }), order.id);
    return { fulfilled: { kind: 'market', stallId: r.booking.stallId } };
  }
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(order.account_id);
  const plotId = targetId(order);
  let out;
  try {
    // a cart line priced with the Pro the same payment bought is carried out at that price, whatever became of the Pro line (cart.mjs)
    out = attempt(db, () => LEASE_ACTIONS[req.action](db, account, plotId, req.input ?? {}, req.pro ? { pro: true } : {}));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    db.prepare('UPDATE orders SET note = ? WHERE id = ?').run(`could not be done once paid (${e.message}): refunded`.slice(0, 200), order.id);
    return { refund: order.id };
  }
  // an outside upgrade keeps what it replaced, so a refund can put it back (endPaidLease)
  const undo = req.action === 'exterior' ? { before: out.before, diff: out.diff } : {};
  db.prepare('UPDATE orders SET request = ? WHERE id = ?').run(JSON.stringify({ ...req, ...undo, done: true }), order.id);
  audit(db, byAccount(account), `plot.${req.action}`, { kind: 'plot', id: plotId }, { ...leaseDetail(req.action, out), order: order.id });
  return { fulfilled: { kind: 'lease', action: req.action, plotId, accountId: account.id, out } };
}

// What the audit log records about a lease action, paid for (in the game a take-over pays nobody out yet: see above).
export function leaseDetail(action, out) {
  const plot = out.plot ?? out;
  return {
    claim: { title: plot.title, value: plot.value, leaseDays: plot.lease?.days ?? null },
    takeover: { title: plot.title, paidOut: 0, previousOwner: out.previousOwner, previousAccount: out.previousAccount ?? null },
    renew: { paid: out.paid, leaseDays: plot.lease?.days ?? null },
    exterior: { paid: out.paid, diff: out.diff, value: plot.value },
  }[action];
}

// What an order held is let go (its checkout expired or failed): a pending stall is freed. (A plot's hold is the order's own hold_until.)
// A cart's order lets go of every line it held.
function release(db, order) {
  if (order.product === 'market') market.releaseBooking(db, targetId(order));
}
export function expire(db, order, status) {
  if (order?.status !== 'pending') return;
  db.prepare('UPDATE orders SET status = ?, hold_until = NULL WHERE id = ?').run(status, order.id);
  release(db, order);
  promo.release(db, order.id); // a promo code's use held by this checkout is free again
  for (const child of childrenOf(db, order)) expire(db, child, status);
}
export const childrenOf = (db, order) => (order?.product === 'cart' ? db.prepare('SELECT * FROM orders WHERE parent_id = ? ORDER BY id').all(order.id) : []);
const proChildOf = (db, order) => childrenOf(db, order).find((c) => c.product === 'pro') ?? null;

// ---- 2. the webhook ---------------------------------------------------------------------------------------------------------------
// Stripe signs "<timestamp>.<raw body>" with HMAC-SHA256; the Stripe-Signature header carries t=<timestamp> and one or more v1=<hex>.
export function verifySignature(raw, header, secret, at = now()) {
  const parts = String(header ?? '').split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || !secret) return false;
  if (Math.abs(at / 1000 - t) > TOLERANCE_S) return false;
  const want = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'));
  return sigs.some((s) => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), want));
}
export const signPayload = (raw, secret, t = Math.floor(now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

// Applies one event, once. Returns what the caller must do after the transaction (refund an oversold spot).
export function handleEvent(db, event) {
  return transaction(db, () => {
    if (db.prepare('SELECT 1 FROM stripe_events WHERE id = ?').get(String(event.id))) return { duplicate: true };
    db.prepare('INSERT INTO stripe_events (id, type, received_at) VALUES (?,?,?)').run(String(event.id), String(event.type), now());
    return apply(db, event) ?? {};
  });
}

export const orderById = (db, id) => (id ? db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id)) : null);
const orderOfSubscription = (db, sub, metaOrder) => orderById(db, metaOrder) ?? (sub ? db.prepare('SELECT * FROM orders WHERE stripe_subscription = ?').get(String(sub)) : null);

function apply(db, event) {
  const o = event.data?.object ?? {};
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const order = orderById(db, o.client_reference_id ?? o.metadata?.order);
      if (!order) return null;
      // a card payment is paid at once; a bank debit may complete later (async_payment_succeeded)
      if (o.payment_status !== 'paid' && o.status !== 'complete') return null;
      if (o.mode === 'payment' && o.payment_status !== 'paid') return null;
      return markPaid(db, order, { paymentIntent: o.payment_intent, subscription: o.subscription, periodEnd: null });
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      expire(db, orderById(db, o.client_reference_id ?? o.metadata?.order), event.type.endsWith('expired') ? 'expired' : 'failed');
      return null;
    }
    case 'invoice.paid': {
      // each paid month of Pro: the plan runs to the end of the period just paid
      const sub = o.subscription ?? o.parent?.subscription_details?.subscription;
      const meta = o.subscription_details?.metadata?.order ?? o.parent?.subscription_details?.metadata?.order;
      const order = orderOfSubscription(db, sub, meta);
      if (!order) return null;
      const periodEnd = Number(o.lines?.data?.[0]?.period?.end ?? o.period_end) * 1000 || null;
      const periodStart = Number(o.lines?.data?.[0]?.period?.start ?? o.period_start) * 1000 || null;
      // a month after the first one is a renewal (the renewal rate: conversions.mjs); each invoice's event is applied once
      const plan = order.product === 'cart' ? proChildOf(db, order) : order; // a cart's Pro is its child order
      if (plan && plan.status === 'paid' && periodStart && plan.paid_at && periodStart > plan.paid_at + DAY_MS) db.prepare('UPDATE orders SET renewals = renewals + 1 WHERE id = ?').run(plan.id);
      return markPaid(db, order, { subscription: sub, paymentIntent: o.payment_intent ?? null, periodEnd });
    }
    case 'customer.subscription.deleted': {
      const found = orderOfSubscription(db, o.id, o.metadata?.order);
      const order = found?.product === 'cart' ? proChildOf(db, found) : found;
      if (order) db.prepare("UPDATE entitlements SET ends_at = MIN(ends_at, ?) WHERE order_id = ? AND status = 'active'").run(now(), order.id);
      if (order) audit(db, SYSTEM, 'billing.pro_ended', { kind: 'order', id: order.id }, { subscription: o.id });
      return null;
    }
    case 'charge.refunded':
      return refundedInStripe(db, o); // a refund made in the Stripe dashboard (or ours, already recorded), in full or in part
    case 'charge.dispute.created':
      return disputeOpened(db, o);
    case 'charge.dispute.updated': {
      const d = db.prepare('SELECT * FROM disputes WHERE stripe_dispute = ?').get(String(o.id ?? ''));
      if (d) db.prepare('UPDATE disputes SET stripe_status = ? WHERE id = ?').run(String(o.status ?? d.stripe_status), d.id);
      return null;
    }
    case 'charge.dispute.closed':
      return disputeClosed(db, o);
    default:
      return null; // other events are recorded (so a retry is a no-op) and otherwise ignored
  }
}

// An order is paid: grant what it bought. Idempotent (a second call for a paid order only extends Pro to a later period end).
function markPaid(db, order, { paymentIntent = null, subscription = null, periodEnd = null }) {
  const at = now();
  if (order.status === 'refunded') return null; // paid after we refunded it (a retried webhook): nothing to grant
  if (order.product === 'cart') return markCartPaid(db, order, { paymentIntent, subscription, periodEnd });
  if (order.status !== 'paid') {
    db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, hold_until = NULL, stripe_payment_intent = COALESCE(?, stripe_payment_intent), stripe_subscription = COALESCE(?, stripe_subscription) WHERE id = ?").run(at, paymentIntent, subscription, order.id);
    audit(db, SYSTEM, 'billing.paid', { kind: 'order', id: order.id }, { product: order.product, placement: order.placement, cents: order.cents, ...promoDetail(order) });
    if (!order.parent_id) promo.redeem(db, order.id);
  } else if (paymentIntent || subscription) {
    db.prepare('UPDATE orders SET stripe_payment_intent = COALESCE(stripe_payment_intent, ?), stripe_subscription = COALESCE(stripe_subscription, ?) WHERE id = ?').run(paymentIntent, subscription, order.id);
  }
  if (order.product === 'lease' || order.product === 'market' || order.product === 'ad') return fulfil(db, orderById(db, order.id));
  const existing = db.prepare('SELECT * FROM entitlements WHERE order_id = ?').get(order.id);
  if (order.product === 'pro') {
    const end = periodEnd ?? at + 31 * DAY_MS; // the first invoice sets the exact end; a month until then
    // a cart's Pro line, for a profile that got Pro some other way while the cart was being paid: that line is refunded (and its plan cancelled)
    if (!existing && order.parent_id && planFor(db, order.business_id, at).pro) {
      db.prepare("UPDATE orders SET note = 'the profile already had Pro when the payment completed: refunded' WHERE id = ?").run(order.id);
      return { refund: order.id };
    }
    if (!existing) db.prepare('INSERT INTO entitlements (business_id, order_id, kind, starts_at, ends_at) VALUES (?,?,?,?,?)').run(order.business_id, order.id, 'pro', at, end);
    else if (periodEnd && periodEnd > existing.ends_at && existing.status === 'active') db.prepare('UPDATE entitlements SET ends_at = ? WHERE id = ?').run(periodEnd, existing.id);
    return null;
  }
  if (existing) return null;
  // a week of the Launch Pack or a placement; buying again while one runs adds the week after it
  const same = db.prepare("SELECT MAX(ends_at) AS e FROM entitlements WHERE business_id = ? AND kind = ? AND COALESCE(placement, '') = COALESCE(?, '') AND status = 'active'").get(order.business_id, order.product, order.placement).e;
  const start = Math.max(at, same ?? 0);
  const days = PRODUCTS[order.product].days;
  if (order.placement) {
    // the spot was held for this checkout; if it is somehow full now (the hold ran out mid-payment), refund rather than oversell
    const others = db.prepare("SELECT COUNT(*) AS n FROM entitlements WHERE placement = ? AND status = 'active' AND ends_at > ? AND business_id != ?").get(order.placement, at, order.business_id).n;
    if (others >= placementOf(order.placement).slots) {
      db.prepare("UPDATE orders SET note = 'the spot filled before payment completed: refunded' WHERE id = ?").run(order.id);
      return { refund: order.id };
    }
  }
  db.prepare('INSERT INTO entitlements (business_id, order_id, kind, placement, starts_at, ends_at) VALUES (?,?,?,?,?,?)').run(order.business_id, order.id, order.product, order.placement, start, start + days * DAY_MS);
  return null;
}

// A cart is paid: its lines are carried out one by one, each as its own order would be. A line that can no longer be done is refunded on its own
// (its amount only); the rest goes through. The cart's lines that were in this checkout leave the cart. Returns { fulfilled: [...], refund: [...] }.
// Applied again (a retried webhook, a later invoice), it changes nothing but Pro's paid period.
function markCartPaid(db, order, { paymentIntent, subscription, periodEnd }) {
  const first = order.status !== 'paid';
  if (first) {
    db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, hold_until = NULL, stripe_payment_intent = COALESCE(?, stripe_payment_intent), stripe_subscription = COALESCE(?, stripe_subscription) WHERE id = ?").run(now(), paymentIntent, subscription, order.id);
    audit(db, SYSTEM, 'billing.paid', { kind: 'order', id: order.id }, { product: 'cart', cents: order.cents, lines: childrenOf(db, order).length, ...promoDetail(order) });
    promo.redeem(db, order.id);
    const items = JSON.parse(order.request || '{}').items ?? [];
    if (items.length) db.prepare(`DELETE FROM cart_items WHERE account_id = ? AND id IN (${items.map(() => '?').join(',')})`).run(order.account_id, ...items);
    if (order.promo_code) db.prepare('UPDATE carts SET promo_code = NULL WHERE account_id = ? AND promo_code = ?').run(order.account_id, order.promo_code); // the code was used
  } else if (paymentIntent) db.prepare('UPDATE orders SET stripe_payment_intent = COALESCE(stripe_payment_intent, ?) WHERE id = ?').run(paymentIntent, order.id);
  const out = { fulfilled: [], refund: [] };
  for (const child of childrenOf(db, order)) {
    if (child.status === 'refunded') continue;
    if (child.status === 'paid' && child.product !== 'pro') continue; // done already: only Pro's next month moves anything
    const pro = child.product === 'pro';
    const r = markPaid(db, child, { paymentIntent: pro && !first ? null : paymentIntent, subscription: pro ? subscription : null, periodEnd: pro ? periodEnd : null });
    if (r?.fulfilled) out.fulfilled.push(r.fulfilled);
    if (r?.refund) out.refund.push(r.refund);
  }
  return out;
}

// What a paid order bought is taken back: it was refunded in full (status 'refunded'), or a dispute of its payment was lost (status 'charged_back':
// the bank took the money back). `source`: who refunded (admin, system, or stripe: the dashboard), for the order's refund record.
const sourceOf = (actor) => (actor?.kind === 'system' ? 'system' : 'admin');
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
// what a code is counted as having taken off an order, for the part of it `refunded` leaves paid
const promoShare = (order, refunded) => (order.cents > 0 ? Math.round(((order.promo_cents ?? 0) * Math.min(refunded, order.cents)) / order.cents) : 0);
const settled = (o) => o.status === 'refunded' || o.status === 'charged_back';
const refundedOf = (o) => (o.status === 'refunded' ? o.cents : (o.refunded_cents ?? 0)); // an order refunded before partial refunds were recorded counts in full
function revoke(db, order, actor, why, { status = 'refunded', source = sourceOf(actor) } = {}) {
  if (settled(order)) return;
  const refund = status === 'refunded';
  const before = order.refunded_cents ?? 0;
  db.prepare('UPDATE orders SET status = ?, refunded_at = ?, refunded_cents = ?, note = COALESCE(note, ?) WHERE id = ?').run(status, now(), refund ? order.cents : before, why, order.id);
  if (refund && order.product !== 'cart' && order.cents > before) db.prepare('INSERT INTO order_refunds (order_id, cents, full, source, note, at) VALUES (?,?,1,?,?,?)').run(order.id, order.cents - before, source, why, now());
  db.prepare("UPDATE entitlements SET status = 'revoked', ends_at = MIN(ends_at, ?) WHERE order_id = ?").run(now(), order.id);
  if (order.product === 'market') market.releaseBooking(db, targetId(order));
  if (order.product === 'lease') {
    endPaidLease(db, order);
    db.prepare('UPDATE plots SET disputed = 0 WHERE id = ?').run(targetId(order)); // nothing left to keep frozen
  }
  if (order.product === 'ad') core.setAdTerm(db, order.id, 'revoked');
  audit(db, actor, refund ? 'billing.refunded' : 'billing.charged_back', { kind: 'order', id: order.id }, { cents: order.cents, ...(before ? { refundedBefore: before } : {}), why, ...(order.parent_id ? { cart: order.parent_id } : {}), ...promoDetail(order) });
  // a promo code: a whole order refunded frees its use; a cart's line refunded takes that line's share (what is left of it) off what the code gave
  if (order.parent_id) {
    const off = (order.promo_cents ?? 0) - promoShare(order, before);
    if (off > 0) promo.reduceUse(db, order.parent_id, off);
  } else promo.voidUse(db, order.id);
  const parent = order.parent_id ? orderById(db, order.parent_id) : null;
  if (!parent) return;
  syncCartRefunded(db, parent.id);
  // the last line of a cart refunded (or charged back): the cart's own order is too
  const lines = childrenOf(db, parent);
  if (parent.status === 'paid' && !lines.some((c) => c.status === 'paid')) {
    const all = lines.every((c) => c.status === 'charged_back') ? 'charged_back' : 'refunded';
    db.prepare('UPDATE orders SET status = ?, refunded_at = ?, note = COALESCE(note, ?) WHERE id = ?').run(all, now(), all === 'refunded' ? 'every line refunded' : 'every line charged back', parent.id);
    promo.voidUse(db, parent.id);
  }
}
// A cart's own order counts what its lines have had refunded.
const syncCartRefunded = (db, parentId) => db.prepare('UPDATE orders SET refunded_cents = (SELECT COALESCE(SUM(CASE WHEN status = \'refunded\' THEN cents ELSE refunded_cents END), 0) FROM orders WHERE parent_id = ?) WHERE id = ?').run(parentId, parentId);

// Part of a paid order refunded (in the Stripe dashboard): recorded, its share of a promo code taken off what the code is counted as giving, and what it
// bought goes on (only what is refunded in full is ended).
function refundPart(db, order, cents, why) {
  const before = order.refunded_cents ?? 0;
  const after = before + cents;
  db.prepare('UPDATE orders SET refunded_cents = ?, note = ? WHERE id = ?').run(after, `${why}: ${usd(after)} of ${usd(order.cents)} refunded, the rest stays paid`, order.id);
  db.prepare('INSERT INTO order_refunds (order_id, cents, full, source, note, at) VALUES (?,?,0,?,?,?)').run(order.id, cents, 'stripe', why, now());
  const off = promoShare(order, after) - promoShare(order, before);
  if (off > 0) promo.reduceUse(db, order.parent_id ?? order.id, off);
  audit(db, SYSTEM, 'billing.partly_refunded', { kind: 'order', id: order.id }, { cents, refundedCents: after, of: order.cents, why, ...(order.parent_id ? { cart: order.parent_id } : {}) });
  if (order.parent_id) syncCartRefunded(db, order.parent_id);
}

// The order a Stripe payment paid: a single purchase, or a cart's own order (its lines are its child orders).
function orderOfPayment(db, paymentIntent) {
  const pi = typeof paymentIntent === 'object' ? paymentIntent?.id : paymentIntent;
  const o = pi ? db.prepare('SELECT * FROM orders WHERE stripe_payment_intent = ? ORDER BY parent_id IS NOT NULL, id LIMIT 1').get(String(pi)) : null;
  return o?.parent_id ? orderById(db, o.parent_id) : (o ?? null);
}
const linesOf = (db, whole) => (whole.product === 'cart' ? childrenOf(db, whole) : [whole]);
const subscriptionOf = (whole, line) => line.stripe_subscription ?? whole.stripe_subscription ?? null;
const cancelSub = (sub) => ({ method: 'DELETE', path: `/subscriptions/${encodeURIComponent(sub)}` });

// charge.refunded: `amount_refunded` is everything refunded of the charge so far. What is new (beyond what is recorded: our own refunds are recorded
// before Stripe tells us) is allocated to the payment's lines (docs/monetization/billing.md#disputes-and-partial-refunds):
//   all of it        every line still paid is refunded and ended
//   one line's rest  a refund of exactly what one line still has paid goes to that line (the latest such), which is ended
//   otherwise        latest line first (the one-time lines, then Pro last, since ending Pro cancels its plan): each line it covers in full is ended,
//                    the line it covers in part is partly refunded and goes on
// Anything left over (more than the lines had) is recorded on the order. Pro refunded in full: its subscription is cancelled (stripeCalls, after).
function refundedInStripe(db, charge) {
  const whole = orderOfPayment(db, charge.payment_intent);
  if (!whole || !['paid', 'refunded', 'charged_back'].includes(whole.status)) return null;
  const lines = linesOf(db, whole);
  const total = Number(charge.amount_refunded) || 0;
  let left = total - lines.reduce((a, l) => a + refundedOf(l), 0);
  if (!(left > 0)) return null; // nothing new: a refund we made ourselves (already recorded), or a retried event
  const calls = [];
  const end = (l) => {
    revoke(db, orderById(db, l.id), SYSTEM, 'refunded in Stripe', { source: 'stripe' });
    if (l.product === 'pro' && subscriptionOf(whole, l)) calls.push(cancelSub(subscriptionOf(whole, l)));
  };
  if (total >= Number(charge.amount)) {
    for (const l of lines) if (l.status === 'paid') end(l);
    if (whole.product === 'cart') revoke(db, orderById(db, whole.id), SYSTEM, 'refunded in Stripe', { source: 'stripe' });
    return { stripeCalls: calls };
  }
  const rest = (l) => l.cents - (l.refunded_cents ?? 0);
  const open = lines.filter((l) => l.status === 'paid' && rest(l) > 0).sort((a, b) => (a.product === 'pro') - (b.product === 'pro') || b.id - a.id);
  const exact = open.find((l) => rest(l) === left);
  for (const l of exact ? [exact] : open) {
    if (left <= 0) break;
    const take = Math.min(rest(l), left);
    left -= take;
    if (take === rest(l)) end(l);
    else refundPart(db, orderById(db, l.id), take, 'partly refunded in Stripe');
  }
  if (left > 0) {
    db.prepare('UPDATE orders SET note = ? WHERE id = ?').run(`refunded in Stripe: ${usd(left)} more than its lines had paid (recorded, nothing else to end)`, whole.id);
    audit(db, SYSTEM, 'billing.refund_unallocated', { kind: 'order', id: whole.id }, { cents: left, amountRefunded: total, charge: charge.id ?? null });
  }
  return { stripeCalls: calls };
}

// ---- disputes (chargebacks) ----------------------------------------------------------------------------------------------------------
// charge.dispute.created: the bank is asked to take a payment back. Everything the charge paid for is paused while the dispute is open (each line
// still paid; docs/monetization/billing.md#disputes-and-partial-refunds), the admins are told (an email to each admin with a confirmed address, and
// Admin > Disputes), and it is audited:
//   lease           frozen: the building stays in the city and open to visitors (a dispute is not yet a verdict), but its owner cannot change it,
//                   upgrade it, redesign it or renew it (core.assertNotDisputed)
//   launch, sponsored   stops showing (the entitlement is paused; a sponsored slot stays counted, so it can come back)
//   pro             its features stop (paused) and its plan's billing is paused at Stripe (pause_collection, void)
//   market          a stall that has not opened yet is cancelled (one open or over has nothing left to pause)
//   ad              the ad is taken down; the space stays booked for the advertiser
// charge.dispute.closed: won (or an inquiry closed without a chargeback, warning_closed) puts back exactly what was paused, where it can be (a
// cancelled stall only if it is still free and still to come); lost ends it all as a refund would (status 'charged_back'), cancels a Pro plan, and is
// recorded. Each is applied once (the event id, and the dispute's own status).
const DISPUTE_WON = ['won', 'warning_closed'];
function pauseLine(db, whole, l, calls) {
  if (['launch', 'sponsored', 'pro'].includes(l.product)) {
    const n = Number(db.prepare("UPDATE entitlements SET status = 'paused' WHERE order_id = ? AND status = 'active'").run(l.id).changes);
    const sub = l.product === 'pro' && n ? subscriptionOf(whole, l) : null;
    if (sub) calls.push({ method: 'POST', path: `/subscriptions/${encodeURIComponent(sub)}`, params: { pause_collection: { behavior: 'void' } } });
    return n ? 'paused' : 'nothing running';
  }
  if (l.product === 'lease') {
    const req = JSON.parse(l.request || '{}');
    const p = db.prepare('SELECT * FROM plots WHERE id = ?').get(targetId(l));
    if (!req.done || !p || p.owner_account !== l.account_id) return 'nothing (the plot is no longer theirs)';
    db.prepare('UPDATE plots SET disputed = 1 WHERE id = ?').run(p.id);
    return 'frozen';
  }
  if (l.product === 'market') {
    const b = db.prepare('SELECT * FROM market_bookings WHERE id = ?').get(targetId(l));
    if (b?.status !== 'booked' || b.start_at <= now()) return 'nothing (the stall has opened or is over)';
    market.releaseBooking(db, b.id);
    return 'cancelled';
  }
  if (l.product === 'ad') return core.setAdTerm(db, l.id, 'paused') === 'paused' ? 'hidden' : 'nothing running';
  return 'nothing';
}
function restoreLine(db, whole, l, what, calls) {
  if (l.status !== 'paid') return `not restored: the order is ${l.status}`;
  if (what === 'paused') {
    db.prepare("UPDATE entitlements SET status = 'active' WHERE order_id = ? AND status = 'paused'").run(l.id);
    const sub = l.product === 'pro' ? subscriptionOf(whole, l) : null;
    if (sub) calls.push({ method: 'POST', path: `/subscriptions/${encodeURIComponent(sub)}`, params: { pause_collection: '' } });
    return 'restored';
  }
  if (what === 'frozen') return (db.prepare('UPDATE plots SET disputed = 0 WHERE id = ?').run(targetId(l)), 'unfrozen');
  if (what === 'cancelled') return market.restoreBooking(db, targetId(l)) ? 'booked again' : 'not restored: the stall was booked by someone else or its time has passed';
  if (what === 'hidden') return (core.setAdTerm(db, l.id, 'active'), 'shown again');
  return 'nothing to restore';
}
function loseLine(db, whole, l, calls) {
  if (l.status !== 'paid') return `nothing more: the order is ${l.status}`;
  revoke(db, l, SYSTEM, 'the payment dispute was lost', { status: 'charged_back' });
  if (l.product === 'pro' && subscriptionOf(whole, l)) calls.push(cancelSub(subscriptionOf(whole, l)));
  return 'ended';
}
// An email to every admin with a confirmed address (services/api/admin.mjs), sent with the other mail (the outbox).
function alertAdmins(db, subject, body) {
  for (const a of db.prepare('SELECT email FROM admin_accounts WHERE email IS NOT NULL AND email_verified_at IS NOT NULL AND disabled = 0').all()) {
    db.prepare('INSERT INTO outbox (to_email, subject, body, kind, created_at) VALUES (?,?,?,?,?)').run(a.email, subject, body, 'admin_dispute', now());
  }
}
const pausedText = (paused) => (paused.length ? paused.map((p) => `- order ${p.order} (${p.product}): ${p.after ?? p.what}`).join('\n') : '- nothing: no order of ours was found for this payment. Look it up in the Stripe dashboard.');
function disputeOpened(db, d) {
  const sid = String(d.id ?? '');
  if (!sid || db.prepare('SELECT 1 FROM disputes WHERE stripe_dispute = ?').get(sid)) return null;
  const pi = typeof d.payment_intent === 'object' ? d.payment_intent?.id : d.payment_intent;
  const charge = typeof d.charge === 'object' ? d.charge?.id : d.charge;
  const whole = orderOfPayment(db, pi);
  const calls = [];
  const paused = whole ? linesOf(db, whole).filter((l) => l.status === 'paid').map((l) => ({ order: l.id, product: l.product, what: pauseLine(db, whole, l, calls) })) : [];
  const cents = Number(d.amount) || 0;
  const id = Number(db.prepare("INSERT INTO disputes (stripe_dispute, order_id, charge, payment_intent, cents, reason, status, stripe_status, paused, created_at) VALUES (?,?,?,?,?,?,'open',?,?,?)").run(sid, whole?.id ?? null, charge ?? null, pi ?? null, cents, d.reason ?? null, d.status ?? null, JSON.stringify(paused), now()).lastInsertRowid);
  if (whole) db.prepare('UPDATE orders SET dispute_id = ? WHERE id = ? OR parent_id = ?').run(id, whole.id, whole.id);
  audit(db, SYSTEM, 'billing.dispute_opened', { kind: 'order', id: whole?.id ?? sid }, { dispute: sid, cents, reason: d.reason ?? null, paused });
  alertAdmins(db, `A payment is disputed: ${usd(cents)}${whole ? ` (order ${whole.id})` : ''}`, `Stripe reports a dispute (${sid}) of ${usd(cents)}${d.reason ? `, reason: ${d.reason}` : ''}${whole ? `, on order ${whole.id}: ${whole.label ?? whole.product}` : ''}.\n\nWhile it is open, what the payment bought is paused:\n${pausedText(paused)}\n\nAnswer it in the Stripe dashboard before its deadline. Admin > Disputes shows every dispute and what was paused.`);
  return { stripeCalls: calls };
}
function disputeClosed(db, d) {
  const sid = String(d.id ?? '');
  let row = db.prepare('SELECT * FROM disputes WHERE stripe_dispute = ?').get(sid);
  let calls = [];
  if (!row) {
    // the dispute's first event never came: open it now, then close it
    calls = disputeOpened(db, d)?.stripeCalls ?? [];
    row = db.prepare('SELECT * FROM disputes WHERE stripe_dispute = ?').get(sid);
    if (!row) return null;
  }
  if (row.status !== 'open') return { stripeCalls: calls };
  const won = DISPUTE_WON.includes(d.status);
  const whole = orderById(db, row.order_id);
  const paused = JSON.parse(row.paused || '[]');
  // a dispute that opened before this server knew to pause anything (or a line not paused) still ends what it paid for when it is lost
  const lines = whole ? linesOf(db, whole) : [];
  for (const l of lines) if (!won && l.status === 'paid' && !paused.some((p) => p.order === l.id)) paused.push({ order: l.id, product: l.product, what: 'not paused' });
  for (const p of paused) {
    const l = orderById(db, p.order);
    if (l) p.after = won ? restoreLine(db, whole, l, p.what, calls) : loseLine(db, whole, l, calls);
  }
  const status = won ? 'won' : 'lost';
  db.prepare('UPDATE disputes SET status = ?, stripe_status = ?, paused = ?, closed_at = ? WHERE id = ?').run(status, d.status ?? null, JSON.stringify(paused), now(), row.id);
  audit(db, SYSTEM, `billing.dispute_${status}`, { kind: 'order', id: whole?.id ?? sid }, { dispute: sid, cents: row.cents, stripeStatus: d.status ?? null, paused });
  alertAdmins(db, `Dispute ${status}: ${usd(row.cents)}${whole ? ` (order ${whole.id})` : ''}`, `The dispute ${sid} of ${usd(row.cents)} is closed: ${status}${d.status && d.status !== status ? ` (${d.status})` : ''}.\n\n${won ? 'What was paused is back:' : 'What it paid for has ended (charged back):'}\n${pausedText(paused)}`);
  return { stripeCalls: calls };
}

// A refunded lease is taken back, if the player still holds the plot: a claim or take-over ends at once (the plot opens to others), a
// renewal loses the days it added, an outside upgrade is undone (the outside it replaced comes back, the value goes down again). A lease that was never
// carried out (refunded because it could not be) changes nothing.
function endPaidLease(db, order) {
  const req = JSON.parse(order.request || '{}');
  const p = db.prepare('SELECT * FROM plots WHERE id = ?').get(targetId(order));
  if (!req.done || !p || p.owner_account !== order.account_id || !p.lease_end) return;
  if (req.action === 'exterior') core.revertExterior(db, p.id, req.before ?? null, req.diff ?? 0);
  else if (req.action === 'renew') db.prepare('UPDATE plots SET lease_end = lease_end - ?, lease_notified = 0 WHERE id = ?').run((req.days ?? p.lease_days ?? 0) * DAY_MS, p.id);
  else community.setLeaseState(db, p.id, 'open');
}

// The webhook endpoint's work: verify, apply once, then do any refund the event called for. after(fulfilled) lets the server tell the
// other players about a plot or stall that just changed hands.
export async function receiveWebhook(db, raw, signature, env = process.env, fetchImpl = fetch, after = null) {
  if (!env.STRIPE_WEBHOOK_SECRET) fail(503, 'Payments are not set up.', 'billing_off');
  if (!verifySignature(raw, signature, env.STRIPE_WEBHOOK_SECRET)) fail(400, 'Bad signature.', 'bad_signature');
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    fail(400, 'Not JSON.', 'bad_json');
  }
  const out = handleEvent(db, event);
  for (const f of [].concat(out.fulfilled ?? [])) after?.(f);
  for (const id of [].concat(out.refund ?? [])) await refundOrder(db, id, SYSTEM, env, fetchImpl, refundWhy(db, id));
  // what a dispute or a refund asks of Stripe (pause, resume or cancel a Pro plan): after the event is recorded, so a failure here is only noted
  for (const c of out.stripeCalls ?? []) {
    await stripe(env, c.method, c.path, c.params ?? null, { fetchImpl }).catch((e) => audit(db, SYSTEM, 'billing.stripe_call_failed', { kind: 'stripe', id: c.path }, { method: c.method, error: String(e.message).slice(0, 200) }));
  }
  return { received: true, duplicate: Boolean(out.duplicate) };
}

// ---- complimentary grants -------------------------------------------------------------------------------------------------------
// An admin gives a profile a product without payment (the pilot's free weeks, making good a problem): a zero-cent order, audited.
export function grant(db, slug, input, actor = ADMIN, at = now()) {
  const b = (isSlug(slug) ? db.prepare("SELECT * FROM businesses WHERE slug = ? AND status = 'published'").get(String(slug)) : null) ?? fail(404, 'No such business.', 'no_business');
  const product = PRODUCTS[input.product] ? input.product : fail(400, 'product must be launch, pro or sponsored.', 'bad_product');
  const placement = product === 'sponsored' ? (placementOf(input.placement) ?? fail(400, 'Choose where the placement goes.', 'bad_placement')).key : null;
  const days = Math.max(1, Math.min(366, Math.round(Number(input.days) || PRODUCTS[product].days || 30)));
  return transaction(db, () => {
    const r = db.prepare("INSERT INTO orders (account_id, business_id, product, placement, cents, status, created_at, paid_at, note) VALUES (?,?,?,?,0,'paid',?,?,?)").run(b.account_id, b.id, product, placement, at, at, `complimentary: ${String(input.reason ?? '').slice(0, 120) || 'granted by an admin'}`);
    const orderId = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO entitlements (business_id, order_id, kind, placement, starts_at, ends_at) VALUES (?,?,?,?,?,?)').run(b.id, orderId, product, placement, at, at + days * DAY_MS);
    audit(db, actor, 'billing.granted', { kind: 'order', id: orderId }, { business: b.slug, product, placement, days, reason: input.reason ?? null });
    return { orderId, until: at + days * DAY_MS };
  });
}

// ---- refunds and cancelling -------------------------------------------------------------------------------------------------------
// Refund a paid order in full and take back what it granted. For Pro the subscription is cancelled at once and its last payment refunded.
// A cart's line is refunded on its own: that line's amount, from the cart's one payment (a partial refund). Refunding the cart's own order refunds
// each line still paid. Pro bought in a cart: the subscription is cancelled and the Pro line's amount refunded from its latest invoice (the first
// one also carried the cart's other lines; a later one is Pro's month alone, the same amount).
export async function refundOrder(db, orderId, actor = ADMIN, env = process.env, fetchImpl = fetch, why = 'refunded by an admin') {
  const order = orderById(db, orderId) ?? fail(404, 'No such order.', 'no_order');
  if (order.status === 'refunded') return { refunded: true, already: true };
  if (order.status !== 'paid') fail(409, `This order is ${order.status}, not paid.`, 'not_paid');
  if (order.product === 'cart') {
    for (const child of childrenOf(db, order)) if (child.status === 'paid') await refundOrder(db, child.id, actor, env, fetchImpl, why);
    transaction(db, () => revoke(db, orderById(db, order.id), actor, why));
    return { refunded: true };
  }
  const parent = order.parent_id ? orderById(db, order.parent_id) : null;
  let paymentIntent = order.stripe_payment_intent ?? parent?.stripe_payment_intent ?? null;
  if (order.product === 'pro' && order.stripe_subscription) {
    const invoices = await stripe(env, 'GET', '/invoices', { subscription: order.stripe_subscription, limit: 1 }, { fetchImpl });
    paymentIntent = invoices.data?.[0]?.payment_intent ?? (await lastInvoicePayment(env, order.stripe_subscription, fetchImpl)) ?? paymentIntent;
    await stripe(env, 'DELETE', `/subscriptions/${encodeURIComponent(order.stripe_subscription)}`, null, { fetchImpl });
  } else if (!paymentIntent && parent) paymentIntent = await cartPayment(db, parent, env, fetchImpl);
  // a cart's line: its own amount; an order already refunded in part (in the Stripe dashboard): what is left of it
  const owed = order.cents - (order.refunded_cents ?? 0);
  if (paymentIntent && owed > 0) await stripe(env, 'POST', '/refunds', { payment_intent: paymentIntent, amount: parent || order.refunded_cents ? owed : undefined }, { idempotencyKey: `vv-refund-${order.id}`, fetchImpl });
  transaction(db, () => revoke(db, orderById(db, order.id), actor, why));
  return { refunded: true };
}

// The payment a cart was paid with. In subscription mode (Pro in the cart) the session has no payment intent of its own: its first invoice's
// payment carries the whole cart.
async function cartPayment(db, parent, env, fetchImpl) {
  if (!parent.stripe_session) return null;
  const s = await stripe(env, 'GET', `/checkout/sessions/${encodeURIComponent(parent.stripe_session)}`, null, { fetchImpl });
  let pi = s.payment_intent ?? null;
  if (!pi && s.invoice) {
    const inv = await stripe(env, 'GET', `/invoices/${encodeURIComponent(s.invoice)}`, { expand: { 0: 'payments' } }, { fetchImpl });
    pi = inv.payment_intent ?? inv.payments?.data?.find((p) => p.payment?.payment_intent)?.payment.payment_intent ?? null;
  }
  if (pi) db.prepare('UPDATE orders SET stripe_payment_intent = COALESCE(stripe_payment_intent, ?) WHERE id = ?').run(pi, parent.id);
  return pi;
}

// Since Stripe's API version 2025-03-31 an invoice has no payment_intent: its payments list carries it, and only when asked for (expand).
async function lastInvoicePayment(env, subscription, fetchImpl) {
  const invoices = await stripe(env, 'GET', '/invoices', { subscription, limit: 1, expand: { 0: 'data.payments' } }, { fetchImpl });
  return invoices.data?.[0]?.payments?.data?.find((p) => p.payment?.payment_intent)?.payment.payment_intent ?? null;
}

// The owner stops Pro: it runs to the end of the month already paid, then ends (Stripe sends customer.subscription.deleted).
export async function cancelPro(db, account, slug, env = process.env, fetchImpl = fetch) {
  requireAccount(account);
  const b = ownBusiness(db, account, slug);
  const order = db.prepare("SELECT o.* FROM orders o JOIN entitlements e ON e.order_id = o.id WHERE o.business_id = ? AND o.product = 'pro' AND o.status = 'paid' AND e.status = 'active' AND e.ends_at > ? ORDER BY o.id DESC LIMIT 1").get(b.id, now()) ?? fail(404, 'This business does not have Pro.', 'no_pro');
  if (order.stripe_subscription) await stripe(env, 'POST', `/subscriptions/${encodeURIComponent(order.stripe_subscription)}`, { cancel_at_period_end: 'true' }, { fetchImpl });
  db.prepare("UPDATE orders SET note = 'cancelled by the owner: runs to the end of the paid month' WHERE id = ?").run(order.id);
  audit(db, byAccount(account), 'billing.pro_cancelled', { kind: 'order', id: order.id }, { business: b.slug });
  return { cancelled: true, until: planFor(db, b.id).proUntil };
}

// ---- 4. reconciliation ----------------------------------------------------------------------------------------------------------------
// Asks Stripe about every order still pending after a couple of minutes, and every running Pro plan, and applies what it says.
const refundWhy = (db, id) => ({ sponsored: 'the spot filled before payment completed', ad: 'the ad space was booked by someone else before payment completed' })[orderById(db, id)?.product] ?? 'it could not be done once paid';
export async function reconcile(db, env = process.env, fetchImpl = fetch, after = null) {
  if (!billingOn(env)) return { checked: 0 };
  const out = { checked: 0, paid: 0, expired: 0, proExtended: 0, proEnded: 0, refunded: 0 };
  for (const order of db.prepare("SELECT * FROM orders WHERE status = 'pending' AND stripe_session IS NOT NULL AND created_at < ? ORDER BY id LIMIT 100").all(now() - 2 * 60000)) {
    out.checked++;
    const s = await stripe(env, 'GET', `/checkout/sessions/${encodeURIComponent(order.stripe_session)}`, null, { fetchImpl });
    if (s.status === 'complete' && (s.payment_status === 'paid' || s.mode === 'subscription')) {
      const r = transaction(db, () => markPaid(db, orderById(db, order.id), { paymentIntent: s.payment_intent, subscription: s.subscription }));
      out.paid++;
      for (const f of [].concat(r?.fulfilled ?? [])) after?.(f);
      for (const id of [].concat(r?.refund ?? [])) (await refundOrder(db, id, SYSTEM, env, fetchImpl, refundWhy(db, id)), out.refunded++);
    } else if (s.status === 'expired') {
      transaction(db, () => expire(db, orderById(db, order.id), 'expired'));
      out.expired++;
    }
  }
  for (const row of db.prepare("SELECT o.id, o.stripe_subscription, e.id AS eid, e.ends_at FROM orders o JOIN entitlements e ON e.order_id = o.id WHERE o.product = 'pro' AND o.status = 'paid' AND e.status = 'active' AND o.stripe_subscription IS NOT NULL").all()) {
    out.checked++;
    const sub = await stripe(env, 'GET', `/subscriptions/${encodeURIComponent(row.stripe_subscription)}`, null, { fetchImpl });
    const end = Number(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end) * 1000;
    if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
      if (row.ends_at > now()) (db.prepare('UPDATE entitlements SET ends_at = ? WHERE id = ?').run(now(), row.eid), out.proEnded++);
    } else if (['active', 'trialing'].includes(sub.status) && end > row.ends_at) {
      db.prepare('UPDATE entitlements SET ends_at = ? WHERE id = ?').run(end, row.eid);
      out.proExtended++;
    }
  }
  return out;
}

// The paid, not yet refunded order for a stall or plot, if there is one.
export const paidOrderFor = (db, target) => db.prepare("SELECT * FROM orders WHERE target = ? AND status = 'paid' ORDER BY id DESC LIMIT 1").get(String(target)) ?? null;

// ---- what owners and admins see -----------------------------------------------------------------------------------------------------
const orderView = (o) => ({ id: o.id, product: o.product, placement: o.placement, target: o.target ?? null, label: o.label ?? null, cents: o.cents, status: o.status, createdAt: o.created_at, paidAt: o.paid_at, refundedAt: o.refunded_at, refundedCents: refundedOf(o), disputeId: o.dispute_id ?? null, note: o.note, parentId: o.parent_id ?? null, promoCode: o.promo_code ?? null, promoCents: o.promo_cents ?? 0 });
export function myOrders(db, account) {
  requireAccount(account);
  return { orders: db.prepare('SELECT o.*, b.slug, b.name FROM orders o LEFT JOIN businesses b ON b.id = o.business_id WHERE o.account_id = ? ORDER BY o.id DESC LIMIT 100').all(account.id).map((o) => ({ ...orderView(o), business: o.slug ? { slug: o.slug, name: o.name } : null })) };
}
export function adminOrders(db, status) {
  const rows = status ? db.prepare('SELECT o.*, b.slug FROM orders o LEFT JOIN businesses b ON b.id = o.business_id WHERE o.status = ? ORDER BY o.id DESC LIMIT 200').all(String(status)) : db.prepare('SELECT o.*, b.slug FROM orders o LEFT JOIN businesses b ON b.id = o.business_id ORDER BY o.id DESC LIMIT 200').all();
  return { orders: rows.map((o) => ({ ...orderView(o), business: o.slug ?? null, accountId: o.account_id })) };
}
// GET /admin/billing/disputes: every dispute (open first, newest first) with what it paused and how it ended, the refunds recorded (newest first:
// by an admin, by the server, or in the Stripe dashboard, in full or in part), and how many disputes are open.
const disputeView = (d) => ({ id: d.id, stripeDispute: d.stripe_dispute, orderId: d.order_id ?? null, label: d.label ?? null, accountId: d.account_id ?? null, cents: d.cents, reason: d.reason ?? null, status: d.status, stripeStatus: d.stripe_status ?? null, paused: JSON.parse(d.paused || '[]'), createdAt: d.created_at, closedAt: d.closed_at ?? null });
const refundView = (r) => ({ id: r.id, orderId: r.order_id, parentId: r.parent_id ?? null, label: r.label ?? null, product: r.product ?? null, cents: r.cents, full: Boolean(r.full), source: r.source, note: r.note ?? null, at: r.at });
export function adminDisputes(db) {
  const disputes = db.prepare("SELECT d.*, o.label, o.account_id FROM disputes d LEFT JOIN orders o ON o.id = d.order_id ORDER BY d.status = 'open' DESC, d.id DESC LIMIT 200").all().map(disputeView);
  const refunds = db.prepare('SELECT r.*, o.label, o.product, o.parent_id FROM order_refunds r JOIN orders o ON o.id = r.order_id ORDER BY r.id DESC LIMIT 200').all().map(refundView);
  return { open: db.prepare("SELECT COUNT(*) AS n FROM disputes WHERE status = 'open'").get().n, disputes, refunds };
}
// GET /admin/billing/orders/:id: one order, its lines (a cart), every refund of it or its lines, and the disputes of its payment.
export function adminOrder(db, id) {
  const o = orderById(db, id) ?? fail(404, 'No such order.', 'no_order');
  const whole = o.parent_id ? orderById(db, o.parent_id) : o;
  const ids = [whole.id, ...childrenOf(db, whole).map((c) => c.id)];
  const marks = ids.map(() => '?').join(',');
  return {
    order: { ...orderView(o), accountId: o.account_id },
    cart: o.parent_id ? orderView(whole) : null,
    lines: childrenOf(db, o).map(orderView),
    refunds: db.prepare(`SELECT r.*, o.label, o.product, o.parent_id FROM order_refunds r JOIN orders o ON o.id = r.order_id WHERE r.order_id IN (${marks}) ORDER BY r.id`).all(...ids).map(refundView),
    disputes: db.prepare('SELECT d.*, o.label, o.account_id FROM disputes d LEFT JOIN orders o ON o.id = d.order_id WHERE d.order_id = ? ORDER BY d.id').all(whole.id).map(disputeView),
  };
}
export const orderStatus = (db, account, id) => {
  requireAccount(account);
  const o = orderById(db, id);
  if (!o || o.account_id !== account.id) fail(404, 'No such order.', 'no_order');
  return orderView(o);
};

// The public side: who is sponsored on a page right now, and (Discover) who is in their launch week. Only published profiles.
export function featured(db, placementKey, at = now()) {
  const p = placementOf(placementKey) ?? fail(400, 'No such placement.', 'bad_placement');
  const rows = (kind, placement) => db.prepare(`SELECT DISTINCT b.* FROM entitlements e JOIN businesses b ON b.id = e.business_id WHERE e.kind = ? AND ${placement ? 'e.placement = ?' : '1=1'} AND e.status = 'active' AND e.starts_at <= ? AND e.ends_at > ? AND b.status = 'published' ORDER BY e.starts_at`).all(...[kind, ...(placement ? [placement] : []), at, at]);
  return { sponsored: rows('sponsored', p.key), launches: p.kind === 'discover' ? rows('launch', null) : [] };
}
