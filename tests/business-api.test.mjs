// Free business profiles on the API (services/api/business.mjs): creating and editing, the public list and filters, verified profile events,
// referral attribution, newsletter sign-ups, upgrade interest and moderation. Starts its own server on a free port.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { root, sleep } from './helpers.mjs';

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const port = await free();
const proc = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { cwd: root, env: { ...process.env, API_PORT: String(port), API_DB: ':memory:', ADMIN_TOKEN: 'admin-secret', REFERRAL_SECRET: 'test-secret', PROFILE_VIEW_CAP: '2' }, stdio: 'ignore' });
const base = `http://localhost:${port}`;
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const call = async (method, p, { token, body, ua } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(ua ? { 'User-Agent': ua } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const signup = async (username, extra = {}) => (await call('POST', '/auth/signup', { body: { username, password: 'longenough1', ...extra } })).data;

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { /* starting */ } await sleep(250); }
  const amy = await signup('Amy');
  const bob = await signup('Bob');

  // ---- creating
  const cafe = { name: "Amy's Café & Bar", category: 'food', district: 'creator', tagline: 'Coffee by the river', description: 'Fresh coffee, pastries and a quiet corner to work in, all day.', website: 'https://amy.test' };
  check('a profile needs an account', (await call('POST', '/businesses', { body: cafe })).status === 401);
  const bad = await call('POST', '/businesses', { token: amy.token, body: { ...cafe, category: 'casino', website: 'javascript:alert(1)' } });
  check('a bad category or website is refused, with each field named', bad.status === 400 && bad.data.code === 'bad_profile' && bad.data.errors.category && bad.data.errors.website);
  const made = await call('POST', '/businesses', { token: amy.token, body: cafe });
  check('a free profile gets a readable slug and a website call to action', made.status === 200 && made.data.slug === 'amys-cafe-bar' && made.data.cta.kind === 'website' && made.data.cta.url === 'https://amy.test', JSON.stringify(made.data));
  const twin = await call('POST', '/businesses', { token: bob.token, body: { ...cafe, website: undefined } });
  check('the same name gets the next free slug; no website means a newsletter call to action', twin.data.slug === 'amys-cafe-bar-2' && twin.data.cta.kind === 'newsletter');
  check('screened text: a blocked word is refused', (await call('POST', '/businesses', { token: bob.token, body: { ...cafe, name: 'Buy cheap viagra now' } })).status === 422);
  const booking = await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Builds', category: 'services', cta: { kind: 'booking', url: 'https://cal.test/bob' } } });
  check('a booking call to action keeps its link and label', booking.data.cta.kind === 'booking' && booking.data.cta.url === 'https://cal.test/bob' && booking.data.cta.label === 'Book a meeting');
  check('a booking call to action without a link is refused', (await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Two', category: 'services', cta: { kind: 'booking' } } })).status === 400);

  // ---- reading and listing
  check('a profile by slug; an unknown or malformed one is 404', (await call('GET', '/businesses/amys-cafe-bar')).data.name === "Amy's Café & Bar" && (await call('GET', '/businesses/nope')).status === 404 && (await call('GET', '/businesses/BAD_slug')).status === 404);
  const all = (await call('GET', '/businesses')).data;
  check('the public list has every profile, newest first', all.total === 3 && all.profiles[0].slug === 'bob-builds');
  check('filter by category and district', (await call('GET', '/businesses?category=food')).data.total === 2 && (await call('GET', '/businesses?district=creator')).data.total === 2 && (await call('GET', '/businesses?category=services&district=creator')).data.total === 0);
  check('search by words (a % is not a wildcard)', (await call('GET', '/businesses?q=pastries')).data.total === 2 && (await call('GET', '/businesses?q=%25')).data.total === 0);
  check('the sitemap lists every slug', (await call('GET', '/businesses/sitemap')).data.entries.length === 3);

  // ---- editing
  check('only the owner can edit', (await call('PATCH', '/businesses/amys-cafe-bar', { token: bob.token, body: { tagline: 'x' } })).status === 403);
  const edited = await call('PATCH', '/businesses/amys-cafe-bar', { token: amy.token, body: { tagline: 'Now with cake', cta: { kind: 'order', url: 'https://amy.test/order' } } });
  check('the owner edits; the slug stays', edited.data.slug === 'amys-cafe-bar' && edited.data.tagline === 'Now with cake' && edited.data.cta.kind === 'order' && edited.data.name === "Amy's Café & Bar");

  // ---- linking a building
  const empty = (await call('GET', '/plots/state')).data.plots.find((p) => !p.owner);
  const claimed = await call('POST', `/plots/${empty.id}/claim`, { token: amy.token, body: { title: 'Amy Cafe', buildingType: 'restaurant', website: 'https://amy.test', variant: 'cafe', logo: { kind: 'generated' } } });
  check('(a plot claimed for the next checks)', claimed.status === 200, JSON.stringify(claimed.data).slice(0, 80));
  check("you cannot link someone else's building", (await call('PUT', `/businesses/bob-builds/plot`, { token: bob.token, body: { plotId: empty.id } })).status === 403);
  check('the owner links her building', (await call('PUT', '/businesses/amys-cafe-bar/plot', { token: amy.token, body: { plotId: empty.id } })).data.plotId === empty.id);

  // ---- referral codes and verified events
  const ref = (await call('GET', '/me/referrals', { token: bob.token })).data;
  check('every account has a random referral code that does not show its account', /^r[0-9a-f]{12}$/.test(ref.code) && ref.visits === 0 && (await call('GET', '/me/referrals', { token: bob.token })).data.code === ref.code);
  const forged = 'r000000000000';
  const view = (visitor, extra = {}, opts = {}) => call('POST', '/businesses/amys-cafe-bar/events', { body: { kind: 'view', visitor, ...extra }, ...opts });
  check('a view through a referral link is verified and credited', (await view('visitor-one', { ref: ref.code, source: 'social' })).data.verified === true);
  check('a repeat within a minute is one view', (await view('visitor-one', { ref: ref.code })).data.counted === false);
  check('a bot is recorded but not counted', (await view('visitor-bot', {}, { ua: 'Googlebot/2.1' })).data.verified === false);
  check('a malformed visitor id is not counted', (await view('x')).data.verified === false);
  check('a forged referral code is ignored, the view still counts', (await view('visitor-two', { ref: forged })).data.verified === true);
  check('the per-network daily cap (2 in this test) stops the third', (await view('visitor-three')).data.verified === false);
  check("the owner's own visit is not counted", (await call('POST', '/businesses/amys-cafe-bar/events', { token: amy.token, body: { kind: 'view', visitor: 'amy-device' } })).data.verified === false);
  check("a referrer's own visit is not credited to them", (await call('POST', '/businesses/bob-builds/events', { token: bob.token, body: { kind: 'view', visitor: 'bob-device', ref: ref.code } })).data.verified === false);
  const cta = (visitor) => call('POST', '/businesses/amys-cafe-bar/events', { body: { kind: 'cta', visitor, ref: ref.code } });
  check('a press without a view first is not counted', (await cta('visitor-never-viewed')).data.verified === false);
  check('a press after a view is', (await cta('visitor-one')).data.verified === true);
  check('a bad event kind is refused', (await call('POST', '/businesses/amys-cafe-bar/events', { body: { kind: 'purchase', visitor: 'visitor-one' } })).status === 400);

  // ---- campaigns (utm_campaign on the link): a Pro figure, so this profile gets complimentary Pro first (services/api/billing.mjs)
  check('campaign figures are Pro: the free plan does not see them', (await call('GET', '/me/businesses', { token: bob.token })).data.profiles.find((x) => x.profile.slug === 'amys-cafe-bar-2').stats.campaigns === undefined);
  check('only an admin can grant Pro', (await call('POST', '/admin/billing/grant/amys-cafe-bar-2', { token: bob.token, body: { product: 'pro' } })).status === 403);
  await call('POST', '/admin/billing/grant/amys-cafe-bar-2', { token: 'admin-secret', body: { product: 'pro', days: 30, reason: 'test' } });
  // ---- offers (Pro): one line at the top of the public page
  check('an offer needs Pro', (await call('PUT', '/businesses/amys-cafe-bar/offer', { token: amy.token, body: { text: '10% off' } })).status === 402);
  check('only the owner sets an offer', (await call('PUT', '/businesses/amys-cafe-bar-2/offer', { token: amy.token, body: { text: '10% off' } })).status === 403);
  check('an end date in the past or over 90 days away is refused', (await call('PUT', '/businesses/amys-cafe-bar-2/offer', { token: bob.token, body: { text: '10% off', until: '2020-01-01' } })).status === 400 && (await call('PUT', '/businesses/amys-cafe-bar-2/offer', { token: bob.token, body: { text: '10% off', until: new Date(Date.now() + 120 * 86400000).toISOString() } })).status === 400);
  const offerSet = await call('PUT', '/businesses/amys-cafe-bar-2/offer', { token: bob.token, body: { text: '10% off your first order with VOXEL', until: new Date(Date.now() + 7 * 86400000).toISOString() } });
  check('with Pro the offer is saved and shown on the public page', offerSet.status === 200 && (await call('GET', '/businesses/amys-cafe-bar-2')).data.offer?.text === '10% off your first order with VOXEL' && (await call('GET', '/businesses/amys-cafe-bar')).data.offer === null);
  check('an empty offer takes it off the page', (await call('PUT', '/businesses/amys-cafe-bar-2/offer', { token: bob.token, body: { text: '' } })).data.offer === null && (await call('GET', '/businesses/amys-cafe-bar-2')).data.offer === null);
  await call('PUT', '/businesses/amys-cafe-bar-2/offer', { token: bob.token, body: { text: 'Free delivery this week' } });
  // (on a profile nobody has viewed yet: this test's network has used its daily views on Amy's)
  await call('POST', '/businesses/amys-cafe-bar-2/events', { body: { kind: 'view', visitor: 'camp-visitor', campaign: 'Spring-Sale' } });
  await call('POST', '/businesses/amys-cafe-bar-2/events', { body: { kind: 'view', visitor: 'camp-visitor-2', campaign: '<script>' } });
  const camp = (await call('GET', '/me/businesses', { token: bob.token })).data.profiles.find((x) => x.profile.slug === 'amys-cafe-bar-2').stats.campaigns;
  check('a tagged campaign is counted under its (lower-cased) name; a malformed tag is no campaign', camp.length === 1 && camp[0].id === 'spring-sale' && camp[0].views === 1, JSON.stringify(camp));
  check('a linked building carries its profile address in the world state', (await call('GET', '/plots/state')).data.plots.find((p) => p.id === empty.id).profileSlug === 'amys-cafe-bar');

  // ---- sign-ups and profiles through a link
  const carol = await signup('Carol', { ref: ref.code });
  await signup('Dave', { ref: forged });
  await call('POST', '/businesses', { token: carol.token, body: { name: 'Carol Comics', category: 'creators', website: 'https://carol.test' } });
  const after = (await call('GET', '/me/referrals', { token: bob.token })).data;
  check("Bob's link: 1 verified view, 1 press, 1 sign-up (not the forged one), 1 new profile", after.visits === 1 && after.ctaClicks === 1 && after.signups === 1 && after.profiles === 1, JSON.stringify(after));

  // ---- the owner's page
  const mine = (await call('GET', '/me/businesses', { token: amy.token })).data;
  const cafeRow = mine.profiles.find((x) => x.profile.slug === 'amys-cafe-bar');
  check("the owner sees only verified figures, never simulated", cafeRow.stats.simulated === false && cafeRow.stats.views === 2 && cafeRow.stats.ctaClicks === 1 && cafeRow.stats.referralVisits === 1, JSON.stringify(cafeRow.stats).slice(0, 120));
  check('and her onboarding steps (all done, including the linked building)', cafeRow.ready && cafeRow.steps.every((s) => s.done));
  check('a complete profile with few views is offered the Launch Pack', cafeRow.prompts.map((p) => p.plan.id).join() === 'launch');
  check('asking for an upgrade is recorded once', (await call('POST', '/businesses/amys-cafe-bar/interest', { token: amy.token, body: { plan: 'launch' } })).data.requested && (await call('POST', '/businesses/amys-cafe-bar/interest', { token: amy.token, body: { plan: 'launch' } })).status === 200 && (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].prompts[0].requested === true);
  check('an unknown plan or not your profile is refused', (await call('POST', '/businesses/amys-cafe-bar/interest', { token: amy.token, body: { plan: 'gold' } })).status === 400 && (await call('POST', '/businesses/amys-cafe-bar/interest', { token: bob.token, body: { plan: 'pro' } })).status === 403);

  // ---- newsletter call to action
  check('a profile whose call to action is not a newsletter takes no sign-ups', (await call('POST', '/leads', { body: { targetKind: 'business', targetId: 'amys-cafe-bar', email: 'x@y.test' } })).status === 400);
  check('a newsletter profile takes a double opt-in sign-up', (await call('POST', '/leads', { body: { targetKind: 'business', targetId: 'amys-cafe-bar-2', email: 'fan@y.test' } })).data.status === 'pending');
  check('its owner sees the pending count; others cannot', (await call('GET', '/businesses/amys-cafe-bar-2/leads', { token: bob.token })).data.pending === 1 && (await call('GET', '/businesses/amys-cafe-bar-2/leads', { token: amy.token })).status === 403);

  const erin = await signup('Erin');
  const digits = (await call('POST', '/businesses', { token: erin.token, body: { name: '2024', category: 'other', cta: { kind: 'newsletter' } } })).data;
  check('a slug made only of digits is a slug like any other for sign-ups', digits.slug === '2024' && (await call('POST', '/leads', { body: { targetKind: 'business', targetId: '2024', email: 'n@y.test' } })).data.status === 'pending' && (await call('GET', '/businesses/2024/leads', { token: erin.token })).data.pending === 1);

  // ---- moderation
  check('a profile can be reported', (await call('POST', '/reports', { token: carol.token, body: { kind: 'business', id: 'bob-builds', reason: 'spam' } })).data.reported === true);
  const queue = (await call('GET', '/admin/reports', { token: 'admin-secret' })).data.reports;
  const item = queue.find((x) => x.kind === 'business');
  check('it shows in the admin queue with its text and owner', item && item.text.startsWith('Bob Builds') && item.author === 'Bob');
  const first = (await call('GET', '/admin/reports/ids?kind=business&id=bob-builds', { token: 'admin-secret' })).data.id;
  await call('POST', `/admin/reports/${first}/resolve`, { token: 'admin-secret', body: { action: 'remove' } });
  check('removing it takes the page and the listing down', (await call('GET', '/businesses/bob-builds')).status === 404 && !(await call('GET', '/businesses')).data.profiles.some((x) => x.slug === 'bob-builds'));
  check('the slug of a removed profile is not given to anyone else', (await call('POST', '/businesses', { token: carol.token, body: { name: 'Bob Builds', category: 'services', website: 'https://c.test' } })).data.slug === 'bob-builds-2');

  // ---- limits
  for (let i = 0; i < 4; i++) await call('POST', '/businesses', { token: carol.token, body: { name: `Carol ${i}`, category: 'other', website: 'https://c.test' } });
  check('an account can list five businesses', (await call('POST', '/businesses', { token: carol.token, body: { name: 'Carol six', category: 'other', website: 'https://c.test' } })).status === 409);
} catch (e) {
  fails++;
  console.log('FAIL threw', e);
} finally {
  proc.kill();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
