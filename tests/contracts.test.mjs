// The cross-boundary contracts of packages/shared-types (docs/architecture/adr/0001-shared-package-boundaries.md), checked against the real
// API: a profile event, a purchase report from the business's server, the owner's figures and the weekly vote. If the server's answers or
// its own lists drift from a contract, this fails; change the contract (and its version, see the package's CHANGELOG.md) on purpose.
import { createApi } from '../server/api/server.mjs';
import { imp } from '../scripts/lib-loader.mjs';
import * as types from '@voxelventure/shared-types';
import { SOURCES, EVENT_KINDS } from '../server/api/business.mjs';

const { check: fits, validate, CONTRACTS } = types;
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const holds = (name, contract, value) => {
  const r = fits(contract, value);
  check(`${name} fits ${contract.id} v${contract.version}`, r.ok, r.ok ? '' : `${r.errors.slice(0, 4).join('; ')} in ${JSON.stringify(value).slice(0, 300)}`);
};

// ---- the validator itself
const shape = { type: 'object', required: ['n'], additionalProperties: false, properties: { n: { type: 'integer', minimum: 1 }, s: { type: ['string', 'null'], pattern: '^a' }, l: { type: 'array', maxItems: 1, items: { enum: ['x'] } } } };
check('a value that fits has no errors', validate(shape, { n: 2, s: null, l: ['x'] }).length === 0);
check('every problem is named by its path', JSON.stringify(validate(shape, { n: 1.5, s: 'b', l: ['x', 'y'], extra: 1 })) === JSON.stringify(['$.n: expected integer, got number', '$.s: does not match ^a', '$.l: more than 1 items', '$.l[1]: "y" is not one of x', '$.extra: not allowed']), JSON.stringify(validate(shape, { n: 1.5, s: 'b', l: ['x', 'y'], extra: 1 })));
check('a missing field and a wrong type are errors', validate(shape, {}).includes('$.n: missing') && validate(shape, []).length === 1);
check('NaN is not a number', validate({ type: 'number' }, NaN).length === 1);

// ---- every contract is well formed: an id, a whole version and a schema of plain JSON (so other languages can read it)
for (const c of Object.values(CONTRACTS)) check(`${c.id} has a version and survives JSON`, Number.isInteger(c.version) && c.version >= 1 && JSON.stringify(JSON.parse(JSON.stringify(c.schema))) === JSON.stringify(c.schema));
check('contract ids are unique', Object.keys(CONTRACTS).length === 15);

// ---- the shared values are the ones the server and the funnel use
import { OUTCOMES } from '@voxelventure/analytics';
check('traffic sources are the server\'s', JSON.stringify(types.TRAFFIC_SOURCES) === JSON.stringify(SOURCES));
check('profile event kinds are the server\'s', JSON.stringify(types.PROFILE_EVENT_KINDS) === JSON.stringify(EVENT_KINDS));
check('outcome families are the funnel\'s', JSON.stringify(types.OUTCOME_FAMILIES) === JSON.stringify(OUTCOMES.map((o) => o.id)));

