import crypto from 'node:crypto';
import { attempt, dryRun, transaction } from './db.mjs';
import * as core from './core.mjs';
import * as community from './community.mjs';
import * as market from './market.mjs';
import { ApiError, fail, requireAccount } from './core.mjs';
import { audit, ADMIN, SYSTEM, byAccount } from './audit.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// Payments through Stripe Checkout (phase 4, docs/monetization/billing.md): the Launch Pack (once), Pro (monthly) and sponsored placements (a week),
// each for one business profile; and, in the game, leases (claiming, taking over or renewing a plot) and market stalls. A lease or a stall
// is held for the player while they pay and only happens once the payment is confirmed (step 2): what an order does is in fulfil().
//
//   1. checkout   the owner asks for a product; the server makes a pending order at the catalogue's price (@voxelventure/business-core) and a
//                 Stripe Checkout session for exactly that amount, and sends the owner to Stripe's page
//   2. webhook    Stripe tells the server what happened, signed with STRIPE_WEBHOOK_SECRET. Only this (or step 4) marks an order paid,
//                 and each Stripe event is applied once however many times it is delivered
//   3. grant      a paid order makes an entitlement: the Launch Pack and a placement for 7 days, Pro until the end of the paid month
//   4. reconcile  every hour (and on demand) the server asks Stripe about orders still pending and Pro plans still active, so a lost
//                 webhook cannot leave a customer paid but without what they bought, or a cancelled plan still running
//
// Settings: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PUBLIC_SITE_URL (where Stripe sends the owner back), STRIPE_API_URL (tests only),
// TERMS_URL and REFUND_POLICY_URL (shown at checkout; both required with a live key).
import { PRODUCTS, placementOf, priceOf, planOf, DAY_MS } from '@voxelventure/business-core';
import { categoryOf, districtOf, isSlug } from '@voxelventure/business-core';

const { termLabel } = await imp('game/leases.js');
const HOLD_MS = 30 * 60000; // Stripe's shortest checkout expiry: a sponsored spot, a plot or a stall is held this long for a checkout in progress
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
async function stripe(env, method, path, params = null, { idempotencyKey, fetchImpl = fetch } = {}) {
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

// How many of a placement's slots are taken now: paid weeks still running, and checkouts in progress still holding a spot.
function taken(db, key, at = now()) {
  const paid = db.prepare("SELECT COUNT(*) AS n FROM entitlements WHERE placement = ? AND status = 'active' AND ends_at > ?").get(key, at).n;
  const held = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE placement = ? AND status = 'pending' AND hold_until > ?").get(key, at).n;
  return paid + held;
}
export function availability(db, key, at = now()) {
  const p = placementOf(key) ?? fail(400, 'No such placement.', 'bad_placement');
  return { placement: p.key, label: p.label, cents: p.cents, slots: p.slots, free: Math.max(0, p.slots - taken(db, p.key, at)) };
}

export async function createCheckout(db, account, slug, input, env = process.env, fetchImpl = fetch) {
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
  // the order (and, for a placement, the held spot) is made atomically, so two owners cannot both take the last spot
  const order = transaction(db, () => {
    if (product === 'pro' && planFor(db, b.id).pro) fail(409, 'This business already has Pro.', 'already_pro');
    if (placement && taken(db, placement) >= placementOf(placement).slots) fail(409, 'That spot is full right now. Try another, or come back when a week ends.', 'placement_full');
    const r = db.prepare('INSERT INTO orders (account_id, business_id, product, placement, cents, hold_until, created_at) VALUES (?,?,?,?,?,?,?)').run(account.id, b.id, product, placement, cents, placement ? now() + HOLD_MS : null, now());
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(r.lastInsertRowid));
  });
  const item = PRODUCTS[product];
  const name = `${item.name}${placement ? ` (${placementOf(placement).label}${placementOf(placement).target ? `: ${placementOf(placement).target}` : ''})` : ''} for ${b.name}`;
  const url = await openSession(db, account, order, { name, mode: item.mode, interval: item.interval, back: '/business/manage', metadata: { business: b.slug, product } }, env, fetchImpl);
  audit(db, byAccount(account), 'billing.checkout', { kind: 'order', id: order.id }, { product, placement, cents, business: b.slug });
  return { orderId: order.id, url };
}

