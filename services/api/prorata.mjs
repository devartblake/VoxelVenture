import { transaction } from './db.mjs';
import * as core from './core.mjs';
import * as market from './market.mjs';
import * as billing from './billing.mjs';
import { audit } from './audit.mjs';
import { ApiError, fail } from './core.mjs';
import { DAY_MS, PRODUCTS, PRORATA, monthPeriod, prorataPlan } from '@voxelventure/business-core';

// Refunds of unused time, pro rata (docs/monetization/billing.md#refunds-of-unused-time). The rule is @voxelventure/business-core's prorataLine:
// this module gathers each paid line's facts (what was paid for it, the time it paid for, its dispute), asks the rule, makes the refunds in Stripe
// (part of the original charge; idempotency key vv-prorata-<order line>), records them on the order and in the audit log, and (for an admin's
// refund) ends what was refunded.
//
//   an account's deletion   privacy.mjs deleteAccount: every line of the account, before anything is deleted (the deletion then ends it all)
//   an admin's refund       GET (preview) and POST { reason } /admin/accounts/:id/prorata and /admin/billing/orders/:id/prorata
//   the estimate            GET /me/prorata: what deleting the account would give back now
//
// The time each line paid for:
//   lease, renewal  a plot's lease is the chain of its tenant's paid orders since the last claim or take-over: walked back from the lease's end, each
//                   order's term in turn (the latest renewal holds the last days). A renewal still to come counts all its days as unused.
//                   A plot no longer theirs has nothing left.
//   ad              its booking (ad_terms) while active; sponsored: its week (entitlements) while active
//   pro             the period paid now: a calendar month back from the plan's end (not before it started); paid the order's amount in the
//                   first month, the full price after (a promo code covers the first month only), less what was refunded in this period
//   market          a stall booked and not opened yet: all of it

const json = (s, d = {}) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};
const targetOf = (o) => String(o.target ?? '').split(':').slice(1).join(':');
const LEASE_KIND = { claim: 'lease', takeover: 'lease', renew: 'renewal', exterior: 'exterior' };

function disputeOf(db, o) {
  const parent = o.parent_id ? billing.orderById(db, o.parent_id) : null;
  const ids = [o.dispute_id, parent?.dispute_id].filter(Boolean);
  const rows = db.prepare(`SELECT status FROM disputes WHERE order_id IN (?, ?)${ids.length ? ` OR id IN (${ids.map(() => '?').join(',')})` : ''}`).all(o.id, parent?.id ?? 0, ...ids);
  if (rows.some((r) => r.status === 'open')) return 'open';
  if (rows.some((r) => r.status === 'lost')) return 'lost';
  return rows.length ? 'won' : null;
}

// The lease chain of a plot for its tenant: order id -> { start, end, days }.
function leaseWindows(db, plotId, accountId) {
  const out = new Map();
  const p = db.prepare('SELECT * FROM plots WHERE id = ?').get(Number(plotId));
  if (!p || p.owner_account !== accountId || !p.lease_end) return out;
  const rows = db.prepare("SELECT * FROM orders WHERE product = 'lease' AND target = ? AND account_id = ? AND status = 'paid' ORDER BY id DESC").all(`plot:${p.id}`, accountId);
  let cursor = p.lease_end;
  for (const o of rows) {
    const req = json(o.request);
    if (!req.done || !['claim', 'takeover', 'renew'].includes(req.action)) continue;
    const days = Number(req.days ?? p.lease_days ?? 30);
    out.set(o.id, { start: cursor - days * DAY_MS, end: cursor, days, plotId: p.id });
    cursor -= days * DAY_MS;
    if (req.action !== 'renew') break; // the claim or take-over this tenancy started with: what came before is another tenancy
  }
  return out;
}

