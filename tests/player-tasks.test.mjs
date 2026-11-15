// Player tasks on the server (services/api/tasks.mjs; docs/product/daily_weekly_tasks.md): the user's rule is that the SERVER holds every balance and verifies every task. What is
// tested: what is offered (to a guest, to an account), that progress comes only from the server's own records, that a page cannot say a task is done or what it pays, that a claim pays
// the tier's Gold through the wallet exactly once, the profile's history and totals, the admin's view, and that no task the server cannot verify is ever offered.
import { createApi } from '../services/api/server.mjs';
import { auditCurrency } from '../services/api/gold.mjs';
import * as gold from '../services/api/gold.mjs';
import { createTasks, loadCatalogue } from '../services/api/tasks.mjs';
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const SEED = 20260101;
const SITE = 'https://site.test';
const { generateCity } = await imp('city/cityGenerator.js');
const { dailyChest, scavengerHunt } = await imp('game/daily.js');
const { utcDay } = await imp('game/goldRules.js');
const { progressOf, supports, windowOf } = await imp('game/taskRules.js');
const { tasksForDay } = await imp('game/taskSchedule.js');
const city = generateCity(SEED);
const day = utcDay();
const chest = dailyChest(city.layout.intersections, SEED, day);
const stars = scavengerHunt(city.layout, city.plots, SEED, day);
const saas = city.plots.filter((p) => p.districtId === 'saas' && p.generated && p.buildingType);

// a small catalogue, one task per slot, so what is offered is certain: real shapes (the goals the catalogue uses), made-up ids
const T = (id, cadence, tier, goal, extra = {}) => ({ id, cadence, category: 'TST', family: 'test', title: `Test ${id}`, text: id, tier, gold: { daily: { easy: 5, medium: 10, hard: 20 }, weekly: { easy: 30, medium: 60, hard: 120 } }[cadence][tier], goal, signal: 'tracked-today', requires: [], seedBound: false, ...extra });
const catalogue = {
  version: 1, seed: SEED,
  tasks: [
    T('D-TST-chest001', 'daily', 'easy', { type: 'chest' }),
    T('D-TST-stars001', 'daily', 'medium', { type: 'stars', count: 2 }),
    T('D-TST-visits01', 'daily', 'hard', { type: 'visit-businesses', district: 'saas', count: 2 }),
    T('W-TST-votes001', 'weekly', 'easy', { type: 'vote', count: 1 }),
    T('W-TST-chests01', 'weekly', 'easy', { type: 'chest', days: 1 }),
    T('W-TST-potd0001', 'weekly', 'medium', { type: 'potd' }),
    T('W-TST-fish0001', 'weekly', 'medium', { type: 'catch-kinds', kinds: 99 }),
    T('W-TST-meta0001', 'weekly', 'hard', { type: 'tasks-complete', cadence: 'daily', count: 2 }),
    // never offered to an account without a listing, and one the server cannot verify (a position)
    T('D-TST-owner001', 'daily', 'easy', { type: 'visit-business', plotId: saas[0].id }, { requires: ['owns-listing'] }),
    T('D-TST-walk0001', 'daily', 'medium', { type: 'reach', place: 'park', id: 'x' }, { signal: 'needs-position' }),
  ],
};

