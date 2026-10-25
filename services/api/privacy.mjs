import crypto from 'node:crypto';
import { transaction } from './db.mjs';
import * as core from './core.mjs';
import { audit } from './audit.mjs';
import { orderById, expire, closeSessions, stripe, planFor } from './billing.mjs';
import { profileStats, ownerView, referralCode, referralSecret } from './business.mjs';
import { endHold, hashOf } from './economy.mjs';
import { exportFor as messagingExport, eraseFor as messagingErase } from './messaging.mjs';
import * as prorata from './prorata.mjs';
import { figuresFor } from '@voxelventure/business-core';
import { imp } from '../../scripts/lib-loader.mjs';

// Privacy rights, self-service (docs/architecture/backend.md#privacy, docs/monetization/policy_review.md section 3 item 6):
//
//   export    GET /me/export (3 a day per account): everything the database holds about the signed-in account, as JSON, with a readable summary.
//             An admin makes the same for a person who writes in (GET /admin/accounts/:id/export).
//   delete    POST /me/delete { password, confirm } (the password again, and the account's name typed): personal data is wiped at once, records
//             that must stay are kept without it (below). No grace period: the confirmation screen and the password are the safeguard.
//             An admin does the same for a request by email (POST /admin/accounts/:id/delete { confirm, reason }).
//   a page    DELETE /businesses/:slug (the owner): the business page goes, its figures are kept in total only.
//
// Every table of the database is in TABLES: what it holds about a person, whether the export carries it (and where) or why not, and what
// deleting the account does to it. tests/privacy.test.mjs fails when a table is missing, so a new table has to be classified here.

const now = () => Date.now();
const DAY = 86400000;
export const TOMBSTONE = (id) => `deleted-${id}`;

