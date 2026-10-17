// Building of the Week: the rules, shared by the game, the business pages and the API (server/api/community.mjs), so they cannot drift.
//
//   - Every signed-in player has one vote a week (Monday to Sunday, UTC). Finding all three gold stars of a day that week earns one more.
//   - Each vote goes to a different building, and never to your own.
//   - Only businesses people can walk into take votes: not houses in Old Town, not the admin headquarters.
//   - Last week's most-voted building is this week's Building of the Week (a tie goes to the one that got there first).
//
// Without a game server the votes stay in this browser, and the rest of the city's votes are simulated (simulatedTally): a demo, labelled
// as one wherever it shows.
import { addWeeks, weekStartOf, weekWindow } from '../market/weeks';

export { addWeeks, weekStartOf, weekWindow };
export const BASE_VOTES = 1;
export const HUNT_BONUS_VOTES = 1;
export const LEADERS_SHOWN = 5;

export const votesAllowed = (huntWon) => BASE_VOTES + (huntWon ? HUNT_BONUS_VOTES : 0);
// When this week's voting closes (and the next Building of the Week is decided): the start of next week.
export const votingClosesAt = (week = weekStartOf()) => weekWindow(addWeeks(week, 1)).start;

// "3 days 4 h" until `at` (the minute is enough: this is a weekly vote).
export function timeLeft(at, now = Date.now()) {
  const m = Math.max(0, Math.round((at - now) / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d} day${d === 1 ? '' : 's'} ${h} h` : h ? `${h} h ${m % 60} min` : `${m} min`;
}

// Can this plot take a vote? (`plot` in the game's shape: owner, buildingType, admin, districtId.)
export const votable = (plot) => Boolean(plot && plot.owner && plot.buildingType !== 'house' && !plot.admin && plot.districtId !== 'suburb');

// Why `plot` cannot get a vote from someone who has already voted for `votedFor` and has `left` votes, or null if it can.
export function voteProblem(plot, { votedFor = [], left = 0, ownPlot = false } = {}) {
  if (!votable(plot)) return 'Vote for a business that people can visit.';
  if (ownPlot) return 'You cannot vote for your own building.';
  if (votedFor.includes(plot.id)) return 'You already voted for this building this week.';
  if (left <= 0) return 'You have used your votes this week.';
  return null;
}

// ---- the demo: the city's other votes, made up but steady ----------------------------------------------------------------------
// A small seeded random, so a week's simulated votes are the same on every page load and on the server.
function seeded(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// The simulated votes of `week`: a dozen of the busier businesses, with votes that grow through the week (a past week is complete).
// Returns [{ plotId, title, votes }], most votes first.
export function simulatedTally(plots, week, now = Date.now()) {
  const rand = seeded(`botw-${week}`);
  const pool = plots.filter(votable).sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0) || a.id - b.id).slice(0, 60);
  const { start, end } = weekWindow(week);
  const progress = Math.min(1, Math.max(0.15, (now - start) / (end - start)));
  const picked = new Map();
  for (let i = 0; i < 12 && pool.length; i++) {
    const p = pool[Math.floor(rand() * pool.length)];
    if (picked.has(p.id)) continue;
    picked.set(p.id, { plotId: p.id, title: p.title, votes: Math.max(1, Math.round((4 + rand() * 36) * progress)) });
  }
  return [...picked.values()].sort((a, b) => b.votes - a.votes || a.plotId - b.plotId);
}

// The simulated tally with this browser's own votes added: what the demo leaderboard shows.
export function withLocalVotes(tally, plots, votedFor) {
  const byId = new Map(tally.map((t) => [t.plotId, { ...t }]));
  for (const id of votedFor) {
    const row = byId.get(id);
    if (row) row.votes += 1;
    else {
      const p = plots.find((q) => q.id === id);
      if (p) byId.set(id, { plotId: id, title: p.title, votes: 1 });
    }
  }
  return [...byId.values()].sort((a, b) => b.votes - a.votes || a.plotId - b.plotId);
}
