// Weeks and bookings for the market. Pure, so the server, the game and the tests use the same rules.
//
// A market week runs from Monday 00:00 to the next Monday 00:00, UTC. Each week has one layout (set by an admin, or an automatic one if
// nobody set it) and a stall is rented for 24, 48 or 72 hours inside that week at one flat price for the spot.
import { HOURS } from './layout';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const pad = (n) => String(n).padStart(2, '0');
const iso = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// The Monday (as 'YYYY-MM-DD') of the week that contains `ms`.
export function weekStartOf(ms = Date.now()) {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}
export const isWeekStart = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && weekStartOf(Date.parse(`${s}T00:00:00Z`)) === s && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const weekWindow = (week) => ({ start: Date.parse(`${week}T00:00:00Z`), end: Date.parse(`${week}T00:00:00Z`) + 7 * DAY });
export const addWeeks = (week, n) => iso(weekWindow(week).start + n * 7 * DAY);
// The weeks an admin can set up: this week and the next few.
export const upcomingWeeks = (ms = Date.now(), count = 6) => Array.from({ length: count }, (_, i) => addWeeks(weekStartOf(ms), i));
export const weekLabel = (week) => {
  const { start } = weekWindow(week);
  const fmt = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(start)} to ${fmt(start + 6 * DAY)}`;
};

// A layout for a week nobody has set up: the style turns with the week number, the arrangement of booths with the week and the site.
const STYLES = ['rows', 'columns', 'plaza'];
export function autoParams(siteCode, week) {
  const n = Math.floor(weekWindow(week).start / (7 * DAY));
  const h = [...String(siteCode)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { style: STYLES[(n + h) % STYLES.length], entrances: 2, seed: ((n * 2654435761 + h) >>> 0) % 99991 };
}

// A booking: where it starts and ends.
export const bookingEnd = (startMs, hours) => startMs + hours * HOUR;
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// Why a booking cannot be made, or null. `existing` is the bookings already made for this stall: [{ start, end }].
export function bookingProblem({ week, stall, startMs, hours, existing = [], nowMs = Date.now() }) {
  if (!HOURS.includes(hours)) return `A stall is rented for ${HOURS.join(', ')} hours.`;
  if (!stall) return 'There is no such stall in this week\'s layout.';
  const w = weekWindow(week);
  if (!Number.isFinite(startMs)) return 'Choose when the booking starts.';
  if (startMs < w.start) return 'That is before the week starts.';
  const end = bookingEnd(startMs, hours);
  if (end > w.end) return 'That would run past the end of the week. Choose a shorter booking or an earlier start.';
  if (startMs < nowMs - 5 * 60000) return 'That time has already passed.';
  if (existing.some((b) => overlaps({ start: startMs, end }, b))) return 'Someone already has this stall then.';
  return null;
}

// The earliest start for a booking made now in `week`: the next full hour, or the start of the week if it has not begun.
export function earliestStart(week, nowMs = Date.now()) {
  const w = weekWindow(week);
  return Math.max(w.start, Math.ceil(nowMs / HOUR) * HOUR);
}