const api = createApi({ dbFile: ':memory:', seed: SEED, taskCatalogue: catalogue, deliverEveryMs: 0, origin: SITE, rate: { perMinute: 100000, authPerMinute: 100000 }, env: { ADMIN_TOKEN: 'admin-machine-token', IP_SALT: 'salt', TRUST_PROXY: '1' } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const db = api.db;
let ipN = 1;
const call = async (method, p, { body, token } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Origin: SITE, 'X-Forwarded-For': `10.2.0.${ipN++ % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data };
};
const signup = async (name) => (await call('POST', '/auth/signup', { body: { username: name, password: 'longenough1' } })).data;
const idOf = (name) => db.prepare('SELECT id FROM accounts WHERE username = ?').get(name).id;
const wallet = (name) => gold.balance(db, idOf(name)).gold;
const visit = (name, plotId, { verified = 1, at = Date.now() } = {}) => db.prepare("INSERT INTO events (plot_id, kind, source, visitor, seconds, at, verified) VALUES (?, 'visit', 'street', ?, 30, ?, ?)").run(plotId, `a${idOf(name)}`, at, verified);

// ---- what is offered
const guest = await call('GET', '/tasks');
check('a guest sees today\'s three tasks and this week\'s five, each with a title, a tier and its Gold, none collected', guest.status === 200 && guest.data.signedIn === false && guest.data.daily.length === 3 && guest.data.weekly.length === 5 && [...guest.data.daily, ...guest.data.weekly].every((t) => t.title && t.tier && t.gold > 0 && t.collected === null), `${guest.data.daily.length}+${guest.data.weekly.length}`);
check('looking is recorded nowhere for a guest', db.prepare('SELECT COUNT(*) AS n FROM task_offers').get().n === 0);
check('the dormant task (a position) and the listing task are not offered to a guest', ![...guest.data.daily].some((t) => t.id === 'D-TST-walk0001' || t.id === 'D-TST-owner001'));
const ana = await signup('Ana');
const ben = await signup('Ben');
const mine = await call('GET', '/tasks', { token: ana.token });
check('an account sees the same schedule, with progress, and what it was shown is recorded', mine.data.signedIn === true && mine.data.daily.map((t) => t.id).join() === guest.data.daily.map((t) => t.id).join() && db.prepare('SELECT COUNT(*) AS n FROM task_offers WHERE account_id = ?').get(idOf('Ana')).n === 8);
check('no task the server cannot verify is ever offered, over a year of days', (() => { const t = createTasks({ seed: SEED, catalogue }); const eligible = () => true; for (let i = 0; i < 400; i++) { const d = utcDay(Date.now() + i * 86400000); if (tasksForDay({ tasks: t.live }, SEED, d, { eligible }).some((x) => !supports(x.goal))) return false; } return !t.live.some((x) => x.id === 'D-TST-walk0001'); })());

// ---- the page cannot say a task is done, or what it pays
const chestTask = mine.data.daily.find((t) => t.id === 'D-TST-chest001');
const early = await call('POST', '/tasks/D-TST-chest001/claim', { token: ana.token, body: { done: true, progress: { done: true, have: 1, need: 1 }, gold: 99999, amount: 99999 } });
check('a task cannot be collected because the page says it is done: 409 not_done, with the server\'s own progress, and nothing is paid', early.status === 409 && early.data.code === 'not_done' && early.data.progress.done === false && early.data.progress.have === 0 && wallet('Ana') === 0 && db.prepare('SELECT COUNT(*) AS n FROM task_claims').get().n === 0, JSON.stringify(early.data));
check('a task that is not one of yours is refused (409), and one that does not exist is a 404', (await call('POST', '/tasks/D-TST-owner001/claim', { token: ana.token })).status === 409 && (await call('POST', '/tasks/D-TST-nothing9/claim', { token: ana.token })).status === 404);
check('a guest cannot collect (401)', (await call('POST', '/tasks/D-TST-chest001/claim', {})).status === 401);

// ---- doing it, then collecting: the server reads its own records
const opened = await call('POST', '/game/chest', { token: ana.token, body: { x: chest.x, z: chest.z } });
const progress = (await call('GET', '/tasks', { token: ana.token })).data.daily.find((t) => t.id === 'D-TST-chest001').progress;
check('the chest, paid by the server, is what moves the progress', opened.status === 200 && progress.done === true);
const paid = await call('POST', '/tasks/D-TST-chest001/claim', { token: ana.token, body: { gold: 99999 } });
check('collecting pays the tier\'s Gold (5), from the server, through the wallet', paid.status === 200 && paid.data.paid === chestTask.gold && wallet('Ana') === opened.data.paid + chestTask.gold, `${wallet('Ana')} = ${opened.data.paid} + ${chestTask.gold}`);
const again = await call('POST', '/tasks/D-TST-chest001/claim', { token: ana.token });
check('and only once for that period (409)', again.status === 409 && again.data.code === 'already_done' && wallet('Ana') === opened.data.paid + chestTask.gold);
check('the wallet has a ledger row for it, with the task in it', !!db.prepare("SELECT 1 FROM game_gold_ledger WHERE account_id = ? AND reason = 'task' AND ref = 'D-TST-chest001'").get(idOf('Ana')));
check('another account\'s progress is its own: Ben has done nothing, so he cannot collect', (await call('POST', '/tasks/D-TST-chest001/claim', { token: ben.token })).data.code === 'not_done');
check('the view now shows it collected', (await call('GET', '/tasks', { token: ana.token })).data.daily.find((t) => t.id === 'D-TST-chest001').collected?.gold === 5);

// ---- visits: only the account\'s own verified visits count
const [s1, s2] = saas;
visit('Ana', s1.id, { verified: 0 });
visit('Ben', s1.id);
visit('Ben', s2.id);
const notYet = await call('POST', '/tasks/D-TST-visits01/claim', { token: ana.token });
check('unverified visits and other people\'s visits do not count', notYet.status === 409 && notYet.data.code === 'not_done' && notYet.data.progress.have === 0);
visit('Ana', s1.id);
check('one visit is not two', (await call('POST', '/tasks/D-TST-visits01/claim', { token: ana.token })).data.code === 'not_done');
visit('Ana', s2.id);
const hard = await call('POST', '/tasks/D-TST-visits01/claim', { token: ana.token });
check('two verified visits to two different businesses in the district: the hard task pays 20', hard.status === 200 && hard.data.paid === 20);

// ---- stars through the server's own payments (spaced so the avatar could have walked, and after the chest claim)
const t1 = Date.now() + 15 * 60000, t2 = t1 + 15 * 60000;
if (utcDay(t2) === day) {
  gold.collectStar(db, SEED, { id: idOf('Ana') }, { index: 0, x: stars[0].x, z: stars[0].z }, t1);
  check('one star of the two needed is not enough', (await call('POST', '/tasks/D-TST-stars001/claim', { token: ana.token })).data.code === 'not_done');
  gold.collectStar(db, SEED, { id: idOf('Ana') }, { index: 1, x: stars[1].x, z: stars[1].z }, t2);
  const starPay = await call('POST', '/tasks/D-TST-stars001/claim', { token: ana.token });
  check('two stars the server paid: the medium task pays 10', starPay.status === 200 && starPay.data.paid === 10);
} else {
  check('(near midnight UTC: the star test is skipped, the day would change under it)', true);
  db.prepare("INSERT INTO task_claims (account_id, task_id, period_key, cadence, tier, category, gold, claimed_at, day) VALUES (?, 'D-TST-stars001', ?, 'daily', 'medium', 'TST', 10, ?, ?)").run(idOf('Ana'), day, Date.now(), day);
  db.prepare("INSERT INTO game_gold_ledger (account_id, delta, reason, ref, key, at) VALUES (?, 10, 'task', 'D-TST-stars001', ?, ?)").run(idOf('Ana'), `task:D-TST-stars001@${day}`, Date.now());
  db.prepare('UPDATE accounts SET game_gold = game_gold + 10 WHERE id = ?').run(idOf('Ana'));
}

// ---- weekly, and a task made from the account\'s own claims
const week = (await call('GET', '/tasks', { token: ana.token })).data.weekly;
check('the week has its five tasks, one of them about collecting daily tasks', week.length === 5 && week.some((t) => t.id === 'W-TST-meta0001'));
const meta = await call('POST', '/tasks/W-TST-meta0001/claim', { token: ana.token });
check('having collected three daily tasks, the weekly task about daily tasks pays 120 (the tier)', meta.status === 200 && meta.data.paid === 120);
check('a weekly vote task is not done by a page saying so, but by a vote the server holds', (await call('POST', '/tasks/W-TST-votes001/claim', { token: ana.token, body: { done: true } })).data.code === 'not_done');
const built = city.plots.find((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2 && !p.admin);
const voted = await call('POST', '/vote', { token: ana.token, body: { plotId: built.id } });
check('after a real vote it is done and pays 30', voted.status === 200 && (await call('POST', '/tasks/W-TST-votes001/claim', { token: ana.token })).data.paid === 30);

// ---- the profile: what has been collected
const history = await call('GET', '/me/tasks', { token: ana.token });
check('the profile lists what was collected, newest first, with titles', history.status === 200 && history.data.claims.length === 5 && history.data.claims[0].taskId === 'W-TST-votes001' && history.data.claims.every((c) => c.title.startsWith('Test ')), JSON.stringify(history.data.claims.map((c) => c.taskId)));
check('its totals add up: five collected, 5 + 10 + 20 + 120 + 30 Gold, today\'s streak of 1, by category and cadence', history.data.totals.collected === 5 && history.data.totals.gold === 185 && history.data.totals.currentStreak === 1 && history.data.totals.bestStreak === 1 && history.data.totals.byCategory.TST === 5 && history.data.totals.byCadence.daily === 3 && history.data.totals.byCadence.weekly === 2, JSON.stringify(history.data.totals));
const page1 = await call('GET', '/me/tasks?limit=2', { token: ana.token });
const page2 = await call('GET', `/me/tasks?limit=2&before=${page1.data.next}`, { token: ana.token });
check('history pages: two, then the next two, with no overlap', page1.data.claims.length === 2 && page1.data.next && page2.data.claims.length === 2 && !page2.data.claims.some((c) => page1.data.claims.some((d) => d.taskId === c.taskId)));
check('an account\'s history is its own (Ben has none) and needs a sign-in', (await call('GET', '/me/tasks', { token: ben.token })).data.totals.collected === 0 && (await call('GET', '/me/tasks')).status === 401);

// ---- the admin: offered and collected, and who
const rep = await call('GET', '/admin/tasks', { token: 'admin-machine-token' });
const chestRow = rep.data.tasks.find((t) => t.id === 'D-TST-chest001');
check('the admin sees how many accounts were shown a task and how many collected it, and who', rep.status === 200 && chestRow.offered >= 1 && chestRow.collected === 1 && chestRow.collectors.join() === 'Ana' && rep.data.collected === 5 && rep.data.goldPaid === 185, JSON.stringify(chestRow));
check('and which tasks the server cannot verify yet (dormant)', rep.data.catalogue.dormant === 1 && rep.data.catalogue.offered === catalogue.tasks.length - 1);
check('the admin report needs the admin', (await call('GET', '/admin/tasks', { token: ana.token })).status >= 400 && (await call('GET', '/admin/tasks')).status >= 400);

// ---- the money: every task payment went through the ledger
const audit = auditCurrency(db);
check('after all that every balance still equals its ledger', audit.ok, JSON.stringify(audit.mismatches));

// ---- the real catalogue
const real = loadCatalogue();
const tasks = createTasks({ seed: SEED });
check('the real catalogue loads; over a thousand of its tasks are verifiable today and the rest are held back', tasks.live.length > 1000 && tasks.live.length < real.tasks.length && tasks.live.every((t) => supports(t.goal)), `${tasks.live.length} of ${real.tasks.length}`);
check('a real day for a real account: three daily and five weekly tasks, all verifiable', (() => { const v = tasks.view(db, { id: idOf('Ben'), username: 'Ben' }); return v.daily.length === 3 && v.weekly.length === 5 && [...v.daily, ...v.weekly].every((t) => tasks.byId.has(t.id) && supports(tasks.byId.get(t.id).goal)); })());
await signup('Zed');
check('every verifiable task has a worked-out progress for an account with no records, and none of them is done from nothing', tasks.live.every((t) => { const p = progressOf(t.goal, tasks.gatherFacts(db, { id: idOf('Zed') }, t, windowOf(t.cadence, day), Date.now())); return Number.isFinite(p.have) && p.need >= 1 && p.done === false; }));

// ---- the contracts describe what the server really sends
const types = await import('@voxelventure/shared-types');
const holds = (name, contract, value) => { const errors = types.validate(contract.schema, value); check(`${name} satisfies ${contract.id}`, errors.length === 0, errors.slice(0, 2).join('; ')); };
holds('the tasks of an account', types.TASKS_VIEW, (await call('GET', '/tasks', { token: ana.token })).data);
holds('the tasks as a guest sees them', types.TASKS_VIEW, guest.data);
holds('a collected task', types.TASKS_CLAIM_RESULT, paid.data);
holds('the profile history', types.TASKS_HISTORY, history.data);
holds('the admin report', types.ADMIN_TASKS, rep.data);

api.server.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
