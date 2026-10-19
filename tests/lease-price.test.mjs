// The server charges exactly what the claim form shows (lib/game/claimPrice.js). For plots of every tier in several cities, with different outsides and
// lease terms: the price the browser works out for a claim, a take-over and a renewal is the price the API writes in the ledger (and so what Stripe is
// asked for: services/api/billing.mjs charges the ledger's price), and the plot's value is the year's price the form shows.
import { createApi } from '../services/api/server.mjs';
import { imp } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const ADMIN = 'admin';

const { generateCity, SUBURB_ID } = await imp('city/cityGenerator.js');
const { leaseQuote, renewalQuote, takeoverQuote } = await imp('game/claimPrice.js');
const { cleanExterior, defaultExterior, floorRange } = await imp('game/exterior.js');
const { EXTERIOR_PRICES } = await imp('content/exteriorPrices.js');
const { fromServer } = await imp('data/sync.js');

// The shipped outside prices (shares of the land price: extra floors, a roof garden, a dome, a spire) are charged as the form shows them. The test
// checks they are the real ones, so the comparison below is of the prices players pay.
const shipped = structuredClone(EXTERIOR_PRICES);
check('the outside has real prices (more floors and the roof features cost a share of the land)', EXTERIOR_PRICES.perFloor > 0 && EXTERIOR_PRICES.crown.spire > 0 && EXTERIOR_PRICES.crown.garden > 0);

const tierOf = (p) => (p.grand ? 'grand' : p.luxury ? 'luxury' : p.prime ? 'prime' : 'ordinary');
const TERMS = [90, 182, 365];
// the outsides a player might set up (null: they did not touch it, the claim form sends the usual one)
const OUTSIDES = [null, (p, t) => ({ floors: floorRange(p, t).typical + 2, crown: 'spire' }), () => ({ palette: 'tokyo', wallColor: '#336699', crown: 'garden' })];
const TYPES = ['shop', 'restaurant', 'office'];
const biz = (title, buildingType) => ({ title, buildingType, website: 'https://lease.test', variant: null, logo: { kind: 'generated' }, description: 'A test.' });
// what the claim form sends as the outside, and so what it prices (apps/web/components/ui/PlotCard.jsx)
const sentOutside = (p, type, choice) => cleanExterior(choice ?? defaultExterior(p, type), p, type);

