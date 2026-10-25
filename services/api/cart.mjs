import { attempt, dryRun, transaction } from './db.mjs';
import * as market from './market.mjs';
import * as economy from './economy.mjs';
import * as billing from './billing.mjs';
import * as promo from './promo.mjs';
import * as core from './core.mjs';
import { ApiError, fail, hasPro, requireAccount } from './core.mjs';
import { audit, byAccount } from './audit.mjs';
import { CART, PRODUCTS, categoryOf, districtOf, dollars, isSlug, placementOf, priceOf, promoGroupOf } from '@voxelventure/business-core';

// The cart (docs/monetization/billing.md#the-cart, docs/product/sales_funnel_proposal.md section 4): several purchases, one Stripe payment, so
// Stripe's 30¢ a payment is paid once instead of once per item.
//
//   lines      a plot lease (claim), a take-over, a renewal, an outside upgrade (each a "plot line": at most CART.maxPlots, each plot once), the Launch
//              Pack, a sponsored week, a market stall, an ad space (a billboard or banner, for its days), and Pro (the only subscription, at most
//              once). One cart per account, kept on the server.
//   prices     always the server's: each line is priced from the catalogue and the game's pricing code when it is added (to show it) and again at
//              checkout (what is charged). A price that changed in between stops the checkout once, with the new price shown.
//   Pro        with Pro in the cart the plot lines and ad spaces already get the Pro discount (the same payment buys Pro). If the Pro line then fails
//              or is refunded, the discount stays: it is not clawed back.
//   holds      adding a line holds nothing. Checkout checks every line (by doing it and undoing it, as a single "Buy now" does) and holds them all
//              at once for billing.HOLD_MS; if any line cannot be had, nothing is held and the answer says which lines and why.
//   orders     one parent order (product 'cart', the whole amount, the Stripe session) and a child order per line (orders.parent_id), each the
//              same order a single purchase makes, so fulfilment, refunds, the audit trail and the order lists work line by line (billing.mjs).
//   minimum    a checkout of at least CART.minimumCents. "Buy now" on a single item is not a cart and keeps no minimum.
//   promo      one promo code per cart (POST /cart/promo, promo.mjs): shown as its own line, on the lines it covers, after the Pro discount. The minimum
//              is the total before the code. Checked again at checkout; the parent order reserves its use and each line carries its share (promo_cents).
//              A cart the code makes free (and without Pro) is done at once, with no Stripe session.
// Without payments (billing.billingOn false) the game's lines (plots, stalls, ad spaces) are done at once, all or nothing, as the game's own routes do;
// the business products (Launch Pack, Pro, sponsored) cannot be bought without payments (503 billing_off, as their own checkout).
const PLOT_KINDS = ['claim', 'takeover', 'renew', 'exterior'];
const BUSINESS_KINDS = ['launch', 'pro', 'sponsored'];
export const CART_KINDS = [...PLOT_KINDS, ...BUSINESS_KINDS, 'stall', 'ad'];
const PRO_PRICED = [...PLOT_KINDS.filter((k) => k !== 'exterior'), 'ad']; // the lines Pro is cheaper for (an outside upgrade is not)
const now = () => Date.now();

