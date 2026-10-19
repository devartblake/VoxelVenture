// The outside of a leased building through the API (services/api/core.mjs updateBusiness and upgradeExterior): a free change applies at once, a dearer
// one through PATCH is refused with 402 and its quote, and is paid for with POST /plots/:id/exterior (here without payments set up, so at once; the paid
// path through Stripe is in billing-game.test.mjs). Also: an old 30-day lease renews for 3 months, and the plot's history and its "changed hands"
// version count only the times it changed hands.
import { createApi } from '../services/api/server.mjs';
import { imp } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const ADMIN = 'admin';
const SECRET = 'internal-secret';

const { generateCity, SUBURB_ID } = await imp('city/cityGenerator.js');
const { exteriorChangeQuote, renewalQuote } = await imp('game/claimPrice.js');
const { defaultExterior, floorRange } = await imp('game/exterior.js');

const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: ADMIN, INTERNAL_SECRET: SECRET } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { token, body, headers = {} } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const plot = async (id) => (await call('GET', `/plots/${id}`)).data;
const ledger = (id, kind) => api.db.prepare('SELECT * FROM ledger WHERE plot_id = ? AND kind = ? ORDER BY id').all(id, kind);
const version = async (id) => (await call('GET', `/internal/plots/${id}/owner`, { headers: { 'X-Internal-Secret': SECRET } })).data.version;

