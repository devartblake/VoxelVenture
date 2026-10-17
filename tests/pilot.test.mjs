// The pilot dashboard (server/api/pilot.mjs, packages/analytics/src/pilot.js, docs/monetization/pilot.md): members, the owner's weekly
// return, the weekly figures, payments and renewals, the merchant's weekly feedback, and the criteria that lift the world freeze.
import { createApi } from '../server/api/server.mjs';
import { imp } from '../scripts/lib-loader.mjs';
import { PILOT_CRITERIA, pilotVerdict, returnedWeekly, hadInteraction } from '@voxelventure/analytics';
import fs from 'node:fs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const DAY = 86400000;

// ---- the rules
check('returning weekly means at least 3 of every 4 completed weeks', returnedWeekly(3, 4) && !returnedWeekly(2, 4) && returnedWeekly(1, 1) && !returnedWeekly(0, 0) && returnedWeekly(2, 2) && !returnedWeekly(1, 2));
check('an interaction is a verified press or a lead', hadInteraction({ ctaClicks: 1 }) && hadInteraction({ leads: 2 }) && !hadInteraction({ views: 50 }));
const ten = (over) => Array.from({ length: 10 }, (_, i) => ({ returnedWeekly: i < 3, interaction: i < 2, paid: i < 3, renewed: i < 2, ...over?.(i) }));
const v = pilotVerdict(ten());
check('ten businesses at exactly the thresholds lift the freeze', v.lifts && v.met === PILOT_CRITERIA.length, JSON.stringify(v.criteria.map((c) => [c.id, c.actual, c.met])));
check('one fewer payer and it does not', !pilotVerdict(ten((i) => ({ paid: i < 2 }))).lifts && pilotVerdict(ten((i) => ({ paid: i < 2 }))).criteria.find((c) => c.id === 'paying').met === false);
check('simulated figures shown to an owner fail the pilot', !pilotVerdict(ten(), { simulatedShown: true }).lifts);
check('an empty pilot meets nothing but the flag', pilotVerdict([]).met === 1 && !pilotVerdict([]).lifts);
const freeze = fs.readFileSync(new URL('../docs/roadmap/world_freeze.md', import.meta.url), 'utf8');
check('the criteria are the ones world_freeze.md lists', /At least 30% of participating businesses return weekly/.test(freeze) && /At least 20% receive a meaningful CTA interaction/.test(freeze) && /At least three businesses pay/.test(freeze) && /At least two renew/.test(freeze) && PILOT_CRITERIA.find((c) => c.id === 'returning').target === 0.3 && PILOT_CRITERIA.find((c) => c.id === 'interaction').target === 0.2 && PILOT_CRITERIA.find((c) => c.id === 'paying').target === 3 && PILOT_CRITERIA.find((c) => c.id === 'renewing').target === 2);