try {
  let compared = 0;
  let withOutside = 0;
  const tiersSeen = new Set();
  for (const seed of [20260101, 7, 424242]) {
    const api = createApi({ dbFile: ':memory:', seed, deliverEveryMs: 0, env: { ADMIN_TOKEN: ADMIN } });
    await new Promise((r) => api.server.listen(0, r));
    const base = `http://localhost:${api.server.address().port}`;
    const call = async (method, p, { token, body } = {}) => {
      const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
      return { status: res.status, data: await res.json().catch(() => null) };
    };
    const signup = async (u) => (await call('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
    const charged = (id) => api.db.prepare('SELECT price FROM ledger WHERE plot_id = ? ORDER BY id DESC LIMIT 1').get(id).price;
    // the plot as the browser has it with a server: the generated plot, with what the server says about it on top (lib/data/sync.js)
    const inBrowser = async (p, me) => ({ ...p, ...fromServer((await call('GET', `/plots/${p.id}`)).data, me) });
    try {
      const city = generateCity(seed); // the browser's city, from the same generator and seed as the server's
      const amy = await signup('Amy');
      const bob = await signup('Bob');
      const open = (p) => p.districtId !== SUBURB_ID && !p.admin;
      let n = 0;

      // ---- claiming an empty lot: up to three of each tier
      for (const tier of ['ordinary', 'prime', 'luxury', 'grand']) {
        for (const p of city.plots.filter((q) => !q.owner && open(q) && tierOf(q) === tier).slice(0, 3)) {
          const type = TYPES[n % 3];
          const term = TERMS[n % 3];
          const choice = OUTSIDES[n % 3]?.(p, type) ?? null;
          n++;
          const shown = leaseQuote(p, sentOutside(p, type, choice), type, term);
          const r = await call('POST', `/plots/${p.id}/claim`, { token: amy.token, body: { ...biz(`Amy ${p.id}`, type), leaseDays: term, exterior: sentOutside(p, type, choice) } });
          compared++;
          tiersSeen.add(tier);
          if (shown.outside > 0) withOutside++;
          check(`seed ${seed}: claiming ${tier} plot ${p.id} for ${term} days costs what the form shows ($${shown.total}), and it is worth the year's price`, r.status === 200 && charged(p.id) === shown.total && r.data.value === shown.year && shown.land === p.price, JSON.stringify({ status: r.status, charged: charged(p.id), shown: shown.total, value: r.data?.value, year: shown.year }));
        }
      }

      // ---- taking over a business the city started with: up to two of each tier
      for (const tier of ['ordinary', 'prime', 'luxury', 'grand']) {
        for (const p of city.plots.filter((q) => q.owner && open(q) && q.buildingType && q.buildingType !== 'house' && tierOf(q) === tier).slice(0, 2)) {
          const type = TYPES[n % 3];
          const term = TERMS[n % 3];
          const choice = OUTSIDES[n % 3]?.(p, type) ?? null;
          n++;
          const seen = await inBrowser(p, bob.account);
          const outside = choice ? sentOutside(seen, type, choice) : null; // the take-over form sends no outside; the API takes one
          const shown = takeoverQuote(seen, outside, type, term);
          const r = await call('POST', `/plots/${p.id}/takeover`, { token: bob.token, body: { ...biz(`Bob ${p.id}`, type), leaseDays: term, ...(outside ? { exterior: outside } : {}), expectedPrice: shown.total } });
          compared++;
          tiersSeen.add(tier);
          check(`seed ${seed}: taking over ${tier} business ${p.id} for ${term} days costs what the browser shows ($${shown.total}): 1.25x its land`, r.status === 200 && charged(p.id) === shown.total && r.data.plot.value === shown.year && shown.business === Math.round(p.price * 1.25 * 100) / 100, JSON.stringify({ status: r.status, code: r.data?.code, charged: charged(p.id), shown: shown.total }));
        }
      }

      // ---- a player's business: renewing it, then taking it over once its lease is open
      const lot = city.plots.find((q) => !q.owner && open(q) && q.prime && !api.db.prepare('SELECT owner_name FROM plots WHERE id = ?').get(q.id).owner_name) ?? city.plots.find((q) => !q.owner && open(q) && !api.db.prepare('SELECT owner_name FROM plots WHERE id = ?').get(q.id).owner_name);
      const outside = sentOutside(lot, 'office', OUTSIDES[1](lot, 'office'));
      const claimed = await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz('Amy Renews', 'office'), leaseDays: 90, exterior: outside } });
      await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
      for (const term of TERMS) {
        const seen = await inBrowser(lot, amy.account);
        const shown = renewalQuote(seen, term);
        const r = await call('POST', `/plots/${lot.id}/renew`, { token: amy.token, body: { leaseDays: term } });
        compared++;
        check(`seed ${seed}: renewing for ${term} days costs what the lease box shows ($${shown}): half a new lease`, r.status === 200 && r.data.paid === shown && charged(lot.id) === shown && shown === Math.round(leaseQuote(lot, outside, 'office', term).total * 0.5 * 100) / 100 && seen.lease.renewPrice === renewalQuote(seen, seen.lease.days), JSON.stringify({ status: r.status, paid: r.data?.paid, shown }));
        await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
      }
      await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'open' } });
      const seen = await inBrowser(lot, bob.account);
      const shown = takeoverQuote(seen, null, 'shop', 365);
      const taken = await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz('Bob Takes', 'shop'), expectedPrice: shown.total } });
      compared++;
      check(`seed ${seed}: a player's business is taken over at 1.25x the year's price it was leased at ($${shown.total})`, claimed.status === 200 && taken.status === 200 && charged(lot.id) === shown.total && shown.business === Math.round(claimed.data.value * 1.25 * 100) / 100 && taken.data.plot.value === shown.year, JSON.stringify({ status: taken.status, code: taken.data?.code, charged: charged(lot.id), shown: shown.total }));
      check(`seed ${seed}: a stale take-over price is refused`, (await call('POST', `/plots/${city.plots.find((q) => q.owner && open(q) && q.buildingType && q.buildingType !== 'house' && !q.prime && !q.luxury && !q.grand && !api.db.prepare('SELECT owner_account FROM plots WHERE id = ?').get(q.id).owner_account).id}/takeover`, { token: bob.token, body: { ...biz('Bob Stale', 'shop'), expectedPrice: 1e9 } })).data?.code === 'price_changed');
    } finally {
      await api.close();
    }
  }
  check('every tier was compared, and outsides that cost something too', ['ordinary', 'prime', 'luxury', 'grand'].every((t) => tiersSeen.has(t)) && withOutside > 3, `${[...tiersSeen].join()} ${withOutside}`);
  console.log(`${compared} prices compared`);

  // ---- a database seeded before the plots carried their pricing attributes is brought up to date when the server starts
  const { openDb } = await import('../services/api/db.mjs');
  const core = await import('../services/api/core.mjs');
  const db = openDb(':memory:');
  core.seedWorld(db, 20260101);
  db.exec("UPDATE plots SET facts = json_remove(facts, '$.land')");
  const again = core.seedWorld(db, 20260101);
  const city = generateCity(20260101);
  const sample = city.plots.find((p) => p.luxury);
  check('an older database gets each plot\'s pricing attributes when the server starts', again.seeded === false && again.land === city.plots.length && JSON.stringify(JSON.parse(db.prepare('SELECT facts FROM plots WHERE id = ?').get(sample.id).facts).land) === JSON.stringify(sample.land) && core.seedWorld(db, 20260101).land === 0, JSON.stringify(again));
  db.close();
} catch (e) {
  fails++;
  console.log('FAIL', e.stack);
} finally {
  for (const k of Object.keys(EXTERIOR_PRICES)) delete EXTERIOR_PRICES[k];
  Object.assign(EXTERIOR_PRICES, shipped);
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
