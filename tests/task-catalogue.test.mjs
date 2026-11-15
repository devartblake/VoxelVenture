// The daily and weekly task catalogue (docs/product/daily_weekly_tasks.md, scripts/tasks/): more than 800 tasks that name only what the city really has, pay small
// fixed Gold, leave out what would pad a business's verified figures, and spread over the days and weeks without repeating. Design data: nothing in the game reads it.
import fs from 'node:fs';
import path from 'node:path';
import { buildCatalogue, GOLD, toCsv, worldFacts } from '../scripts/tasks/build-task-catalogue.mjs';
import { DAILY_SLOTS, WEEKLY_SLOTS, dayIndex, tasksForDay, tasksForWeek, weekIndex } from '../scripts/tasks/schedule.mjs';
import { imp, root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const SEED = 20260101;
const cat = await buildCatalogue(SEED);
const tasks = cat.tasks;
const W = await worldFacts(SEED);

// ---- the catalogue
check('more than 800 tasks', tasks.length > 800, String(tasks.length));
check('both cadences, each with a pool big enough to rotate for months', cat.counts.daily >= 500 && cat.counts.weekly >= 150, `${cat.counts.daily} daily, ${cat.counts.weekly} weekly`);
check('every id is unique and every title is unique within its cadence', new Set(tasks.map((t) => t.id)).size === tasks.length && new Set(tasks.map((t) => `${t.cadence}|${t.title}`)).size === tasks.length);
const TIERS = ['easy', 'medium', 'hard'], SIGNALS = ['tracked-today', 'needs-position', 'needs-new-event'], REQUIRES = ['signed-in', 'owns-item', 'owns-listing'];
const shape = (t) => ['daily', 'weekly'].includes(t.cadence) && t.category && t.family && t.title && t.text && TIERS.includes(t.tier) && Number.isInteger(t.gold) && t.goal?.type && SIGNALS.includes(t.signal) && t.requires.every((r) => REQUIRES.includes(r)) && typeof t.seedBound === 'boolean' && /^[DW]-[A-Z]{3}-\d{3}$/.test(t.id);
check('every task has an id, cadence, category, title, text, tier, Gold, a machine-readable goal and a tracking signal', tasks.every(shape), tasks.find((t) => !shape(t))?.id ?? '');
check('the id says the cadence', tasks.every((t) => t.id[0] === (t.cadence === 'daily' ? 'D' : 'W')));
const perTier = (cadence, tier) => tasks.filter((t) => t.cadence === cadence && t.tier === tier).length;
check('each tier of each cadence has a pool to rotate (the schedule draws one from each)', DAILY_SLOTS.every((tr) => perTier('daily', tr) >= 60) && TIERS.every((tr) => perTier('weekly', tr) >= 20), TIERS.map((tr) => `${perTier('daily', tr)}/${perTier('weekly', tr)}`).join(' '));

// ---- Gold: small, fixed by tier, and below what the daily finds already pay
check('Gold follows the tier (5/10/20 a day, 30/60/120 a week), except the survey, which pays none', tasks.every((t) => t.gold === GOLD[t.cadence][t.tier] || (t.gold === 0 && t.goal.action === 'pilot-checkin')));
const dayMax = GOLD.daily.easy + GOLD.daily.medium + GOLD.daily.hard;
const weekMax = WEEKLY_SLOTS.reduce((s, tr) => s + GOLD.weekly[tr], 0);
check('a full day of tasks pays at most 35 Gold and a week at most 300, next to about 275 a day that the chest, stars, Plot of the Day and fishing can already pay', dayMax === 35 && weekMax === 300, `${dayMax} / ${weekMax}`);
check('nothing pays Credits (the server money): only Gold', tasks.every((t) => !/credit/i.test(`${t.title} ${t.text}`)));

// ---- what it must not reward: the figures businesses see are verified, and rewards must not pad them
const padding = /coupon|newsletter|sign[- ]?up|subscribe|purchase|\bbuy\b|checkout|\bpaid\b|review|rating|repost|retweet|share (a|the|your) link|invite|referral|call to action press|cta press/i;
const padded = tasks.find((t) => padding.test(`${t.title} ${t.text}`) || padding.test(JSON.stringify(t.goal)));
check('no task pays for a coupon claim, a sign-up, a purchase, a button press, a review, a share or an invite (they would pad the verified figures owners see)', !padded, padded?.id ?? '');

// ---- it names only what the city has
const roads = new Set(W.roads), districts = new Set(W.districts.map((d) => d.id)), plots = new Map(W.businesses.map((b) => [b.id, b]));
const bizTasks = tasks.filter((t) => t.goal.type === 'visit-business');
check('every business task points at a business the city generates, in the district it names', bizTasks.length >= 150 && bizTasks.every((t) => plots.has(t.goal.plotId) && t.text.includes(W.label[plots.get(t.goal.plotId).district])), `${bizTasks.length} business tasks`);
check('every road, pair of roads and district a task names exists', tasks.every((t) => (!t.goal.road || roads.has(t.goal.road)) && (!t.goal.roads || t.goal.roads.every((r) => roads.has(r))) && (!t.goal.district || districts.has(t.goal.district)) && (!t.goal.from || districts.has(t.goal.from)) && (!t.goal.to || districts.has(t.goal.to))));
const { FISH } = await imp('sim/vehicles.js');
const { ZONES } = await imp('game/soundZones.js');
const { COSMETIC_BY_ID } = await imp('game/cosmetics.js');
const fishIds = new Set(FISH.map((f) => f.id));
check('every fish, sound zone and wardrobe item a task names exists in the game\'s own lists', tasks.every((t) => (!t.goal.fish || [].concat(t.goal.fish).every((f) => fishIds.has(f))) && (!t.goal.zone || t.goal.zone in ZONES) && (!t.goal.item || COSMETIC_BY_ID[t.goal.item]) && (!t.goal.items || t.goal.items.every((i) => COSMETIC_BY_ID[i])) && (!t.goal.emote || COSMETIC_BY_ID[t.goal.emote])));
check('tasks that name something that exists in one city seed say so (seedBound), so a new seed means a rebuild', tasks.filter((t) => t.goal.plotId || (t.goal.id && t.goal.type !== 'owner')).every((t) => t.seedBound));
check('it is honest about what the game records today: all three tracking signals occur', SIGNALS.every((s) => tasks.some((t) => t.signal === s)), SIGNALS.map((s) => `${s} ${tasks.filter((t) => t.signal === s).length}`).join(', '));

// ---- the files agree with the generator
const onDisk = JSON.parse(fs.readFileSync(path.join(root, 'docs/product/task_catalogue.json'), 'utf8'));
check('docs/product/task_catalogue.json is exactly what the generator makes (run scripts/tasks/build-task-catalogue.mjs after a change)', JSON.stringify(onDisk) === JSON.stringify(cat));
check('and the CSV for spreadsheets matches too', fs.readFileSync(path.join(root, 'docs/product/task_catalogue.csv'), 'utf8').replace(/\r\n/g, '\n') === toCsv(cat));
const doc = fs.readFileSync(path.join(root, 'docs/product/daily_weekly_tasks.md'), 'utf8');
check('the document states the real total and the split', doc.includes(`${tasks.length} tasks`) && doc.includes(`${cat.counts.daily} daily`) && doc.includes(`${cat.counts.weekly} weekly`));

const newcomer = { eligible: (t) => !t.requires.includes('owns-item') && !t.requires.includes('owns-listing') };
const sampleDays = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
check('the sample schedule in the document is what the scheduler gives a newcomer (a stale sample fails here)', sampleDays.every((d) => tasksForDay(cat, SEED, d, newcomer).every((t) => doc.includes(t.title))) && ['2026-11-16', '2026-11-23'].every((d) => tasksForWeek(cat, SEED, d, newcomer).every((t) => doc.includes(t.title))));

// ---- the schedule
const days = [...Array(400)].map((_, i) => new Date(Date.UTC(2026, 10, 15) + i * 86400000).toISOString().slice(0, 10));
const sched = days.map((d) => tasksForDay(cat, SEED, d));
check('every day gets three tasks: an easy, a medium and a hard one', sched.every((s) => s.length === 3 && s.map((t) => t.tier).join() === DAILY_SLOTS.join() && s.every((t) => t.cadence === 'daily')));
check('the same city and day always give the same tasks', JSON.stringify(tasksForDay(cat, SEED, days[7])) === JSON.stringify(tasksForDay(cat, SEED, days[7])));
check('another city seed gives another order', JSON.stringify(tasksForDay(cat, SEED + 1, days[7])) !== JSON.stringify(tasksForDay(cat, SEED, days[7])));
const gap = (list) => { const last = new Map(); let min = Infinity; list.forEach((s, i) => s.forEach((t) => { if (last.has(t.id)) min = Math.min(min, i - last.get(t.id)); last.set(t.id, i); })); return min; };
const hardPool = perTier('daily', 'hard');
const third = (n) => Math.floor(n / 3);
check(`no daily task comes round again within a third of its cycle (the hard ones, a pool of ${hardPool}, not within ${third(hardPool)} days)`, gap(sched) >= third(hardPool), `closest repeat: ${gap(sched)} days`);
const cycleStart = days.findIndex((d) => dayIndex(d) % hardPool === 0);
const cycleDays = sched.slice(cycleStart, cycleStart + hardPool);
const hardSeen = new Map();
cycleDays.forEach((s) => hardSeen.set(s[2].id, (hardSeen.get(s[2].id) ?? 0) + 1));
check('over one whole cycle every hard daily task is given exactly once', cycleDays.length === hardPool && hardSeen.size === hardPool && [...hardSeen.values()].every((n) => n === 1), `${hardSeen.size} of ${hardPool}`);
const clash = sched.filter((s) => new Set(s.map((t) => t.category)).size < 3).length / sched.length;
check('two tasks of one category on the same day are uncommon (under 25% of days)', clash < 0.25, `${(clash * 100).toFixed(1)}%`);
const weekStarts = [...new Set(days.map(weekIndex))].map((w) => days.find((d) => weekIndex(d) === w));
const wsched = weekStarts.map((d) => tasksForWeek(cat, SEED, d));
check('every week gets five tasks: two easy, two medium, one hard, all different', wsched.every((s) => s.length === 5 && s.map((t) => t.tier).join() === WEEKLY_SLOTS.join() && new Set(s.map((t) => t.id)).size === 5 && s.every((t) => t.cadence === 'weekly')));
check('every day of a week gets the same weekly tasks', days.slice(0, 30).every((d) => JSON.stringify(tasksForWeek(cat, SEED, d)) === JSON.stringify(wsched[[...new Set(days.map(weekIndex))].indexOf(weekIndex(d))])));
const weeklyHard = perTier('weekly', 'hard');
check(`no weekly task comes round again within a third of its cycle (the hard ones, a pool of ${weeklyHard}, not within ${third(weeklyHard)} weeks)`, gap(wsched) >= third(weeklyHard), `closest repeat: ${gap(wsched)} weeks`);
const signedOut = days.slice(0, 120).flatMap((d) => tasksForDay(cat, SEED, d, { eligible: (t) => !t.requires.length }));
const noOwner = weekStarts.flatMap((d) => tasksForWeek(cat, SEED, d, { eligible: (t) => !t.requires.includes('owns-listing') }));
check('eligibility is respected: nobody is given a task they cannot do, and a day still has three', signedOut.every((t) => !t.requires.length) && noOwner.every((t) => !t.requires.includes('owns-listing')) && tasksForDay(cat, SEED, days[0], { eligible: (t) => !t.requires.length }).length === 3);
check('a week starts on Monday (UTC), as Building of the Week\'s does', weekIndex('2026-11-16') === weekIndex('2026-11-22') && weekIndex('2026-11-22') !== weekIndex('2026-11-23') && new Date(dayIndex('2026-11-16') * 86400000).getUTCDay() === 1);

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
