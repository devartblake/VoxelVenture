// The market without a game server: the same rules as services/api/market.mjs, kept in the browser. Used when NEXT_PUBLIC_LIVE_API_URL is not set, so
// the market can be tried (and an admin can lay out a week) on one machine. All functions are pure: they take the local state and return a new one.
import { cleanParams, planMarket, priceOf, TIERS, PRICE_RANGE_CENTS } from './layout';
import { addWeeks, autoParams, bookingEnd, bookingProblem, isWeekStart, weekStartOf, weekWindow } from './weeks';

export const EMPTY_LOCAL = { layouts: {}, bookings: [], nextId: 1, visits: {} };
const MAX_ACTIVE_PER_WEEK = 4;
const key = (code, week) => `${code}|${week}`;

export const cleanRates = (rates) => {
  if (!rates || typeof rates !== 'object') return null;
  const out = {};
  for (const t of TIERS) {
    const c = Number(rates[t.id]);
    if (Number.isFinite(c) && c > 0) out[t.id] = Math.round(Math.min(PRICE_RANGE_CENTS[1], Math.max(PRICE_RANGE_CENTS[0], c)));
  }
  return Object.keys(out).length ? out : null;
};

// The layout of a week for a site, with the prices applied: { source, published, params, rates, note, plan }.
export function layoutFor(local, site, road, week) {
  const row = local.layouts[key(site.code, week)];
  const params = cleanParams(row ? row.params : autoParams(site.code, week));
  const rates = row ? cleanRates(row.rates) : null;
  const plan = planMarket(site, params, road);
  const stalls = plan.stalls.map((s) => ({ ...s, cents: priceOf(s, rates) }));
  return { source: row ? 'admin' : 'auto', published: row ? Boolean(row.published) : true, params: plan.params, rates, note: row?.note ?? null, plan: { ...plan, stalls, stats: { ...plan.stats, perDayCents: stalls.reduce((n, s) => n + s.cents, 0) } } };
}

const stateOf = (b, now = Date.now()) => (b.status === 'cancelled' ? 'cancelled' : now < b.start ? 'upcoming' : now < b.end ? 'live' : 'ended');
const view = (b) => ({ id: b.id, stallId: b.stallId, start: b.start, end: b.end, hours: b.hours, brand: b.brand, product: b.product, by: b.by, cents: b.cents, goods: b.goods ?? [], offer: b.offer ?? null, website: b.website ?? null, state: stateOf(b) });

// What a stallholder puts in their shop (the same limits as the server): up to eight goods with prices, a one-line offer, a website.
export function cleanShop(input = {}) {
  const goods = (Array.isArray(input.goods) ? input.goods : []).slice(0, 8).map((g) => ({ name: String(g?.name ?? '').trim().slice(0, 40), cents: Math.max(0, Math.min(100000, Math.round(Number(g?.cents) || 0))) })).filter((g) => g.name);
  const website = String(input.website ?? '').trim().slice(0, 200);
  if (website && !/^https?:\/\/[^\s]+$/i.test(website)) throw new Error('The website must start with http:// or https://.');
  return { goods, offer: String(input.offer ?? '').trim().slice(0, 120) || null, website: website || null };
}
const active = (local, code, week) => local.bookings.filter((b) => b.siteCode === code && b.week === week && b.status === 'booked');

// The same shape the server returns from GET /market/:code/:week.
export function weekPayload(local, site, road, week = weekStartOf()) {
  const lay = layoutFor(local, site, road, week);
  return {
    site: { id: site.id, code: site.code, number: site.number, x0: site.x0, x1: site.x1, z0: site.z0, z1: site.z1, frontRoad: site.frontRoad, frontSide: site.frontSide },
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
    bookings: active(local, site.code, week).map(view),
  };
}