// ---- the API
const ADMIN = 'pilot-admin';
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: ADMIN, REFERRAL_SECRET: 'pilot-secret' } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { token, body } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 test', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, type, data: type.includes('json') ? await res.json() : await res.text() };
};
const { weekStartOf, addWeeks } = await imp('market/weeks.js');
const db = api.db;
try {
  const signup = async (u) => (await call('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
  const amy = await signup('Amy');
  const bob = await signup('Bob');
  const desc = 'Fresh bread and coffee every morning, baked on the premises since 1998.';
  await call('POST', '/businesses', { token: amy.token, body: { name: 'Amy Bakery', category: 'food', district: 'bazaar', description: desc, website: 'https://amy.test', cta: { kind: 'website', url: 'https://amy.test' } } });
  await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Bikes', category: 'retail', cta: { kind: 'website', url: 'https://bob.test' } } });
  const id = (slug) => db.prepare('SELECT id FROM businesses WHERE slug = ?').get(slug).id;

  check('only the admin sees the pilot', (await call('GET', '/admin/pilot')).status === 403 && (await call('GET', '/admin/pilot', { token: amy.token })).status === 403);
  const empty = (await call('GET', '/admin/pilot', { token: ADMIN })).data;
  check('before anyone joins: no businesses, four weeks ending this week', empty.businesses.length === 0 && empty.weeks.length === 4 && empty.weeks[3] === weekStartOf() && !empty.verdict.lifts);
  check('?all=1 previews every published business', (await call('GET', '/admin/pilot?all=1', { token: ADMIN })).data.businesses.length === 2);

  check('a business that is not there cannot join', (await call('POST', '/admin/pilot/members', { token: ADMIN, body: { slug: 'nobody' } })).status === 404);
  check('the admin adds businesses to the pilot', (await call('POST', '/admin/pilot/members', { token: ADMIN, body: { slug: 'amy-bakery', note: 'met at the market' } })).data.member === true && (await call('POST', '/admin/pilot/members', { token: ADMIN, body: { slug: 'bob-bikes' } })).status === 200);
  check('each change is in the audit trail', db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'pilot.add'").get().n === 2);
  // they joined three weeks ago: three completed weeks and this one
  const joined = Date.parse(`${addWeeks(weekStartOf(), -3)}T09:00:00Z`);
  db.prepare('UPDATE pilot_members SET joined_at = ?').run(joined);

  // Amy came back in each of the three completed weeks (and this one: loading the dashboard counts), Bob in one
  for (const w of [-3, -2, -1]) db.prepare('INSERT INTO owner_activity (business_id, week, first_at) VALUES (?, ?, ?)').run(id('amy-bakery'), addWeeks(weekStartOf(), w), joined);
  db.prepare('INSERT INTO owner_activity (business_id, week, first_at) VALUES (?, ?, ?)').run(id('bob-bikes'), addWeeks(weekStartOf(), -3), joined);
  const mine = (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0];
  check('the owner\'s dashboard says the profile is in the pilot, with no feedback yet this week', mine.pilot?.week === weekStartOf() && mine.pilot.feedback === null, JSON.stringify(mine.pilot));
  check('and loading it marks this week as one the owner came back in', db.prepare('SELECT COUNT(*) AS n FROM owner_activity WHERE business_id = ? AND week = ?').get(id('amy-bakery'), weekStartOf()).n === 1);
  check('a business outside the pilot has no pilot box', (await call('GET', '/me/businesses', { token: bob.token })).data.profiles[0].pilot !== null); // Bob is a member too
  await call('DELETE', '/admin/pilot/members/bob-bikes', { token: ADMIN });
  check('taken out of the pilot, the box goes', (await call('GET', '/me/businesses', { token: bob.token })).data.profiles[0].pilot === null);
  check('and taking out again is refused', (await call('DELETE', '/admin/pilot/members/bob-bikes', { token: ADMIN })).status === 404);
  await call('POST', '/admin/pilot/members', { token: ADMIN, body: { slug: 'bob-bikes' } });

  // what visitors did: Amy got views and a verified press two weeks ago; Bob only views
  const lastWeek = Date.parse(`${addWeeks(weekStartOf(), -2)}T12:00:00Z`);
  const ev = db.prepare('INSERT INTO business_events (business_id, kind, source, visitor, verified, at) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 5; i++) ev.run(id('amy-bakery'), 'view', 'search', `v${i}`, 1, lastWeek + i);
  ev.run(id('amy-bakery'), 'cta', 'search', 'v1', 1, lastWeek + 10);
  ev.run(id('amy-bakery'), 'cta', 'search', 'bot', 0, lastWeek + 11); // not verified: never counted
  for (let i = 0; i < 3; i++) ev.run(id('bob-bikes'), 'view', 'direct', `w${i}`, 1, lastWeek + i);
  // Amy paid for the Launch Pack, then Pro, which renewed once
  const ord = db.prepare("INSERT INTO orders (account_id, business_id, product, cents, status, created_at, paid_at, renewals) VALUES (?, ?, ?, ?, 'paid', ?, ?, ?)");
  ord.run(amy.account.id, id('amy-bakery'), 'launch', 900, lastWeek, lastWeek, 0);
  ord.run(amy.account.id, id('amy-bakery'), 'pro', 1900, lastWeek + DAY, lastWeek + DAY, 1);

  const s = (await call('GET', '/admin/pilot', { token: ADMIN })).data;
  const a = s.businesses.find((b) => b.slug === 'amy-bakery');
  const b = s.businesses.find((x) => x.slug === 'bob-bikes');
  check('both are in the pilot, with the admin\'s note', s.businesses.length === 2 && a.note === 'met at the market' && a.member);
  check('a complete profile is activated; one without a description or district is not', a.activated && !b.activated && b.stepsDone < b.stepsTotal, `${a.stepsDone}/${a.stepsTotal} ${b.stepsDone}/${b.stepsTotal}`);
  const wk = a.weekly.find((w) => w.week === addWeeks(weekStartOf(), -2));
  check('the week\'s figures are verified only', wk.views === 5 && wk.ctaClicks === 1 && a.totals.ctaClicks === 1, JSON.stringify(wk));
  check('retention counts the completed weeks the owner came back in', a.retention.activeWeeks === 3 && a.retention.completedWeeks === 3 && a.returnedWeekly && b.retention.activeWeeks === 1 && !b.returnedWeekly, JSON.stringify([a.retention, b.retention]));
  check('a press is a meaningful interaction; views alone are not', a.interaction && !b.interaction);
  check('payments and renewals', a.paid && a.paidCents === 2800 && a.orders === 2 && a.renewed && !b.paid && !b.renewed);
  const crit = Object.fromEntries(s.verdict.criteria.map((c) => [c.id, c]));
  check('the verdict: half return, half interact, one payer, one renewer', crit.returning.actual === 0.5 && crit.returning.met && crit.interaction.met && crit.paying.actual === 1 && !crit.paying.met && crit.renewing.actual === 1 && !crit.renewing.met && crit.verifiedOnly.met && !s.verdict.lifts);
  check('the totals add the businesses up', s.totals.views === 8 && s.totals.activated === 1 && s.totals.paidCents === 2800);

  // the merchant's weekly feedback
  check('feedback needs a rating and an answer about paying, each named', JSON.stringify(Object.keys((await call('POST', '/businesses/amy-bakery/pilot-feedback', { token: amy.token, body: { rating: 9 } })).data.errors ?? {}).sort()) === '["rating","wouldPay"]');
  check('only the owner can send it', (await call('POST', '/businesses/amy-bakery/pilot-feedback', { token: bob.token, body: { rating: 4, wouldPay: 'yes' } })).status === 403);
  const sent = await call('POST', '/businesses/amy-bakery/pilot-feedback', { token: amy.token, body: { rating: 4, wouldPay: 'maybe', result: 'Two people came in from search', missing: 'Opening hours on the page' } });
  check('the owner sends this week\'s feedback', sent.status === 200 && sent.data.week === weekStartOf());
  await call('POST', '/businesses/amy-bakery/pilot-feedback', { token: amy.token, body: { rating: 5, wouldPay: 'yes', result: 'A catering order' } });
  check('sending again the same week replaces it', db.prepare('SELECT COUNT(*) AS n FROM pilot_feedback').get().n === 1 && (await call('GET', '/me/businesses', { token: amy.token })).data.profiles[0].pilot.feedback.rating === 5);
  await call('DELETE', '/admin/pilot/members/bob-bikes', { token: ADMIN });
  check('a business outside the pilot cannot send any', (await call('POST', '/businesses/bob-bikes/pilot-feedback', { token: bob.token, body: { rating: 4, wouldPay: 'yes' } })).data.code === 'not_member');
  const after = (await call('GET', '/admin/pilot', { token: ADMIN })).data;
  check('the dashboard lists the feedback and its average', after.businesses[0].feedback[0].result === 'A catering order' && after.totals.averageRating === 5 && after.totals.feedback === 1);
  check('a business taken out leaves the figures', after.businesses.length === 1);
  check('a link in the feedback is screened like other text', (await call('POST', '/businesses/amy-bakery/pilot-feedback', { token: amy.token, body: { rating: 3, wouldPay: 'no', missing: 'cheap pills at https://spam.test' } })).status >= 400);

  const csv = await call('GET', '/admin/pilot.csv?weeks=2', { token: ADMIN });
  const lines = csv.data.trim().split('\n');
  check('the spreadsheet has a line per business per week', csv.type.startsWith('text/csv') && lines[0].startsWith('business,name,week,in_pilot,owner_active,views') && lines.length === 1 + 2, lines.join(' | '));
  check('the number of weeks can be chosen (1 to 12)', (await call('GET', '/admin/pilot?weeks=99', { token: ADMIN })).data.weeks.length === 12 && (await call('GET', '/admin/pilot?weeks=1', { token: ADMIN })).data.weeks.length === 1);
} catch (err) {
  fails++;
  console.log('FAIL', err.stack);
} finally {
  api.close?.();
  api.server.close();
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall pilot checks passed');
process.exit(fails ? 1 : 0);
