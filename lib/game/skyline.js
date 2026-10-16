// Activity-based skyline: a building grows with the real, verified attention it gets, not only with the money spent on it. Pure, so the server (which
// counts the engagement) and the game (which draws the building) use the same rules.
//
// The engagement of a business is worked out from its last 30 days of verified human traffic (server/api/core.mjs, events with verified = 1):
//   unique visitors, Visit website clicks, and the time people spend inside. A building then has a level from 0 to 3:
//     level 1: a roof light and 10% taller      level 2: a pennant on the roof and 25% taller      level 3: a plaza fountain out front and 45% taller
//   and a "Verified traffic" badge once ten different real people have visited.
export const SKYLINE_WINDOW_DAYS = 30;
export const LEVELS = [
  { level: 0, min: 0, factor: 1 },
  { level: 1, min: 25, factor: 1.1 },
  { level: 2, min: 100, factor: 1.25 },
  { level: 3, min: 300, factor: 1.45 },
];
export const VERIFIED_UNIQUES = 10;
export const MAX_HEIGHT = 12; // no building is ever taller than this, whatever its traffic

// One number for how much real attention a business has had: each unique visitor counts 2, each click 4, and every minute people spend inside 1.
export function engagementScore({ uniques = 0, clicks = 0, views = 0, avgSeconds = 0 } = {}) {
  const dwellMinutes = (views * Math.min(Math.max(avgSeconds, 0), 180)) / 60;
  return Math.round(uniques * 2 + clicks * 4 + dwellMinutes);
}

export function skylineFor(stats = {}) {
  const score = engagementScore(stats);
  const row = [...LEVELS].reverse().find((l) => score >= l.min) ?? LEVELS[0];
  const badges = [];
  if ((stats.uniques ?? 0) >= VERIFIED_UNIQUES) badges.push('verified');
  if (row.level >= 1) badges.push('light');
  if (row.level >= 2) badges.push('pennant');
  if (row.level >= 3) badges.push('fountain');
  return { level: row.level, factor: row.factor, score, badges };
}

// The height a building is drawn at: its generated height times the level's factor, to one decimal place and never past MAX_HEIGHT (or its own height, if that is higher).
export const grownHeight = (baseHeight, level) => {
  const factor = LEVELS.find((l) => l.level === level)?.factor ?? 1;
  return Math.max(baseHeight, Math.min(MAX_HEIGHT, Math.round(baseHeight * factor * 10) / 10));
};