// Admin: set a week's layout. Returns the new local state, or throws an Error with a message for the person.
export function setLayoutLocal(local, site, road, input) {
  const week = String(input.week ?? '');
  if (!isWeekStart(week)) throw new Error('That is not a week.');
  if (weekWindow(week).end < Date.now()) throw new Error('That week is over.');
  const params = cleanParams(input.params ?? {});
  const booked = active(local, site.code, week);
  const was = local.layouts[key(site.code, week)];
  const before = cleanParams(was ? was.params : autoParams(site.code, week));
  if (booked.length && JSON.stringify(before) !== JSON.stringify(params)) throw new Error(`${booked.length} stall${booked.length === 1 ? ' is' : 's are'} already booked this week, so the layout cannot change. Prices and notes can.`);
  const row = { params, rates: cleanRates(input.rates), note: String(input.note ?? '').slice(0, 200) || null, published: Boolean(input.publish) };
  return { ...local, layouts: { ...local.layouts, [key(site.code, week)]: row } };
}

// A player rents a stall. Returns { local, booking } or throws.
export function bookLocal(local, site, road, input, who = 'You') {
  const week = String(input.week ?? '');
  if (!isWeekStart(week)) throw new Error('That is not a week.');
  const lay = layoutFor(local, site, road, week);
  if (!lay.published) throw new Error('That week\'s market is not open for booking yet.');
  const brand = String(input.brand ?? '').trim().slice(0, 60);
  if (!brand) throw new Error('Give your stall a name.');
  const stall = lay.plan.stalls.find((s) => s.id === String(input.stallId));
  const existing = active(local, site.code, week).filter((b) => b.stallId === String(input.stallId)).map((b) => ({ start: b.start, end: b.end }));
  const problem = bookingProblem({ week, stall, startMs: Number(input.start), hours: Number(input.hours), existing });
  if (problem) throw new Error(problem);
  if (active(local, site.code, week).filter((b) => b.by === who).length >= MAX_ACTIVE_PER_WEEK) throw new Error(`One account can hold ${MAX_ACTIVE_PER_WEEK} stalls a week.`);
  const shop = cleanShop(input);
  const booking = { id: local.nextId, siteCode: site.code, week, stallId: stall.id, start: Number(input.start), end: bookingEnd(Number(input.start), Number(input.hours)), hours: Number(input.hours), brand, product: String(input.product ?? '').trim().slice(0, 120) || null, by: who, cents: stall.cents, ...shop, status: 'booked' };
  return { local: { ...local, bookings: [...local.bookings, booking], nextId: local.nextId + 1 }, booking: view(booking), paid: stall.cents, stall: { id: stall.id, tier: stall.tier } };
}

export function cancelLocal(local, id) {
  const b = local.bookings.find((x) => x.id === Number(id) && x.status === 'booked');
  if (!b) throw new Error('There is no such booking.');
  if (b.start <= Date.now()) throw new Error('That booking has already started.');
  return { ...local, bookings: local.bookings.map((x) => (x.id === b.id ? { ...x, status: 'cancelled' } : x)) };
}

const visitCount = (local, id) => Object.keys(local.visits ?? {}).filter((k) => k.startsWith(`${id}|`)).length;
// the player's stalls: coming up, open now, and those that closed in the last two weeks
export const myBookingsLocal = (local, who = 'You') =>
  local.bookings
    .filter((b) => b.by === who && b.status === 'booked' && b.end > Date.now() - 14 * 86400000)
    .sort((a, b) => a.start - b.start)
    .map((b) => ({ ...view(b), siteCode: b.siteCode, week: b.week, visits: visitCount(local, b.id) }));

// The owner sets up (or changes) their shop.
export function updateLocal(local, id, input = {}, who = 'You') {
  const b = local.bookings.find((x) => x.id === Number(id) && x.status === 'booked');
  if (!b || b.by !== who) throw new Error('There is no such booking.');
  if (b.end <= Date.now()) throw new Error('That booking has ended.');
  const shop = cleanShop(input);
  const brand = String(input.brand ?? b.brand).trim().slice(0, 60) || b.brand;
  return { ...local, bookings: local.bookings.map((x) => (x.id === b.id ? { ...x, ...shop, brand, product: String(input.product ?? b.product ?? '').trim().slice(0, 120) || null } : x)) };
}

