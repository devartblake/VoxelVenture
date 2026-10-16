// The market plan: stalls fit the site, never overlap, can all be walked up to, and are priced by how busy they are.
import { imp, problemTally } from './helpers.mjs';
const { planMarket, MARKET_STYLES, MARKET_DEFAULTS, MARKET_LIMITS, TIERS, cleanParams, priceOf, HOURS } = await imp('market/layout.js');
const { bad, total } = problemTally();

const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const rectOf = (s) => ({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - s.d / 2, z1: s.z + s.d / 2 });
const sites = [
  { name: 'east-west road, site to the south', site: { x0: 10, x1: 44, z0: 100, z1: 130, frontRoad: 'r', frontSide: 1 }, road: { axis: 'x' } },
  { name: 'east-west road, site to the north', site: { x0: -40, x1: -6, z0: -80, z1: -50, frontRoad: 'r', frontSide: -1 }, road: { axis: 'x' } },
  { name: 'north-south road, site to the east', site: { x0: 60, x1: 90, z0: -20, z1: 14, frontRoad: 'r', frontSide: 1 }, road: { axis: 'z' } },
  { name: 'north-south road, site to the west', site: { x0: -90, x1: -60, z0: 5, z1: 39, frontRoad: 'r', frontSide: -1 }, road: { axis: 'z' } },
];
const counts = {};
for (const { name, site, road } of sites) {
  for (const style of MARKET_STYLES.map((s) => s.id)) {
    for (const entrances of [1, 2, 3]) {
      for (const seed of [1, 2, 3]) {
        const tag = `${name} / ${style} / ${entrances} / ${seed}`;
        const plan = planMarket(site, { style, entrances, seed }, road);
        const { stalls } = plan;
        (counts[style] ??= []).push(stalls.length);
        if (stalls.length < 40) bad('a market has plenty of stalls', `${tag}: ${stalls.length}`);
        const ids = new Set(stalls.map((s) => s.id));
        if (ids.size !== stalls.length) bad('every stall has its own id', tag);
        for (const s of stalls) {
          const r = rectOf(s);
          if (r.x0 < site.x0 - 1e-6 || r.x1 > site.x1 + 1e-6 || r.z0 < site.z0 - 1e-6 || r.z1 > site.z1 + 1e-6) { bad('a stall is inside the site', `${tag} ${s.id}`); break; }
          if (!['N', 'S', 'E', 'W'].includes(s.front)) bad('a stall faces a compass direction', `${tag} ${s.id}`);
          if (!s.reachable) bad('every stall can be walked up to', `${tag} ${s.id}`);
        }
        for (let i = 0; i < stalls.length; i++) for (let j = i + 1; j < stalls.length; j++) if (overlap(rectOf(stalls[i]), rectOf(stalls[j]))) { bad('stalls do not overlap', `${tag} ${stalls[i].id}/${stalls[j].id}`); i = stalls.length; break; }
        // the gates are on the road side: the side the site faces the road on
        for (const g of plan.gates) {
          const onRoadSide = road.axis === 'x' ? Math.abs(g.z - (site.frontSide < 0 ? site.z1 : site.z0)) < 1e-6 : Math.abs(g.x - (site.frontSide < 0 ? site.x1 : site.x0)) < 1e-6;
          if (!onRoadSide) bad('the gates are on the road side', `${tag} ${JSON.stringify(g)}`);
        }
        // prices: $2 to $5, the dearer spots are the busier ones, every tier is used
        const byTier = Object.fromEntries(TIERS.map((t) => [t.id, stalls.filter((s) => s.tier === t.id)]));
        for (const t of TIERS) {
          if (!byTier[t.id].length) bad('every price tier has stalls', `${tag} ${t.id}`);
          for (const s of byTier[t.id]) if (s.cents !== t.cents || s.cents < 200 || s.cents > 500) bad('prices are $2 to $5', `${tag} ${s.id} ${s.cents}`);
        }
        const mean = (list) => list.reduce((n, s) => n + s.traffic, 0) / list.length;
        if (!(mean(byTier.prime) > mean(byTier.busy) && mean(byTier.busy) > mean(byTier.standard) && mean(byTier.standard) > mean(byTier.quiet))) bad('the busier the spot, the higher its tier', tag);
        // the prime spots are the ones near a gate
        const nearGate = (s) => Math.min(...plan.gates.map((g) => Math.hypot(g.x - s.x, g.z - s.z)));
        const avg = (list) => list.reduce((n, s) => n + nearGate(s), 0) / list.length;
        if (!(avg(byTier.prime) < avg(byTier.quiet))) bad('prime spots are nearer the gates than quiet ones', tag);
        if (JSON.stringify(planMarket(site, { style, entrances, seed }, road).stalls) !== JSON.stringify(stalls)) bad('the same settings give the same plan', tag);
      }
    }
  }
}
// parameters are cleaned and bounded
const p = cleanParams({ style: 'nope', entrances: 99, stallW: 0, aisle: 50, boothShare: -1 });
if (p.style !== MARKET_DEFAULTS.style || p.entrances !== MARKET_LIMITS.entrances[1] || p.aisle !== MARKET_LIMITS.aisle[1] || p.boothShare !== MARKET_LIMITS.boothShare[0] || p.stallW < MARKET_LIMITS.stallW[0]) bad('settings are kept within their limits', JSON.stringify(p));
// the admin's own rates, within $2 to $5
if (priceOf({ tier: 'prime', cents: 500 }, { prime: 450 }) !== 450 || priceOf({ tier: 'prime', cents: 500 }, { prime: 9999 }) !== 500 || priceOf({ tier: 'quiet', cents: 200 }, { quiet: 1 }) !== 200 || priceOf({ tier: 'quiet', cents: 200 }) !== 200) bad('an admin rate replaces the tier price, within $2 to $5', '');
if (HOURS.join() !== '24,48,72') bad('a stall is rented for 24, 48 or 72 hours', HOURS.join());
const sizes = Object.entries(counts).map(([k, v]) => `${k} ${Math.min(...v)}-${Math.max(...v)}`).join(', ');
console.log(`stalls on a 34 x 30 site: ${sizes}`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
