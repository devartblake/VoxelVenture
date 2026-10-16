import { ApiError, fail, getPlot, plotView, requireAccount } from './core.mjs';
import { transaction } from './db.mjs';
import { enqueue, noticeAddress } from './engage.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// Leases (renewing, notices, an admin way to end one) and Building of the Week (the daily collectibles earn a vote). The rules are the game's own, in
// lib/game/leases.js; this is the part that needs the database.
const { DAY_MS, GRACE_DAYS, RENEWAL_WINDOW_DAYS, leaseState, renewalPrice, termOf, extendedEnd } = await imp('game/leases.js');
const { weekStartOf, addWeeks, weekWindow } = await imp('market/weeks.js');
const { HUNT_COUNT } = await imp('game/daily.js');
const now = () => Date.now();

// ---- leases ---------------------------------------------------------------------------------------------------------
// The tenant renews: in the last 14 days of the lease, the grace week after it, or later if nobody has taken the plot over. Half the price of a new lease.
export function renewLease(db, account, plotId, input = {}) {
  requireAccount(account);
  return transaction(db, () => {
    const p = getPlot(db, plotId);
    if (p.owner_account !== account.id) throw new ApiError(404, 'There is no business of yours here.', 'not_yours');
    if (!p.lease_end) fail(409, 'This business has no lease to renew.', 'no_lease');
    const state = leaseState(p.lease_end);
    if (state === 'active') fail(409, `You can renew in the last ${RENEWAL_WINDOW_DAYS} days of the lease.`, 'too_early');
    const days = input.leaseDays == null ? p.lease_days : termOf(input.leaseDays)?.days ?? fail(400, 'A lease is 30, 90 or 365 days.', 'bad_term');
    const price = renewalPrice(p.value, days);
    const end = extendedEnd(state === 'open' ? null : p.lease_end, days);
    db.prepare('UPDATE plots SET lease_days = ?, lease_end = ?, lease_notified = 0, updated_at = ? WHERE id = ?').run(days, end, now(), p.id);
    db.prepare("INSERT INTO ledger (plot_id, kind, account_id, owner_name, title, price, at) VALUES (?, 'renew', ?, ?, ?, ?, ?)").run(p.id, account.id, account.username, p.title, price, now());
    return { plot: plotView(db, getPlot(db, p.id)), paid: price };
  });
}

// An admin ends a lease early (for support, and for the tests): 'renewal' puts it in its last days, 'grace' just past its end, 'open' open to a buyout.
export function setLeaseState(db, plotId, state) {
  const p = getPlot(db, plotId);
  const end = { renewal: now() + 3 * DAY_MS, grace: now() - DAY_MS, open: now() - (GRACE_DAYS + 1) * DAY_MS }[state];
  if (!end) fail(400, 'state must be renewal, grace or open.', 'bad_state');
  db.prepare('UPDATE plots SET lease_end = ?, lease_days = COALESCE(lease_days, 365), lease_start = COALESCE(lease_start, ?), lease_notified = 0 WHERE id = ?').run(end, now(), p.id);
  return { ok: true, lease: plotView(db, getPlot(db, p.id)).lease };
}

// The emails around a lease: when its last 14 days begin, when it ends (the grace week starts) and when the plot opens to a buyout. Each is sent once.
export function sendLeaseNotices(db, at = now()) {
  let sent = 0;
  const rows = db.prepare('SELECT * FROM plots WHERE owner_account IS NOT NULL AND lease_end IS NOT NULL').all();
  for (const r of rows) {
    const state = leaseState(r.lease_end, at);
    const bit = { renewal: 1, grace: 2, open: 4 }[state];
    if (!bit || r.lease_notified & bit) continue;
    const to = noticeAddress(db, r.owner_account);
    if (to) {
      const subject = { renewal: `${r.title}: your lease ends soon`, grace: `${r.title}: your lease has ended`, open: `${r.title} is open to a buyout` }[state];
      const body = {
        renewal: `The lease on ${r.title} (plot #${r.id}) ends on ${new Date(r.lease_end).toUTCString()}. Until then nobody else can take it over, and you can renew now for ${renewalPrice(r.value, r.lease_days).toLocaleString()}.`,
        grace: `The lease on ${r.title} (plot #${r.id}) has ended. You have ${GRACE_DAYS} days to renew before anyone else can take it over.`,
        open: `The lease on ${r.title} (plot #${r.id}) ended and the week to renew has passed, so anyone can take it over now. You can still renew it until someone does.`,
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

function votingStatus(db, account) {
  const week = weekStartOf();
  const next = addWeeks(week, 1);
  const won = account ? db.prepare('SELECT COUNT(*) AS n FROM hunt_wins WHERE account_id = ? AND day >= ? AND day < ?').get(account.id, week, next).n > 0 : false;
  const mine = account ? db.prepare('SELECT plot_id FROM votes WHERE week = ? AND account_id = ?').get(week, account.id) : null;
  return { week, earned: won, voted: mine ? mine.plot_id : null, canVote: won && !mine };
}

const tally = (db, week) =>
  db
    .prepare("SELECT v.plot_id AS plotId, p.title, p.owner_name AS owner, COUNT(*) AS votes, MAX(v.at) AS last FROM votes v JOIN plots p ON p.id = v.plot_id WHERE v.week = ? GROUP BY v.plot_id ORDER BY votes DESC, last ASC, plotId ASC")
    .all(week);

// This week's votes so far, the winner of last week, and whether this player can vote.
export function votesView(db, account) {
  const week = weekStartOf();
  const last = tally(db, addWeeks(week, -1))[0] ?? null;
  return { ...votingStatus(db, account), leaders: tally(db, week).slice(0, 5).map(({ last: _l, ...r }) => r), winner: last ? { plotId: last.plotId, title: last.title, votes: last.votes, week: addWeeks(week, -1) } : null, endsAt: weekWindow(addWeeks(week, 1)).start };
}

export function castVote(db, account, plotId) {
  requireAccount(account);
  return transaction(db, () => {
    const status = votingStatus(db, account);
    if (!status.earned) fail(403, 'Find all three daily collectibles to earn this week\'s vote.', 'not_earned');
    if (status.voted) fail(409, 'You have already voted this week.', 'voted');
    const p = getPlot(db, plotId);
    if (!p.owner_name || p.building_type === 'house' || !p.claimable) fail(400, 'Vote for a business that people can visit.', 'bad_plot');
    db.prepare('INSERT INTO votes (week, account_id, plot_id, at) VALUES (?,?,?,?)').run(status.week, account.id, p.id, now());
    return votesView(db, account);
  });
}

// Last week's winner: the Building of the Week for this week (null until a week has had votes).
export function buildingOfTheWeek(db) {
  const week = weekStartOf();
  const w = tally(db, addWeeks(week, -1))[0];
  return w ? { plotId: w.plotId, title: w.title, votes: w.votes, week: addWeeks(week, -1) } : null;
}
