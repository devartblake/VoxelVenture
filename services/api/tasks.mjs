// Player tasks (docs/product/daily_weekly_tasks.md; rules in lib/game/taskRules.js and taskSchedule.js, shared with the pages). The user's rule governs all of it: the SERVER holds every
// balance and verifies every task. What happens here:
//   - what is AVAILABLE to an account today and this week comes from the shared schedule over the tasks the server can verify, for the account's own facts (it owns a listing, it owns
//     the item a "wear" task names). Showing a task to an account is recorded (task_offers), so an admin can see how many were offered as well as collected.
//   - PROGRESS is never stored and never taken from a page: it is worked out again from the server's own records (verified visits, the Gold ledger, votes, hunt wins, the wardrobe, the
//     account's earlier claims) inside the period.
//   - a CLAIM re-evaluates the goal on the server, checks the task is one of this account's tasks for this period, and pays the tier's Gold through the Gold wallet (gold.mjs, reason 'task').
//     The unique key (account, task, period) means it happens once. A page never says a task is done and never says how much it pays.
//   - a task whose goal the server cannot verify yet is simply not offered (supports() in taskRules.js). Where the avatar WAS is verified from the presence server's events (presence.mjs:
//     it checked the movement was plausible), never from the page. An account whose anti-bot score is at or over the review score has its rewards held (claim answers 'under_review'); the task stays
//     collectable if the flag clears.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imp } from '../../scripts/lib-loader.mjs';
import { ApiError, requireAccount } from './core.mjs';
import { transaction } from './db.mjs';
import * as gold from './gold.mjs';
import { votesView } from './community.mjs';
import * as presence from './presence.mjs';

