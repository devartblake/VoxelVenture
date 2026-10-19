import { ApiError, TERM_MESSAGE, fail, getPlot, hasPro, plotView, pricedPlot, requireAccount } from './core.mjs';
import { transaction } from './db.mjs';
import { enqueue, noticeAddress } from './engage.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// Leases (renewing, notices, an admin way to end one) and Building of the Week (the daily collectibles earn a vote). The rules are the game's own, in
// lib/game/leases.js; this is the part that needs the database.
const { DAY_MS, GRACE_DAYS, leaseState, renewalWindowDays, termFor, termOf, extendedEnd } = await imp('game/leases.js');
const { renewalQuote } = await imp('game/claimPrice.js');
const { weekStartOf, addWeeks } = await imp('market/weeks.js');
const { HUNT_COUNT } = await imp('game/daily.js');
const { votesAllowed, votingClosesAt, LEADERS_SHOWN } = await imp('game/buildingOfWeek.js');
const now = () => Date.now();

// ---- leases ---------------------------------------------------------------------------------------------------------
// The tenant renews: in the renewal window at the end of the lease (its last 7 days, the last 3 of a 7-day lease), the 3 grace days after it, or later
// if nobody has taken the plot over. 90% of the price of a new lease of the plot with the outside it has now (lib/game/claimPrice.js renewalQuote), less
// 15% if the tenant has Pro, so a lease made under older prices renews at today's. Without a chosen term it renews for the one it had; a lease of a term
// no longer offered (90, 182 or 365 days, before the terms became 7, 14 and 30 days) for 30 days.
export function renewLease(db, account, plotId, input = {}, opts = {}) {
  requireAccount(account);
  return transaction(db, () => {
    const p = getPlot(db, plotId);
    if (p.owner_account !== account.id) throw new ApiError(404, 'There is no business of yours here.', 'not_yours');
    if (!p.lease_end) fail(409, 'This business has no lease to renew.', 'no_lease');
    const state = leaseState(p.lease_end, now(), p.lease_days);
    if (state === 'active') fail(409, `You can renew in the last ${renewalWindowDays(p.lease_days)} days of the lease.`, 'too_early');
    const days = input.leaseDays == null ? termFor(p.lease_days) : termOf(input.leaseDays)?.days ?? fail(400, TERM_MESSAGE, 'bad_term');
    const price = renewalQuote(pricedPlot(p), days, { pro: opts.pro ?? hasPro(db, account.id) }).total;
    const end = extendedEnd(state === 'open' ? null : p.lease_end, days);
    db.prepare('UPDATE plots SET lease_days = ?, lease_end = ?, lease_notified = 0, updated_at = ? WHERE id = ?').run(days, end, now(), p.id);
    db.prepare("INSERT INTO ledger (plot_id, kind, account_id, owner_name, title, price, at) VALUES (?, 'renew', ?, ?, ?, ?, ?)").run(p.id, account.id, account.username, p.title, price, now());
    return { plot: plotView(db, getPlot(db, p.id)), paid: price };
  });
}

// An admin ends a lease early (for support, and for the tests): 'renewal' puts it in its last days (2 days left: inside the renewal window of every term),
// 'grace' just past its end (a day into the GRACE_DAYS), 'open' open to a buyout (the grace days have passed).
export function setLeaseState(db, plotId, state) {
  const p = getPlot(db, plotId);
  const end = { renewal: now() + 2 * DAY_MS, grace: now() - DAY_MS, open: now() - (GRACE_DAYS + 1) * DAY_MS }[state];
  if (!end) fail(400, 'state must be renewal, grace or open.', 'bad_state');
  db.prepare('UPDATE plots SET lease_end = ?, lease_days = COALESCE(lease_days, 30), lease_start = COALESCE(lease_start, ?), lease_notified = 0 WHERE id = ?').run(end, now(), p.id);
  return { ok: true, lease: plotView(db, getPlot(db, p.id)).lease };
}

// The emails around a lease: when its renewal window begins (its last 7 days, the last 3 of a 7-day lease), when it ends (the grace days start) and when
// the plot opens to a buyout. Each is sent once.
export function sendLeaseNotices(db, at = now()) {
  let sent = 0;
  const rows = db.prepare('SELECT * FROM plots WHERE owner_account IS NOT NULL AND lease_end IS NOT NULL').all();
  for (const r of rows) {
    const state = leaseState(r.lease_end, at, r.lease_days);
    const bit = { renewal: 1, grace: 2, open: 4 }[state];
    if (!bit || r.lease_notified & bit) continue;
    const to = noticeAddress(db, r.owner_account);
    if (to) {
      const subject = { renewal: `${r.title}: your lease ends soon`, grace: `${r.title}: your lease has ended`, open: `${r.title} is open to a buyout` }[state];
      const body = {
        renewal: `The lease on ${r.title} (plot #${r.id}) ends on ${new Date(r.lease_end).toUTCString()}. Until then nobody else can take it over, and you can renew now for $${renewalQuote(pricedPlot(r), termFor(r.lease_days), { pro: hasPro(db, r.owner_account, at) }).total.toLocaleString()}. Once it ends you can no longer change the building's inside, or pay to build onto its outside, until you renew; visitors still see your design.`,
        grace: `The lease on ${r.title} (plot #${r.id}) has ended. You have ${GRACE_DAYS} days to renew before anyone else can take it over. Until you renew, the building's inside can't be changed and its outside can't be built onto; visitors still see your design.`,
        open: `The lease on ${r.title} (plot #${r.id}) ended and the ${GRACE_DAYS} days to renew have passed, so anyone can take it over now. You can still renew it until someone does.`,
      }[state];
      enqueue(db, { to, kind: `lease_${state}`, subject, body });
      sent++;
    }
    db.prepare('UPDATE plots SET lease_notified = lease_notified | ? WHERE id = ?').run(bit, r.id);
  }
  return { sent };
}

