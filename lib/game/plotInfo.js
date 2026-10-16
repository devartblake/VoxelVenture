// What the plot card tells you about a building and about its website's visitors. Pure functions, so they can be tested in Node.
//
// Real, saved facts are used where the game has them (the owner, the price, past owners, what the player did there). The rest is
// SIMULATED, from the plot's id and size, and is labelled as simulated in the card: the same plot always shows the same numbers,
// and busier plots (more visits, a better spot) show bigger ones. Real numbers need accounts and a server.

// A small seeded random from (plot id, salt): the same every time.
function rng(id, salt) {
  let a = (Math.imul(Number(String(id).replace(/\D/g, '') || 1) + 17, 2654435761) ^ Math.imul(salt + 1, 2246822519)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// ---- where it is ---------------------------------------------------------------------------------------------------
// "Byte St, 14": the nearest road and a house number counted along it (odd on one side, even on the other).
export function addressOf(plot, layout) {
  if (plot.mall) {
    const mall = layout.malls?.find((m) => m.id === plot.mall);
    return `${mall?.name ?? 'Mega Mall'}, unit ${plot.unit + 1}`;
  }
  let best = null;
  for (const r of layout.roads) {
    const along = r.axis === 'x' ? plot.x : plot.z;
    const across = (r.axis === 'x' ? plot.z : plot.x) - r.center;
    const u = Math.min(r.to, Math.max(r.from, along));
    const d = Math.hypot(along - u, across);
    if (!best || d < best.d) best = { d, road: r, u, side: across < 0 ? 1 : 0 };
  }
  if (!best) return `Plot ${plot.id}`;
  // one number a plot's width along the road: odd on one side, even on the other
  const slot = Math.max(0, Math.floor((best.u - best.road.from) / 3.4));
  return `${best.road.name ?? 'Country road'}, ${2 * slot + (best.side ? 1 : 2)}`;
}

// The kind of place it is: near the middle, the edge, the water or the country; and how much passing trade that gives it.
export function exposureOf(plot, layout, plots) {
  const land = layout.land;
  const half = Math.min(land.x1 - land.x0, land.z1 - land.z0) / 2;
  const d = Math.hypot(plot.x - layout.center.x, plot.z - layout.center.z) / half;
  const waterfront = plot.districtId === 'riverside' || plot.districtId === 'lakeside';
  const zone = plot.mall ? 'Mall' : waterfront ? 'Waterfront' : plot.districtId === 'countryside' ? 'Country' : plot.districtId === 'outskirts' ? 'Outskirts' : d < 0.28 ? 'Center' : d < 0.55 ? 'Midtown' : 'Edge';
  const visits = plots.map((p) => p.visits ?? 0).sort((a, b) => a - b);
  const share = visits.length ? visits.filter((v) => v <= (plot.visits ?? 0)).length / visits.length : 0.5;
  const level = plot.parkBoost || share >= 0.75 ? 'High' : share >= 0.35 ? 'Medium' : 'Low';
  return { zone, level, label: `${zone.toUpperCase()} · ${level.toUpperCase()} EXPOSURE` };
}

// 1 = the most valuable plot in the city.
export function rankByValue(plot, plots) {
  return 1 + plots.filter((p) => p.value > plot.value || (p.value === plot.value && p.id < plot.id)).length;
}

// ---- what it is ----------------------------------------------------------------------------------------------------
const BLURB = {
  office: [
    (t, d) => `${t} is a ${d} office: a studio of builders who turn ideas into products. Drop in, meet the team and see the work.`,
    (t, d) => `${t} helps growing companies get found and get ahead from its base in ${d}. Walk in for a tour of the floor.`,
    (t, d) => `A working office in ${d}. ${t} runs its projects out of this building and welcomes visitors.`,
  ],
  restaurant: [
    (t, d) => `${t} serves fresh food all day in ${d}. Grab a table, try the special and stay as long as you like.`,
    (t, d) => `A favourite in ${d}: ${t} is known for a short menu done well and a busy dining room.`,
    (t, d) => `${t} is a neighbourhood kitchen in ${d}. Come hungry.`,
  ],
  shop: [
    (t, d) => `${t} is a ${d} shop with something for everyone. Browse the racks and ask about this week's offer.`,
    (t, d) => `${t} stocks the things people come to ${d} for. Step inside and have a look around.`,
    (t, d) => `A local shop in ${d}. ${t} has regulars, new arrivals and an offer for first-time visitors.`,
  ],
  house: [() => 'A quiet house in Old Town, the home of an owner who was bought out of their business.'],
};
// What the business says about itself: the owner's own words if they wrote some, else a line made from its name, type and district.
export function describeBusiness(plot) {
  if (plot.description) return plot.description;
  if (!plot.owner) return `An empty ${plot.prime ? 'prime ' : ''}lot in ${plot.district}, ready for a business. Claim it, choose a building and make it yours.`;
  const rand = rng(plot.id, 3);
  return pick(rand, BLURB[plot.buildingType] ?? BLURB.shop)(plot.title, plot.district);
}

// ---- who has owned it ----------------------------------------------------------------------------------------------
export const ownersOf = (plot) => (plot.owner ? (plot.takeovers ?? 0) + 1 + (plot.generated ? Math.floor(rng(plot.id, 5)() * 3) : 0) : 0);

// Newest first: { kind: 'claim' | 'open', title, price, daysAgo }. A taken-over business lists the owners it replaced (real, saved);
// a business the city started with gets a short simulated past, ending with the plot being opened.
export function historyOf(plot, today = 0) {
  if (!plot.owner) return [];
  const rand = rng(plot.id, 9);
  const out = [];
  let daysAgo = plot.userClaimed ? 0 : 2 + Math.floor(rand() * 40);
  let price = plot.value;
  out.push({ kind: 'claim', title: plot.title, price, daysAgo: plot.userClaimed ? 0 : daysAgo, now: true });
  for (const h of plot.history ?? []) {
    price = Math.max(1, Math.round(price / 1.25));
    daysAgo += 3 + Math.floor(rand() * 12);
    out.push({ kind: 'claim', title: h.title, price, daysAgo, owner: h.owner });
  }
  const extra = plot.generated ? ownersOf(plot) - 1 : 0;
  for (let i = 0; i < extra; i++) {
    price = Math.max(1, Math.round(price / 1.25));
    daysAgo += 5 + Math.floor(rand() * 14);
    out.push({ kind: 'claim', title: i === extra - 1 ? 'Available' : `${plot.district} business`, price, daysAgo });
  }
  price = Math.max(1, Math.round(price * 0.8));
  out.push({ kind: 'open', title: `Building #${plot.id}`, price, daysAgo: daysAgo + 4 + Math.floor(rand() * 10) });
  return out.map((e) => ({ ...e, today }));
}

// ---- its website's visitors ----------------------------------------------------------------------------------------
const SOURCES = [
  { id: 'street', label: 'Walked past in the city', share: 0.5 },
  { id: 'billboard', label: 'Billboards', share: 0.14 },
  { id: 'banner', label: 'Aerial banners', share: 0.1 },
  { id: 'search', label: 'Map search and Places', share: 0.16 },
  { id: 'friends', label: 'Shared by other players', share: 0.1 },
];
const CTR = { office: 0.045, restaurant: 0.03, shop: 0.055, house: 0.01 };

// Thirty days of visits to the business and its website. `activity` is what the player really did there ({ visits, siteClicks }):
// it is added on top, so entering the building and pressing Visit website show up straight away.
export function siteVisitStats(plot, activity = {}) {
  if (!plot.owner) return null;
  const rand = rng(plot.id, 21);
  const perDay = Math.max(2, (plot.visits ?? 100) / 30 + (plot.parkBoost ? 3 : 0));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const weekend = (i % 7 === 0 || i % 7 === 6) ? 0.78 : 1.05;
    const trend = 0.85 + ((29 - i) / 29) * 0.3; // a little growth
    days.push({ ago: i, views: Math.max(0, Math.round(perDay * weekend * trend * (0.6 + rand() * 0.8))) });
  }
  const own = activity.visits ?? 0;
  days[days.length - 1].views += own;
  const views = days.reduce((a, d) => a + d.views, 0);
  const ctr = (CTR[plot.buildingType] ?? 0.04) * (0.7 + rand() * 0.7);
  const clicks = Math.round(views * ctr) + (activity.siteClicks ?? 0);
  const uniques = Math.round(views * (0.55 + rand() * 0.15));
  const weights = SOURCES.map((s) => s.share * (0.7 + rand() * 0.6));
  const total = weights.reduce((a, b) => a + b, 0);
  const sources = SOURCES.map((s, i) => ({ id: s.id, label: s.label, share: weights[i] / total })).sort((a, b) => b.share - a.share);
  return {
    simulated: true,
    days,
    views,
    uniques,
    clicks,
    ctr: views ? clicks / views : 0,
    avgSeconds: 25 + Math.round(rand() * 110) + (plot.buildingType === 'restaurant' ? 40 : 0),
    busiestHour: 11 + Math.floor(rand() * 9),
    busiestDay: pick(rand, ['Friday', 'Saturday', 'Saturday', 'Sunday', 'Thursday']),
    sources,
    best: Math.max(...days.map((d) => d.views)),
  };
}

export const formatDaysAgo = (n) => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);
export const formatHour = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? ' am' : ' pm'}`;
export const formatSeconds = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`);
