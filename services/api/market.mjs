import { transaction } from './db.mjs';
import { ApiError, fail, text, requireAccount } from './core.mjs';
import { enqueue, noticeAddress } from './engage.mjs';
import { imp } from '../../scripts/lib-loader.mjs';
import { countKept } from './retention.mjs';

// The pop-up market: weekly layouts set by an admin, and stalls rented by players for 24 to 72 hours at one flat price per spot.
// The plan (where the stalls are, how busy each is, what it costs) comes from the game's own lib/market, so the server and the game agree.
const { generateCity } = await imp('city/cityGenerator.js');
const { planMarket, cleanParams, priceOf, TIERS, PRICE_RANGE_CENTS } = await imp('market/layout.js');
const { weekStartOf, isWeekStart, weekWindow, autoParams, bookingProblem, bookingEnd, upcomingWeeks } = await imp('market/weeks.js');

const MAX_ACTIVE_PER_WEEK = 4; // stalls one account may hold in one week
const OPEN_NOTICE_MS = 60 * 60 * 1000; // the stallholder is told an hour before their stall opens
const sitesBySeed = new Map();

// The market sites of the city: [{ code, number, rect, frontRoad, frontSide, road }].
export function marketSites(seed) {
  if (!sitesBySeed.has(seed)) {
    const { layout } = generateCity(seed);
    sitesBySeed.set(
      seed,
      layout.reserved.map((r) => ({ ...r, road: layout.roads.find((x) => x.id === r.frontRoad) ?? null })).filter((r) => r.market)
    );
  }
  return sitesBySeed.get(seed);
}
const siteOf = (seed, code) => marketSites(seed).find((s) => s.code === code) ?? fail(404, 'There is no market with that ID.', 'not_found');
const weekOrFail = (week) => (isWeekStart(week) ? week : fail(400, 'That is not a week (use the Monday, like 2026-03-02).', 'bad_week'));

const parse = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};
const cleanRates = (rates) => {
  if (!rates || typeof rates !== 'object') return null;
  const out = {};
  for (const t of TIERS) {
    const c = Number(rates[t.id]);
    if (Number.isFinite(c) && c > 0) out[t.id] = Math.round(Math.min(PRICE_RANGE_CENTS[1], Math.max(PRICE_RANGE_CENTS[0], c)));
  }
  return Object.keys(out).length ? out : null;
};

// The layout of one market for one week: the admin's if they set one, else an automatic one. A draft is not open for booking.
export function layoutOf(db, seed, code, week) {
  const site = siteOf(seed, code);
  const row = db.prepare('SELECT * FROM market_layouts WHERE site_code = ? AND week_start = ?').get(code, week);
  const params = cleanParams(row ? parse(row.params, {}) : autoParams(code, week));
  const rates = row ? cleanRates(parse(row.rates, null)) : null;
  const plan = planMarket(site, params, site.road);
  const stalls = plan.stalls.map((s) => ({ ...s, cents: priceOf(s, rates) }));
  return {
    site,
    week,
    source: row ? 'admin' : 'auto',
    published: row ? Boolean(row.published) : true,
    note: row?.note ?? null,
    params: plan.params,
    rates,
    plan: { ...plan, stalls, stats: { ...plan.stats, perDayCents: stalls.reduce((n, s) => n + s.cents, 0) } },
  };
}

// What a stallholder puts in their shop: up to eight things with prices, a one-line offer and a website. Shown to visitors while the stall is open.
export function cleanShop(input = {}) {
  const goods = (Array.isArray(input.goods) ? input.goods : [])
    .slice(0, 8)
    .map((g) => ({ name: text(g?.name, 40), cents: Math.max(0, Math.min(100000, Math.round(Number(g?.cents) || 0))) }))
    .filter((g) => g.name);
  const site = text(input.website, 200);
  if (site && !/^https?:\/\/[^\s]+$/i.test(site)) fail(400, 'The website must start with http:// or https://.', 'invalid');
  return { goods, offer: text(input.offer, 120) || null, website: site || null };
}
const statusOf = (b, now = Date.now()) => (b.status === 'cancelled' ? 'cancelled' : now < b.start_at ? 'upcoming' : now < b.end_at ? 'live' : 'ended');
const visitsOf = (db, id) => db.prepare('SELECT COUNT(*) AS n FROM market_visits WHERE booking_id = ?').get(id).n + countKept(db, 'market_visits', { target: id }); // with the totals kept after 13 months (retention.mjs)
const bookingView = (b) => ({ id: b.id, stallId: b.stall_id, start: b.start_at, end: b.end_at, hours: b.hours, brand: b.brand, product: b.product, by: b.account_name, cents: b.cents, goods: parse(b.goods, []), offer: b.offer ?? null, website: b.website ?? null, state: statusOf(b) });
const activeBookings = (db, code, week) => db.prepare("SELECT * FROM market_bookings WHERE site_code = ? AND week_start = ? AND status = 'booked' ORDER BY start_at").all(code, week);

