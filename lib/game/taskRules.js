// What a task's goal MEANS, and which goals the server can verify today (docs/product/daily_weekly_tasks.md). Pure, shared by the server (services/api/tasks.mjs, which pays) and the
// pages (which only show progress), so the two cannot disagree. The rule of the whole system: the page never says a task is done and never says how much it pays. The server works out
// progress from ITS OWN records, for one account, inside one period, and pays the tier's Gold through the Gold wallet (services/api/gold.mjs).
//
//   supports(goal)           true when the server can verify this goal from its own records. A task whose goal is not supported is simply not offered.
//   progressOf(goal, facts)  { have, need, done } for one account in one period
//   windowOf(cadence, day)   the period: a UTC day, or a Monday-to-Sunday UTC week (as Building of the Week's)
//
// `facts` is what the server read for the account inside the window (see services/api/tasks.mjs gatherFacts):
//   visits [{ plotId, at }]       verified visits (the server's events table: the person's own account, a human by its checks, once a minute at most)
//   plot(id)                      a generated business's facts { id, title, district, type, category, colour, value, height, prime, luxury, grand } or null
//   districtPlots(district)       every generated business in a district (for "the tallest building")
//   stars [{ day, index, kind, at }]  chests [{ day }]  potds [{ day }]  huntWins [{ day }]    the Gold ledger and hunt_wins
//   votes [{ plotId, at }]        fish [{ fish, paid, at }]     wearing: Set of item ids worn and owned
//   leaders [plotId]  winner      this week's leaderboard and last week's winner (community.votesView)
//   claims [{ taskId, cadence, tier, category, gold, at, day }]   task_claims inside the window;  claimDays: every UTC day the account ever collected a daily task
//   task { id, cadence }          the task being evaluated (for "this week's OTHER tasks")
//   presence [{ kind, ref, phase, at, dwell, metres, mode, district }]   what the PRESENCE server saw (services/api/presence.mjs: derived events, after it checked the movement was plausible):
//                                 kind 'in' (ref district:<id> | place:<kind>:<id> | zone:<id> | edge:<side>), 'pass' (road:<name>), 'loop' (place:<kind>:<id>), 'distance' (ref = mode)
//   placeIds(kind)                the ids of every place of a kind (for "all the bridges")
import { hourAt, phaseName } from './dayCycle';
import { addWeeks, weekStartOf, weekWindow } from '../market/weeks';

const DAY_MS = 86400000;
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayWindow = (day) => ({ start: Date.parse(`${day}T00:00:00Z`), end: Date.parse(`${day}T00:00:00Z`) + DAY_MS });

/** The period of a cadence that holds `day`: { key, start, end }. Daily: the UTC day. Weekly: its Monday. */
export function windowOf(cadence, day) {
  if (cadence === 'weekly') {
    const week = weekStartOf(Date.parse(`${day}T12:00:00Z`));
    const w = weekWindow(week);
    return { key: week, start: w.start, end: w.end, next: addWeeks(week, 1) };
  }
  const w = dayWindow(day);
  return { key: day, start: w.start, end: w.end };
}

/** "dawn" | "day" | "dusk" | "night" at a real time: the city's shared clock (lib/game/dayCycle.js: a city day is 24 real minutes). */
export const phaseAt = (ms) => phaseName(hourAt(ms)).toLowerCase();

// A colour name from a hex colour: the SAME function as scripts/tasks/build-task-catalogue.mjs colourName (a test compares them), because the catalogue's colour tasks use its words.
export function colourName(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 0.12) return 'grey';
  const s = d / (1 - Math.abs(2 * l - 1));
  if (s < 0.14) return 'grey';
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 350) return 'red';
  if (h < 50 && l < 0.4) return 'brown';
  if (h < 40) return 'orange';
  if (h < 62) return 'yellow';
  if (h < 100) return 'lime';
  if (h < 165) return 'green';
  if (h < 195) return 'teal';
  if (h < 215) return 'sky blue';
  if (h < 235) return 'blue';
  if (h < 270) return 'violet';
  if (h < 305) return 'purple';
  if (h < 330) return 'magenta';
  return 'pink';
}

