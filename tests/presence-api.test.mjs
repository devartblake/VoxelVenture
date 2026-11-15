// The API's side of presence-verified positions (services/api/presence.mjs, lib/game/taskRules.js, services/api/tasks.mjs; docs/architecture/presence_positions.md): the events the presence
// server sends are validated and stored once, kept ten days, and task goals about where an avatar was are checked against them; the anti-bot flags hold rewards back and an admin can clear one.
import fs from 'node:fs';
import path from 'node:path';
import { createApi } from '../services/api/server.mjs';
import * as presence from '../services/api/presence.mjs';
import { createTasks, loadCatalogue } from '../services/api/tasks.mjs';
import { imp, root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const SEED = 20260101;
const SITE = 'https://site.test';
const SECRET = 'mp-secret';
const { progressOf, supports, dayOf } = await imp('game/taskRules.js');
const { generateTown } = await imp('city/townExtension.js');
const { buildPlaceGeometry } = await imp('world/placeGeometry.js');
const geo = buildPlaceGeometry(generateTown(SEED));

const T = (id, cadence, tier, goal) => ({ id, cadence, category: 'TST', family: 'test', title: `Test ${id}`, text: id, tier, gold: { daily: { easy: 5, medium: 10, hard: 20 }, weekly: { easy: 30, medium: 60, hard: 120 } }[cadence][tier], goal, signal: 'needs-position', requires: [], seedBound: false });
const catalogue = { version: 1, seed: SEED, tasks: [
  T('D-TST-reachpk1', 'daily', 'easy', { type: 'reach', place: 'park', id: 'park' }),
  T('D-TST-distance', 'daily', 'medium', { type: 'distance', mode: 'walk', metres: 100 }),
  T('D-TST-zonedwel', 'daily', 'hard', { type: 'zone', zone: 'park', seconds: 60 }),
  T('W-TST-roadpass', 'weekly', 'easy', { type: 'road', road: 'Pixel Ln', mode: 'walk' }),
  T('W-TST-bein0001', 'weekly', 'medium', { type: 'be-in', district: 'bazaar' }),
  T('W-TST-loop0001', 'weekly', 'hard', { type: 'reach', place: 'park', id: 'park', loop: true }),
] };

const api = createApi({ dbFile: ':memory:', seed: SEED, taskCatalogue: catalogue, deliverEveryMs: 0, origin: SITE, rate: { perMinute: 100000, authPerMinute: 100000 }, env: { ADMIN_TOKEN: 'admin-machine-token', IP_SALT: 'salt', TRUST_PROXY: '1', MP_NOTIFY_SECRET: SECRET } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const db = api.db;
let ipN = 1;
const call = async (method, p, { body, token, secret } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Origin: SITE, 'X-Forwarded-For': `10.3.0.${ipN++ % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(secret ? { 'X-Internal-Secret': secret } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data };
};
const signup = async (name) => (await call('POST', '/auth/signup', { body: { username: name, password: 'longenough1' } })).data;
const ana = await signup('Ana');
const ben = await signup('Ben');
const A = ana.account.id, B = ben.account.id;
const now = Date.now();
const ev = (accountId, kind, ref, extra = {}) => ({ accountId, kind, ref, at: now - 1000, phase: 'day', mode: 'walk', ...extra });

// ---- ingestion
check('the presence routes are internal: no secret, no entry (403)', (await call('POST', '/internal/presence/events', { body: { events: [] } })).status === 403 && (await call('POST', '/internal/presence/summary', { body: {} })).status === 403);
const batch = [
  ev(A, 'in', 'place:park:park', { dwell: 0 }),
  ev(A, 'in', 'zone:park', { dwell: 70 }),
  ev(A, 'pass', 'road:Pixel Ln'),
  ev(A, 'loop', 'place:park:park'),
  ev(A, 'distance', 'walk', { metres: 120 }),
];
const bad = [
  ev(99999, 'in', 'zone:park'), // no such account
  ev(A, 'teleport', 'zone:park'), // not a kind
  ev(A, 'in', 'nonsense'), // not a ref
  ev(A, 'in', 'zone:park', { at: now - 3600000 }), // an hour old
  ev(A, 'in', 'zone:park', { at: now + 3600000 }), // from the future
  ev(A, 'in', 'zone:park', { phase: 'teatime' }),
  ev(A, 'distance', 'walk', { metres: 0 }), // nothing moved
  ev(A, 'distance', 'jetpack', { metres: 50 }),
];
const out = await call('POST', '/internal/presence/events', { secret: SECRET, body: { events: [...batch, ...bad] } });
check('a batch is stored, and what is not believable is refused, counted apart', out.status === 200 && out.data.accepted === batch.length && out.data.rejected === bad.length, JSON.stringify(out.data));
const before = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(metres), 0) AS m FROM presence_events').get();
await call('POST', '/internal/presence/events', { secret: SECRET, body: { events: batch } });
const after = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(metres), 0) AS m FROM presence_events').get();
check('the same batch sent again (a lost answer, a retry) changes nothing: not a second row, not 120 more metres', before.n === after.n && before.m === after.m, `${before.n} rows, ${before.m} m`);
const dwellUp = await call('POST', '/internal/presence/events', { secret: SECRET, body: { events: [ev(A, 'in', 'zone:park', { dwell: 310, at: now - 500 })] } });
check('an "in" event keeps one row per place, phase and ten minutes, with the longest dwell', dwellUp.data.accepted === 1 && db.prepare("SELECT COUNT(*) AS n, MAX(dwell) AS d FROM presence_events WHERE ref = 'zone:park' AND kind = 'in'").get().n === 1 && db.prepare("SELECT MAX(dwell) AS d FROM presence_events WHERE ref = 'zone:park'").get().d === 310);
await call('POST', '/internal/presence/events', { secret: SECRET, body: { events: [ev(A, 'in', 'zone:park', { phase: 'night', dwell: 5 })] } });
check('another time of day is another row', db.prepare("SELECT COUNT(*) AS n FROM presence_events WHERE ref = 'zone:park'").get().n === 2);
check('a distance is one row per event, however many there are', (await call('POST', '/internal/presence/events', { secret: SECRET, body: { events: [ev(A, 'distance', 'walk', { metres: 80, at: now - 20000 })] } })).data.accepted === 1 && db.prepare("SELECT SUM(metres) AS m FROM presence_events WHERE kind = 'distance'").get().m === 200);
check('a distance event is at most a thirty-second walk or drive (600 m): more is cut', (await call('POST', '/internal/presence/events', { secret: SECRET, body: { events: [ev(B, 'distance', 'car', { metres: 99999, mode: 'car' })] } })).data.accepted === 1 && db.prepare("SELECT metres FROM presence_events WHERE account_id = ?").get(B).metres === 600);
check('a batch is cut at 500 events', (await call('POST', '/internal/presence/events', { secret: SECRET, body: { events: Array.from({ length: 700 }, (_, i) => ev(B, 'distance', 'walk', { metres: 1 + (i % 9), at: now - 30000 - i * 1000, district: `d${i}` })) } })).data.accepted <= 500);
check('the events of one account in a window come back as the task rules read them', (() => { const rows = presence.eventsFor(db, A, now - 60000, now + 60000); return rows.some((r) => r.kind === 'in' && r.ref === 'place:park:park' && r.phase === 'day') && rows.every((r) => 'at' in r && 'district' in r); })());

// ---- retention: ten days
db.prepare("INSERT INTO presence_events (account_id, kind, ref, phase, bucket, mode, district, first_at, last_at, n, dwell, metres) VALUES (?, 'in', 'zone:old', '', 1, '', '', ?, ?, 1, 0, 0)").run(A, now - 11 * 86400000, now - 11 * 86400000);
db.prepare("INSERT INTO presence_events (account_id, kind, ref, phase, bucket, mode, district, first_at, last_at, n, dwell, metres) VALUES (?, 'in', 'zone:recent', '', 2, '', '', ?, ?, 1, 0, 0)").run(A, now - 9 * 86400000, now - 9 * 86400000);
check('a derived event is kept ten days (the policy says so) and then deleted', presence.EVENT_DAYS === 10 && presence.purge(db, now) === 1 && !db.prepare("SELECT 1 FROM presence_events WHERE ref = 'zone:old'").get() && Boolean(db.prepare("SELECT 1 FROM presence_events WHERE ref = 'zone:recent'").get()));

// ---- the rules: every goal shape the catalogue uses about where an avatar was
const D1 = Date.UTC(2026, 10, 16, 10), D2 = D1 + 86400000, D3 = D2 + 86400000;
const facts = (presenceList) => ({ presence: presenceList, placeIds: (k) => geo.placeIds(k), visits: [] });
const inn = (ref, at = D1, phase = 'day', extra = {}) => ({ kind: 'in', ref, phase, at, dwell: 0, metres: 0, mode: 'walk', district: '', ...extra });
const g = (goal, list) => progressOf(goal, facts(list));
check('be in a district: seen there, and at a time of day when that is asked', g({ type: 'be-in', district: 'bazaar' }, [inn('district:bazaar')]).done && !g({ type: 'be-in', district: 'bazaar' }, [inn('district:saas')]).done && g({ type: 'be-in', district: 'bazaar', phase: 'dusk' }, [inn('district:bazaar', D1, 'dusk')]).done && !g({ type: 'be-in', district: 'bazaar', phase: 'dusk' }, [inn('district:bazaar', D1, 'day')]).done);
check('be in a district at all four times of day, and in three districts at one time of day', g({ type: 'be-in', district: 'saas', phases: 4 }, ['dawn', 'day', 'dusk', 'night'].map((p) => inn('district:saas', D1, p))).done && !g({ type: 'be-in', district: 'saas', phases: 4 }, ['dawn', 'day'].map((p) => inn('district:saas', D1, p))).done && g({ type: 'be-in', districts: 3, phase: 'night' }, ['saas', 'bazaar', 'arcade'].map((d) => inn(`district:${d}`, D1, 'night'))).done && g({ type: 'be-in', districts: 3, phase: 'night' }, ['saas', 'bazaar'].map((d) => inn(`district:${d}`, D1, 'night'))).have === 2);
check('reach a place: here, at a time of day, on three different days, or all the way round it', g({ type: 'reach', place: 'park', id: 'park' }, [inn('place:park:park')]).done && g({ type: 'reach', place: 'park', id: 'park', phase: 'night' }, [inn('place:park:park', D1, 'night')]).done && !g({ type: 'reach', place: 'park', id: 'park', phase: 'night' }, [inn('place:park:park', D1, 'day')]).done
  && g({ type: 'reach', place: 'park', id: 'park', days: 3 }, [D1, D2, D3].map((d) => inn('place:park:park', d))).done && g({ type: 'reach', place: 'park', id: 'park', days: 3 }, [D1, D1 + 3600000, D2].map((d) => inn('place:park:park', d))).have === 2
  && g({ type: 'reach', place: 'park', id: 'park', loop: true }, [{ ...inn('place:park:park'), kind: 'loop' }]).done && !g({ type: 'reach', place: 'park', id: 'park', loop: true }, [inn('place:park:park')]).done);
const bridges = geo.placeIds('bridge');
check('reach two places (both, on one day), two bridges, every bridge, a park and a lake, one of each kind', g({ type: 'reach', both: true, ids: ['park', 'lake-1'] }, [inn('place:park:park'), inn('place:lake:lake-1')]).done && !g({ type: 'reach', both: true, ids: ['park', 'lake-1'] }, [inn('place:park:park')]).done
  && g({ type: 'reach', place: 'bridge', ids: bridges.slice(0, 2) }, bridges.slice(0, 2).map((b) => inn(`place:bridge:${b}`))).done
  && g({ type: 'reach', place: 'bridge', all: true }, bridges.map((b) => inn(`place:bridge:${b}`))).done && !g({ type: 'reach', place: 'bridge', all: true }, bridges.slice(1).map((b) => inn(`place:bridge:${b}`))).done
  && g({ type: 'reach', place: ['park', 'lake'], all: true }, [...geo.placeIds('park'), ...geo.placeIds('lake')].map((id, i) => inn(`place:${i < geo.placeIds('park').length ? 'park' : 'lake'}:${id}`))).done
  && g({ type: 'reach', place: ['park', 'lake'], oneOfEach: true }, [inn('place:park:park'), inn('place:lake:lake-1')]).done && !g({ type: 'reach', place: ['park', 'lake'], oneOfEach: true }, [inn('place:park:park')]).done);
check('a zone: in it, at a time of day, for a number of seconds', g({ type: 'zone', zone: 'park' }, [inn('zone:park')]).done && g({ type: 'zone', zone: 'jazz', phase: 'night' }, [inn('zone:jazz', D1, 'night')]).done && !g({ type: 'zone', zone: 'jazz', phase: 'night' }, [inn('zone:jazz', D1, 'day')]).done && g({ type: 'zone', zone: 'park', seconds: 60 }, [inn('zone:park', D1, 'day', { dwell: 75 })]).done && !g({ type: 'zone', zone: 'park', seconds: 60 }, [inn('zone:park', D1, 'day', { dwell: 20 })]).done);
check('five different zones', g({ type: 'zones', count: 5 }, ['park', 'jazz', 'arcade', 'office', 'water'].map((z) => inn(`zone:${z}`))).done && g({ type: 'zones', count: 5 }, ['park', 'park', 'jazz'].map((z) => inn(`zone:${z}`))).have === 2);
const dist = (metres, mode = 'walk', district = '', at = D1) => ({ kind: 'distance', ref: mode, phase: 'day', at, dwell: 0, metres, mode, district });
check('a distance: summed over the window, by how you travel (on foot, by car, by boat), and apart for a district', g({ type: 'distance', mode: 'walk', metres: 500 }, [dist(300), dist(250)]).done && g({ type: 'distance', mode: 'drive', metres: 400 }, [dist(500, 'car')]).done && !g({ type: 'distance', mode: 'drive', metres: 400 }, [dist(500, 'walk')]).done && g({ type: 'distance', mode: 'sail', metres: 300 }, [dist(300, 'boat')]).done
  && g({ type: 'distance', mode: 'walk', metres: 800, district: 'bazaar' }, [dist(500, 'walk', 'bazaar'), dist(400, 'walk', 'bazaar'), dist(9000, 'walk', 'saas')]).done && !g({ type: 'distance', mode: 'walk', metres: 800 }, [dist(500, 'walk', 'bazaar')]).done);
const pass = (road, mode = 'walk', at = D1, phase = 'day') => ({ kind: 'pass', ref: `road:${road}`, phase, at, dwell: 0, metres: 0, mode, district: '' });
check('walk or drive the length of a road, at a time of day, on three days, and two roads', g({ type: 'road', road: 'Pixel Ln', mode: 'walk' }, [pass('Pixel Ln')]).done && !g({ type: 'road', road: 'Pixel Ln', mode: 'walk' }, [pass('Pixel Ln', 'car')]).done && g({ type: 'road', road: 'Pixel Ln', mode: 'drive' }, [pass('Pixel Ln', 'car')]).done
  && g({ type: 'road', road: 'Pixel Ln', mode: 'walk', phase: 'night' }, [pass('Pixel Ln', 'walk', D1, 'night')]).done && !g({ type: 'road', road: 'Pixel Ln', mode: 'walk', phase: 'night' }, [pass('Pixel Ln')]).done
  && g({ type: 'road', road: 'Pixel Ln', mode: 'walk', days: 3 }, [D1, D2, D3].map((d) => pass('Pixel Ln', 'walk', d))).done && g({ type: 'road', roads: ['Pixel Ln', 'Cache St'], mode: 'walk' }, [pass('Pixel Ln'), pass('Cache St')]).done && g({ type: 'road', roads: ['Pixel Ln', 'Cache St'], mode: 'walk' }, [pass('Pixel Ln')]).have === 1);
check('from one end of the city to the other: both edges of an axis', g({ type: 'cross-city', axis: 'x' }, [inn('edge:west'), inn('edge:east')]).done && !g({ type: 'cross-city', axis: 'x' }, [inn('edge:west')]).done && g({ type: 'cross-city', axis: 'z' }, [inn('edge:north'), inn('edge:south')]).done);
check('walk from one district to another: seen in one, then in the other within two hours, walking both times', g({ type: 'travel', from: 'saas', to: 'bazaar', mode: 'walk' }, [inn('district:saas', D1), inn('district:bazaar', D1 + 3600000)]).done && !g({ type: 'travel', from: 'saas', to: 'bazaar', mode: 'walk' }, [inn('district:bazaar', D1), inn('district:saas', D1 + 3600000)]).done && !g({ type: 'travel', from: 'saas', to: 'bazaar', mode: 'walk' }, [inn('district:saas', D1), inn('district:bazaar', D1 + 3 * 3600000)]).done && !g({ type: 'travel', from: 'saas', to: 'bazaar', mode: 'walk' }, [inn('district:saas', D1, 'day', { mode: 'car' }), inn('district:bazaar', D1 + 600000, 'day', { mode: 'car' })]).done);
check('with no events from the presence server nothing is done (the page\'s word is not a source)', ['be-in', 'reach', 'zone', 'distance', 'road'].every((type) => !progressOf({ type, district: 'bazaar', place: 'park', id: 'park', zone: 'park', mode: 'walk', metres: 1, road: 'Pixel Ln' }, { visits: [], plot: () => null }).done));

// ---- the real catalogue
const real = loadCatalogue();
const presenceTypes = ['be-in', 'reach', 'zone', 'zones', 'distance', 'road', 'cross-city', 'travel'];
const wanted = real.tasks.filter((t) => presenceTypes.includes(t.goal.type));
check('every position task of the real catalogue that has geometry is verifiable, and evaluates without error on empty facts', wanted.filter((t) => supports(t.goal)).length >= 560 && wanted.filter((t) => supports(t.goal)).every((t) => { const r = progressOf(t.goal, facts([])); return r.done === false && r.need >= 1; }), `${wanted.filter((t) => supports(t.goal)).length} of ${wanted.length}`);
const liveTasks = createTasks({ seed: SEED, catalogue: real });
check('and they are offered: the position tasks are in the server\'s live pool now', liveTasks.live.filter((t) => presenceTypes.includes(t.goal.type)).length >= 560, String(liveTasks.live.filter((t) => presenceTypes.includes(t.goal.type)).length));

// ---- a claim, paid from the presence server's events, once
const view1 = await call('GET', '/tasks', { token: ana.token });
const ids = [...view1.data.daily, ...view1.data.weekly].map((t) => t.id);
check('the account is offered the position tasks of the small catalogue', ['D-TST-reachpk1', 'D-TST-distance', 'D-TST-zonedwel', 'W-TST-roadpass', 'W-TST-bein0001', 'W-TST-loop0001'].every((id) => ids.includes(id)), ids.join(','));
const early = await call('POST', '/tasks/D-TST-reachpk1/claim', { token: ben.token });
check('nobody has reached the park yet: not done (409), and nothing is paid', early.status === 409 && early.data.code === 'not_done');
const goldOf = (id) => db.prepare('SELECT game_gold FROM accounts WHERE id = ?').get(id).game_gold;
const g0 = goldOf(A);
const claim1 = await call('POST', '/tasks/D-TST-reachpk1/claim', { token: ana.token });
check('the presence server saw Ana in Voxel Park: the task is collectable, and pays the tier\'s Gold', claim1.status === 200 && claim1.data.paid === 5 && goldOf(A) === g0 + 5, JSON.stringify(claim1.data).slice(0, 120));
check('and once: asking again is 409', (await call('POST', '/tasks/D-TST-reachpk1/claim', { token: ana.token })).status === 409);
check('the distance (120 + 80 m walked) and the dwell (310 s in the zone) count too', (await call('POST', '/tasks/D-TST-distance/claim', { token: ana.token })).status === 200 && (await call('POST', '/tasks/D-TST-zonedwel/claim', { token: ana.token })).status === 200);
check('a page that says it was there changes nothing: the claim body is ignored', (await call('POST', '/tasks/W-TST-bein0001/claim', { token: ana.token, body: { done: true, district: 'bazaar', gold: 99999 } })).status === 409);

// ---- the flags: a score at or over 60 holds rewards back
const flagBody = (id, score) => ({ flagged: [{ accountId: id, score, flags: [{ name: 'no_pauses', weight: score, detail: '30 minutes of movement without a stop' }] }], cleared: [] });
check('a flag below the review score holds nothing', (await call('POST', '/internal/presence/summary', { secret: SECRET, body: flagBody(A, 59) })).data.flagged === 1 && presence.holdFor(db, A) === null);
const w1 = await call('POST', '/internal/presence/summary', { secret: SECRET, body: flagBody(A, 70) });
check('a flag at 70 holds rewards back', w1.data.flagged === 1 && presence.holdFor(db, A)?.score === 70);
const held = await call('POST', '/tasks/W-TST-roadpass/claim', { token: ana.token });
check('a claim then answers "under review" (409), says nothing of the score or the signals, and pays nothing', held.status === 409 && held.data.code === 'under_review' && !/score|no_pauses|70/.test(JSON.stringify(held.data)) && goldOf(A) === g0 + 5 + 10 + 20, JSON.stringify(held.data));
const trail = () => db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'presence.hold' AND target_id = ?").get(String(A)).n;
await call('POST', '/tasks/W-TST-bein0001/claim', { token: ana.token });
check('the audit trail gets one entry for the hold, not one per attempt', trail() === 1, String(trail()));
check('the page is told the account is under review (and nothing else about it)', (await call('GET', '/tasks', { token: ana.token })).data.underReview === true && (await call('GET', '/tasks', { token: ben.token })).data.underReview === false);
check('a flag expires by itself if the presence server stops repeating it (so a restart cannot leave an account stuck)', presence.holdFor(db, A, Date.now() + presence.FLAG_TTL_MS + 1000) === null);
const clearedBy = await call('POST', '/internal/presence/summary', { secret: SECRET, body: { flagged: [], cleared: [A] } });
const afterClear = await call('POST', '/tasks/W-TST-roadpass/claim', { token: ana.token });
check('the presence server saying the flag is gone clears it, and the task that was held (done all along) is collectable and pays 30', clearedBy.data.cleared === 1 && presence.holdFor(db, A) === null && afterClear.status === 200 && afterClear.data.paid === 30, JSON.stringify({ c: clearedBy.data, claim: afterClear.data }));
await call('POST', '/internal/presence/summary', { secret: SECRET, body: flagBody(A, 80) });
check('the admin sees the flag with its signals', (async () => {})() !== null && (await call('GET', '/admin/presence/flags', { token: 'admin-machine-token' })).data.flags.some((f) => f.accountId === A && f.held && f.flags[0].name === 'no_pauses'));
check('and only the admin does', (await call('GET', '/admin/presence/flags', { token: ana.token })).status >= 400 && (await call('GET', '/admin/presence/flags')).status >= 400 && (await call('POST', `/admin/presence/flags/${A}/clear`, { token: ana.token })).status >= 400);
const cleared = await call('POST', `/admin/presence/flags/${A}/clear`, { token: 'admin-machine-token' });
check('an admin can clear a flag for a day, and it is audited', cleared.status === 200 && presence.holdFor(db, A) === null && db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'presence.flag.clear' AND target_id = ?").get(String(A)).n === 1);
await call('POST', '/internal/presence/summary', { secret: SECRET, body: flagBody(A, 90) });
check('a cleared account stays cleared for the day even when the presence server flags it again; when the day is over the flag holds again', presence.holdFor(db, A) === null && (db.prepare('UPDATE presence_flags SET cleared_until = ? WHERE account_id = ?').run(Date.now() - 1000, A), presence.holdFor(db, A)?.score === 90));
check('clearing an account that has no flag is a 404', (await call('POST', `/admin/presence/flags/${B}/clear`, { token: 'admin-machine-token' })).status === 404);
check('the numbers for the admin page', (() => { const s = presence.summary(db); return s.retentionDays === 10 && s.reviewScore === 60 && s.events > 0; })());
check('the days of a window are UTC days', dayOf(D1) === '2026-11-16');

// ---- it is in the policy facts
const retention = fs.readFileSync(path.join(root, 'lib/legal/retention.js'), 'utf8');
check('the retention facts state the ten days, and the code uses them', /presenceEventDays: 10/.test(retention) && presence.EVENT_DAYS === 10);

api.server.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