// One paid line's facts for the rule, with what the server needs to end it.
function factsOf(db, o, at, cache = new Map()) {
  const req = json(o.request);
  const f = { id: o.id, status: o.status, cents: o.cents, refundedCents: o.refunded_cents ?? (o.status === 'refunded' ? o.cents : 0), dispute: disputeOf(db, o), proRataDone: billing.proRataDone(db, o.id), start: null, end: null, termDays: null, kind: 'other', order: o };
  if (o.product === 'lease') {
    f.kind = LEASE_KIND[req.action] ?? 'other';
    if (f.kind === 'lease' || f.kind === 'renewal') {
      const plotId = Number(targetOf(o));
      const key = `${plotId}:${o.account_id}`;
      if (!cache.has(key)) cache.set(key, leaseWindows(db, plotId, o.account_id));
      const w = cache.get(key).get(o.id);
      f.plotId = plotId;
      f.termDays = Number(req.days ?? w?.days ?? 30);
      if (w) Object.assign(f, { start: w.start, end: w.end });
    }
  } else if (o.product === 'ad') {
    f.kind = 'ad';
    const t = db.prepare('SELECT * FROM ad_terms WHERE order_id = ?').get(o.id);
    f.termDays = Number(req.days ?? PRORATA.adDays);
    if (t?.status === 'active') Object.assign(f, { start: t.starts_at, end: t.ends_at });
  } else if (o.product === 'sponsored') {
    f.kind = 'sponsored';
    f.termDays = PRORATA.weekDays;
    const e = db.prepare('SELECT * FROM entitlements WHERE order_id = ?').get(o.id);
    if (e?.status === 'active') Object.assign(f, { start: e.starts_at, end: e.ends_at });
  } else if (o.product === 'pro') {
    f.kind = 'pro';
    const e = db.prepare('SELECT * FROM entitlements WHERE order_id = ?').get(o.id);
    if (e?.status === 'active' && e.ends_at > at) {
      const period = monthPeriod(e.ends_at, e.starts_at);
      const renewed = (o.renewals ?? 0) > 0 && period.start > e.starts_at;
      Object.assign(f, { start: period.start, end: e.ends_at, termDays: period.days });
      if (renewed) Object.assign(f, { cents: PRODUCTS.pro.cents, refundedCents: db.prepare('SELECT COALESCE(SUM(cents), 0) AS n FROM order_refunds WHERE order_id = ? AND at >= ?').get(o.id, period.start).n });
    }
  } else if (o.product === 'market') {
    f.kind = 'market';
    const b = db.prepare('SELECT * FROM market_bookings WHERE id = ?').get(Number(targetOf(o)));
    f.bookingId = b?.id ?? null;
    if (b?.status === 'booked') Object.assign(f, { start: b.start_at, end: b.end_at });
  } else if (o.product === 'launch') f.kind = 'launch';
  return f;
}

const labelOf = (o) => o.label ?? PRODUCTS[o.product]?.name ?? o.product;
const view = (facts, plan) => plan.lines.map((l, i) => ({ orderId: l.id, parentId: facts[i].order.parent_id ?? null, product: facts[i].order.product, kind: l.kind, label: labelOf(facts[i].order), paidCents: l.paidCents, unusedDays: l.unusedDays, termDays: l.termDays, notStarted: l.notStarted, cents: l.cents, refund: l.refund, why: l.why }));

function planOf(db, orders, { at = Date.now(), closedForRules = false } = {}) {
  const cache = new Map();
  const facts = orders.map((o) => factsOf(db, o, at, cache));
  const plan = prorataPlan(facts, { at, closedForRules });
  return { at, closedForRules, facts, plan, preview: { totalCents: plan.totalCents, count: plan.count, lines: view(facts, plan), minCents: PRORATA.minCents, at, closedForRules } };
}