// What everyone sees: the plan, the prices and who has what, when.
export function marketWeek(db, seed, code, week = weekStartOf()) {
  weekOrFail(week);
  const lay = layoutOf(db, seed, code, week);
  const s = lay.site;
  return {
    site: { id: s.id, code: s.code, number: s.number, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, frontRoad: s.frontRoad, frontSide: s.frontSide },
    week,
    window: weekWindow(week),
    source: lay.source,
    open: lay.published,
    note: lay.note,
    params: lay.params,
    rates: lay.rates,
    stalls: lay.plan.stalls,
    gates: lay.plan.gates,
    frame: lay.plan.frame,
    aisles: lay.plan.aisles,
    plaza: lay.plan.plaza,
    stats: lay.plan.stats,
    bookings: activeBookings(db, code, week).map(bookingView),
  };
}

export function marketSummary(db, seed) {
  const thisWeek = weekStartOf();
  return {
    sites: marketSites(seed).map((s) => ({ id: s.id, code: s.code, number: s.number })),
    week: thisWeek,
    weeks: upcomingWeeks(Date.now(), 6),
  };
}

// Admin: set a week's layout. Changing the arrangement of a week that already has bookings is refused (the stall IDs would move under people).
export function setLayout(db, seed, input = {}) {
  const code = String(input.siteCode ?? '');
  const week = weekOrFail(String(input.week ?? ''));
  siteOf(seed, code);
  if (weekWindow(week).end < Date.now()) fail(400, 'That week is over.', 'past_week');
  const params = cleanParams(input.params ?? {});
  const rates = cleanRates(input.rates);
  const note = text(input.note, 200) || null;
  const published = input.publish ? 1 : 0;
  return transaction(db, () => {
    const had = db.prepare('SELECT params FROM market_layouts WHERE site_code = ? AND week_start = ?').get(code, week);
    const booked = activeBookings(db, code, week);
    const sameAsBefore = JSON.stringify(cleanParams(had ? parse(had.params, {}) : autoParams(code, week))) === JSON.stringify(params);
    if (booked.length && !sameAsBefore) fail(409, `${booked.length} stall${booked.length === 1 ? ' is' : 's are'} already booked this week, so the layout cannot change. Prices and notes can.`, 'has_bookings');
    db.prepare(
      'INSERT INTO market_layouts (site_code, week_start, params, rates, note, published, updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(site_code, week_start) DO UPDATE SET params = excluded.params, rates = excluded.rates, note = excluded.note, published = excluded.published, updated_at = excluded.updated_at'
    ).run(code, week, JSON.stringify(params), rates ? JSON.stringify(rates) : null, note, published, Date.now());
    return marketWeek(db, seed, code, week);
  });
}

// A stall counts as taken by a confirmed booking, and by one waiting for its payment while its hold lasts (docs/monetization/billing.md).
const TAKEN = "(status = 'booked' OR (status = 'pending' AND hold_until > ?))";

