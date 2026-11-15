// Spreads the catalogue over the days and weeks (docs/product/daily_weekly_tasks.md, "Dispersal"): the same tasks for everyone with the same city, with no server,
// as lib/game/daily.js does for the chest and the stars. Pure, so it is tested in Node (tests/task-catalogue.test.mjs).
//
//   - a day gets 3 tasks (one easy, one medium, one hard); a week gets 5 (two easy, two medium, one hard)
//   - each tier's pool is shuffled once per cycle, and the days walk down the shuffled list: every task comes exactly once per cycle (the hard daily pool of 93
//     means each hard task once in 93 days), and never again within a third of a cycle (not twice within 32 days)
//   - `eligible(task)` drops what a player cannot do (a business task for someone with no listing, an item they do not own), then the walk goes on over the rest
export const DAILY_SLOTS = ['easy', 'medium', 'hard'];
export const WEEKLY_SLOTS = ['easy', 'easy', 'medium', 'medium', 'hard'];

const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Days since 1970-01-01 (UTC) for a "YYYY-MM-DD" key. */
export const dayIndex = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
/** Weeks since the first Monday (UTC) for a "YYYY-MM-DD" key: a week is Monday to Sunday, as Building of the Week's is. */
export const weekIndex = (day) => Math.floor((dayIndex(day) + 3) / 7);

function shuffled(pool, seed, label, cycle) {
  const out = [...pool];
  const next = rng(hash(`${seed}|${label}|${cycle}`));
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// The order of each cycle, kept once made. A cycle is a fresh shuffle, with one rule so that a task cannot come round twice in quick succession: nothing from the last
// third of the cycle before may be in the first third of this one. So every task comes exactly once per cycle, and never again within a third of a cycle.
const cycles = new Map();
function orderOf(pool, seed, label, cycle) {
  const key = `${seed}|${label}|${pool.length}|${hash(pool.map((t) => t.id).join(','))}`;
  if (!cycles.has(key)) cycles.set(key, []);
  const made = cycles.get(key);
  while (made.length <= cycle) {
    const order = shuffled(pool, seed, label, made.length);
    if (made.length) {
      const third = Math.floor(pool.length / 3);
      const tail = new Set(made[made.length - 1].slice(pool.length - third).map((t) => t.id));
      let spare = third;
      for (let i = 0; i < third; i++) {
        if (!tail.has(order[i].id)) continue;
        while (tail.has(order[spare].id)) spare++;
        [order[i], order[spare]] = [order[spare], order[i]];
      }
    }
    made.push(order);
  }
  return made[cycle];
}
const at = (pool, seed, label, position) => (pool.length ? orderOf(pool, seed, label, Math.floor(position / pool.length))[position % pool.length] : null);

const poolOf = (catalogue, cadence, tier, eligible) => catalogue.tasks.filter((t) => t.cadence === cadence && t.tier === tier && eligible(t)).sort((a, b) => (a.id < b.id ? -1 : 1));

/** The day's tasks, in slot order (easy, medium, hard). */
export function tasksForDay(catalogue, seed, day, { eligible = () => true } = {}) {
  const d = dayIndex(day);
  return DAILY_SLOTS.map((tier) => at(poolOf(catalogue, 'daily', tier, eligible), seed, `daily-${tier}`, d)).filter(Boolean);
}

/** The week's tasks (the week that holds `day`), in slot order (easy, easy, medium, medium, hard). */
export function tasksForWeek(catalogue, seed, day, { eligible = () => true } = {}) {
  const w = weekIndex(day);
  const used = {};
  return WEEKLY_SLOTS.map((tier) => {
    const k = (used[tier] = (used[tier] ?? -1) + 1);
    const per = WEEKLY_SLOTS.filter((t) => t === tier).length;
    return at(poolOf(catalogue, 'weekly', tier, eligible), seed, `weekly-${tier}`, w * per + k);
  }).filter(Boolean);
}