// ---- the lines -------------------------------------------------------------------------------------------------------------------------
// What a line keeps of what the browser sent: the setup a plot action reads, or a stall's booking. Never a price.
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
const SETUP = ['title', 'buildingType', 'website', 'variant', 'logo', 'description', 'exterior', 'leaseDays'];
const STALL = ['siteCode', 'week', 'stallId', 'hours', 'start', 'brand', 'product', 'goods', 'offer', 'website'];
const AD = ['advertiser', 'headline', 'tagline', 'url', 'color'];
function requestOf(kind, input = {}) {
  if (kind === 'claim' || kind === 'takeover') return pick(input, SETUP);
  if (kind === 'renew') return pick(input, ['leaseDays']);
  if (kind === 'exterior') return pick(input, ['exterior']);
  if (kind === 'stall') return pick(input, STALL);
  if (kind === 'ad') return pick(input, AD);
  return {};
}
const plotOf = (line) => Number(String(line.target).split(':')[1]);
const slotOf = (line) => String(line.target).slice('ad:'.length);
const lineOf = (row) => ({ ...row, request: JSON.parse(row.request || '{}') });
const itemsOf = (db, accountId) => db.prepare('SELECT * FROM cart_items WHERE account_id = ? ORDER BY id').all(accountId);
const proIn = (rows) => rows.some((r) => r.kind === 'pro');
const stallLabel = (booked) => `Market stall ${booked.stall.id} (${booked.siteCode}), ${booked.booking.hours} hours from ${new Date(booked.booking.start).toUTCString().slice(0, 22)}`;

// A business profile of this account, by id (a line keeps the id; the profile must still be published and the account's).
function profileOf(db, account, id) {
  const b = db.prepare("SELECT * FROM businesses WHERE id = ? AND status = 'published'").get(Number(id)) ?? fail(404, 'That business profile is no longer published.', 'no_business');
  if (b.account_id !== account.id) fail(403, 'This is not your business.', 'forbidden');
  return b;
}
const placementName = (p) => `${p.label}${p.target ? `: ${p.target}` : ''}`;

// The price of a line now, as the server would charge it, and everything its purchase checks: { cents, discountCents, label }. Throws the
// ApiError the purchase itself would (409 for what is taken or held, 400 for what is not valid). `pro`: price the plot lines as Pro.
function priceLine(db, seed, account, line, pro) {
  const req = line.request;
  if (PLOT_KINDS.includes(line.kind)) {
    const plotId = plotOf(line);
    if (line.kind === 'claim' || line.kind === 'takeover') economy.assertNotHeld(db, account, plotId); // somebody else is setting it up (economy.mjs)
    const discounted = line.kind !== 'exterior';
    const would = billing.leaseWould(db, account, plotId, line.kind, req, discounted ? { pro } : {});
    const cents = Math.round(would.price * 100);
    if (!(cents > 0)) fail(409, 'This outside change costs nothing: save it on your building instead.', 'nothing_to_pay');
    const full = pro && discounted ? Math.round(billing.leaseWould(db, account, plotId, line.kind, req, { pro: false }).price * 100) : cents;
    return { cents, discountCents: Math.max(0, full - cents), label: billing.leaseLabel(line.kind, plotId, would) };
  }
  if (line.kind === 'stall') {
    const booked = dryRun(db, () => market.book(db, seed, account, req, { holdUntil: now() + billing.HOLD_MS }));
    return { cents: booked.paid, discountCents: 0, label: stallLabel(booked) };
  }
  if (line.kind === 'ad') {
    core.cleanAd(req);
    const q = core.adQuote(db, account, slotOf(line), { pro });
    return { cents: q.cents, discountCents: q.discountCents, label: q.label };
  }
  const b = profileOf(db, account, line.business_id);
  if (line.kind === 'pro' && billing.planFor(db, b.id).pro) fail(409, `${b.name} already has Pro.`, 'already_pro');
  let p = null;
  if (line.kind === 'sponsored') {
    p = placementOf(line.placement) ?? fail(400, 'Choose where the placement goes.', 'bad_placement');
    if (billing.taken(db, p.key) >= p.slots) fail(409, `${placementName(p)} is full right now. Try another, or come back when a week ends.`, 'placement_full');
  }
  const cents = priceOf(line.kind, p?.key) ?? fail(400, 'That is not for sale.', 'bad_product');
  const item = PRODUCTS[line.kind];
  return { cents, discountCents: 0, label: `${item.name}${p ? ` (${placementName(p)})` : ''} for ${b.name}${line.kind === 'pro' ? ', monthly' : ''}` };
}