/** A generated plot as the rules read it. */
export const plotFacts = (p) => ({ id: p.id, title: p.title, district: p.districtId, type: p.buildingType, category: p.category, colour: p.color ? colourName(p.color) : null, value: p.value, height: p.height, prime: Boolean(p.prime), luxury: Boolean(p.luxury), grand: Boolean(p.grand) });

// ---- which goals can be verified from the server's own records
// A goal about where the avatar was (reach, be in, a road, a distance, a zone) is verified from the PRESENCE server's events (PRESENCE below), not the page's word. "Catch on a lake" is not: the
// position is not recorded with the fish. Goals that need an event nobody records (an emote, a chat message, an owner's action, minutes in a vehicle) are not verifiable either.
const SUBGOAL = new Set(['visit-business', 'visit-businesses', 'visit-extreme', 'districts', 'visit-types', 'visit-winner', 'visit-leader', 'vote', 'stars', 'chest', 'potd', 'hunt-won', 'catch', 'catch-all', 'catch-kinds', 'fish-gold', 'wear']);
const META = new Set(['tasks-complete', 'streak', 'task-gold']);
// Goals about where the avatar WAS: verified from the presence server's events (services/multiplayer/positions.mjs checked the movement was plausible; docs/architecture/presence_positions.md).
// Not the page's word. A goal about a place the world has no geometry for (a ride in the fun park, a plane, a vehicle's minutes) is not supported.
const PRESENCE = new Set(['be-in', 'reach', 'zone', 'zones', 'distance', 'road', 'cross-city', 'travel']);
export const PLACE_KINDS = ['park', 'lake', 'bridge', 'airport', 'mall', 'funpark', 'pier', 'river'];
const kindsOf = (place) => (Array.isArray(place) ? place : place === undefined ? [] : [place]);
function supportsPresence(goal) {
  switch (goal.type) {
    case 'be-in': return typeof goal.district === 'string' || goal.districts !== undefined;
    case 'reach': {
      const kinds = kindsOf(goal.place);
      if (kinds.some((k) => !PLACE_KINDS.includes(k))) return false; // rides, planes: no geometry
      if (goal.id !== undefined) return kinds.length === 1;
      if (goal.ids !== undefined) return Array.isArray(goal.ids) && goal.ids.length > 0;
      return goal.all === true || goal.oneOfEach === true;
    }
    case 'zone': return typeof goal.zone === 'string';
    case 'zones': return Number.isFinite(goal.count);
    case 'distance': return ['walk', 'drive', 'sail'].includes(goal.mode) && Number.isFinite(goal.metres);
    case 'road': return ['walk', 'drive'].includes(goal.mode) && (typeof goal.road === 'string' || (Array.isArray(goal.roads) && goal.roads.length > 0));
    case 'cross-city': return goal.axis === 'x' || goal.axis === 'z';
    case 'travel': return typeof goal.from === 'string' && typeof goal.to === 'string' && goal.mode === 'walk';
    default: return false;
  }
}
export const SUPPORTED_TYPES = [...SUBGOAL, ...META, ...PRESENCE, 'all'];

export function supports(goal) {
  if (!goal || typeof goal.type !== 'string') return false;
  const t = goal.type;
  if (t === 'all') return Array.isArray(goal.of) && goal.of.length > 0 && goal.of.every(supports);
  if (PRESENCE.has(t)) return supportsPresence(goal);
  if (!SUBGOAL.has(t) && !META.has(t)) return false;
  if (goal.place !== undefined) return false; // "on a lake", "at a pier", "in a mall" for a catch or a visit: a position at that moment, which is not recorded with it
  if (t === 'stars' && goal.before !== undefined) return false; // before noon: needs the time of each star on the city clock, not recorded
  if (t === 'visit-businesses' && goal.phases !== undefined && goal.phases !== 4) return false;
  return true;
}

// ---- helpers
const distinct = (list) => [...new Set(list)];
const result = (have, need) => ({ have: Math.min(have, need), need, done: have >= need });
const visitedPlots = (facts) => distinct(facts.visits.map((v) => v.plotId));