export const TABLES = {
  accounts: { export: 'account', deletion: 'kept as a row with no personal data: the name becomes deleted-<id>; email, password, notices, referral and Credits are wiped (orders and the action log refer to its number)' },
  sessions: { export: 'sessions', deletion: 'deleted: every device is signed out' },
  plots: { export: 'plots', deletion: 'a plot it leases is released at once: back to the empty lot (or the city\'s business) the world started with; its unused lease time is refunded first (prorata.mjs)' },
  plot_interiors: { export: 'plots[].interior', deletion: 'deleted' },
  ledger: { export: 'plotHistory', deletion: 'kept (the plot\'s history of who held it, and the price): the name in it becomes deleted-<id>' },
  events: { export: 'activity.visits', deletion: 'kept for the businesses\' figures, with the visitor replaced by a random number that leads to nobody' },
  ad_slots: { export: 'adSpaces', deletion: 'an ad space it holds is emptied' },
  ad_terms: { export: 'adBookings', deletion: 'a paid booking still running or to come is removed (the space is emptied); the ad text is wiped, the dates and order kept for accounting' },
  ad_ledger: { export: 'adHistory', deletion: 'kept (prices and dates); the advertiser and headline are wiped' },
  ad_events: { export: 'activity.adViews', deletion: 'kept for the figures, with the visitor replaced by a random number' },
  coupon_claims: { export: 'couponClaims', deletion: 'kept for the business\'s figures, with the visitor replaced by a random number' },
  leads: { export: 'newsletters.mine and businesses[].newsletterSignups (the confirmed addresses its owner already sees)', deletion: 'deleted: its own sign-ups (by its email), and the sign-ups other people made to its businesses, plots and ad spaces' },
  feedback: { export: 'feedbackPosted', deletion: 'its posts are taken down and their text wiped; the name becomes deleted-<id>' },
  quest_sessions: { export: 'quests.started', deletion: 'deleted' },
  quest_claims: { export: 'quests.earned', deletion: 'kept (the Credits a business paid out)' },
  gold_ledger: { export: 'credits', deletion: 'kept (the record of every Credit moved); the balance is set to 0' },
  outbox: { export: 'emails (subject, kind and date; the body is left out: it can hold one-use links)', deletion: 'every email to its address is deleted, sent or not' },
  reports: { export: 'reportsMade (what it reported and why; not the reported content)', deletion: 'kept for moderation, its note wiped; a copy of its own reported message keeps its text until the report is decided, under the new name' },
  market_layouts: { export: null, excluded: 'the market\'s weekly layout set by staff: nothing about a player', deletion: 'nothing' },
  market_bookings: { export: 'marketStalls', deletion: 'a stall booked for later is cancelled and refunded in full first; past ones are kept for accounting with the name, goods, offer and website wiped' },
  market_visits: { export: 'activity.stallVisits', deletion: 'kept for the stallholders\' figures, with the visitor replaced by a random number' },
  presence: { export: 'activity.online', deletion: 'deleted' },
  arrivals: { export: 'activity.arrivals', deletion: 'kept (the visits count), with the visitor replaced by a random number' },
  hunt_wins: { export: 'buildingOfTheWeek.huntWins', deletion: 'deleted' },
  votes: { export: 'buildingOfTheWeek.votes', deletion: 'kept so past weeks\' results do not change; linked only to the deleted-<id> row' },
  messaging_tickets: { export: null, excluded: 'a one-use sign-in ticket for chat that lasts 60 seconds: a credential, never handed out again', deletion: 'deleted' },
  nearby_messages: { export: 'messaging.nearby (its own lines only)', deletion: 'the text of its lines is wiped (one under an open report is kept until it is decided)' },
  conversations: { export: 'messaging.conversations', deletion: 'kept for the other person; the account is shown as deleted-<id>' },
  conversation_members: { export: 'messaging.conversations', deletion: 'it leaves every conversation' },
  messages: { export: 'messaging.conversations[].messages (its own in full; the other person\'s as its Inbox shows them)', deletion: 'the text of its messages is wiped (one under an open report is kept until it is decided)' },
  account_blocks: { export: 'messaging.blocks (the people it blocked)', deletion: 'deleted, both ways' },
  messaging_outbox: { export: null, excluded: '"your inbox changed" nudges for the presence server: a conversation id, no content; delivered or dropped within a day', deletion: 'deleted' },
  businesses: { export: 'businesses', deletion: 'each business page is deleted as by its owner (DELETE /businesses/:slug)' },
  business_events: { export: 'businesses[].figures (in total, as the dashboard shows them) and activity.profileVisits (its own visits)', deletion: 'its own visits are kept with a random visitor; a deleted page\'s events are deleted after its totals are kept' },
  business_inquiries: { export: 'businesses[].requests (what the owner already sees) and requestsSent (its own)', deletion: 'requests to its pages are deleted; in requests it sent, the name, email, phone and message are wiped' },
  upgrade_interest: { export: 'businesses[].upgradeInterest', deletion: 'deleted with the page' },
  audit_log: { export: 'actionLog (entries it made, and entries about the account)', deletion: 'kept: it cannot be changed or deleted (security and accountability; the privacy policy says so). Entries name the account by number, and some by the name it had then' },
  social_posts: { export: 'welcomePosts', deletion: 'a post not yet made is cancelled and its text wiped; one already on X stays there (ask us to remove it)' },
  orders: { export: 'orders (amounts, dates, products; never card details: Stripe holds those)', deletion: 'kept for accounting and tax; checkouts still open are closed; the unused time of what is still running is refunded first, pro rata, and recorded on the order' },
  carts: { export: 'cart', deletion: 'deleted' },
  cart_items: { export: 'cart.items', deletion: 'deleted' },
  promo_codes: { export: 'promoCodesMade (only a code an account made: none today)', deletion: 'kept (a code is not about a person)' },
  promo_redemptions: { export: 'promoUses', deletion: 'kept for accounting; a use held by an open checkout is released' },
  stripe_events: { export: null, excluded: 'the ids of Stripe events already applied: nothing about a person', deletion: 'nothing' },
  disputes: { export: 'disputes (of its own orders: amount, reason, status, dates)', deletion: 'kept for accounting and the payment processor (amounts and Stripe ids; nothing personal)' },
  order_refunds: { export: 'orders[].refunds', deletion: 'kept for accounting and tax, with the orders' },
  entitlements: { export: 'businesses[].plans', deletion: 'ended with the page; Pro is cancelled in Stripe at once (the unused part of the month is refunded first, when the account or the page is deleted)' },
  pilot_members: { export: 'businesses[].pilot', deletion: 'the page leaves the pilot (the staff note is kept)' },
  owner_activity: { export: 'businesses[].activeWeeks', deletion: 'kept (the weeks the page was used: business-level, no person)' },
  pilot_feedback: { export: 'businesses[].pilotFeedback', deletion: 'kept for the pilot\'s results with the written answers wiped' },
  plot_holds: { export: 'plotHolds', deletion: 'released' },
  plot_intents: { export: 'plotSteps', deletion: 'kept for the plot economy report with the account replaced by a random number' },
  street_traffic: { export: null, excluded: 'counts of players per map square and day: numbers only, nobody in them', deletion: 'nothing' },
  traffic_seen: { export: null, excluded: 'scrambled (a one-way hash) ids of who was already counted in a square today, deleted after 2 days; it cannot be read back to an account', deletion: 'its rows are deleted' },
  plot_watches: { export: 'watches', deletion: 'deleted' },
  admin_accounts: { export: null, excluded: 'staff accounts for the admin pages: a separate table, never linked to a player', deletion: 'nothing' },
  admin_sessions: { export: null, excluded: 'staff sign-ins to the admin pages (a hash of the cookie): staff, never a player', deletion: 'nothing' },
  admin_tokens: { export: null, excluded: 'staff password reset and email links (a hash): staff, never a player', deletion: 'nothing' },
};

// What stays after a deletion and why, and what goes: lib/legal/privacy.js, shared with the confirmation screens and the privacy policy.
export const { KEPT, REMOVED, PRIVACY } = await imp('legal/privacy.js');
export const EXPORT_PER_DAY = PRIVACY.exportsPerDay;

// ---- export ------------------------------------------------------------------------------------------------------------------------
const json = (s, d = null) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};
const orderView = (o) => ({ id: o.id, product: o.product, label: o.label ?? null, business: o.slug ?? null, placement: o.placement ?? null, target: o.target ?? null, cents: o.cents, currency: o.currency, status: o.status, refundedCents: o.refunded_cents ?? 0, promoCode: o.promo_code ?? null, promoCents: o.promo_cents ?? 0, renewals: o.renewals ?? 0, parentId: o.parent_id ?? null, createdAt: o.created_at, paidAt: o.paid_at ?? null, refundedAt: o.refunded_at ?? null, note: o.note ?? null });
const leadsOf = (db, kind, id) => {
  const rows = db.prepare('SELECT email, status, confirmed_at FROM leads WHERE target_kind = ? AND target_id = ?').all(kind, String(id));
  return { confirmed: rows.filter((r) => r.status === 'confirmed').map((r) => ({ email: r.email, at: r.confirmed_at })), pending: rows.filter((r) => r.status === 'pending').length, unsubscribed: rows.filter((r) => r.status === 'unsubscribed').length };
};