// The Stripe Checkout session for an order, for exactly its amount. If Stripe refuses, the order fails and anything it held is let go.
async function openSession(db, account, order, { name, mode = 'payment', interval, back, metadata = {} }, env, fetchImpl) {
  const site = siteOf(env);
  const email = db.prepare('SELECT email, email_verified FROM accounts WHERE id = ?').get(account.id);
  let session;
  try {
    session = await stripe(env, 'POST', '/checkout/sessions', {
      mode,
      client_reference_id: String(order.id),
      customer_email: email?.email_verified ? email.email : undefined,
      line_items: { 0: { quantity: 1, price_data: { currency: 'usd', unit_amount: order.cents, product_data: { name }, recurring: mode === 'subscription' ? { interval } : undefined } } },
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
      db.prepare("UPDATE orders SET status = 'failed', hold_until = NULL, note = ? WHERE id = ?").run(String(e.message).slice(0, 200), order.id);
      release(db, order);
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
const LEASE_ACTIONS = {
  claim: (db, account, plotId, input) => core.claimPlot(db, account, plotId, input),
  takeover: (db, account, plotId, input) => core.takeOverPlot(db, account, plotId, input),
  renew: (db, account, plotId, input) => community.renewLease(db, account, plotId, input),
  exterior: (db, account, plotId, input) => core.upgradeExterior(db, account, plotId, input),
};
const LEASE_LABEL = { claim: 'Lease', takeover: 'Take-over lease', renew: 'Lease renewal', exterior: 'Building upgrade' };
export async function payLease(db, account, plotId, action, input = {}, env = process.env, fetchImpl = fetch) {
  requireAccount(account);
  if (!billingOn(env)) fail(503, 'Payments are not set up yet.', 'billing_off');
  const run = LEASE_ACTIONS[action] ?? fail(400, 'Unknown action.', 'bad_action');
  const id = Number(plotId);
  const order = transaction(db, () => {
    const would = dryRun(db, () => {
      const out = run(db, account, id, input);
      const plot = out.plot ?? out;
      const price = out.paid ?? db.prepare('SELECT price FROM ledger WHERE plot_id = ? ORDER BY id DESC LIMIT 1').get(id).price;
      return { price, title: plot.title, days: plot.lease?.days ?? null };
    });
    if (!(would.price > 0)) return null; // nothing to pay (a free outside change): done below, without a checkout
    const label = action === 'exterior' ? `${LEASE_LABEL[action]}: ${would.title} (plot ${id})` : `${LEASE_LABEL[action]}: ${would.title} (plot ${id}, ${termLabel(would.days)})`;
    const r = db.prepare("INSERT INTO orders (account_id, product, target, request, label, cents, hold_until, created_at) VALUES (?, 'lease', ?, ?, ?, ?, ?, ?)").run(account.id, `plot:${id}`, JSON.stringify({ action, input, days: would.days }), label, Math.round(would.price * 100), now() + HOLD_MS, now());
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(r.lastInsertRowid));
  });
  if (!order) {
    return transaction(db, () => {
      const out = run(db, account, id, input);
      audit(db, byAccount(account), `plot.${action}`, { kind: 'plot', id }, leaseDetail(action, out));
      return out;
    });
  }
  const url = await openSession(db, account, order, { name: order.label, back: '/', metadata: { plot: id, action } }, env, fetchImpl);
  audit(db, byAccount(account), 'billing.checkout', { kind: 'order', id: order.id }, { product: 'lease', action, plot: id, cents: order.cents });
  return { checkout: { orderId: order.id, url, cents: order.cents } };
}

// Book a market stall, paid for: a pending booking holds the stall while the player pays; it becomes a booking when the payment arrives.
export async function payStall(db, seed, account, input = {}, env = process.env, fetchImpl = fetch) {
  requireAccount(account);
  if (!billingOn(env)) fail(503, 'Payments are not set up yet.', 'billing_off');
  const { order, booked } = transaction(db, () => {
    const booked = market.book(db, seed, account, input, { holdUntil: now() + HOLD_MS });
    const label = `Market stall ${booked.stall.id} (${booked.siteCode}), ${booked.booking.hours} hours from ${new Date(booked.booking.start).toUTCString().slice(0, 22)}`;
    const r = db.prepare("INSERT INTO orders (account_id, product, target, label, cents, hold_until, created_at) VALUES (?, 'market', ?, ?, ?, ?, ?)").run(account.id, `booking:${booked.booking.id}`, label, booked.paid, now() + HOLD_MS, now());
    return { booked, order: db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(r.lastInsertRowid)) };
  });
  const url = await openSession(db, account, order, { name: order.label, back: '/', metadata: { booking: booked.booking.id } }, env, fetchImpl);
  audit(db, byAccount(account), 'billing.checkout', { kind: 'order', id: order.id }, { product: 'market', booking: booked.booking.id, cents: order.cents });
  return { checkout: { orderId: order.id, url, cents: order.cents }, booking: booked.booking, stall: booked.stall };
}

// The paid order is carried out. { fulfilled } tells the server what changed (to tell the other players); { refund } when it can no longer
// be done (somebody else claimed the plot or booked the stall after the hold ran out): the payment goes back.
const targetId = (order) => Number(String(order.target ?? '').split(':')[1]);
function fulfil(db, order) {
  const req = JSON.parse(order.request || '{}');
  if (req.done) return null;
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
    out = attempt(db, () => LEASE_ACTIONS[req.action](db, account, plotId, req.input ?? {}));
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
function leaseDetail(action, out) {
  const plot = out.plot ?? out;
  return {
    claim: { title: plot.title, value: plot.value, leaseDays: plot.lease?.days ?? null },
    takeover: { title: plot.title, paidOut: 0, previousOwner: out.previousOwner, previousAccount: out.previousAccount ?? null },
    renew: { paid: out.paid, leaseDays: plot.lease?.days ?? null },
    exterior: { paid: out.paid, diff: out.diff, value: plot.value },
  }[action];
}

// What an order held is let go (its checkout expired or failed): a pending stall is freed. (A plot's hold is the order's own hold_until.)
function release(db, order) {
  if (order.product === 'market') market.releaseBooking(db, targetId(order));
}
function expire(db, order, status) {
  if (order?.status !== 'pending') return;
  db.prepare('UPDATE orders SET status = ?, hold_until = NULL WHERE id = ?').run(status, order.id);
  release(db, order);
}

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

const orderById = (db, id) => (id ? db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id)) : null);
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
      if (order.status === 'paid' && periodStart && order.paid_at && periodStart > order.paid_at + DAY_MS) db.prepare('UPDATE orders SET renewals = renewals + 1 WHERE id = ?').run(order.id);
      return markPaid(db, order, { subscription: sub, paymentIntent: o.payment_intent ?? null, periodEnd });
    }
    case 'customer.subscription.deleted': {
      const order = orderOfSubscription(db, o.id, o.metadata?.order);
      if (order) db.prepare("UPDATE entitlements SET ends_at = MIN(ends_at, ?) WHERE order_id = ? AND status = 'active'").run(now(), order.id);
      if (order) audit(db, SYSTEM, 'billing.pro_ended', { kind: 'order', id: order.id }, { subscription: o.id });
      return null;
    }
    case 'charge.refunded': {
      const order = o.payment_intent ? db.prepare('SELECT * FROM orders WHERE stripe_payment_intent = ?').get(String(o.payment_intent)) : null;
      if (order && o.amount_refunded >= o.amount) revoke(db, order, SYSTEM, 'refunded in Stripe');
      return null;
    }
    default:
      return null; // other events are recorded (so a retry is a no-op) and otherwise ignored
  }
}