// ---- the cart --------------------------------------------------------------------------------------------------------------------------
// GET /cart: the lines with their prices, the Pro discount, the total, and what the $4 minimum still needs.
export function cartView(db, account, env = process.env) {
  requireAccount(account);
  const rows = itemsOf(db, account.id);
  const names = new Map(db.prepare('SELECT id, slug, name FROM businesses WHERE account_id = ?').all(account.id).map((b) => [b.id, b]));
  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    cents: r.cents,
    discountCents: r.discount_cents,
    previousCents: r.previous_cents ?? null,
    plotId: PLOT_KINDS.includes(r.kind) ? plotOf(r) : null,
    business: r.business_id && names.get(r.business_id) ? { slug: names.get(r.business_id).slug, name: names.get(r.business_id).name } : null,
    placement: r.placement ?? null,
  }));
  const beforeCode = items.reduce((a, i) => a + i.cents, 0);
  const discountCents = items.reduce((a, i) => a + i.discountCents, 0);
  // the cart's promo code, priced on these lines now (it is checked again, and its use reserved, at checkout)
  const code = db.prepare('SELECT promo_code FROM carts WHERE account_id = ?').get(account.id)?.promo_code ?? null;
  let shownPromo = null;
  if (code) {
    const r = promo.check(db, account, code, rows.map(lineGroup));
    shownPromo = r.ok ? { code: r.promo.code, label: promoLabelOf(r.promo), cents: r.discount.cents, error: null } : { code, label: r.promo ? promoLabelOf(r.promo) : null, cents: 0, error: promo.messageOf(r) };
    if (r.ok) items.forEach((i, n) => (i.promoCents = r.discount.lines[n]));
  }
  for (const i of items) i.promoCents ??= 0;
  const totalCents = beforeCode - (shownPromo?.cents ?? 0);
  const pending = db.prepare("SELECT id, hold_until FROM orders WHERE account_id = ? AND product = 'cart' AND status = 'pending' AND hold_until > ? ORDER BY id DESC LIMIT 1").get(account.id, now());
  return {
    items,
    count: items.length,
    plots: items.filter((i) => i.plotId).length,
    maxPlots: CART.maxPlots,
    maxLines: CART.maxLines,
    subtotalCents: beforeCode + discountCents,
    discountCents,
    totalCents,
    minimumCents: CART.minimumCents,
    promo: shownPromo,
    missingCents: items.length ? Math.max(0, CART.minimumCents - beforeCode) : CART.minimumCents,
    ready: items.length > 0 && beforeCode >= CART.minimumCents,
    feeSavedCents: Math.max(0, items.length - 1) * CART.feeCents,
    payments: billing.billingOn(env),
    pending: pending ? { orderId: pending.id, until: pending.hold_until } : null,
  };
}

const lineGroup = (r) => ({ group: promoGroupOf(r.kind), cents: r.cents });
const promoLabelOf = (p) => promo.view(p, { public: true }).label;

// POST /cart/promo { code }: puts a promo code on the cart (one at a time: a new one replaces it), if it can be used on the cart's lines now. Rate
// limited as any code check is (promo.mjs). DELETE /cart/promo takes it off.
export function setPromo(db, account, rawCode, env = process.env, ctx = {}) {
  requireAccount(account);
  return transaction(db, () => {
    const r = promo.evaluate(db, account, rawCode, itemsOf(db, account.id).map(lineGroup), { ip: ctx.ip, env });
    db.prepare('INSERT INTO carts (account_id, created_at, updated_at, promo_code) VALUES (?, ?, ?, ?) ON CONFLICT (account_id) DO UPDATE SET promo_code = excluded.promo_code, updated_at = excluded.updated_at').run(account.id, now(), now(), r.promo.code);
    return cartView(db, account, env);
  });
}
export function clearPromo(db, account, env = process.env) {
  requireAccount(account);
  db.prepare('UPDATE carts SET promo_code = NULL, updated_at = ? WHERE account_id = ?').run(now(), account.id);
  return cartView(db, account, env);
}