// ---- Building of the Week -------------------------------------------------------------------------------------------
const dayMs = (day) => (/^\d{4}-\d{2}-\d{2}$/.test(String(day)) ? Date.parse(`${day}T12:00:00Z`) : NaN);

// The player found all three collectibles of a day. The server cannot see where they stood, so it checks the day is today (give or take a day for time zones)
// and that all of today's stars are named; it is a lightweight check, not a proof.
export function completeHunt(db, account, input = {}) {
  requireAccount(account);
  const ms = dayMs(input.day);
  if (!Number.isFinite(ms) || Math.abs(ms - now()) > 2 * DAY_MS) fail(400, 'That is not today.', 'bad_day');
  const found = new Set((Array.isArray(input.found) ? input.found : []).map(Number));
  if (!Array.from({ length: HUNT_COUNT }, (_, i) => i).every((i) => found.has(i))) fail(400, 'Find all three first.', 'incomplete');
  db.prepare('INSERT OR IGNORE INTO hunt_wins (account_id, day, at) VALUES (?,?,?)').run(account.id, input.day, now());
  return { ok: true, ...votingStatus(db, account) };
}

// The rules are in lib/game/buildingOfWeek.js: one vote a week for every signed-in player, one more for finding all three stars on a day of
// the week, each for a different building, never your own.
function votingStatus(db, account) {
  const week = weekStartOf();
  const next = addWeeks(week, 1);
  const huntWon = account ? db.prepare('SELECT COUNT(*) AS n FROM hunt_wins WHERE account_id = ? AND day >= ? AND day < ?').get(account.id, week, next).n > 0 : false;
  const votedFor = account ? db.prepare('SELECT plot_id FROM votes WHERE week = ? AND account_id = ? ORDER BY at').all(week, account.id).map((r) => r.plot_id) : [];
  const allowed = account ? votesAllowed(huntWon) : 0;
  return { week, signedIn: Boolean(account), huntWon, allowed, votedFor, votesLeft: Math.max(0, allowed - votedFor.length), canVote: votedFor.length < allowed };
}

// The votes of a week, most first, with the business page of each building when it has one (for the Discover page).
const tally = (db, week) =>
  db
    .prepare("SELECT v.plot_id AS plotId, p.title, p.owner_name AS owner, COUNT(*) AS votes, MAX(v.at) AS last, (SELECT b.slug FROM businesses b WHERE b.plot_id = v.plot_id AND b.status = 'published') AS slug FROM votes v JOIN plots p ON p.id = v.plot_id WHERE v.week = ? GROUP BY v.plot_id ORDER BY votes DESC, last ASC, plotId ASC")
    .all(week)
    .map(({ last: _l, ...r }) => r);

// This week's leaders, last week's winner (this week's Building of the Week), when voting closes, and what this player can still do.
export function votesView(db, account) {
  const week = weekStartOf();
  const last = tally(db, addWeeks(week, -1))[0] ?? null;
  return { ...votingStatus(db, account), leaders: tally(db, week).slice(0, LEADERS_SHOWN), winner: last ? { ...last, week: addWeeks(week, -1) } : null, endsAt: votingClosesAt(week) };
}

export function castVote(db, account, plotId) {
  requireAccount(account);
  return transaction(db, () => {
    const status = votingStatus(db, account);
    const p = getPlot(db, plotId);
    if (!p.owner_name || p.building_type === 'house' || !p.claimable) fail(400, 'Vote for a business that people can visit.', 'bad_plot');
    if (p.owner_account === account.id) fail(400, 'You cannot vote for your own building.', 'own_building');
    if (status.votedFor.includes(p.id)) fail(409, 'You already voted for this building this week.', 'already_voted');
    if (!status.canVote) fail(409, status.huntWon ? 'You have used your votes this week.' : 'You have used this week\'s vote. Find all three gold stars on any day this week for one more.', 'no_votes_left');
    db.prepare('INSERT INTO votes (week, account_id, plot_id, at) VALUES (?,?,?,?)').run(status.week, account.id, p.id, now());
    return votesView(db, account);
  });
}

// Last week's winner: the Building of the Week for this week (null until a week has had votes).
export function buildingOfTheWeek(db) {
  const week = weekStartOf();
  const w = tally(db, addWeeks(week, -1))[0];
  return w ? { ...w, week: addWeeks(week, -1) } : null;
}