function matches(goal, p, at) {
  if (!p) return false;
  if (goal.district !== undefined && p.district !== goal.district) return false;
  if (goal.buildingType !== undefined && p.type !== goal.buildingType) return false;
  if (goal.category !== undefined && p.category !== goal.category) return false;
  if (goal.colour !== undefined && p.colour !== goal.colour) return false;
  if (goal.flag !== undefined && !p[goal.flag]) return false;
  if (goal.minValue !== undefined && !(p.value > goal.minValue)) return false;
  if (goal.nameEndsWith !== undefined && !String(p.title).endsWith(goal.nameEndsWith)) return false;
  if (goal.initial !== undefined && String(p.title).charAt(0).toUpperCase() !== String(goal.initial).toUpperCase()) return false;
  if (goal.phase !== undefined && phaseAt(at) !== goal.phase) return false;
  return true;
}

function daysCount(list) { return distinct(list.map((x) => x.day)).length; }
const claimDay = (c) => c.day ?? dayOf(c.at);

/** One run of consecutive UTC days ending at `end` ("2026-11-15"), counting back while the account collected a daily task. */
export function streakAt(claimDays, end) {
  const set = new Set(claimDays);
  let day = end;
  if (!set.has(day)) day = dayOf(Date.parse(`${end}T00:00:00Z`) - DAY_MS); // today is not over: the streak holds if yesterday is in
  let n = 0;
  while (set.has(day)) { n++; day = dayOf(Date.parse(`${day}T00:00:00Z`) - DAY_MS); }
  return n;
}
/** The longest run of consecutive days ever. */
export function bestStreak(claimDays) {
  const days = [...new Set(claimDays)].sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev && Date.parse(`${d}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`) === DAY_MS ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

// ---- goals about where the avatar was
const MODE_OF = { walk: 'walk', drive: 'car', sail: 'boat' }; // the catalogue's words for how you travel, and presence's
const presenceIn = (facts, ref) => facts.presence.filter((e) => e.kind === 'in' && e.ref === ref);
const phaseOk = (goal, e) => goal.phase === undefined || e.phase === goal.phase;
const refOf = (kind, id) => `place:${kind}:${id}`;

function beIn(goal, facts) {
  if (goal.districts !== undefined) return result(distinct(facts.presence.filter((e) => e.kind === 'in' && e.ref.startsWith('district:') && phaseOk(goal, e)).map((e) => e.ref)).length, goal.districts);
  const here = presenceIn(facts, `district:${goal.district}`);
  if (goal.phases !== undefined) return result(distinct(here.map((e) => e.phase)).length, goal.phases);
  return result(here.some((e) => phaseOk(goal, e)) ? 1 : 0, 1);
}

function reach(goal, facts) {
  const kinds = kindsOf(goal.place);
  // one place: here, at a time of day, on some days, or all the way round it
  if (goal.id !== undefined) {
    const ref = refOf(kinds[0], goal.id);
    if (goal.loop) return result(facts.presence.some((e) => e.kind === 'loop' && e.ref === ref) ? 1 : 0, 1);
    const here = presenceIn(facts, ref).filter((e) => phaseOk(goal, e));
    if (goal.days !== undefined) return result(distinct(here.map((e) => dayOf(e.at))).length, goal.days);
    return result(here.length > 0 ? 1 : 0, 1);
  }
  // a list of places (of one kind, or of any): all of them
  if (goal.ids !== undefined) {
    const been = (id) => facts.presence.some((e) => e.kind === 'in' && (kinds.length ? kinds.some((k) => e.ref === refOf(k, id)) : e.ref.startsWith('place:') && e.ref.endsWith(`:${id}`)));
    return result(goal.ids.filter(been).length, goal.ids.length);
  }
  // every place of a kind, or of each of several kinds; or one of each kind
  if (goal.oneOfEach) return result(kinds.filter((k) => facts.presence.some((e) => e.kind === 'in' && e.ref.startsWith(`place:${k}:`))).length, kinds.length);
  const all = kinds.flatMap((k) => facts.placeIds(k).map((id) => refOf(k, id)));
  return result(all.filter((ref) => facts.presence.some((e) => e.kind === 'in' && e.ref === ref)).length, all.length || 1);
}

/** { have, need, done } for `goal` and `facts`. A goal that is not supported is never done. */
export function progressOf(goal, facts) {
  if (!supports(goal)) return { have: 0, need: 1, done: false };
  if (!facts.presence || !facts.placeIds) facts = { presence: [], placeIds: () => [], ...facts }; // facts made without the presence server's events: nothing was seen there
  switch (goal.type) {
    case 'visit-business': return result(visitedPlots(facts).includes(goal.plotId) ? 1 : 0, 1);
    case 'visit-businesses': {
      if (goal.categories) return result(distinct(facts.visits.filter((v) => goal.categories.includes(facts.plot(v.plotId)?.category)).map((v) => facts.plot(v.plotId).category)).length, goal.categories.length);
      if (goal.phases === 4) return result(distinct(facts.visits.filter((v) => facts.plot(v.plotId)).map((v) => phaseAt(v.at))).length, 4);
      return result(distinct(facts.visits.filter((v) => matches(goal, facts.plot(v.plotId), v.at)).map((v) => v.plotId)).length, goal.count ?? 1);
    }
    case 'visit-extreme': {
      const list = facts.districtPlots(goal.district).filter((p) => typeof p[goal.by] === 'number');
      if (!list.length) return result(0, 1);
      const best = list.reduce((a, b) => ((goal.pick === 'min' ? b[goal.by] < a[goal.by] : b[goal.by] > a[goal.by]) ? b : a));
      return result(visitedPlots(facts).includes(best.id) ? 1 : 0, 1);
    }
    case 'districts': {
      const seen = distinct(visitedPlots(facts).map((id) => facts.plot(id)?.district).filter(Boolean));
      return goal.ids ? result(goal.ids.filter((d) => seen.includes(d)).length, goal.ids.length) : result(seen.length, goal.count ?? 1);
    }
    case 'visit-types': {
      const seen = distinct(visitedPlots(facts).map((id) => facts.plot(id)?.type).filter(Boolean));
      return result(goal.types.filter((t) => seen.includes(t)).length, goal.types.length);
    }
    case 'be-in': return beIn(goal, facts);
    case 'reach': return reach(goal, facts);
    case 'zone': return result(presenceIn(facts, `zone:${goal.zone}`).filter((e) => phaseOk(goal, e) && (goal.seconds === undefined || e.dwell >= goal.seconds)).length > 0 ? 1 : 0, 1);
    case 'zones': return result(distinct(facts.presence.filter((e) => e.kind === 'in' && e.ref.startsWith('zone:')).map((e) => e.ref)).length, goal.count);
    case 'distance': {
      const mode = MODE_OF[goal.mode];
      return result(Math.floor(facts.presence.filter((e) => e.kind === 'distance' && e.mode === mode && (goal.district === undefined ? e.district === '' : e.district === goal.district)).reduce((n, e) => n + e.metres, 0)), goal.metres);
    }
    case 'road': {
      const mode = MODE_OF[goal.mode];
      const passed = (name) => facts.presence.filter((e) => e.kind === 'pass' && e.ref === `road:${name}` && e.mode === mode && phaseOk(goal, e));
      if (goal.roads) return result(goal.roads.filter((r) => passed(r).length > 0).length, goal.roads.length);
      if (goal.days !== undefined) return result(distinct(passed(goal.road).map((e) => dayOf(e.at))).length, goal.days);
      return result(passed(goal.road).length > 0 ? 1 : 0, 1);
    }
    case 'travel': {
      // from one district to another, on foot: seen there, and later (within two hours) seen in the other, both times walking (the presence server checked the movement between)
      const to = presenceIn(facts, `district:${goal.to}`).filter((e) => e.mode === MODE_OF[goal.mode]);
      const from = presenceIn(facts, `district:${goal.from}`).filter((e) => e.mode === MODE_OF[goal.mode]);
      return result(from.some((a) => to.some((b) => b.at > a.at && b.at - a.at <= 2 * 3600000)) ? 1 : 0, 1);
    }
    case 'cross-city': {
      const sides = goal.axis === 'x' ? ['west', 'east'] : ['north', 'south'];
      return result(sides.filter((side) => presenceIn(facts, `edge:${side}`).length > 0).length, 2);
    }
    case 'visit-winner': return result(facts.winner != null && visitedPlots(facts).includes(facts.winner) ? 1 : 0, 1);
    case 'visit-leader': {
      const seen = visitedPlots(facts);
      if (goal.all) return result(facts.leaders.slice(0, goal.all).filter((id) => seen.includes(id)).length, goal.all);
      const id = facts.leaders[(goal.rank ?? 1) - 1];
      return result(id != null && seen.includes(id) ? 1 : 0, 1);
    }
    case 'vote': return result(facts.votes.filter((v) => matches({ ...goal, count: undefined }, facts.plot(v.plotId), v.at)).length, goal.count ?? 1);
    case 'stars': {
      const list = facts.stars.filter((s) => goal.kind === undefined || s.kind === goal.kind);
      if (goal.days !== undefined) return result(daysCount(list), goal.days);
      return result(distinct(list.map((s) => `${s.day}#${s.index}`)).length, goal.count ?? 1);
    }
    case 'chest': return result(daysCount(facts.chests), goal.days ?? 1);
    case 'potd': return result(daysCount(facts.potds), goal.days ?? 1);
    case 'hunt-won': return result(daysCount(facts.huntWins), goal.days ?? 1);
    case 'catch': return result(facts.fish.filter((f) => (goal.fish === undefined || f.fish === goal.fish) && (goal.phase === undefined || phaseAt(f.at) === goal.phase)).length, goal.count ?? 1);
    case 'catch-all': return result(goal.fish.filter((id) => facts.fish.some((f) => f.fish === id)).length, goal.fish.length);
    case 'catch-kinds': return result(distinct(facts.fish.filter((f) => f.fish !== 'boot').map((f) => f.fish)).length, goal.kinds);
    case 'fish-gold': return result(facts.fish.reduce((n, f) => n + f.paid, 0), goal.gold);
    case 'wear': {
      const items = goal.items ?? [goal.item];
      return result(items.filter((i) => facts.wearing.has(i)).length, items.length);
    }
    case 'all': {
      if (goal.sameDay) {
        // one single day on which every part was done: the facts are cut to each day in turn
        const days = distinct([...facts.visits.map((v) => dayOf(v.at)), ...facts.stars.map((s) => s.day), ...facts.chests.map((c) => c.day), ...facts.potds.map((p) => p.day)]);
        const best = days.map((d) => goal.of.map((g) => progressOf(g, cut(facts, d)).done)).find((parts) => parts.every(Boolean));
        return result(best ? goal.of.length : 0, goal.of.length);
      }
      return result(goal.of.filter((g) => progressOf(g, facts).done).length, goal.of.length);
    }
    case 'tasks-complete': {
      let list = facts.claims.filter((c) => (goal.cadence === undefined || c.cadence === goal.cadence) && (goal.tier === undefined || c.tier === goal.tier) && (goal.category === undefined || c.category === goal.category));
      if (goal.others) list = list.filter((c) => c.taskId !== facts.task?.id);
      if (goal.days !== undefined) {
        const perDay = {};
        for (const c of list) perDay[claimDay(c)] = (perDay[claimDay(c)] ?? 0) + 1;
        const full = goal.all ? 3 : 1; // a "full" day is all three of its daily tasks
        return result(Object.values(perDay).filter((n) => n >= full).length, goal.days);
      }
      return result(list.length, goal.count ?? 1);
    }
    case 'streak': return result(streakAt(facts.claimDays, facts.today), goal.days);
    case 'task-gold': return result(facts.claims.filter((c) => c.taskId !== facts.task?.id).reduce((n, c) => n + c.gold, 0), goal.gold);
    default: return { have: 0, need: 1, done: false };
  }
}

// the same facts restricted to one UTC day
function cut(facts, day) {
  const on = (at) => dayOf(at) === day;
  return { ...facts, visits: facts.visits.filter((v) => on(v.at)), stars: facts.stars.filter((s) => s.day === day), chests: facts.chests.filter((c) => c.day === day), potds: facts.potds.filter((p) => p.day === day), votes: facts.votes.filter((v) => on(v.at)), fish: facts.fish.filter((f) => on(f.at)), presence: facts.presence.filter((e) => on(e.at)) };
}