// Someone looked at an open stall: counted once per visitor per hour.
export function visitLocal(local, id, visitor = 'you', who = 'You') {
  const b = local.bookings.find((x) => x.id === Number(id) && x.status === 'booked');
  if (!b || stateOf(b) !== 'live' || b.by === who) return local;
  const k = `${b.id}|${visitor}|${Math.floor(Date.now() / 3600000)}`;
  return local.visits?.[k] ? local : { ...local, visits: { ...(local.visits ?? {}), [k]: Date.now() } };
}

// ---- a demonstration: a market with nearly every stall let and open ------------------------------------------------------------------
const DEMO = [
  ['Sourdough & Sons', 'Fresh bread', [['Sourdough loaf', 450], ['Rye', 500], ['Cinnamon roll', 300]], 'Free sample with every loaf'],
  ['Pixel Plants', 'Succulents and cacti', [['Tiny cactus', 400], ['Fern', 900], ['Pot', 250]], '3 for 2 on small plants'],
  ['Retro Tees', 'Printed t-shirts', [['Tee', 1800], ['Cap', 1200]], '10% off a second tee'],
  ['Luna Candles', 'Hand-poured candles', [['Small', 700], ['Large', 1400]], null],
  ['Byte Bites', 'Street food', [['Dumplings', 800], ['Noodle bowl', 1100], ['Soda', 250]], 'Free soda with a bowl'],
  ['Kilo Coffee', 'Coffee and tea', [['Flat white', 400], ['Tea', 300]], 'Loyalty stamp on every cup'],
  ['Vinyl Vault', 'Second-hand records', [['Record', 1500], ['Sleeve', 100]], null],
  ['Nova Knits', 'Scarves and hats', [['Scarf', 2200], ['Beanie', 1600]], null],
  ['Apex Arcade Repairs', 'Retro console fixes', [['Cleaning', 1500]], 'Free quote'],
  ['Honey Hive', 'Local honey', [['Jar', 800], ['Comb', 1200]], 'Taste before you buy'],
  ['Pat the Potter', 'Mugs and bowls', [['Mug', 1400], ['Bowl', 1800]], null],
  ['Cheese Please', 'Cheese and chutney', [['Cheddar', 900], ['Chutney', 600]], 'Sample board'],
  ['Wob Wood', 'Wooden toys', [['Train', 1900], ['Blocks', 1500]], null],
  ['Fizz Lab', 'Lemonade and ice pops', [['Lemonade', 350], ['Ice pop', 250]], '2 for $5'],
  ['Moss & Stone', 'Terrariums', [['Small', 1800], ['Large', 3400]], null],
  ['Zed Zines', 'Comics and prints', [['Zine', 500], ['Print', 1200]], 'Meet the artist'],
];
// Lets nearly every stall of the week from a few hours ago for a few days, and fills their shops, so the market looks and works as it does when it is busy.
export function fillDemo(local, site, road, week, share = 0.9, now = Date.now()) {
  const lay = layoutFor(local, site, road, week);
  const w = weekWindow(week);
  const bookings = local.bookings.filter((b) => !b.demo);
  let id = bookings.reduce((n, b) => Math.max(n, b.id), local.nextId - 1) + 1;
  const stalls = lay.plan.stalls;
  stalls.forEach((s, i) => {
    if (((i * 7919) % 100) / 100 >= share) return; // leave some free
    const [brand, product, goods, offer] = DEMO[i % DEMO.length];
    const hours = [24, 48, 72][i % 3];
    const start = Math.max(w.start, now - ((i % 5) + 1) * 3600000);
    bookings.push({ id: id++, siteCode: site.code, week, stallId: s.id, start, end: Math.min(w.end, bookingEnd(start, hours)), hours, brand: `${brand}${i >= DEMO.length ? ` ${Math.floor(i / DEMO.length) + 1}` : ''}`, product, by: 'Demo', cents: s.cents, goods: goods.map(([name, cents]) => ({ name, cents })), offer, website: 'https://example.com', status: 'booked', demo: true });
  });
  return { ...local, bookings, nextId: id };
}
export const clearDemo = (local) => ({ ...local, bookings: local.bookings.filter((b) => !b.demo) });
export { addWeeks };