// ---- the live API
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: 'admin', REFERRAL_SECRET: 'contract-secret', HUMAN_MIN_AGE_MS: '0' } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { token, body } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 test', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
try {
  const bob = (await call('POST', '/auth/signup', { body: { username: 'Bob', password: 'longenough1' } })).data;
  const cat = (await call('POST', '/auth/signup', { body: { username: 'Cat', password: 'longenough1' } })).data;
  await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Builds', category: 'services', website: 'https://bob.test', cta: { kind: 'order', url: 'https://bob.test/shop' } } });

  // a profile event: what the page sends, and what comes back
  const view = { kind: 'view', visitor: 'contract-visitor', source: 'social', campaign: 'spring' };
  const press = { kind: 'cta', visitor: 'contract-visitor', clickId: 'ContractClick01' };
  holds('a page view', types.PROFILE_EVENT, view);
  holds('a press of the button', types.PROFILE_EVENT, press);
  holds('the answer to a view', types.PROFILE_EVENT_RESULT, (await call('POST', '/businesses/bob-builds/events', { body: view })).data);
  holds('the answer to a press', types.PROFILE_EVENT_RESULT, (await call('POST', '/businesses/bob-builds/events', { body: press })).data);
  check('an event the contract refuses, the server refuses too', !fits(types.PROFILE_EVENT, { kind: 'purchase', visitor: 'contract-visitor' }).ok && (await call('POST', '/businesses/bob-builds/events', { body: { kind: 'purchase', visitor: 'contract-visitor' } })).status === 400);

  // a purchase report from the business's own server
  const { key } = (await call('POST', '/businesses/bob-builds/tracking/key', { token: bob.token })).data;
  const sale = { business: 'bob-builds', click: 'ContractClick01', value: 4500, order: 'C-1' };
  holds('a purchase report', types.PURCHASE_REPORT, sale);
  const first = (await call('POST', '/conversions', { token: key, body: sale })).data;
  holds('a recorded purchase', types.PURCHASE_REPORT_RESULT, first);
  holds('the same order again', types.PURCHASE_REPORT_RESULT, (await call('POST', '/conversions', { token: key, body: sale })).data);
  check('the sale is credited to the press', first.recorded === true && first.attributed === true);
  check('a key in the body is outside the contract, and the server refuses it', !fits(types.PURCHASE_REPORT, { ...sale, key }).ok && (await call('POST', '/conversions', { body: { ...sale, key, order: 'C-2' } })).data?.code === 'key_in_body');

  // the owner's figures
  const stats = (await call('GET', '/me/businesses', { token: bob.token })).data.profiles.find((p) => p.profile.slug === 'bob-builds').stats;
  holds('the owner\'s figures', types.OWNER_FIGURES, stats);
  check('they count what happened', stats.views === 1 && stats.ctaClicks === 1 && stats.outcomes.find((o) => o.id === 'purchases').count === 1 && stats.revenue.verifiedCents === 4500, JSON.stringify(stats).slice(0, 300));

  // a coupon in Bob's 3D storefront: claimed by a visitor, redeemed at the till
  const { generateCity: city } = await imp('city/cityGenerator.js');
  const lot = city(20260101).plots.find((pl) => !pl.owner && pl.districtId !== 'suburb');
  await call('POST', `/plots/${lot.id}/claim`, { token: bob.token, body: { title: 'Bob Builds', buildingType: 'shop', website: 'https://bob.test', logo: { kind: 'generated' } } });
  await call('PUT', `/plots/${lot.id}/storefront`, { token: bob.token, body: { couponText: '10% off', couponCode: 'BOB-10', couponTotal: 5 } });
  const claim = { visitor: 'coupon-visitor' };
  holds('a coupon claim', types.COUPON_CLAIM, claim);
  const claimed = (await call('POST', `/plots/${lot.id}/coupon`, { body: claim })).data;
  holds('the claimed coupon', types.COUPON_CLAIM_RESULT, claimed);
  holds('claiming it again', types.COUPON_CLAIM_RESULT, (await call('POST', `/plots/${lot.id}/coupon`, { body: claim })).data);
  holds('a redemption', types.COUPON_REDEEM, { ticket: claimed.ticket });
  holds('the redeemed coupon', types.COUPON_REDEEM_RESULT, (await call('POST', `/plots/${lot.id}/coupon/redeem`, { token: bob.token, body: { ticket: claimed.ticket } })).data);
  check('a ticket the contract refuses, the server refuses too', !fits(types.COUPON_REDEEM, { ticket: 'no!' }).ok && (await call('POST', `/plots/${lot.id}/coupon/redeem`, { token: bob.token, body: { ticket: 'no!' } })).status === 400);

  // the pixel: its query, and that a key in it is outside the contract
  const pixel = { business: 'bob-builds', click: 'ContractClick01', value: '1200', order: 'P-1' };
  holds('a pixel report', types.PURCHASE_PIXEL, pixel);
  const gif = await fetch(`${base}/conversions/pixel.gif?${new URLSearchParams(pixel)}`);
  check('the pixel answers an image', gif.status === 200 && (gif.headers.get('content-type') ?? '').startsWith('image/gif'));
  check('a pixel with a key is outside the contract (the pixel never needs one)', !fits(types.PURCHASE_PIXEL, { ...pixel, key: 'vvck_x' }).ok);

  // a quote request from a profile's form
  await call('POST', '/businesses', { token: cat.token, body: { name: 'Cat Quotes', category: 'services', cta: { kind: 'quote' } } });
  await call('POST', '/businesses/cat-quotes/events', { body: { kind: 'view', visitor: 'quote-visitor' } });
  const quote = { kind: 'quote', name: 'Dee', email: 'dee@example.test', message: 'Forty coffees on Friday', visitor: 'quote-visitor', website: '' };
  holds('a quote request', types.INQUIRY, quote);
  holds('the answer to it', types.INQUIRY_RESULT, (await call('POST', '/businesses/cat-quotes/inquiries', { body: quote })).data);
  check('a request the contract refuses (no email), the server refuses too', !fits(types.INQUIRY, { ...quote, email: undefined }).ok && (await call('POST', '/businesses/cat-quotes/inquiries', { body: { ...quote, email: 'nope' } })).status === 400);

  // the pilot: the merchant's check-in and the admin's dashboard
  await call('POST', '/admin/pilot/members', { token: 'admin', body: { slug: 'bob-builds' } });
  const answers = { rating: 4, wouldPay: 'maybe', result: 'One order from the city', missing: 'Opening hours' };
  holds('a pilot check-in', types.PILOT_FEEDBACK, answers);
  check('the server takes it', (await call('POST', '/businesses/bob-builds/pilot-feedback', { token: bob.token, body: answers })).status === 200);
  check('a check-in the contract refuses, the server refuses too', !fits(types.PILOT_FEEDBACK, { rating: 6, wouldPay: 'yes' }).ok && (await call('POST', '/businesses/bob-builds/pilot-feedback', { token: bob.token, body: { rating: 6, wouldPay: 'yes' } })).status === 400);
  holds('the pilot dashboard', types.PILOT_SUMMARY, (await call('GET', '/admin/pilot', { token: 'admin' })).data);

  // the weekly vote, signed out and signed in, before and after a vote
  holds('the vote signed out', types.WEEKLY_VOTE, (await call('GET', '/votes')).data);
  holds('the vote signed in', types.WEEKLY_VOTE, (await call('GET', '/votes', { token: cat.token })).data);
  const { generateCity } = await imp('city/cityGenerator.js');
  const plots = (await call('GET', '/plots')).data;
  const built = (Array.isArray(plots) ? plots : plots?.plots ?? generateCity(20260101).plots).filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2 && !p.admin);
  const voted = await call('POST', '/vote', { token: cat.token, body: { plotId: built[0]?.id } });
  check('a vote can be cast', voted.status === 200, JSON.stringify(voted.data));
  holds('the answer to a vote', types.WEEKLY_VOTE, voted.data);
  holds('the vote with a leader', types.WEEKLY_VOTE, (await call('GET', '/votes')).data);
} catch (err) {
  fails++;
  console.log('FAIL', err.stack);
} finally {
  api.close?.();
  api.server.close();
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall contract checks passed');
process.exit(fails ? 1 : 0);