// Every line of an account (each paid order; a cart is its lines).
export function forAccount(db, accountId, opts = {}) {
  const orders = db.prepare("SELECT * FROM orders WHERE account_id = ? AND product != 'cart' AND status IN ('paid', 'charged_back') ORDER BY id").all(Number(accountId));
  return planOf(db, orders, opts);
}
// Every line of one business page: the orders made for it (Pro, sponsored weeks, the Launch Pack: a cart's lines carry it too). Leases and ad spaces
// belong to the account, not the page (deleting the page only unlinks its plot), so they are not in it.
export function forBusiness(db, businessId, opts = {}) {
  const orders = db.prepare("SELECT * FROM orders WHERE business_id = ? AND product != 'cart' AND status IN ('paid', 'charged_back') ORDER BY id").all(Number(businessId));
  return planOf(db, orders, opts);
}
// One order: itself, or a cart's lines; a lease line whose time is running takes the later renewals of the same lease with it (refunding it ends
// the lease, so they could not be used either).
export function forOrder(db, orderId, opts = {}) {
  const at = opts.at ?? Date.now();
  const o = billing.orderById(db, orderId) ?? fail(404, 'No such order.', 'no_order');
  const lines = o.product === 'cart' ? billing.childrenOf(db, o) : [o];
  const ids = new Set(lines.map((l) => l.id));
  for (const l of [...lines]) {
    if (l.product !== 'lease' || l.status !== 'paid') continue;
    const w = leaseWindows(db, Number(targetOf(l)), l.account_id);
    const mine = w.get(l.id);
    if (!mine || mine.start > at) continue;
    for (const [id] of w) {
      if (id > l.id && !ids.has(id)) (ids.add(id), lines.push(billing.orderById(db, id)));
    }
  }
  return planOf(db, lines.sort((a, b) => a.id - b.id), { ...opts, at });
}

// What was refunded is ended (an admin's refund; an account's deletion ends everything itself): a lease whose time was running is released at once
// (the plot goes back to the city), a lease renewal still to come gives its days back, an ad booking is revoked (a later one of the same space moves
// forward), a sponsored week and Pro stop (Pro's plan is cancelled in Stripe afterwards: `cancel`), a stall still to come is released.
function endLines(db, done, seed, at) {
  const ended = [];
  const cancel = [];
  const plots = new Map();
  for (const f of done) {
    const o = f.order;
    if (f.kind === 'lease' || f.kind === 'renewal') {
      const g = plots.get(f.plotId) ?? { running: false, days: 0, orders: [] };
      if (f.start <= at) g.running = true;
      else g.days += f.termDays;
      g.orders.push(o.id);
      plots.set(f.plotId, g);
    } else if (f.kind === 'ad') {
      core.setAdTerm(db, o.id, 'revoked');
      ended.push({ orderId: o.id, what: 'the ad booking ended' });
    } else if (f.kind === 'sponsored' || f.kind === 'pro') {
      db.prepare("UPDATE entitlements SET status = 'revoked', ends_at = MIN(ends_at, ?) WHERE order_id = ? AND status = 'active'").run(at, o.id);
      if (f.kind === 'pro') {
        const parent = o.parent_id ? billing.orderById(db, o.parent_id) : null;
        const sub = o.stripe_subscription ?? parent?.stripe_subscription ?? null;
        if (sub) cancel.push({ orderId: o.id, sub });
      }
      ended.push({ orderId: o.id, what: f.kind === 'pro' ? 'Pro stopped' : 'the sponsored week ended' });
    } else if (f.kind === 'market') {
      market.releaseBooking(db, f.bookingId);
      ended.push({ orderId: o.id, what: 'the stall booking was released' });
    }
  }
  const released = [];
  for (const [plotId, g] of plots) {
    const p = db.prepare('SELECT * FROM plots WHERE id = ?').get(plotId);
    if (!p || p.owner_account !== done.find((f) => f.plotId === plotId).order.account_id) continue;
    if (g.running) {
      core.releasePlot(db, plotId, seed);
      released.push(plotId);
      for (const id of g.orders) ended.push({ orderId: id, what: `the lease ended: plot ${plotId} is released` });
    } else {
      db.prepare('UPDATE plots SET lease_end = lease_end - ?, lease_notified = 0 WHERE id = ?').run(g.days * DAY_MS, plotId);
      for (const id of g.orders) ended.push({ orderId: id, what: `the renewal's days were taken off the lease of plot ${plotId}` });
    }
  }
  return { ended, cancel, released };
}