// Everything about one account (`messaging`: the messaging part from the Python service, when it holds messages). Raw database rows never leave:
// each section is written out, without tokens, password hashes, network hashes or other people's account numbers.
export function exportAccount(db, accountId, { env = process.env, messaging = null, at = now() } = {}) {
  const a = db.prepare('SELECT * FROM accounts WHERE id = ?').get(Number(accountId)) ?? core.fail(404, 'No such account.', 'no_account');
  const id = a.id;
  const me = `a${id}`;
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const plots = all('SELECT * FROM plots WHERE owner_account = ? ORDER BY id', id).map((p) => {
    const interior = db.prepare('SELECT design, revision, updated_at FROM plot_interiors WHERE plot_id = ? AND account_id = ?').get(p.id, id);
    return {
      id: p.id, title: p.title, website: p.website, buildingType: p.building_type, description: p.description, logo: json(p.logo), exterior: json(p.exterior), storefront: json(p.brand), questBudget: p.quest_budget,
      lease: p.lease_end ? { days: p.lease_days, start: p.lease_start, end: p.lease_end } : null,
      interior: interior ? { design: json(interior.design), revision: interior.revision, updatedAt: interior.updated_at } : null,
      newsletterSignups: leadsOf(db, 'plot', p.id),
    };
  });
  const businesses = all("SELECT * FROM businesses WHERE account_id = ? AND status != 'deleted' ORDER BY id", id).map((b) => {
    const plan = planFor(db, b.id, at);
    const inquiries = all('SELECT * FROM business_inquiries WHERE business_id = ? ORDER BY id', b.id);
    const pilot = db.prepare('SELECT joined_at, left_at FROM pilot_members WHERE business_id = ?').get(b.id);
    return {
      ...ownerView(b), status: b.status,
      plan,
      plans: all('SELECT kind, placement, starts_at, ends_at, status FROM entitlements WHERE business_id = ? ORDER BY id', b.id).map((e) => ({ kind: e.kind, placement: e.placement, from: e.starts_at, until: e.ends_at, status: e.status })),
      figures: figuresFor(profileStats(db, b.id, at), plan), // as the dashboard shows them (the free plan the totals)
      requests: inquiries.map((q) => ({ id: q.id, kind: q.kind, name: q.name, email: q.email, phone: q.phone, message: q.message, preferred: q.preferred, status: q.status, verified: Boolean(q.verified), source: q.source, at: q.created_at })),
      newsletterSignups: leadsOf(db, 'business', b.id),
      upgradeInterest: all('SELECT plan, at FROM upgrade_interest WHERE business_id = ?', b.id),
      conversionKeySet: Boolean(b.conv_key_hash),
      pilot: pilot ? { joinedAt: pilot.joined_at, leftAt: pilot.left_at } : null,
      pilotFeedback: all('SELECT week, rating, result, missing, would_pay, created_at FROM pilot_feedback WHERE business_id = ? ORDER BY week', b.id).map((f) => ({ week: f.week, rating: f.rating, result: f.result, missing: f.missing, wouldPay: f.would_pay, at: f.created_at })),
      activeWeeks: all('SELECT week FROM owner_activity WHERE business_id = ? ORDER BY week', b.id).map((w) => w.week),
    };
  });
  const out = {
    format: 'voxelventure.account-export',
    version: 1,
    generatedAt: at,
    account: { id, username: a.username, createdAt: a.created_at, email: a.email ?? null, emailVerified: Boolean(a.email_verified), notices: Boolean(a.notify), messageRequests: Boolean(a.dm_requests), credits: a.gold, referredBySomeone: a.referred_by != null, referralCode: referralCode(id, referralSecret(env)), suspended: Boolean(a.banned), suspendedReason: a.ban_reason ?? null, deletedAt: a.deleted_at ?? null },
    sessions: all('SELECT expires_at FROM sessions WHERE account_id = ? ORDER BY expires_at', id).map((s) => ({ startedAt: s.expires_at - 30 * DAY, expiresAt: s.expires_at, active: s.expires_at > at })),
    businesses,
    plots,
    plotHistory: all('SELECT plot_id, kind, owner_name, title, price, at FROM ledger WHERE account_id = ? ORDER BY id', id).map((l) => ({ plotId: l.plot_id, kind: l.kind, name: l.owner_name, title: l.title, price: l.price, at: l.at })),
    plotHolds: all('SELECT plot_id, started_at, hold_until FROM plot_holds WHERE account_id = ?', id).map((h) => ({ plotId: h.plot_id, startedAt: h.started_at, until: h.hold_until })),
    plotSteps: all('SELECT plot_id, kind, step, price_cents, term_days, at FROM plot_intents WHERE account_id = ? ORDER BY id', id).map((s) => ({ plotId: s.plot_id, kind: s.kind, step: s.step, priceCents: s.price_cents, termDays: s.term_days, at: s.at })),
    watches: all('SELECT plot_id, created_at FROM plot_watches WHERE account_id = ?', id).map((w) => ({ plotId: w.plot_id, since: w.created_at })),
    adSpaces: all('SELECT id, label, ad, value FROM ad_slots WHERE owner_account = ?', id).map((s) => ({ id: s.id, label: s.label, ad: json(s.ad), value: s.value, newsletterSignups: leadsOf(db, 'ad', s.id) })),
    adHistory: all('SELECT slot_id, advertiser, headline, price, at FROM ad_ledger WHERE account_id = ? ORDER BY id', id).map((l) => ({ slotId: l.slot_id, advertiser: l.advertiser, headline: l.headline, price: l.price, at: l.at })),
    adBookings: all('SELECT slot_id, order_id, ad, starts_at, ends_at, status FROM ad_terms WHERE account_id = ? ORDER BY id', id).map((t) => ({ slotId: t.slot_id, orderId: t.order_id, ad: json(t.ad), from: t.starts_at, until: t.ends_at, status: t.status })),
    orders: all('SELECT o.*, b.slug FROM orders o LEFT JOIN businesses b ON b.id = o.business_id WHERE o.account_id = ? ORDER BY o.id', id).map((o) => ({ ...orderView(o), refunds: all('SELECT cents, full, source, note, at FROM order_refunds WHERE order_id = ? ORDER BY id', o.id).map((r) => ({ cents: r.cents, full: Boolean(r.full), source: r.source, note: r.note, at: r.at })) })),
    disputes: all('SELECT d.order_id, d.cents, d.reason, d.status, d.created_at, d.closed_at FROM disputes d JOIN orders o ON o.id = d.order_id WHERE o.account_id = ? ORDER BY d.id', id).map((d) => ({ orderId: d.order_id, cents: d.cents, reason: d.reason, status: d.status, at: d.created_at, closedAt: d.closed_at })),
    promoUses: all('SELECT code, order_id, cents_off, status, created_at FROM promo_redemptions WHERE account_id = ? ORDER BY id', id).map((p) => ({ code: p.code, orderId: p.order_id, centsOff: p.cents_off, status: p.status, at: p.created_at })),
    promoCodesMade: all('SELECT code, kind, value, created_at FROM promo_codes WHERE created_by = ?', `account:${id}`),
    cart: (() => {
      const c = db.prepare('SELECT * FROM carts WHERE account_id = ?').get(id);
      return c ? { promoCode: c.promo_code ?? null, createdAt: c.created_at, items: all('SELECT kind, target, label, cents, created_at FROM cart_items WHERE account_id = ? ORDER BY id', id).map((i) => ({ kind: i.kind, target: i.target, label: i.label, cents: i.cents, addedAt: i.created_at })) } : null;
    })(),
    marketStalls: all('SELECT * FROM market_bookings WHERE account_id = ? ORDER BY id', id).map((b) => ({ id: b.id, site: b.site_code, week: b.week_start, stall: b.stall_id, brand: b.brand, product: b.product, goods: json(b.goods, []), offer: b.offer, website: b.website, from: b.start_at, until: b.end_at, cents: b.cents, status: b.status, bookedAt: b.created_at })),
    couponClaims: all('SELECT plot_id, code, ticket, at, redeemed_at FROM coupon_claims WHERE visitor = ? ORDER BY at', me).map((c) => ({ plotId: c.plot_id, code: c.code, ticket: c.ticket, at: c.at, redeemedAt: c.redeemed_at ?? null })),
    credits: { balance: a.gold, ledger: all('SELECT delta, reason, ref, at FROM gold_ledger WHERE account_id = ? ORDER BY id', id) },
    quests: { started: all('SELECT plot_id, started_at FROM quest_sessions WHERE account_id = ?', id).map((q) => ({ plotId: q.plot_id, at: q.started_at })), earned: all('SELECT plot_id, gold, at FROM quest_claims WHERE account_id = ?', id).map((q) => ({ plotId: q.plot_id, credits: q.gold, at: q.at })) },
    feedbackPosted: all('SELECT plot_id, author, message, hidden, at FROM feedback WHERE account_id = ? ORDER BY id', id).map((f) => ({ plotId: f.plot_id, name: f.author, message: f.message, hidden: f.hidden > 0, at: f.at })),
    newsletters: { mine: a.email ? all('SELECT target_kind, target_id, status, created_at, confirmed_at FROM leads WHERE email = ? ORDER BY id', a.email).map((l) => ({ kind: l.target_kind, target: l.target_id, status: l.status, at: l.created_at, confirmedAt: l.confirmed_at })) : [] },
    requestsSent: all('SELECT b.name AS business, q.kind, q.name, q.email, q.phone, q.message, q.preferred, q.created_at FROM business_inquiries q JOIN businesses b ON b.id = q.business_id WHERE q.visitor = ? ORDER BY q.id', me).map((q) => ({ business: q.business, kind: q.kind, name: q.name, email: q.email, phone: q.phone, message: q.message, preferred: q.preferred, at: q.created_at })),
    reportsMade: all('SELECT kind, target_id, reason, note, status, action, created_at, resolved_at FROM reports WHERE reporter = ? ORDER BY id', id).map((r) => ({ kind: r.kind, target: r.target_id, reason: r.reason, note: r.note, status: r.status, decision: r.action, at: r.created_at, decidedAt: r.resolved_at })),
    buildingOfTheWeek: { votes: all('SELECT week, plot_id, at FROM votes WHERE account_id = ? ORDER BY at', id).map((v) => ({ week: v.week, plotId: v.plot_id, at: v.at })), huntWins: all('SELECT day, at FROM hunt_wins WHERE account_id = ? ORDER BY day', id) },
    welcomePosts: all('SELECT kind, target_kind, target_id, text, status, created_at, posted_at FROM social_posts WHERE account_id = ? ORDER BY id', id).map((s) => ({ kind: s.kind, target: `${s.target_kind}:${s.target_id}`, text: s.text, status: s.status, at: s.created_at, postedAt: s.posted_at })),
    messaging: messaging ?? messagingExport(db, id),
    activity: {
      online: all('SELECT country, first_at, last_at FROM presence WHERE visitor = ?', me).map((p) => ({ country: p.country, firstAt: p.first_at, lastAt: p.last_at })),
      arrivals: all('SELECT country, at FROM arrivals WHERE visitor = ? ORDER BY id', me),
      visits: all('SELECT plot_id, kind, source, seconds, at FROM events WHERE visitor = ? ORDER BY id', me).map((e) => ({ plotId: e.plot_id, kind: e.kind, source: e.source, seconds: e.seconds, at: e.at })),
      adViews: all('SELECT slot_id, kind, at FROM ad_events WHERE visitor = ? ORDER BY id', me).map((e) => ({ slotId: e.slot_id, kind: e.kind, at: e.at })),
      profileVisits: all('SELECT b.slug, e.kind, e.source, e.at FROM business_events e JOIN businesses b ON b.id = e.business_id WHERE e.visitor = ? ORDER BY e.id', me).map((e) => ({ business: e.slug, kind: e.kind, source: e.source, at: e.at })),
      stallVisits: all('SELECT booking_id, at FROM market_visits WHERE visitor = ? ORDER BY at', me).map((v) => ({ bookingId: v.booking_id, at: v.at })),
      referralsBrought: { accounts: db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE referred_by = ?').get(id).n, businesses: db.prepare('SELECT COUNT(*) AS n FROM businesses WHERE referred_by = ?').get(id).n, visits: db.prepare('SELECT COUNT(*) AS n FROM business_events WHERE ref_account = ?').get(id).n },
    },
    emails: a.email ? all('SELECT kind, subject, status, created_at, sent_at FROM outbox WHERE to_email = ? ORDER BY id', a.email).map((e) => ({ kind: e.kind, subject: e.subject, status: e.status, at: e.created_at, sentAt: e.sent_at })) : [],
    actionLog: all("SELECT at, actor_kind, action, target_kind, target_id, detail FROM audit_log WHERE (actor_kind = 'account' AND actor_id = ?) OR (target_kind = 'account' AND target_id = ?) ORDER BY id", id, String(id)).map((l) => ({ at: l.at, by: l.actor_kind === 'account' ? 'you' : l.actor_kind, action: l.action, target: `${l.target_kind}${l.target_id ? `:${l.target_id}` : ''}`, detail: json(l.detail) })),
    notIncluded: Object.entries(TABLES).filter(([, t]) => !t.export).map(([table, t]) => ({ table, why: t.excluded })),
    cardDetails: 'Never held here: Stripe takes the card and keeps it. Ask Stripe (stripe.com/privacy) for what it holds.',
  };
  out.summary = summaryOf(out);
  return out;
}

const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '-');
const usd = (c) => `$${(c / 100).toFixed(2)}`;
// The export in plain words, line by line (the account page offers it as a .txt beside the JSON).
export function summaryOf(x) {
  const n = (list, one, many = `${one}s`) => `${list.length} ${list.length === 1 ? one : many}`;
  const paid = x.orders.filter((o) => o.status === 'paid' && o.product !== 'cart');
  const msgs = x.messaging.conversations.reduce((s, c) => s + c.messages.filter((m) => m.mine).length, 0);
  return [
    `VoxelVenture: your data, as of ${new Date(x.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    '',
    `Account: ${x.account.username} (number ${x.account.id}), created ${day(x.account.createdAt)}.`,
    `Email: ${x.account.email ? `${x.account.email} (${x.account.emailVerified ? 'confirmed' : 'not confirmed'})` : 'none'}. Notices: ${x.account.notices ? 'on' : 'off'}. Message requests: ${x.account.messageRequests ? 'allowed' : 'off'}.`,
    `Signed in on ${n(x.sessions.filter((s) => s.active), 'device')} now.`,
    `Business pages: ${x.businesses.length ? x.businesses.map((b) => `${b.name} (/business/${b.slug})`).join(', ') : 'none'}.`,
    ...x.businesses.map((b) => `  ${b.name}: ${n(b.requests, 'meeting or quote request')}, ${n(b.newsletterSignups.confirmed, 'confirmed newsletter sign-up')}.`),
    `Plots held: ${x.plots.length ? x.plots.map((p) => `#${p.id} ${p.title}${p.lease ? ` (lease to ${day(p.lease.end)})` : ''}`).join(', ') : 'none'}. Plot history: ${n(x.plotHistory, 'entry', 'entries')}.`,
    `Ad spaces: ${x.adSpaces.length}. Watched plots: ${x.watches.length}.`,
    `Orders: ${n(x.orders, 'order')}, ${paid.length} paid for ${usd(paid.reduce((s, o) => s + o.cents, 0))} in all. Promo codes used: ${x.promoUses.length}. Card details: never held by us (Stripe holds them).`,
    `Cart: ${x.cart?.items.length ? n(x.cart.items, 'item') : 'empty'}. Market stalls: ${x.marketStalls.length}.`,
    `Credits: ${x.credits.balance}, ${n(x.credits.ledger, 'movement')}. Quests earned: ${x.quests.earned.length}. Coupons claimed: ${x.couponClaims.length}.`,
    `Feedback posted: ${x.feedbackPosted.length}. Requests you sent to businesses: ${x.requestsSent.length}. Newsletters you signed up to: ${x.newsletters.mine.length}. Reports you made: ${x.reportsMade.length}.`,
    `Messages: ${n(x.messaging.conversations, 'conversation')}, ${msgs} written by you; ${n(x.messaging.nearby, 'nearby chat line')} (text kept 7 days). People you blocked: ${x.messaging.blocks.length}.`,
    `Votes: ${x.buildingOfTheWeek.votes.length}. Visits to buildings: ${x.activity.visits.length}. Emails we sent you: ${x.emails.length}. Action log entries: ${x.actionLog.length}.`,
    '',
    'Not included, and why:',
    ...x.notIncluded.map((t) => `  ${t.table}: ${t.why}`),
    '',
    'Everything is in the .json file beside this one. To delete your account, open your account in the game (or My profiles) and choose Delete my account.',
  ];
}

// ---- deleting a business page ------------------------------------------------------------------------------------------------------
// The owner's (or the account deletion's) part: Pro is cancelled in Stripe first (now, not at the end of the month; its unused time was
// refunded just before, prorata.mjs); then, in one transaction, the page's totals are kept on its row and everything else about it goes (below). The row stays,
// renamed deleted-<id> and with no content, because orders refer to it.
async function cancelProNow(db, businessIds, env, fetchImpl) {
  if (!businessIds.length) return [];
  const rows = db.prepare(`SELECT o.id, o.stripe_subscription FROM orders o JOIN entitlements e ON e.order_id = o.id WHERE o.business_id IN (${businessIds.map(() => '?').join(',')}) AND o.product = 'pro' AND o.status = 'paid' AND e.status = 'active' AND e.ends_at > ? AND o.stripe_subscription IS NOT NULL`).all(...businessIds, now());
  const done = [];
  for (const r of rows) {
    if (env.STRIPE_SECRET_KEY) await stripe(env, 'DELETE', `/subscriptions/${encodeURIComponent(r.stripe_subscription)}`, null, { fetchImpl });
    done.push(r.id);
  }
  return done;
}

function eraseBusiness(db, b, at = now()) {
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;
  const totals = {
    views: count("SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = 'view' AND verified = 1", b.id),
    ctaClicks: count("SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = 'cta' AND verified = 1", b.id),
    impressions: count("SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = 'impression' AND verified = 1", b.id),
    purchases: count("SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = 'purchase' AND verified = 1", b.id),
    requests: count('SELECT COUNT(*) AS n FROM business_inquiries WHERE business_id = ? AND verified = 1', b.id),
    newsletterSignups: count("SELECT COUNT(*) AS n FROM leads WHERE target_kind = 'business' AND target_id = ? AND status = 'confirmed'", String(b.id)),
    since: b.created_at,
    until: at,
  };
  db.prepare('DELETE FROM business_events WHERE business_id = ?').run(b.id);
  // the emails that told the owner about its requests carry the requesters' details: they go with the requests
  const owner = db.prepare('SELECT email FROM accounts WHERE id = ?').get(b.account_id)?.email;
  if (owner) db.prepare("DELETE FROM outbox WHERE kind = 'inquiry' AND to_email = ? AND instr(body, ?) > 0").run(owner, ` sent ${b.name} a `);
  db.prepare('DELETE FROM business_inquiries WHERE business_id = ?').run(b.id);
  db.prepare("DELETE FROM leads WHERE target_kind = 'business' AND target_id = ?").run(String(b.id));
  db.prepare('DELETE FROM upgrade_interest WHERE business_id = ?').run(b.id);
  db.prepare('DELETE FROM cart_items WHERE business_id = ?').run(b.id);
  db.prepare("UPDATE entitlements SET status = 'revoked', ends_at = MIN(ends_at, ?) WHERE business_id = ? AND status = 'active'").run(at, b.id);
  db.prepare('UPDATE pilot_members SET left_at = COALESCE(left_at, ?) WHERE business_id = ?').run(at, b.id);
  db.prepare('UPDATE pilot_feedback SET result = NULL, missing = NULL WHERE business_id = ?').run(b.id);
  db.prepare("UPDATE social_posts SET status = 'rejected', text = '', decided_at = ? WHERE target_kind = 'business' AND target_id = ? AND status IN ('review', 'queued', 'failed')").run(at, String(b.id));
  db.prepare("UPDATE businesses SET status = 'deleted', slug = ?, name = ?, tagline = NULL, description = NULL, website = NULL, cta = ?, plot_id = NULL, x_handle = NULL, announce = 0, offer = NULL, offer_until = NULL, conv_key_hash = NULL, conv_key_at = NULL, referred_by = NULL, deleted_at = ?, final_stats = ?, updated_at = ? WHERE id = ?")
    .run(`deleted-${b.id}`, 'Deleted business', JSON.stringify({ kind: 'website', url: null }), at, JSON.stringify(totals), at, b.id);
  return totals;
}

// Deleting a page refunds the unused time of its own orders first (Pro's month, sponsored weeks; prorata.forBusiness), as an account's deletion does,
// except for a page moderation removed for breaking the rules (status 'removed') or one an admin closes so (`closedForRules`). Its plot is only
// unlinked (the building stays the owner's), so no lease is refunded.
export const pageClosedForRules = (b) => b.status === 'removed';
export const ownBusinessPage = (db, account, slug) => {
  core.requireAccount(account);
  const b = db.prepare("SELECT * FROM businesses WHERE slug = ? AND status IN ('published', 'removed')").get(String(slug)) ?? core.fail(404, 'No such business.', 'no_business');
  if (b.account_id !== account.id) core.fail(403, 'This is not your business.', 'forbidden');
  return b;
};
export async function deleteBusiness(db, account, slug, { env = process.env, fetchImpl = fetch, actor, closedForRules = false } = {}) {
  const b = ownBusinessPage(db, account, slug);
  const rules = closedForRules || pageClosedForRules(b);
  const who = actor ?? { kind: 'account', id: account.id };
  // outside calls first: the refunds (each recorded as Stripe makes it, never made twice), then Pro's cancellation; a failure deletes nothing
  const refunds = await prorata.issue(db, prorata.forBusiness(db, b.id, { closedForRules: rules }), { env, fetchImpl, actor: who, why: 'business page deleted', end: false });
  const cancelled = await cancelProNow(db, [b.id], env, fetchImpl);
  return transaction(db, () => {
    const totals = eraseBusiness(db, b);
    audit(db, who, 'business.delete', { kind: 'business', id: b.slug }, { business: b.id, proCancelled: cancelled.length, refundedCents: refunds.totalCents, refundedLines: refunds.refunded.map((r) => r.orderId), ...(rules ? { closedForRules: true } : {}), totals });
    return { deleted: true, slug: b.slug, proCancelled: cancelled.length > 0, plotUnlinked: b.plot_id ?? null, refunds: { totalCents: refunds.totalCents, lines: refunds.refunded.map((r) => ({ orderId: r.orderId, cents: r.cents, unusedDays: r.unusedDays })), closedForRules: rules } };
  });
}

// ---- deleting an account -----------------------------------------------------------------------------------------------------------
// Outside calls first (Stripe, the messaging service when it holds messages): if one fails, nothing here has changed and the person can try
// again. Then one transaction does the rest, table by table (TABLES says what and why). Returns { deleted, username, plots, kept, removed }.
export async function deleteAccount(db, accountId, { seed, env = process.env, fetchImpl = fetch, actor, reason = null, closedForRules = false, eraseRemote = null } = {}) {
  const a = db.prepare('SELECT * FROM accounts WHERE id = ?').get(Number(accountId)) ?? core.fail(404, 'No such account.', 'no_account');
  if (a.deleted_at) core.fail(409, 'This account is already deleted.', 'already_deleted');
  const id = a.id;
  const tomb = TOMBSTONE(id);
  const bizIds = db.prepare("SELECT id FROM businesses WHERE account_id = ? AND status != 'deleted'").all(id).map((b) => b.id);
  // unused time is refunded first (prorata.mjs; none for an account closed for breaking the rules): each refund is recorded as Stripe makes it, and
  // the deletion below ends what it paid for (so nothing is refunded twice, and a Pro refunded here is only cancelled, below)
  const refunds = await prorata.issue(db, prorata.forAccount(db, id, { closedForRules }), { env, fetchImpl, actor: actor ?? { kind: 'account', id }, why: 'account deleted', end: false });
  const cancelled = await cancelProNow(db, bizIds, env, fetchImpl);
  const openSessions = db.prepare("SELECT stripe_session FROM orders WHERE account_id = ? AND status = 'pending' AND stripe_session IS NOT NULL").all(id).map((o) => o.stripe_session);
  if (eraseRemote) await eraseRemote(id, tomb);
  const at = now();
  const out = transaction(db, () => {
    const run = (sql, ...args) => Number(db.prepare(sql).run(...args).changes);
    const pseudonym = `z${crypto.randomBytes(8).toString('hex')}`; // the visitor id in kept figures: random, leads to nobody
    const me = `a${id}`;
    // businesses, plots, ad spaces
    for (const bid of bizIds) eraseBusiness(db, db.prepare('SELECT * FROM businesses WHERE id = ?').get(bid), at);
    const plots = db.prepare('SELECT id FROM plots WHERE owner_account = ?').all(id).map((p) => p.id);
    for (const pid of plots) core.releasePlot(db, pid, seed);
    if (a.email) run('DELETE FROM leads WHERE email = ?', a.email);
    for (const pid of plots) run("DELETE FROM leads WHERE target_kind = 'plot' AND target_id = ?", String(pid));
    for (const s of db.prepare('SELECT id FROM ad_slots WHERE owner_account = ?').all(id)) run("DELETE FROM leads WHERE target_kind = 'ad' AND target_id = ?", s.id);
    // its paid bookings end (one to come too) and their ad text goes; the dates and the order stay for accounting
    const bookedSlots = db.prepare("SELECT DISTINCT slot_id FROM ad_terms WHERE account_id = ? AND status IN ('active', 'paused')").all(id).map((t) => t.slot_id);
    run("UPDATE ad_terms SET status = 'removed' WHERE account_id = ? AND status IN ('active', 'paused')", id);
    run("UPDATE ad_terms SET ad = '{}' WHERE account_id = ?", id);
    run('UPDATE ad_slots SET ad = NULL, owner_account = NULL, paid_until = NULL, updated_at = ? WHERE owner_account = ?', at, id);
    for (const sid of bookedSlots) core.syncSlot(db, sid, at);
    run("UPDATE ad_ledger SET advertiser = '(removed)', headline = '(removed)' WHERE account_id = ?", id);
    run('DELETE FROM plot_interiors WHERE account_id = ?', id);
    run('UPDATE ledger SET owner_name = ? WHERE account_id = ?', tomb, id);
    run('UPDATE ledger SET paid_to = ? WHERE paid_to = ?', tomb, a.username);
    // money: open checkouts close (their holds and promo uses are released); paid orders stay
    for (const o of db.prepare("SELECT * FROM orders WHERE account_id = ? AND status = 'pending' AND parent_id IS NULL").all(id)) expire(db, orderById(db, o.id), 'expired');
    for (const oid of cancelled) run("UPDATE orders SET note = COALESCE(note || '; ', '') || 'Pro cancelled: the account was deleted' WHERE id = ?", oid);
    run('DELETE FROM cart_items WHERE account_id = ?', id);
    run('DELETE FROM carts WHERE account_id = ?', id);
    // the plot economy
    for (const h of db.prepare('SELECT * FROM plot_holds WHERE account_id = ?').all(id)) endHold(db, h, at);
    run('UPDATE plot_intents SET account_id = NULL, visitor = ? WHERE account_id = ?', pseudonym, id);
    run('DELETE FROM plot_watches WHERE account_id = ?', id);
    run('DELETE FROM traffic_seen WHERE who = ?', hashOf(env.IP_SALT, me));
    // the market: later stalls are cancelled, past ones lose what named the seller
    run("UPDATE market_bookings SET status = 'cancelled', hold_until = NULL WHERE account_id = ? AND status IN ('booked', 'pending') AND end_at > ?", id, at);
    run('UPDATE market_bookings SET account_name = ?, brand = NULL, product = NULL, goods = NULL, offer = NULL, website = NULL WHERE account_id = ?', tomb, id);
    // what it did as a visitor: kept for the figures under a random number
    // (requests it sent to businesses: its name, email, phone and message are wiped first, as after INQUIRY_DAYS, with the email that told the business)
    const typed = db.prepare('SELECT DISTINCT email FROM business_inquiries WHERE visitor = ? AND email != ?').all(me, '').map((q) => q.email);
    for (const e of new Set([...typed, ...(a.email ? [a.email] : [])])) run("DELETE FROM outbox WHERE kind = 'inquiry' AND instr(lower(body), lower(?)) > 0", `<${e}>`);
    run("UPDATE business_inquiries SET name = '', email = '', phone = NULL, message = NULL, preferred = NULL, ip_hash = NULL WHERE visitor = ? OR (? IS NOT NULL AND email = ? COLLATE NOCASE)", me, a.email ?? null, a.email ?? null);
    for (const t of ['events', 'ad_events', 'coupon_claims', 'market_visits', 'business_events', 'business_inquiries', 'arrivals']) run(`UPDATE ${t} SET visitor = ? WHERE visitor = ?`, pseudonym, me);
    run('UPDATE business_events SET ref_account = NULL WHERE ref_account = ?', id);
    run('DELETE FROM presence WHERE visitor = ? OR account_id = ?', me, id);
    // its words
    run("UPDATE feedback SET author = ?, message = '', hidden = 2 WHERE account_id = ?", tomb, id);
    run('UPDATE reports SET note = NULL WHERE reporter = ?', id);
    for (const r of db.prepare('SELECT id, evidence FROM reports WHERE evidence IS NOT NULL').all()) {
      const e = json(r.evidence);
      if (e?.sender === id) run('UPDATE reports SET evidence = ? WHERE id = ?', JSON.stringify({ ...e, senderName: tomb }), r.id);
    }
    run("UPDATE social_posts SET status = 'rejected', text = '', decided_at = ? WHERE account_id = ? AND status IN ('review', 'queued', 'failed')", at, id);
    const chat = messagingErase(db, id);
    // the game
    run('DELETE FROM quest_sessions WHERE account_id = ?', id);
    run('DELETE FROM hunt_wins WHERE account_id = ?', id);
    // email: nothing more goes to the address, and what went is deleted
    if (a.email) run('DELETE FROM outbox WHERE to_email = ?', a.email);
    // others who came through its referral link are no longer credited to it
    run('UPDATE accounts SET referred_by = NULL WHERE referred_by = ?', id);
    run('UPDATE businesses SET referred_by = NULL WHERE referred_by = ?', id);
    // sign-ins end everywhere; the account row stays, with nothing personal in it
    run('DELETE FROM sessions WHERE account_id = ?', id);
    const name = db.prepare('SELECT 1 FROM accounts WHERE username = ? AND id != ?').get(tomb, id) ? `${tomb}-${crypto.randomBytes(2).toString('hex')}` : tomb;
    run("UPDATE accounts SET username = ?, pass_salt = ?, pass_hash = ?, email = NULL, email_verified = 0, email_token = NULL, notify = 0, dm_requests = 0, gold = 0, referred_by = NULL, banned = 1, ban_reason = 'deleted', deleted_at = ? WHERE id = ?", name, crypto.randomBytes(16).toString('hex'), crypto.randomBytes(32).toString('hex'), at, id);
    audit(db, actor ?? { kind: 'account', id }, 'account.delete', { kind: 'account', id }, { by: actor?.kind === 'admin' ? 'admin' : 'self', reason: reason ? String(reason).slice(0, 200) : null, ...(closedForRules ? { closedForRules: true } : {}), businesses: bizIds.length, plotsReleased: plots.length, proCancelled: cancelled.length, refundedCents: refunds.totalCents, refundedLines: refunds.refunded.map((r) => r.orderId), chat });
    return { deleted: true, username: name, plotsReleased: plots, businessesDeleted: bizIds.length, proCancelled: cancelled.length, refunds: { totalCents: refunds.totalCents, lines: refunds.refunded.map((r) => ({ orderId: r.orderId, cents: r.cents, unusedDays: r.unusedDays })), closedForRules } };
  });
  closeSessions(env, openSessions, fetchImpl); // the Stripe pages of checkouts that were open (fire and forget: their orders are already closed)
  return { ...out, kept: KEPT, removed: REMOVED };
}

// For the admin's Privacy requests page: find an account by its number, its name or its email (exact, whatever the case).
export function findAccounts(db, q) {
  const s = String(q ?? '').trim().slice(0, 120);
  if (!s) return { accounts: [] };
  const rows = /^\d+$/.test(s) ? db.prepare('SELECT * FROM accounts WHERE id = ?').all(Number(s)) : db.prepare('SELECT * FROM accounts WHERE username = ? COLLATE NOCASE OR LOWER(email) = LOWER(?) ORDER BY id LIMIT 20').all(s, s);
  return {
    accounts: rows.map((a) => ({
      id: a.id,
      username: a.username,
      email: a.email ?? null,
      emailVerified: Boolean(a.email_verified),
      createdAt: a.created_at,
      deletedAt: a.deleted_at ?? null,
      businesses: db.prepare("SELECT COUNT(*) AS n FROM businesses WHERE account_id = ? AND status != 'deleted'").get(a.id).n,
      plots: db.prepare('SELECT COUNT(*) AS n FROM plots WHERE owner_account = ?').get(a.id).n,
      paidOrders: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE account_id = ? AND status = 'paid'").get(a.id).n,
    })),
  };
}