// Plot and ad lines are priced again (quietly) when Pro comes into or leaves the cart: the discount the cart shows follows it. A line that cannot be priced
// now keeps its price; checkout will say why.
function repricePlots(db, seed, account) {
  const rows = itemsOf(db, account.id);
  const pro = hasPro(db, account.id) || proIn(rows);
  for (const r of rows.filter((x) => PRO_PRICED.includes(x.kind))) {
    try {
      const p = priceLine(db, seed, account, lineOf(r), pro);
      db.prepare('UPDATE cart_items SET cents = ?, discount_cents = ?, label = ? WHERE id = ?').run(p.cents, p.discountCents, p.label, r.id);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
  }
}

// POST /cart/items { kind, plotId?, business?, placement?, input? }: adds a line, priced now. Holds nothing.
//   claim | takeover   plotId and input (the setup, as the claim form sends it: title, buildingType, ..., leaseDays)
//   renew              plotId and input { leaseDays? }
//   exterior           plotId and input { exterior }
//   stall              input (the booking, as POST /market/book takes it)
//   ad                 slotId (the billboard or banner) and input (the ad, as POST /ads/:id/buy takes it: advertiser, headline, tagline, url, color)
//   launch | pro | sponsored   business (the profile's slug), and placement for a sponsored week
export function addItem(db, seed, account, body = {}, env = process.env) {
  requireAccount(account);
  const kind = CART_KINDS.includes(body.kind) ? body.kind : fail(400, `kind must be ${CART_KINDS.join(', ')}.`, 'bad_kind');
  if (BUSINESS_KINDS.includes(kind) && !billing.billingOn(env)) fail(503, 'Payments are not set up yet.', 'billing_off');
  return transaction(db, () => {
    const rows = itemsOf(db, account.id);
    if (rows.length >= CART.maxLines) fail(409, `A cart holds up to ${CART.maxLines} items.`, 'cart_full');
    const request = requestOf(kind, body.input ?? {});
    let target;
    let businessId = null;
    let placement = null;
    if (PLOT_KINDS.includes(kind)) {
      const plotId = Number(body.plotId);
      if (!Number.isInteger(plotId) || plotId < 1) fail(400, 'Which plot?', 'bad_plot');
      target = `plot:${plotId}`;
      if (rows.some((r) => r.target === target)) fail(409, 'This plot is in your cart already. Remove it first to change it.', 'plot_in_cart');
      if (rows.filter((r) => PLOT_KINDS.includes(r.kind)).length >= CART.maxPlots) fail(409, `A cart holds up to ${CART.maxPlots} plots (a lease, take-over, renewal or outside upgrade each count as one).`, 'too_many_plots');
    } else if (kind === 'stall') {
      target = `stall:${request.siteCode}:${request.week}:${request.stallId}:${request.start}`;
      if (rows.some((r) => r.target === target)) fail(409, 'This stall is in your cart already.', 'already_in_cart');
    } else if (kind === 'ad') {
      if (!/^[A-Za-z0-9_-]{1,60}$/.test(String(body.slotId ?? ''))) fail(400, 'Which ad space?', 'bad_slot');
      target = `ad:${body.slotId}`;
      if (rows.some((r) => r.target === target)) fail(409, 'This ad space is in your cart already. Remove it first to change the ad.', 'already_in_cart');
    } else {
      const b = (isSlug(body.business) ? db.prepare("SELECT * FROM businesses WHERE slug = ? AND status = 'published'").get(String(body.business)) : null) ?? fail(404, 'No such business.', 'no_business');
      if (b.account_id !== account.id) fail(403, 'This is not your business.', 'forbidden');
      businessId = b.id;
      if (kind === 'sponsored') {
        const p = placementOf(body.placement) ?? fail(400, 'Choose where the placement goes.', 'bad_placement');
        if (p.kind === 'category' && !categoryOf(p.target)) fail(400, 'No such category.', 'bad_placement');
        if (p.kind === 'district' && !districtOf(p.target)) fail(400, 'No such district.', 'bad_placement');
        placement = p.key;
      }
      if (kind === 'pro' && proIn(rows)) fail(409, 'Pro is in your cart already.', 'pro_in_cart');
      target = `business:${b.id}:${kind}${placement ? `:${placement}` : ''}`;
      if (rows.some((r) => r.target === target)) fail(409, 'That is in your cart already.', 'already_in_cart');
    }
    const line = { kind, target, business_id: businessId, placement, request };
    const pro = hasPro(db, account.id) || proIn(rows) || kind === 'pro';
    const p = priceLine(db, seed, account, line, pro);
    db.prepare('INSERT INTO carts (account_id, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT (account_id) DO UPDATE SET updated_at = excluded.updated_at').run(account.id, now(), now());
    const id = Number(db.prepare('INSERT INTO cart_items (account_id, kind, target, business_id, placement, request, label, cents, discount_cents, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(account.id, kind, target, businessId, placement, JSON.stringify(request), p.label, p.cents, p.discountCents, now()).lastInsertRowid);
    if (kind === 'pro') repricePlots(db, seed, account);
    return { added: id, cart: cartView(db, account, env) };
  });
}

// DELETE /cart/items/:id, and DELETE /cart (every line).
export function removeItem(db, seed, account, id, env = process.env) {
  requireAccount(account);
  return transaction(db, () => {
    const row = db.prepare('SELECT * FROM cart_items WHERE id = ? AND account_id = ?').get(Number(id), account.id) ?? fail(404, 'That is not in your cart.', 'not_in_cart');
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(row.id);
    if (row.kind === 'pro') repricePlots(db, seed, account);
    return cartView(db, account, env);
  });
}
export function clearCart(db, account, env = process.env) {
  requireAccount(account);
  db.prepare('DELETE FROM cart_items WHERE account_id = ?').run(account.id);
  db.prepare('UPDATE carts SET promo_code = NULL WHERE account_id = ?').run(account.id);
  return cartView(db, account, env);
}

// ---- checkout --------------------------------------------------------------------------------------------------------------------------
// POST /cart/checkout. With payments on: { checkout: { orderId, url, cents, mode } }, Stripe's page for the whole cart. Without: { done: [...] },
// every line done at once. Refused (409, with `cart` and nothing held) when:
//   cart_unavailable   a line cannot be had now: `problems` [{ id, label, code, error }] says which and why
//   price_changed      a price is not the one the cart showed: the cart now shows the new one (previousCents: the old), checkout again to pay it
//   below_minimum      the total is under CART.minimumCents: `missingCents` is what is missing
// The cart's promo code can no longer be used (promo_invalid, promo_used, promo_not_applicable, promo_minimum): refused with that reason and the cart,
// nothing held. A cart the code makes free: { checkout: { orderId, url (the paid page), cents: 0, mode: 'free' } }, every line done at once.
export async function checkout(db, seed, account, env = process.env, fetchImpl = fetch, after = null, ctx = {}) {
  requireAccount(account);
  const on = billing.billingOn(env);
  const rows = itemsOf(db, account.id);
  if (!rows.length) fail(400, 'Your cart is empty.', 'empty_cart');
  if (!on && rows.some((r) => BUSINESS_KINDS.includes(r.kind))) fail(503, 'Payments are not set up yet: the Launch Pack, Pro and sponsored weeks cannot be bought.', 'billing_off');
  const replaced = [];
  const code = on ? (db.prepare('SELECT promo_code FROM carts WHERE account_id = ?').get(account.id)?.promo_code ?? null) : null;
  let out;
  try {
    out = transaction(db, () => run(db, seed, account, rows, on, replaced, { code, ip: ctx.ip, env }));
  } catch (e) {
    if (e instanceof ApiError && /^promo_/.test(e.code) && e.code !== 'promo_rate_limited') throw e.withData({ cart: cartView(db, account, env) });
    if (!e.late) throw e;
    out = { problems: e.late };
    replaced.length = 0; // rolled back: the checkout it would have replaced is still open
  }
  // the checkout this one replaced: its Stripe page is closed too (best effort: it lapses anyway)
  for (const s of replaced) billing.stripe(env, 'POST', `/checkout/sessions/${encodeURIComponent(s)}/expire`, {}, { fetchImpl }).catch(() => {});
  if (out.problems) {
    for (const p of out.problems) if (p.status === 409 && p.plotId) economy.onCartLine(db, { accountId: account.id, plotId: p.plotId, action: p.kind, step: 'failed' });
    throw new ApiError(409, unavailableMessage(out.problems), 'cart_unavailable').withData({ problems: out.problems.map(shownProblem), cart: cartView(db, account, env) });
  }
  if (out.changed) throw new ApiError(409, 'A price in your cart changed. Check the new total, then check out again.', 'price_changed').withData({ changed: out.changed, cart: cartView(db, account, env) });
  if (out.missingCents) throw new ApiError(409, `A cart checkout is at least ${dollars(CART.minimumCents)}: add ${dollars(out.missingCents)} more, or use Buy now for a single item.`, 'below_minimum').withData({ missingCents: out.missingCents, cart: cartView(db, account, env) });
  if (out.done) {
    for (const d of out.done) if (d.fulfilled) after?.(d.fulfilled);
    return { done: out.done.map(({ id, kind, label, cents }) => ({ id, kind, label, cents })), cart: cartView(db, account, env) };
  }
  // 4. one Stripe Checkout session: a line per child order; with Pro, subscription mode with Pro as the recurring line
  const { parent, children } = out;
  for (const s of out.closing) billing.stripe(env, 'POST', `/checkout/sessions/${encodeURIComponent(s)}/expire`, {}, { fetchImpl }).catch(() => {});
  const proLine = children.find((c) => c.product === 'pro');
  const mode = parent.cents === 0 && !proLine ? 'free' : proLine ? 'subscription' : 'payment';
  // a line's price less its share of the code; Pro keeps its full recurring price, its share of the code coming off the first invoice as a coupon
  const lines = children.map((c) => ({ name: c.label, cents: c.product === 'pro' ? c.cents + c.promo_cents : c.cents, interval: c.product === 'pro' ? PRODUCTS.pro.interval : null }));
  const url = mode === 'free' ? null : await billing.openSession(db, account, parent, { name: parent.label, mode, back: '/cart', metadata: { cart: parent.id }, lines, couponCents: proLine?.promo_cents ?? 0 }, env, fetchImpl);
  for (const c of children) {
    if (c.product !== 'lease') continue;
    const req = JSON.parse(c.request || '{}');
    economy.onCartLine(db, { accountId: account.id, plotId: Number(String(c.target).split(':')[1]), action: req.action, step: 'checkout', priceCents: c.cents, termDays: req.days ?? null });
  }
  audit(db, byAccount(account), 'billing.checkout', { kind: 'order', id: parent.id }, { product: 'cart', cents: parent.cents, mode, ...billing.promoDetail(parent), lines: children.map((c) => ({ order: c.id, product: c.product, target: c.target, placement: c.placement, cents: c.cents, ...(c.promo_cents ? { promoCents: c.promo_cents } : {}) })) });
  // free (a code took everything off, and no Pro to start): no Stripe session, every line done now, and the player is sent to the paid page
  if (mode === 'free') return { checkout: { orderId: parent.id, ...(await billing.comp(db, account, parent, '/cart', env, fetchImpl, after)), mode } };
  return { checkout: { orderId: parent.id, url, cents: parent.cents, mode, ...billing.shownPromo(parent) } };
}
// The checkout's work, in one transaction: price and check every line again, then hold them all (or, without payments, do them).
function run(db, seed, account, rows, on, replaced, promoCtx = {}) {
  // a checkout of this cart still open is replaced: what it held is let go (its Stripe page is closed below)
  for (const o of db.prepare("SELECT * FROM orders WHERE account_id = ? AND product = 'cart' AND status = 'pending'").all(account.id)) {
    billing.expire(db, o, 'expired');
    if (o.stripe_session) replaced.push(o.stripe_session);
  }
  const pro = hasPro(db, account.id) || proIn(rows);
  // 1. every line priced again and checked, by doing it and undoing it
  const problems = [];
  const changed = [];
  const priced = [];
  for (const r of rows) {
    const line = lineOf(r);
    try {
      const p = attempt(db, () => priceLine(db, seed, account, line, pro));
      if (p.cents !== r.cents) changed.push({ id: r.id, label: p.label, previousCents: r.cents, cents: p.cents });
      priced.push({ ...line, ...p });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      problems.push({ id: r.id, label: r.label, code: e.code, error: e.message, status: e.status, plotId: PLOT_KINDS.includes(r.kind) ? plotOf(r) : null, kind: r.kind });
    }
  }
  if (problems.length) return { problems };
  if (changed.length) {
    for (const c of changed) db.prepare('UPDATE cart_items SET cents = ?, discount_cents = ?, label = ?, previous_cents = ? WHERE id = ?').run(c.cents, priced.find((x) => x.id === c.id).discountCents, c.label, c.previousCents, c.id);
    return { changed };
  }
  const total = priced.reduce((a, l) => a + l.cents, 0);
  if (total < CART.minimumCents) return { missingCents: CART.minimumCents - total };
  db.prepare('UPDATE cart_items SET previous_cents = NULL WHERE account_id = ?').run(account.id);
  // the cart's promo code, on the lines as priced now (the minimum above is before it); its use is reserved with the parent order below
  const closing = [];
  const code = on && promoCtx.code ? billing.applyPromo(db, account, promoCtx.code, priced.map((l) => ({ group: promoGroupOf(l.kind), cents: l.cents })), { ip: promoCtx.ip, env: promoCtx.env }, closing) : null;
  priced.forEach((l, i) => Object.assign(l, { promoCents: code ? code.discount.lines[i] : 0, promoCode: code?.promo.code ?? null }));
  const off = code?.discount.cents ?? 0;
  // 2. without payments: every line done now (all or nothing)
  if (!on) {
    const done = priced.map((l) => doLine(db, seed, account, l));
    db.prepare(`DELETE FROM cart_items WHERE account_id = ? AND id IN (${priced.map(() => '?').join(',')})`).run(account.id, ...priced.map((l) => l.id));
    return { done };
  }
  // 3. everything held at once: one parent order, a child order per line
  const holdUntil = now() + billing.HOLD_MS;
  const label = `Cart: ${priced.length} item${priced.length === 1 ? '' : 's'}`;
  const parentId = Number(db.prepare("INSERT INTO orders (account_id, product, request, label, cents, hold_until, created_at, promo_code, promo_cents) VALUES (?, 'cart', ?, ?, ?, ?, ?, ?, ?)").run(account.id, JSON.stringify({ items: priced.map((l) => l.id) }), label, total - off, holdUntil, now(), code ? code.promo.code : null, off).lastInsertRowid);
  if (code) promo.reserve(db, account, code.promo, parentId, off);
  const late = [];
  const children = priced.map((l) => {
    try {
      return attempt(db, () => holdLine(db, seed, account, l, { parentId, holdUntil, pro }));
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      late.push({ id: l.id, label: l.label, code: e.code, error: e.message, status: e.status, plotId: PLOT_KINDS.includes(l.kind) ? plotOf(l) : null, kind: l.kind });
      return null;
    }
  });
  // two lines of the cart that cannot both be had (two stalls at the same time, the last slot of a spot twice): nothing is held
  if (late.length) throw Object.assign(new ApiError(409, unavailableMessage(late), 'cart_unavailable'), { late });
  return { parent: billing.orderById(db, parentId), children, closing };
}

const shownProblem = ({ id, label, code, error }) => ({ id, label, code, error });
const unavailableMessage = (list) => `Part of your cart cannot be bought right now: ${list.map((p) => `${p.label} (${p.error})`).join('; ')}. Remove it, or try again later.`.slice(0, 600);

// A line held for the checkout: the child order (and, for a stall, its pending booking). The same order a single purchase makes.
function holdLine(db, seed, account, l, { parentId, holdUntil, pro }) {
  const insert = (product, { target = null, request = null, businessId = null, placement = null, hold = holdUntil } = {}) => {
    const id = Number(db.prepare('INSERT INTO orders (account_id, business_id, product, target, request, label, placement, cents, hold_until, created_at, parent_id, promo_code, promo_cents) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(account.id, businessId, product, target, request, l.label, placement, l.cents - (l.promoCents ?? 0), hold, now(), parentId, l.promoCents ? l.promoCode : null, l.promoCents ?? 0).lastInsertRowid);
    return billing.orderById(db, id);
  };
  if (PLOT_KINDS.includes(l.kind)) {
    const days = l.kind === 'exterior' ? null : billing.leaseWould(db, account, plotOf(l), l.kind, l.request, { pro }).days;
    return insert('lease', { target: l.target, request: JSON.stringify({ action: l.kind, input: l.request, days, ...(pro && l.kind !== 'exterior' ? { pro: true } : {}) }) });
  }
  if (l.kind === 'stall') {
    const booked = market.book(db, seed, account, l.request, { holdUntil });
    return insert('market', { target: `booking:${booked.booking.id}` });
  }
  if (l.kind === 'ad') {
    const q = core.adQuote(db, account, slotOf(l), { pro }); // two carts cannot both hold the space: the first checkout's order holds it
    return insert('ad', { target: l.target, request: JSON.stringify({ slotId: q.slotId, ad: core.cleanAd(l.request), days: q.days, pro }) });
  }
  if (l.kind === 'sponsored') {
    const p = placementOf(l.placement);
    if (billing.taken(db, p.key) >= p.slots) fail(409, `${placementName(p)} is full right now.`, 'placement_full');
    return insert('sponsored', { businessId: l.business_id, placement: p.key });
  }
  return insert(l.kind, { businessId: l.business_id, hold: null }); // the Launch Pack and Pro hold nothing (there is no limit to hold)
}

// Without payments: a game line done at once, as its own route does (audited; the server tells the other players through `after`).
function doLine(db, seed, account, l) {
  if (l.kind === 'ad') {
    const out = core.buySlot(db, account, slotOf(l), l.request);
    audit(db, byAccount(account), 'ad.buy', { kind: 'ad', id: slotOf(l) }, { advertiser: out.slot.ad.advertiser, value: out.slot.value, paidOut: out.paidOut, previousAdvertiser: out.previousAdvertiser, cart: true });
    return { ...l, fulfilled: { kind: 'ad', slotId: slotOf(l), previousAccount: out.previousAccount, out } };
  }
  if (l.kind === 'stall') {
    const out = market.book(db, seed, account, l.request);
    audit(db, byAccount(account), 'market.book', { kind: 'booking', id: out.booking.id }, { stall: out.stall.id, site: l.request.siteCode ?? null, week: l.request.week ?? null, cents: out.paid, cart: true });
    return { ...l, fulfilled: { kind: 'market', stallId: out.stall.id } };
  }
  const plotId = plotOf(l);
  const out = billing.LEASE_ACTIONS[l.kind](db, account, plotId, l.request, {});
  audit(db, byAccount(account), `plot.${l.kind}`, { kind: 'plot', id: plotId }, { ...billing.leaseDetail(l.kind, out), cart: true });
  return { ...l, fulfilled: { kind: 'lease', action: l.kind, plotId, accountId: account.id, out } };
}