const { generateTown } = await imp('city/townExtension.js'); // the city the game builds (see gold.mjs): the stars and the plots must be the player's own
const { buildPlaceGeometry } = await imp('world/placeGeometry.js'); // where the places are, by the ids the catalogue uses (for "all the bridges")
const { scavengerHunt } = await imp('game/daily.js');
const { tasksForDay, tasksForWeek } = await imp('game/taskSchedule.js');
const { bestStreak, dayOf, plotFacts, progressOf, streakAt, supports, windowOf } = await imp('game/taskRules.js');
const { utcDay } = await imp('game/goldRules.js');
const { DEFAULT_OWNED } = await imp('game/cosmetics.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const fail = (status, message, code, data) => { const e = new ApiError(status, message, code); throw data ? e.withData(data) : e; };
const now = () => Date.now();

export const loadCatalogue = (file = path.join(here, '..', '..', 'lib', 'game', 'taskCatalogue.json')) => JSON.parse(fs.readFileSync(file, 'utf8'));
const goalItems = (goal) => (goal.type === 'wear' ? goal.items ?? [goal.item] : goal.type === 'all' ? goal.of.flatMap(goalItems) : []);

/**
 * @param {{ seed: number, catalogue?: { tasks: object[] } }} options
 */
export function createTasks({ seed, catalogue = loadCatalogue(), onHold = null }) {
  const city = generateTown(seed);
  const geometry = buildPlaceGeometry(city);
  const byId = new Map(catalogue.tasks.map((t) => [t.id, t]));
  // The tasks the server can verify AND that take some effort. A "wear" task whose items are all free ones (the outfit everyone starts in) is done from nothing: it would pay for doing nothing,
  // so it is never offered (a test checks that no verifiable task is done by an account with no records).
  const trivial = (t) => t.goal.type === 'wear' && goalItems(t.goal).every((i) => DEFAULT_OWNED[i]);
  const verifiable = catalogue.tasks.filter((t) => supports(t.goal) && !trivial(t));
  // "Finish 6 air tasks" can only be finished if air tasks turn up often enough among what a week offers (21 daily tasks and 5 weekly ones). A kind whose own tasks are all still waiting
  // for a position or an event never turns up, so its "finish N" tasks would be offered and could never be done. They stay in the catalogue and come alive when the kind has enough
  // verifiable tasks: a week has to offer about 1.6 times N of them on average.
  const kindShare = (cadence, code) => { const pool = verifiable.filter((t) => t.cadence === cadence && t.category !== 'STR'); return pool.length ? pool.filter((t) => t.category === code).length / pool.length : 0; };
  const finishable = (t) => t.goal.type !== 'tasks-complete' || t.goal.category === undefined || 21 * kindShare('daily', t.goal.category) + 5 * kindShare('weekly', t.goal.category) >= 1.6 * t.goal.count;
  const live = verifiable.filter(finishable);
  const plots = new Map(city.plots.map((p) => [p.id, plotFacts(p)]));
  const businesses = city.plots.filter((p) => p.generated && p.title && !/^Empty/.test(p.title) && p.buildingType).map(plotFacts); // the city's own businesses ("the tallest building in a district")
  const spots = new Map();
  const spotsOf = (day) => { if (!spots.has(day)) spots.set(day, scavengerHunt(city.layout, city.plots, seed, day)); return spots.get(day); };
  const publicTask = (t) => ({ id: t.id, cadence: t.cadence, category: t.category, family: t.family, title: t.title, text: t.text, tier: t.tier, gold: t.gold });

  // what an account can be given: tasks it can do (a "wear" task needs the items, a business task needs a listing)
  function eligibility(db, account) {
    if (!account) return (t) => !t.requires.includes('owns-listing') && !t.requires.includes('owns-item');
    const listing = Boolean(db.prepare('SELECT 1 FROM businesses WHERE account_id = ? LIMIT 1').get(account.id));
    const owned = gold.ownedOf(db, account.id);
    return (t) => t.requires.every((r) => (r === 'owns-listing' ? listing : r === 'owns-item' ? goalItems(t.goal).every((i) => owned[i]) : r === 'signed-in'));
  }
  const offeredFor = (db, account, day) => {
    const eligible = eligibility(db, account);
    return { daily: tasksForDay({ tasks: live }, seed, day, { eligible }), weekly: tasksForWeek({ tasks: live }, seed, day, { eligible }) };
  };

  // ---- the facts the rules read: the server's own records, for one account inside one period
  function gatherFacts(db, account, task, win, at) {
    const a = account.id;
    const rows = db.prepare("SELECT delta, reason, ref, key, at FROM game_gold_ledger WHERE account_id = ? AND at >= ? AND at < ? AND reason IN ('star','chest','potd','fish')").all(a, win.start, win.end);
    const startDay = dayOf(win.start), endDay = dayOf(win.end);
    const appearance = gold.appearanceOf(db, a), owned = gold.ownedOf(db, a);
    const vote = votesView(db, null);
    return {
      visits: db.prepare("SELECT plot_id AS plotId, at FROM events WHERE visitor = ? AND kind = 'visit' AND verified = 1 AND at >= ? AND at < ?").all(`a${a}`, win.start, win.end),
      plot: (id) => plots.get(id) ?? null,
      districtPlots: (district) => businesses.filter((p) => p.district === district),
      stars: rows.filter((r) => r.reason === 'star').map((r) => { const [day, index] = r.ref.split('#'); return { day, index: Number(index), kind: spotsOf(day)[Number(index)]?.kind ?? null, at: r.at }; }),
      chests: rows.filter((r) => r.reason === 'chest').map((r) => ({ day: r.ref })),
      potds: rows.filter((r) => r.reason === 'potd').map((r) => ({ day: r.key.split(':')[1] })),
      huntWins: db.prepare('SELECT day FROM hunt_wins WHERE account_id = ? AND day >= ? AND day < ?').all(a, startDay, endDay),
      votes: db.prepare('SELECT plot_id AS plotId, at FROM votes WHERE account_id = ? AND at >= ? AND at < ?').all(a, win.start, win.end),
      fish: rows.filter((r) => r.reason === 'fish').map((r) => ({ fish: r.ref, paid: r.delta, at: r.at })),
      wearing: new Set(Object.values(appearance).filter((i) => owned[i])),
      leaders: vote.leaders.map((l) => l.plotId),
      winner: vote.winner?.plotId ?? null,
      claims: db.prepare('SELECT task_id AS taskId, cadence, tier, category, gold, claimed_at AS at, day FROM task_claims WHERE account_id = ? AND claimed_at >= ? AND claimed_at < ?').all(a, win.start, win.end),
      claimDays: db.prepare("SELECT DISTINCT day FROM task_claims WHERE account_id = ? AND cadence = 'daily'").all(a).map((r) => r.day),
      presence: presence.eventsFor(db, a, win.start, win.end), // where the presence server saw the account, as derived events
      placeIds: (kind) => geometry.placeIds(kind),
      today: utcDay(at),
      task,
    };
  }

  // ---- what an account sees
  function view(db, account, at = now()) {
    const day = utcDay(at);
    const { daily, weekly } = offeredFor(db, account, day);
    const dayWin = windowOf('daily', day), weekWin = windowOf('weekly', day);
    const shape = (t, win) => {
      const base = { ...publicTask(t), period: win.key, progress: { have: 0, need: 1, done: false }, collected: null };
      if (!account) return base;
      db.prepare('INSERT OR IGNORE INTO task_offers (account_id, task_id, period_key, first_seen_at) VALUES (?,?,?,?)').run(account.id, t.id, win.key, at);
      const claim = db.prepare('SELECT claimed_at AS at, gold FROM task_claims WHERE account_id = ? AND task_id = ? AND period_key = ?').get(account.id, t.id, win.key);
      return { ...base, progress: progressOf(t.goal, gatherFacts(db, account, t, win, at)), collected: claim ?? null };
    };
    const out = { signedIn: Boolean(account), day, week: weekWin.key, underReview: Boolean(account && presence.holdFor(db, account.id, at)), daily: daily.map((t) => shape(t, dayWin)), weekly: weekly.map((t) => shape(t, weekWin)) };
    const collected = [...out.daily, ...out.weekly].filter((t) => t.collected);
    return { ...out, summary: { collected: collected.length, offered: out.daily.length + out.weekly.length, gold: collected.reduce((n, t) => n + t.collected.gold, 0) } };
  }

  // ---- collecting
  function claim(db, account, taskId, at = now()) {
    requireAccount(account);
    const task = byId.get(String(taskId));
    if (!task) fail(404, 'There is no such task.', 'no_task');
    const day = utcDay(at);
    const win = windowOf(task.cadence, day);
    if (!offeredFor(db, account, day)[task.cadence].some((t) => t.id === task.id)) fail(409, 'That is not one of your tasks for this period.', 'not_offered');
    const hold = presence.holdFor(db, account.id, at);
    if (hold) {
      // rewards are held while the anti-bot score is at or over the review score: one audit entry in six hours, never the score or the signals to the player
      if (presence.noteHold(db, account.id, at) && onHold) onHold(account, hold);
      fail(409, 'Your account is being reviewed, so task rewards are paused. This task stays yours to collect once the review is done.', 'under_review');
    }
    return transaction(db, () => {
      if (db.prepare('SELECT 1 FROM task_claims WHERE account_id = ? AND task_id = ? AND period_key = ?').get(account.id, task.id, win.key)) fail(409, 'You collected that already.', 'already_done');
      const progress = progressOf(task.goal, gatherFacts(db, account, task, win, at));
      if (!progress.done) fail(409, 'It is not done yet.', 'not_done', { progress });
      db.prepare('INSERT INTO task_claims (account_id, task_id, period_key, cadence, tier, category, gold, claimed_at, day, evidence) VALUES (?,?,?,?,?,?,?,?,?,?)').run(account.id, task.id, win.key, task.cadence, task.tier, task.category, task.gold, at, day, JSON.stringify({ kind: 'server-records', progress }));
      if (!gold.post(db, account.id, { delta: task.gold, reason: 'task', ref: task.id, key: `task:${task.id}@${win.key}`, at })) fail(409, 'You collected that already.', 'already_done');
      return { paid: task.gold, gold: gold.balance(db, account.id).gold, task: publicTask(task), period: win.key, progress };
    });
  }

  // ---- the profile: what an account has collected
  function history(db, account, { limit = 30, before = null } = {}) {
    requireAccount(account);
    const n = Math.max(1, Math.min(100, Number(limit) || 30));
    const rows = db.prepare(`SELECT id, task_id AS taskId, period_key AS period, cadence, tier, category, gold, claimed_at AS claimedAt FROM task_claims WHERE account_id = ? ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`).all(...[account.id, ...(before ? [Number(before)] : []), n + 1]);
    const page = rows.slice(0, n).map((r) => ({ ...r, title: byId.get(r.taskId)?.title ?? 'A task that is no longer offered' }));
    const totals = db.prepare('SELECT COUNT(*) AS collected, COALESCE(SUM(gold), 0) AS gold FROM task_claims WHERE account_id = ?').get(account.id);
    const days = db.prepare("SELECT DISTINCT day FROM task_claims WHERE account_id = ? AND cadence = 'daily'").all(account.id).map((r) => r.day);
    const byCategory = Object.fromEntries(db.prepare('SELECT category, COUNT(*) AS n FROM task_claims WHERE account_id = ? GROUP BY category').all(account.id).map((r) => [r.category, r.n]));
    const byCadence = Object.fromEntries(db.prepare('SELECT cadence, COUNT(*) AS n FROM task_claims WHERE account_id = ? GROUP BY cadence').all(account.id).map((r) => [r.cadence, r.n]));
    return { claims: page, next: rows.length > n ? page[page.length - 1].id : null, totals: { collected: totals.collected, gold: totals.gold, bestStreak: bestStreak(days), currentStreak: streakAt(days, utcDay()), byCategory, byCadence } };
  }

  // ---- the admin: how many were offered and collected, and who collected
  function adminReport(db) {
    const offered = Object.fromEntries(db.prepare('SELECT task_id, COUNT(DISTINCT account_id) AS n FROM task_offers GROUP BY task_id').all().map((r) => [r.task_id, r.n]));
    const rows = db.prepare('SELECT task_id, COUNT(*) AS collected, SUM(gold) AS gold FROM task_claims GROUP BY task_id ORDER BY collected DESC LIMIT 100').all();
    const recent = db.prepare('SELECT c.task_id AS taskId, c.gold, c.claimed_at AS at, a.username FROM task_claims c JOIN accounts a ON a.id = c.account_id ORDER BY c.id DESC LIMIT 25').all();
    const total = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(gold), 0) AS gold, COUNT(DISTINCT account_id) AS accounts FROM task_claims').get();
    return {
      catalogue: { total: catalogue.tasks.length, offered: live.length, dormant: catalogue.tasks.length - live.length },
      collected: total.n, goldPaid: total.gold, accounts: total.accounts,
      tasks: rows.map((r) => ({ id: r.task_id, title: byId.get(r.task_id)?.title ?? null, offered: offered[r.task_id] ?? 0, collected: r.collected, gold: r.gold, collectors: db.prepare('SELECT a.username FROM task_claims c JOIN accounts a ON a.id = c.account_id WHERE c.task_id = ? ORDER BY c.id DESC LIMIT 5').all(r.task_id).map((x) => x.username) })),
      recent: recent.map((r) => ({ ...r, title: byId.get(r.taskId)?.title ?? null })),
    };
  }

  return { view, claim, history, adminReport, live, byId, offeredFor, gatherFacts, geometry };
}