try {
  const city = generateCity(20260101);
  const open = city.plots.filter((p) => !p.owner && p.districtId !== SUBURB_ID && !p.admin);
  const lot = open.find((p) => !p.prime && !p.luxury && !p.grand);
  const prime = open.find((p) => p.prime && !p.luxury);
  const amy = (await call('POST', '/auth/signup', { body: { username: 'Amy', password: 'longenough1' } })).data;
  const bob = (await call('POST', '/auth/signup', { body: { username: 'Bob', password: 'longenough2' } })).data;
  const biz = { title: 'Amy Coffee', buildingType: 'restaurant', website: 'https://amy.test', variant: 'cafe', logo: { kind: 'generated' }, description: 'Coffee.' };
  const claimed = await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, leaseDays: 30 } });
  check('Amy claims a plot with the basic outside, for its land price', claimed.status === 200 && claimed.data.value === lot.price, JSON.stringify([claimed.data?.value, lot.price]));
  const v0 = await version(lot.id);

  // ---- a free change applies at once (a colour style, her own walls, a dish): the value stays the land price
  const typical = floorRange(lot, 'restaurant').typical;
  const basic = { ...defaultExterior(lot, 'restaurant'), palette: 'tokyo', wallColor: '#336699', crown: 'dish' };
  const free = await call('PATCH', `/plots/${lot.id}`, { token: amy.token, body: { exterior: basic } });
  check('a free outside change applies at once', free.status === 200 && free.data.exterior.palette === 'tokyo' && free.data.exterior.crown === 'dish' && free.data.value === lot.price, JSON.stringify(free.data).slice(0, 200));

  // ---- a dearer one through PATCH: 402, with the quote the editor shows, and nothing changes
  const spire = { ...basic, floors: typical + 1, crown: 'spire' };
  const seen = await plot(lot.id);
  const shown = exteriorChangeQuote(seen, seen.exterior, spire, 'restaurant', { leaseDays: seen.lease.days, leaseEnd: seen.lease.end });
  const refused = await call('PATCH', `/plots/${lot.id}`, { token: amy.token, body: { exterior: spire, description: 'Sneaky.' } });
  check('a dearer outside through PATCH is refused with 402 and its quote', refused.status === 402 && refused.data.code === 'exterior_payment_required' && refused.data.quote.diff === shown.diff && Math.abs(refused.data.quote.charge - shown.charge) <= 0.01 && refused.data.quote.lines.some((l) => /spire/.test(l.label)) && /for the rest of your lease/.test(refused.data.error), JSON.stringify(refused.data));
  const after402 = await plot(lot.id);
  check('nothing changed: not the outside, not the description', after402.exterior.crown === 'dish' && after402.description === 'Coffee.' && after402.value === lot.price);
  check('a 30-day difference of a floor and a spire: 10% + 25% of the land', shown.diff === Math.round(lot.price * 0.1 * 100) / 100 + Math.round(lot.price * 0.25 * 100) / 100 || Math.abs(shown.diff - lot.price * 0.35) < 0.011, String(shown.diff));

  // ---- paying for it (no payments set up: at once)
  check('only the owner can upgrade', (await call('POST', `/plots/${lot.id}/exterior`, { token: bob.token, body: { exterior: spire } })).status === 403 && (await call('POST', `/plots/${lot.id}/exterior`, { body: { exterior: spire } })).status === 401);
  const up = await call('POST', `/plots/${lot.id}/exterior`, { token: amy.token, body: { exterior: spire } });
  check('the upgrade is built and paid for the rest of the lease', up.status === 200 && up.data.plot.exterior.crown === 'spire' && up.data.plot.exterior.floors === typical + 1 && Math.abs(up.data.paid - shown.charge) <= 0.01 && Object.keys(up.data).sort().join() === 'paid,plot', JSON.stringify(up.data).slice(0, 200));
  check('its value is the 30-day price: the land and the outside', Math.abs(up.data.plot.value - (lot.price + shown.diff)) < 0.011, `${up.data.plot.value} vs ${lot.price} + ${shown.diff}`);
  check('the ledger has an outside row at what was paid', ledger(lot.id, 'exterior').length === 1 && ledger(lot.id, 'exterior')[0].price === up.data.paid);
  check('the audit log records it', api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'plot.exterior' AND target_id = ?").get(String(lot.id)).n === 1);
  check('a renewal now prices the outside it has', (await plot(lot.id)).lease.renewPrice === renewalQuote(await plot(lot.id), 30).total && (await plot(lot.id)).lease.renewPrice > Math.round(lot.price * 0.9 * 100) / 100);
  // stepwise: one more floor still costs at least 50 cents
  const step = await call('POST', `/plots/${lot.id}/exterior`, { token: amy.token, body: { exterior: { ...spire, floors: typical + 2 } } });
  check('a small step up still costs at least 50 cents', step.status === 200 && step.data.paid >= 0.5, JSON.stringify(step.data?.paid));
  // taking things away is free, and lowers the value, but never below the land
  const down = await call('PATCH', `/plots/${lot.id}`, { token: amy.token, body: { exterior: basic } });
  check('taking the spire and floors away is free, and the value goes back to the land price', down.status === 200 && down.data.exterior.crown === 'dish' && down.data.value === lot.price, JSON.stringify(down.data?.value));

  // ---- the history counts owners, not payments; the "changed hands" version does not move for an upgrade or a renewal
  const hist = (await call('GET', `/plots/${lot.id}/history`)).data;
  check('an outside upgrade is not another owner in the history', hist.owners === 1 && hist.events.filter((e) => e.kind !== 'open').length === 1 && hist.events[0].title === 'Amy Coffee' && hist.events[0].now, JSON.stringify(hist));
  check('nor does it change hands for an inquiry', (await version(lot.id)) === v0);

  // ---- once the lease has ended the outside cannot be built onto until it is renewed
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'grace' } });
  const ended = await call('POST', `/plots/${lot.id}/exterior`, { token: amy.token, body: { exterior: spire } });
  check('an ended lease cannot be built onto (403 lease_ended)', ended.status === 403 && ended.data.code === 'lease_ended', JSON.stringify(ended.data));
  const renewed = await call('POST', `/plots/${lot.id}/renew`, { token: amy.token, body: {} });
  check('renewing without a term keeps the one it had', renewed.status === 200 && renewed.data.plot.lease.days === 30);
  check('a renewal is not another owner either, and does not change hands', (await call('GET', `/plots/${lot.id}/history`)).data.owners === 1 && (await version(lot.id)) === v0 && ledger(lot.id, 'renew').length === 1);
  check('after renewing the outside can be built onto again', (await call('POST', `/plots/${lot.id}/exterior`, { token: amy.token, body: { exterior: spire } })).status === 200);
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
  check('in the renewal window it still can', (await call('POST', `/plots/${lot.id}/exterior`, { token: amy.token, body: { exterior: { ...spire, crown: 'dome' } } })).status === 200);

  // ---- a lease from before the terms changed (90, 182 or 365 days) renews for 30 days
  const old = await call('POST', `/plots/${prime.id}/claim`, { token: bob.token, body: { ...biz, title: 'Bob Old', leaseDays: 14 } });
  api.db.prepare('UPDATE plots SET lease_days = 365 WHERE id = ?').run(prime.id);
  await call('POST', `/admin/plots/${prime.id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
  const legacy = await plot(prime.id);
  check('an old year\'s lease is shown with the 30-day renewal price', old.status === 200 && legacy.lease.days === 365 && legacy.lease.renewPrice === renewalQuote(legacy, 30).total, JSON.stringify(legacy.lease));
  const r365 = await call('POST', `/plots/${prime.id}/renew`, { token: bob.token, body: {} });
  check('renewing it without a term gives 30 days, at the 30-day price', r365.status === 200 && r365.data.plot.lease.days === 30 && r365.data.paid === legacy.lease.renewPrice, JSON.stringify(r365.data?.plot?.lease));
  await call('POST', `/admin/plots/${prime.id}/lease`, { token: ADMIN, body: { state: 'renewal' } });
  check('a 365-day renewal is refused now', (await call('POST', `/plots/${prime.id}/renew`, { token: bob.token, body: { leaseDays: 365 } })).data.code === 'bad_term');

  // ---- a take-over changes hands: the version moves and the history has a second owner
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: ADMIN, body: { state: 'open' } });
  const taken = await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Coffee' } });
  check('a take-over changes hands', taken.status === 200 && (await version(lot.id)) > v0 && (await call('GET', `/plots/${lot.id}/history`)).data.owners === 2, JSON.stringify(taken.data).slice(0, 120));
} catch (e) {
  fails++;
  console.log('FAIL', e.stack);
} finally {
  await api.close?.();
  api.server.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