// Makes the refunds a plan says (`p`: forAccount / forOrder). Each line: Stripe first (a partial refund of the payment it was paid with), then its
// record in one transaction (and, with `end`, what it bought is ended). A Stripe failure stops there (ApiError 502): the lines refunded before it
// are recorded (the money went back) and are never refunded twice; nothing else changes. Returns { totalCents, refunded, ended, released, warnings }.
export async function issue(db, p, { env = process.env, fetchImpl = fetch, actor, why, end = false, seed = 20260101 } = {}) {
  const todo = p.plan.lines.map((l, i) => ({ l, f: p.facts[i] })).filter((x) => x.l.refund);
  const out = { totalCents: 0, refunded: [], ended: [], released: [], warnings: [] };
  if (!todo.length) return out;
  if (!env.STRIPE_SECRET_KEY) throw new ApiError(503, 'Refunds cannot be made right now: payments are not set up.', 'billing_off');
  const done = [];
  for (const { l, f } of todo) {
    const o = billing.orderById(db, f.id);
    if (billing.proRataDone(db, o.id) || o.status !== 'paid') continue;
    const pi = await billing.paymentOfLine(db, o, env, fetchImpl);
    if (!pi) throw new ApiError(502, `The payment of order ${o.id} was not found in Stripe, so its unused time cannot be refunded. Nothing else was changed.`, 'no_payment');
    const r = await billing.stripe(env, 'POST', '/refunds', { payment_intent: pi, amount: l.cents, metadata: { order: o.id, kind: 'prorata' } }, { idempotencyKey: `vv-prorata-${o.id}`, fetchImpl });
    transaction(db, () => {
      if (billing.proRataDone(db, o.id)) return; // the same refund recorded meanwhile (Stripe answered the same key with the same refund)
      billing.recordProrata(db, billing.orderById(db, o.id), l.cents, why, actor, { unusedDays: l.unusedDays, termDays: l.termDays, stripeRefund: r.id ?? null });
      done.push({ ...f, order: billing.orderById(db, o.id) });
    });
    out.refunded.push({ orderId: o.id, cents: l.cents, unusedDays: l.unusedDays, stripeRefund: r.id ?? null });
    out.totalCents += l.cents;
  }
  if (end && done.length) {
    const e = transaction(db, () => endLines(db, done, seed, Date.now()));
    out.ended = e.ended;
    out.released = e.released;
    for (const c of e.cancel) {
      await billing.stripe(env, 'DELETE', `/subscriptions/${encodeURIComponent(c.sub)}`, null, { fetchImpl }).catch((err) => {
        audit(db, actor, 'billing.stripe_call_failed', { kind: 'order', id: c.orderId }, { method: 'DELETE', error: String(err.message).slice(0, 200) });
        out.warnings.push(`Pro of order ${c.orderId} stopped here, but Stripe did not cancel its plan (${err.message}). Cancel it in the Stripe dashboard.`);
      });
    }
  }
  return out;
}

// An admin's refund of unused time (one order, or every line of an account): the reason is required, and it is audited as a whole and line by line.
export async function adminRefund(db, p, target, { reason, actor, env, fetchImpl, seed }) {
  const why = String(reason ?? '').trim();
  if (why.length < 3) fail(400, 'Give a reason (for the audit trail and the order).', 'reason_required');
  const out = await issue(db, p, { env, fetchImpl, actor, why: `by an admin: ${why.slice(0, 160)}`, end: true, seed });
  audit(db, actor, 'billing.prorata', target, { reason: why.slice(0, 200), totalCents: out.totalCents, lines: out.refunded.map((r) => r.orderId), ended: out.ended.length, warnings: out.warnings.length });
  return out;
}