// A player rents a stall. Everything is checked and written in one transaction, so two people cannot take the same stall at the same time.
// With payments on (holdUntil set), the booking is written as pending, holding the stall until then: payStall in billing.mjs sends the player
// to Stripe, and confirmBooking makes it a booking once they have paid.
export function book(db, seed, account, input = {}, { holdUntil = null } = {}) {
  requireAccount(account);
  const code = String(input.siteCode ?? '');
  const week = weekOrFail(String(input.week ?? ''));
  const hours = Number(input.hours);
  const startMs = Number(input.start);
  const brand = text(input.brand, 60);
  const product = text(input.product, 120);
  if (!brand) fail(400, 'Give your stall a name.', 'invalid');
  return transaction(db, () => {
    const lay = layoutOf(db, seed, code, week);
    if (!lay.published) fail(409, 'That week\'s market is not open for booking yet.', 'not_open');
    const stall = lay.plan.stalls.find((s) => s.id === String(input.stallId));
    const existing = db.prepare(`SELECT start_at AS start, end_at AS end FROM market_bookings WHERE site_code = ? AND week_start = ? AND stall_id = ? AND ${TAKEN}`).all(code, week, String(input.stallId), Date.now());
    const problem = bookingProblem({ week, stall, startMs, hours, existing });
    if (problem) fail(409, problem, 'unavailable');
    const mine = db.prepare(`SELECT COUNT(*) AS n FROM market_bookings WHERE account_id = ? AND site_code = ? AND week_start = ? AND ${TAKEN}`).get(account.id, code, week, Date.now()).n;
    if (mine >= MAX_ACTIVE_PER_WEEK) fail(409, `One account can hold ${MAX_ACTIVE_PER_WEEK} stalls a week.`, 'limit');
    const shop = cleanShop(input);
    const id = Number(db.prepare('INSERT INTO market_bookings (site_code, week_start, stall_id, account_id, account_name, brand, product, start_at, end_at, hours, cents, goods, offer, website, status, hold_until, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(code, week, stall.id, account.id, account.username, brand, product || null, startMs, bookingEnd(startMs, hours), hours, stall.cents, JSON.stringify(shop.goods), shop.offer, shop.website, holdUntil ? 'pending' : 'booked', holdUntil, Date.now()).lastInsertRowid);
    const row = db.prepare('SELECT * FROM market_bookings WHERE id = ?').get(id);
    if (!holdUntil) bookedNotice(db, row);
    return { booking: bookingView(row), paid: stall.cents, stall: { id: stall.id, tier: stall.tier }, siteCode: code };
  });
}

function bookedNotice(db, b) {
  const to = noticeAddress(db, b.account_id);
  if (to) enqueue(db, { to, kind: 'market_booking', subject: `Your market stall ${b.stall_id} is booked`, body: `${b.brand} has stall ${b.stall_id} at the pop-up market (${b.site_code}) from ${new Date(b.start_at).toUTCString()} for ${b.hours} hours. The price is $${(b.cents / 100).toFixed(2)}.\n\nYou will get a reminder an hour before it opens. Set up what you sell in the game: Places > Reserved land > the market > Your stalls.` });
}

// The stall is paid for: the pending booking becomes a booking. If its hold ran out during the payment and somebody else has booked the stall
// since, it cannot be had: { refund: true } (the caller refunds the payment).
export function confirmBooking(db, id) {
  return transaction(db, () => {
    const b = db.prepare('SELECT * FROM market_bookings WHERE id = ?').get(Number(id));
    if (!b) return { refund: true };
    if (b.status === 'booked') return { booking: bookingView(b) };
    const clash = db.prepare(`SELECT 1 FROM market_bookings WHERE id != ? AND site_code = ? AND week_start = ? AND stall_id = ? AND ${TAKEN} AND start_at < ? AND end_at > ?`).get(b.id, b.site_code, b.week_start, b.stall_id, Date.now(), b.end_at, b.start_at);
    if (clash || b.end_at <= Date.now()) {
      db.prepare("UPDATE market_bookings SET status = 'cancelled', hold_until = NULL WHERE id = ?").run(b.id);
      return { refund: true };
    }
    db.prepare("UPDATE market_bookings SET status = 'booked', hold_until = NULL WHERE id = ?").run(b.id);
    const row = db.prepare('SELECT * FROM market_bookings WHERE id = ?').get(b.id);
    bookedNotice(db, row);
    return { booking: bookingView(row) };
  });
}
// The checkout was abandoned, failed or refunded: the stall is free again.
export function releaseBooking(db, id) {
  db.prepare("UPDATE market_bookings SET status = 'cancelled', hold_until = NULL WHERE id = ? AND status IN ('pending', 'booked')").run(Number(id));
}

// The player's stalls: coming up, open now, and the ones that closed in the last two weeks, each with how many people stopped by.
export function myBookings(db, account) {
  requireAccount(account);
  const rows = db.prepare("SELECT * FROM market_bookings WHERE account_id = ? AND status = 'booked' AND end_at > ? ORDER BY start_at").all(account.id, Date.now() - 14 * 86400000);
  return { bookings: rows.map((b) => ({ ...bookingView(b), siteCode: b.site_code, week: b.week_start, visits: visitsOf(db, b.id) })) };
}

// The owner sets up (or changes) their shop: what is sold, an offer, a website.
export function updateStall(db, account, id, input = {}) {
  requireAccount(account);
  const b = db.prepare("SELECT * FROM market_bookings WHERE id = ? AND status = 'booked'").get(Number(id));
  if (!b || b.account_id !== account.id) throw new ApiError(404, 'There is no such booking.', 'not_found');
  if (b.end_at <= Date.now()) fail(409, 'That booking has ended.', 'ended');
  const shop = cleanShop(input);
  const brand = text(input.brand ?? b.brand, 60) || b.brand;
  const product = text(input.product ?? b.product, 120) || null;
  db.prepare('UPDATE market_bookings SET goods = ?, offer = ?, website = ?, brand = ?, product = ? WHERE id = ?').run(JSON.stringify(shop.goods), shop.offer, shop.website, brand, product, b.id);
  return { booking: { ...bookingView(db.prepare('SELECT * FROM market_bookings WHERE id = ?').get(b.id)), visits: visitsOf(db, b.id) } };
}

// Someone looked at an open stall. Counted once per visitor per hour (an account id, or an anonymous id from the browser).
export function visit(db, account, id, visitor) {
  const b = db.prepare("SELECT * FROM market_bookings WHERE id = ? AND status = 'booked'").get(Number(id));
  if (!b) throw new ApiError(404, 'There is no such booking.', 'not_found');
  const now = Date.now();
  if (statusOf(b, now) !== 'live') return { counted: false };
  if (account && account.id === b.account_id) return { counted: false }; // not your own visits
  const who = account ? `a${account.id}` : `v${text(visitor, 40) || 'anon'}`;
  const res = db.prepare('INSERT OR IGNORE INTO market_visits (booking_id, visitor, hour, at) VALUES (?,?,?,?)').run(b.id, who, Math.floor(now / 3600000), now);
  return { counted: Number(res.changes) > 0 };
}

// What the server does as stalls open and close: an hour before a stall opens its holder is emailed, and when it closes they get a summary with the number
// of visitors. (Emails go only to a verified address with notices on; the game also tells a player who is online.) Runs every minute, and by an admin call.
export function sendNotices(db, now = Date.now()) {
  let opening = 0;
  let closed = 0;
  const soon = db.prepare("SELECT * FROM market_bookings WHERE status = 'booked' AND notified_open = 0 AND start_at - ? <= ? AND end_at > ?").all(now, OPEN_NOTICE_MS, now);
  for (const b of soon) {
    const to = noticeAddress(db, b.account_id);
    if (to) {
      const mins = Math.max(0, Math.round((b.start_at - now) / 60000));
      enqueue(db, { to, kind: 'market_open', subject: `Your stall ${b.stall_id} opens ${mins <= 1 ? 'now' : `in ${mins} minutes`}`, body: `${b.brand} opens at the pop-up market (${b.site_code}, stall ${b.stall_id}) ${mins <= 1 ? 'now' : `in about ${mins} minutes`} and stays open until ${new Date(b.end_at).toUTCString()}.\n\nVisitors can walk in through the gates and look at your stall while it is open. Add your goods and an offer in the game: Places > Reserved land > the market > Your stalls.` });
      opening++;
    }
    db.prepare('UPDATE market_bookings SET notified_open = 1 WHERE id = ?').run(b.id);
  }
  const done = db.prepare("SELECT * FROM market_bookings WHERE status = 'booked' AND notified_close = 0 AND end_at <= ?").all(now);
  for (const b of done) {
    const to = noticeAddress(db, b.account_id);
    if (to) {
      const n = visitsOf(db, b.id);
      enqueue(db, { to, kind: 'market_closed', subject: `Your stall ${b.stall_id} has closed`, body: `${b.brand}'s time at the pop-up market is over. ${n} ${n === 1 ? 'person' : 'people'} stopped by your stall.\n\nThe stall is free for someone else now. You can rent a stall again any time: Places > Reserved land > the market.` });
      closed++;
    }
    db.prepare('UPDATE market_bookings SET notified_close = 1 WHERE id = ?').run(b.id);
  }
  return { opening, closed };
}

// A booking can be cancelled by its owner until it starts. A paid one is refunded in full (the server does that through billing.mjs first).
export function cancelBooking(db, account, id) {
  requireAccount(account);
  const b = db.prepare("SELECT * FROM market_bookings WHERE id = ? AND status = 'booked'").get(Number(id));
  if (!b || b.account_id !== account.id) throw new ApiError(404, 'There is no such booking.', 'not_found');
  if (b.start_at <= Date.now()) fail(409, 'That booking has already started.', 'started');
  db.prepare("UPDATE market_bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
  return { ok: true };
}

// Admin: every site's layout status and bookings for a week, with what it earns.
export function adminWeek(db, seed, week = weekStartOf()) {
  weekOrFail(week);
  return {
    week,
    sites: marketSites(seed).map((s) => {
      const lay = layoutOf(db, seed, s.code, week);
      const bookings = activeBookings(db, s.code, week);
      return {
        code: s.code,
        source: lay.source,
        published: lay.published,
        params: lay.params,
        rates: lay.rates,
        note: lay.note,
        stalls: lay.plan.stalls.length,
        booked: new Set(bookings.map((b) => b.stall_id)).size,
        live: bookings.filter((b) => statusOf(b) === 'live').length,
        visits: bookings.reduce((n, b) => n + visitsOf(db, b.id), 0),
        bookings: bookings.length,
        earnedCents: bookings.reduce((n, b) => n + b.cents, 0),
        stats: lay.plan.stats,
      };
    }),
  };
}