// An order is paid: grant what it bought. Idempotent (a second call for a paid order only extends Pro to a later period end).
function markPaid(db, order, { paymentIntent = null, subscription = null, periodEnd = null }) {
  const at = now();
  if (order.status === 'refunded') return null; // paid after we refunded it (a retried webhook): nothing to grant
  if (order.status !== 'paid') {
    db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, hold_until = NULL, stripe_payment_intent = COALESCE(?, stripe_payment_intent), stripe_subscription = COALESCE(?, stripe_subscription) WHERE id = ?").run(at, paymentIntent, subscription, order.id);
    audit(db, SYSTEM, 'billing.paid', { kind: 'order', id: order.id }, { product: order.product, placement: order.placement, cents: order.cents });
  } else if (paymentIntent || subscription) {
    db.prepare('UPDATE orders SET stripe_payment_intent = COALESCE(stripe_payment_intent, ?), stripe_subscription = COALESCE(stripe_subscription, ?) WHERE id = ?').run(paymentIntent, subscription, order.id);
  }
  if (order.product === 'lease' || order.product === 'market') return fulfil(db, orderById(db, order.id));
  const existing = db.prepare('SELECT * FROM entitlements WHERE order_id = ?').get(order.id);
  if (order.product === 'pro') {
    const end = periodEnd ?? at + 31 * DAY_MS; // the first invoice sets the exact end; a month until then
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

function revoke(db, order, actor, why) {
  if (order.status === 'refunded') return;
  db.prepare("UPDATE orders SET status = 'refunded', refunded_at = ?, note = COALESCE(note, ?) WHERE id = ?").run(now(), why, order.id);
  db.prepare("UPDATE entitlements SET status = 'revoked', ends_at = MIN(ends_at, ?) WHERE order_id = ?").run(now(), order.id);
  if (order.product === 'market') market.releaseBooking(db, targetId(order));
  if (order.product === 'lease') endPaidLease(db, order);
  audit(db, actor, 'billing.refunded', { kind: 'order', id: order.id }, { cents: order.cents, why });
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
  if (out.fulfilled) after?.(out.fulfilled);
  if (out.refund) await refundOrder(db, out.refund, SYSTEM, env, fetchImpl, refundWhy(db, out.refund));
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
export async function refundOrder(db, orderId, actor = ADMIN, env = process.env, fetchImpl = fetch, why = 'refunded by an admin') {
  const order = orderById(db, orderId) ?? fail(404, 'No such order.', 'no_order');
  if (order.status === 'refunded') return { refunded: true, already: true };
  if (order.status !== 'paid') fail(409, `This order is ${order.status}, not paid.`, 'not_paid');
  let paymentIntent = order.stripe_payment_intent;
  if (order.product === 'pro' && order.stripe_subscription) {
    const invoices = await stripe(env, 'GET', '/invoices', { subscription: order.stripe_subscription, limit: 1 }, { fetchImpl });
    paymentIntent = invoices.data?.[0]?.payment_intent ?? (await lastInvoicePayment(env, order.stripe_subscription, fetchImpl)) ?? paymentIntent;
    await stripe(env, 'DELETE', `/subscriptions/${encodeURIComponent(order.stripe_subscription)}`, null, { fetchImpl });
  }
  if (paymentIntent) await stripe(env, 'POST', '/refunds', { payment_intent: paymentIntent }, { idempotencyKey: `vv-refund-${order.id}`, fetchImpl });
  transaction(db, () => revoke(db, orderById(db, order.id), actor, why));
  return { refunded: true };
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
const refundWhy = (db, id) => (orderById(db, id)?.product === 'sponsored' ? 'the spot filled before payment completed' : 'it could not be done once paid');
export async function reconcile(db, env = process.env, fetchImpl = fetch, after = null) {
  if (!billingOn(env)) return { checked: 0 };
  const out = { checked: 0, paid: 0, expired: 0, proExtended: 0, proEnded: 0, refunded: 0 };
  for (const order of db.prepare("SELECT * FROM orders WHERE status = 'pending' AND stripe_session IS NOT NULL AND created_at < ? ORDER BY id LIMIT 100").all(now() - 2 * 60000)) {
    out.checked++;
    const s = await stripe(env, 'GET', `/checkout/sessions/${encodeURIComponent(order.stripe_session)}`, null, { fetchImpl });
    if (s.status === 'complete' && (s.payment_status === 'paid' || s.mode === 'subscription')) {
      const r = transaction(db, () => markPaid(db, orderById(db, order.id), { paymentIntent: s.payment_intent, subscription: s.subscription }));
      out.paid++;
      if (r?.fulfilled) after?.(r.fulfilled);
      if (r?.refund) (await refundOrder(db, r.refund, SYSTEM, env, fetchImpl, refundWhy(db, r.refund)), out.refunded++);
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
const orderView = (o) => ({ id: o.id, product: o.product, placement: o.placement, target: o.target ?? null, label: o.label ?? null, cents: o.cents, status: o.status, createdAt: o.created_at, paidAt: o.paid_at, refundedAt: o.refunded_at, note: o.note });
export function myOrders(db, account) {
  requireAccount(account);
  return { orders: db.prepare('SELECT o.*, b.slug, b.name FROM orders o LEFT JOIN businesses b ON b.id = o.business_id WHERE o.account_id = ? ORDER BY o.id DESC LIMIT 100').all(account.id).map((o) => ({ ...orderView(o), business: o.slug ? { slug: o.slug, name: o.name } : null })) };
}
export function adminOrders(db, status) {
  const rows = status ? db.prepare('SELECT o.*, b.slug FROM orders o LEFT JOIN businesses b ON b.id = o.business_id WHERE o.status = ? ORDER BY o.id DESC LIMIT 200').all(String(status)) : db.prepare('SELECT o.*, b.slug FROM orders o LEFT JOIN businesses b ON b.id = o.business_id ORDER BY o.id DESC LIMIT 200').all();
  return { orders: rows.map((o) => ({ ...orderView(o), business: o.slug ?? null, accountId: o.account_id })) };
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
