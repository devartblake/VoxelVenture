import crypto from 'node:crypto';
import { transaction } from './db.mjs';
import { ApiError, fail, getPlot, hasPro, pricedPlot, requireAccount, text } from './core.mjs';
import { BOT_UA, ipHashOf } from './business.mjs';
import { enqueue, noticeAddress } from './engage.mjs';
import { imp } from '../../scripts/lib-loader.mjs';
import { keptByTarget } from './retention.mjs';

// The plot economy's data (docs/monetization/plot_economy_data.md): what a demand index will be fitted on after the pilot. Nothing here sets a
// price; the prices are the game's own (lib/game/claimPrice.js), only read here to record what a player was shown.
//
//   holds      the server's claim hold: three minutes for one account to set an empty plot up; nobody else can hold, claim or take it over
//   intents    each step towards a plot (card opened, hold, price shown, checkout, claimed, refused, given up), verified like a visit
//   traffic    players passing through each area of the map (not going in), counted in memory and written once a minute
//   watches    "watch this plot": an email when an occupied plot's lease ends, when it opens to a buyout and when it is taken over; the
//              tenant sees how many watch, admins see who
//   report     GET /admin/economy: per tier and per district, for a date range
const { areaOf, isAreaId, MAX_AREAS_PER_PING, CLIENT_STEPS, SIGNED_IN_STEPS, HOLD_SECONDS, HOLD_MAX_SECONDS, MAX_WATCHES, AREA_SIZE } = await imp('game/economy.js');
const { DEFAULT_TERM, GRACE_DAYS, leaseState, takeoverAllowed } = await imp('game/leases.js');
const { leaseQuote, takeoverQuote } = await imp('game/claimPrice.js');
const { cleanExterior, tierOfPlot } = await imp('game/exterior.js');

const DAY = 86400000;
const now = () => Date.now();
const HOLD_MS = HOLD_SECONDS * 1000;
export const INTENT_DAYS = 180; // raw intents are deleted after this (the policy's retention table: lib/legal/retention.js)
export const TRAFFIC_SEEN_DAYS = 2; // who was already counted in an area: only needed for the day itself
// a day's verified steps from one network for one plot, by step (more are kept but not counted)
const CAPS = { card_open: 3, open: 3, hold: 5, quote: 10 };
const TRAFFIC_CAP = 3; // players a day from one network in one area (a household, an office)
const goodVisitor = (id) => /^[A-Za-z0-9_-]{4,40}$/.test(String(id ?? ''));
const hashOf = (salt, s) => crypto.createHash('sha256').update(`${salt ?? 'voxelventure'}|${s}`).digest('hex').slice(0, 16);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const cents = (dollars) => (Number.isFinite(Number(dollars)) ? Math.round(Number(dollars) * 100) : null);
const factsOf = (row) => JSON.parse(row.facts);
// a step is recorded with a try: the data must never stop a claim
const safe = (fn) => {
  try {
    return fn();
  } catch (e) {
    console.error('economy:', e.message);
    return null;
  }
};

// ---- intents -------------------------------------------------------------------------------------------------------------------------------
// The kind of a plot for its intents: 'claim' (an empty plot), 'takeover' (a business open to a buyout), 'occupied' (a business its lease protects),
// or null for what is not for sale (Old Town houses, the admin headquarters).
function kindOf(row, at = now()) {
  if (!row.claimable || factsOf(row).admin) return null;
  if (!row.owner_name) return 'claim';
  return takeoverAllowed(row.lease_end, at) ? 'takeover' : 'occupied';
}
// Who did it: a signed-in account, or a visitor number (only ever kept hashed).
const whoOf = (account, visitor, salt) => (account ? { accountId: account.id, visitor: null } : { accountId: null, visitor: goodVisitor(visitor) ? hashOf(salt, `v${visitor}`) : null });
const sameWho = (who) => (who.accountId ? ['account_id = ?', who.accountId] : ['visitor = ?', who.visitor]);

// Writes one step. Verified (counted in the report) unless it comes from a robot, from the plot's own tenant, or from a network that has already made
// the step's daily cap for this plot; `human` false (no presence yet) also leaves it unverified. Returns { recorded, verified }.
export function recordIntent(db, { row, kind, step, who, priceCents = null, termDays = null, ctx = {}, human = true, verified, at = now() }) {
  const ipHash = ipHashOf(ctx);
  let ok = verified;
  if (ok == null) {
    ok = human && !BOT_UA.test(String(ctx.userAgent ?? '')) && !(who.accountId && who.accountId === row.owner_account);
    if (ok && ipHash && CAPS[step]) ok = db.prepare('SELECT COUNT(*) AS n FROM plot_intents WHERE plot_id = ? AND step = ? AND ip_hash = ? AND verified = 1 AND at >= ?').get(row.id, step, ipHash, at - DAY).n < CAPS[step];
  }
  db.prepare('INSERT INTO plot_intents (plot_id, kind, step, account_id, visitor, ip_hash, price_cents, term_days, at, verified) VALUES (?,?,?,?,?,?,?,?,?,?)').run(row.id, kind, step, who.accountId, who.visitor, ipHash, priceCents, termDays, at, ok ? 1 : 0);
  return { recorded: true, verified: Boolean(ok) };
}

// The price the claim form shows for a setup ({ leaseDays, buildingType, exterior }), as the server would charge it, or a take-over's (with the
// player's Pro discount, as the form shows it).
function quoteFor(row, kind, input = {}, pro = false) {
  const type = ['shop', 'restaurant', 'office'].includes(input.buildingType) ? input.buildingType : 'shop';
  const days = Number(input.leaseDays) || DEFAULT_TERM;
  const plot = pricedPlot(row);
  let exterior = null;
  if (input.exterior && typeof input.exterior === 'object') exterior = safe(() => cleanExterior(input.exterior, factsOf(row), type));
  const q = kind === 'claim' ? leaseQuote(plot, exterior, type, days, { pro }) : takeoverQuote(plot, null, type, days, { pro });
  return { priceCents: cents(q.total), termDays: q.days };
}
// A quote is written when it differs from the last one this player was shown for this plot in the last half hour.
function recordQuote(db, row, kind, who, input, ctx, human) {
  const q = quoteFor(row, kind, input, who.accountId ? hasPro(db, who.accountId) : false);
  const [w, v] = sameWho(who);
  const last = db.prepare(`SELECT price_cents, term_days FROM plot_intents WHERE plot_id = ? AND step = 'quote' AND ${w} AND at >= ? ORDER BY id DESC LIMIT 1`).get(row.id, v, now() - 30 * 60000);
  if (last && last.price_cents === q.priceCents && last.term_days === q.termDays) return { recorded: false, ...q };
  return { ...recordIntent(db, { row, kind, step: 'quote', who, ...q, ctx, human }), ...q };
}

// POST /plots/:id/intent from the game: { step: card_open | open, visitor, buildingType? }.
//   card_open   any plot that is for sale or leased (the card of a house or the headquarters is not recorded); signed in or not
//   open        the take-over form of a business open to a buyout (its price is written as a quote); signed in only
// Setting an empty plot up is the server hold (POST /plots/:id/hold), which needs an account: with a game server a player signs in first, so every
// setup is held, quoted and (when given up) recorded as abandoned.
// Verified like a visit: the page must have pinged presence for a few seconds first (ctx.minAgeMs). A repeat of the same step within a minute is one.
export function clientIntent(db, account, plotId, input = {}, ctx = {}) {
  const step = CLIENT_STEPS.includes(input.step) ? input.step : fail(400, `step must be ${CLIENT_STEPS.join(', ')}.`, 'bad_step');
  const row = getPlot(db, plotId);
  const kind = kindOf(row);
  if (!kind) return { recorded: false };
  if (step === 'open' && kind !== 'takeover') fail(409, 'This business cannot be taken over now.', 'not_for_takeover');
  if (SIGNED_IN_STEPS.includes(step)) requireAccount(account);
  const who = whoOf(account, input.visitor, ctx.salt);
  if (!who.accountId && !who.visitor) return { recorded: false };
  const presence = db.prepare('SELECT first_at FROM presence WHERE visitor = ?').get(account ? `a${account.id}` : `v${text(input.visitor, 40)}`);
  const human = Boolean(presence) && now() - presence.first_at >= (ctx.minAgeMs ?? 3000);
  return transaction(db, () => {
    const [w, v] = sameWho(who);
    if (db.prepare(`SELECT 1 FROM plot_intents WHERE plot_id = ? AND step = ? AND ${w} AND at >= ?`).get(row.id, step, v, now() - 60000)) return { recorded: false };
    const out = recordIntent(db, { row, kind, step, who, ctx, human });
    if (step === 'open') recordQuote(db, row, kind, who, input, ctx, human);
    return out;
  });
}

// ---- the claim hold -----------------------------------------------------------------------------------------------------------------------
const holdOf = (db, plotId) => db.prepare('SELECT * FROM plot_holds WHERE plot_id = ?').get(Number(plotId));
const secondsLeft = (until, at = now()) => Math.max(0, Math.ceil((until - at) / 1000));
const HELD_MESSAGE = 'Someone else is setting this plot up right now. It opens again if they do not claim it.';
const heldError = (until) => new ApiError(409, HELD_MESSAGE, 'held').withData({ secondsLeft: secondsLeft(until) });

// A hold given up, run out or replaced: deleted, and its `abandoned` step written (unless it ended in a claim or a checkout, which tell their own
// story: the checkout's outcome is in `orders`).
function endHold(db, hold, at = now()) {
  db.prepare('DELETE FROM plot_holds WHERE plot_id = ?').run(hold.plot_id);
  const after = db.prepare("SELECT 1 FROM plot_intents WHERE plot_id = ? AND account_id = ? AND step IN ('checkout', 'claimed') AND at >= ?").get(hold.plot_id, hold.account_id, hold.started_at);
  if (after) return false;
  const row = db.prepare('SELECT * FROM plots WHERE id = ?').get(hold.plot_id);
  recordIntent(db, { row, kind: 'claim', step: 'abandoned', who: { accountId: hold.account_id, visitor: null }, verified: Boolean(hold.verified), at });
  return true;
}

// POST /plots/:id/hold { leaseDays?, buildingType?, exterior? } (signed in): hold an empty plot while setting it up, or refresh the hold (three
// minutes from now, at most 15 from its start). Another account's live hold is a 409 'held' with the seconds it has left. Holding a plot lets go of
// any other this account held. Writes the `hold` step for a new hold and a `quote` when the price shown changed. Returns { plotId, until,
// secondsLeft, quote: { priceCents, termDays } }.
export function holdPlot(db, account, plotId, input = {}, ctx = {}) {
  requireAccount(account);
  return transaction(db, () => {
    const row = getPlot(db, plotId);
    if (kindOf(row) !== 'claim') fail(409, 'Only an empty plot can be held.', 'not_empty');
    const order = db.prepare("SELECT hold_until FROM orders WHERE target = ? AND status = 'pending' AND hold_until > ? AND account_id != ?").get(`plot:${row.id}`, now(), account.id);
    if (order) throw heldError(order.hold_until); // someone is paying for it (billing.mjs: core.plotHeldByOther)
    let hold = holdOf(db, row.id);
    if (hold && hold.hold_until <= now()) (endHold(db, hold), (hold = null));
    if (hold && hold.account_id !== account.id) throw heldError(hold.hold_until);
    const who = { accountId: account.id, visitor: null };
    if (!hold) {
      const other = db.prepare('SELECT * FROM plot_holds WHERE account_id = ?').get(account.id);
      if (other) endHold(db, other);
      const step = recordIntent(db, { row, kind: 'claim', step: 'hold', who, ctx });
      db.prepare('INSERT INTO plot_holds (plot_id, account_id, started_at, hold_until, verified) VALUES (?,?,?,?,?)').run(row.id, account.id, now(), now() + HOLD_MS, step.verified ? 1 : 0);
    } else {
      db.prepare('UPDATE plot_holds SET hold_until = ? WHERE plot_id = ?').run(Math.min(now() + HOLD_MS, hold.started_at + HOLD_MAX_SECONDS * 1000), row.id);
    }
    const quote = recordQuote(db, row, 'claim', who, input, ctx, true);
    const until = holdOf(db, row.id).hold_until;
    return { plotId: row.id, until, secondsLeft: secondsLeft(until), quote: { priceCents: quote.priceCents, termDays: quote.termDays } };
  });
}

// DELETE /plots/:id/hold: the player let the plot go (closed its card, picked another). Returns { released }.
export function releaseHold(db, account, plotId) {
  requireAccount(account);
  return transaction(db, () => {
    const hold = holdOf(db, plotId);
    if (!hold || hold.account_id !== account.id) return { released: false };
    endHold(db, hold);
    return { released: true };
  });
}

// GET /plots/:id/hold: whether the plot is held and for how long ({ held, mine, secondsLeft }); nobody is named.
export function holdView(db, account, plotId) {
  const hold = holdOf(db, getPlot(db, plotId).id);
  if (!hold || hold.hold_until <= now()) return { held: false, mine: false, secondsLeft: 0 };
  return { held: true, mine: Boolean(account && account.id === hold.account_id), secondsLeft: secondsLeft(hold.hold_until) };
}

// Before a claim or a take-over: refused while another account holds the plot.
export function assertNotHeld(db, account, plotId) {
  const hold = db.prepare('SELECT * FROM plot_holds WHERE plot_id = ?').get(Number(plotId));
  if (hold && hold.hold_until > now() && hold.account_id !== account?.id) throw heldError(hold.hold_until);
}

// The minute's sweep: holds that ran out are let go (their `abandoned` step written). Returns how many.
export function sweepHolds(db, at = now()) {
  return transaction(db, () => {
    const lapsed = db.prepare('SELECT * FROM plot_holds WHERE hold_until <= ?').all(at);
    for (const h of lapsed) endHold(db, h, at);
    return lapsed.length;
  });
}

// ---- claims, take-overs and checkouts (the server's hooks) -----------------------------------------------------------------------------------
// Runs a claim or take-over route (fn: the existing route body), with the hold checked first and the outcome written: 'checkout' when a payment
// starts, 'claimed' / 'taken_over' when it happened at once (without payments), 'failed' when it was refused (409: somebody was first, the price
// changed, the lease protects it, it is held).
export async function tracked(db, account, plotId, kind, fn) {
  let out;
  try {
    assertNotHeld(db, account, plotId);
    out = await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && account) safe(() => recordStep(db, account.id, plotId, kind, 'failed'));
    throw e;
  }
  if (out?.checkout) {
    safe(() => {
      const order = db.prepare('SELECT request FROM orders WHERE id = ?').get(out.checkout.orderId);
      recordStep(db, account.id, plotId, kind, 'checkout', { priceCents: out.checkout.cents, termDays: JSON.parse(order?.request || '{}').days ?? null });
    });
  } else safe(() => onClaimed(db, { plotId, accountId: account.id, action: kind }));
  return out;
}
// The cart's checkout (cart.mjs) writes the same steps for each claim or take-over line: 'checkout' when its payment starts (at the line's price and
// term), 'failed' when the line was refused (409). Other lines (a renewal, an outside upgrade) are not steps towards a plot.
export function onCartLine(db, { accountId, plotId, action, step, priceCents = null, termDays = null }) {
  if (action !== 'claim' && action !== 'takeover') return;
  safe(() => recordStep(db, accountId, plotId, action, step, step === 'checkout' ? { priceCents, termDays } : {}));
}
function recordStep(db, accountId, plotId, kind, step, extra = {}) {
  const row = getPlot(db, plotId);
  return recordIntent(db, { row, kind, step, who: { accountId, visitor: null }, verified: true, ...extra });
}
// A claim or take-over happened (at once, or when its payment arrived): the step, at the price in the ledger; the hold is done, and the new tenant no
// longer watches the plot.
export function onClaimed(db, { plotId, accountId, action }) {
  const kind = action === 'claim' ? 'claim' : 'takeover';
  const row = getPlot(db, plotId);
  const paid = db.prepare("SELECT id, price FROM ledger WHERE plot_id = ? AND kind = ? ORDER BY id DESC LIMIT 1").get(row.id, kind);
  transaction(db, () => {
    db.prepare('DELETE FROM plot_holds WHERE plot_id = ?').run(row.id);
    db.prepare('DELETE FROM plot_watches WHERE plot_id = ? AND account_id = ?').run(row.id, accountId);
    recordIntent(db, { row, kind, step: kind === 'claim' ? 'claimed' : 'taken_over', who: { accountId, visitor: null }, verified: true, priceCents: cents(paid?.price), termDays: row.lease_days ?? null });
    if (kind === 'takeover') notifyTakenOver(db, row, paid?.id);
  });
}
// A watched plot was taken over: each watcher is emailed once for that take-over (its ledger row), as the other watch emails. The watch goes on: the
// plot has a new lease, and its end is the next chance.
function notifyTakenOver(db, row, ledgerId) {
  const key = `takeover:${ledgerId ?? row.updated_at}`;
  for (const w of db.prepare('SELECT account_id, notified FROM plot_watches WHERE plot_id = ?').all(row.id)) {
    if (w.notified === key) continue;
    const to = noticeAddress(db, w.account_id);
    if (to) enqueue(db, { to, kind: 'watch_takeover', subject: `${row.title} was taken over`, body: `${row.title} (plot #${row.id}), a plot you are watching, was taken over by a new tenant and has a new lease. You are still watching it: we will email you when that lease ends. To stop these emails, open the plot's card and press Watching.` });
    db.prepare('UPDATE plot_watches SET notified = ? WHERE plot_id = ? AND account_id = ?').run(key, row.id, w.account_id);
  }
}
// billing.mjs's fulfilment (the server's afterPaid): a paid claim or take-over.
export function onFulfilled(db, f) {
  if (f?.kind === 'lease' && (f.action === 'claim' || f.action === 'takeover')) safe(() => onClaimed(db, f));
}

// ---- foot traffic ------------------------------------------------------------------------------------------------------------------------
// The presence ping carries `areas`: the areas the game passed through outdoors since its last ping (lib/data/presence.js). They are kept in
// memory and written once a minute (flush). Only a verified player counts: presence for a few seconds first, not a robot (the ping turns robots
// away), within a per-network cap per area per day, and never in an area where the player's own building stands.
export function createTraffic({ salt } = {}) {
  const pending = new Map(); // `${day}|${area}|${who}` -> { day, area, who, ip, accountId, hours }
  return {
    get size() {
      return pending.size;
    },
    // a verified ping's areas; returns how many were taken
    note(db, { account, visitor, areas, ctx = {}, at = now() }) {
      const key = account ? `a${account.id}` : `v${text(visitor, 40)}`;
      const list = [...new Set((Array.isArray(areas) ? areas : []).map(String).filter(isAreaId))].slice(0, MAX_AREAS_PER_PING);
      if (!list.length) return 0;
      const seen = db.prepare('SELECT first_at FROM presence WHERE visitor = ?').get(key);
      if (!seen || at - seen.first_at < (ctx.minAgeMs ?? 3000)) return 0;
      const who = hashOf(salt, key);
      const ip = ipHashOf(ctx);
      const day = dayOf(at);
      const bit = 2 ** new Date(at).getUTCHours();
      for (const area of list) {
        const k = `${day}|${area}|${who}`;
        const e = pending.get(k) ?? pending.set(k, { day, area, who, ip, accountId: account?.id ?? null, hours: 0 }).get(k);
        if (!(e.hours & bit)) e.hours += bit;
      }
      if (pending.size > MAX_PENDING) this.flush(db); // a crowd: written now rather than holding more in memory
      return list.length;
    },
    // writes what was noted: a player new to an area today adds a player and a pass per hour, a known one a pass per new hour
    flush(db) {
      if (!pending.size) return 0;
      const entries = [...pending.values()];
      pending.clear();
      const ownAreas = new Map();
      const areasOwnedBy = (id) => {
        if (!ownAreas.has(id)) ownAreas.set(id, new Set(db.prepare('SELECT facts FROM plots WHERE owner_account = ?').all(id).map((r) => { const f = JSON.parse(r.facts); return areaOf(f.x, f.z); })));
        return ownAreas.get(id);
      };
      let written = 0;
      transaction(db, () => {
        const get = db.prepare('SELECT hours FROM traffic_seen WHERE day = ? AND area_id = ? AND who = ?');
        const add = db.prepare('INSERT INTO street_traffic (day, area_id, passes, players) VALUES (?, ?, ?, ?) ON CONFLICT (day, area_id) DO UPDATE SET passes = passes + excluded.passes, players = players + excluded.players');
        for (const e of entries) {
          if (e.accountId && areasOwnedBy(e.accountId).has(e.area)) continue;
          const row = get.get(e.day, e.area, e.who);
          if (!row) {
            if (e.ip && db.prepare('SELECT COUNT(*) AS n FROM traffic_seen WHERE day = ? AND area_id = ? AND ip_hash = ?').get(e.day, e.area, e.ip).n >= TRAFFIC_CAP) continue;
            db.prepare('INSERT INTO traffic_seen (day, area_id, who, ip_hash, hours) VALUES (?,?,?,?,?)').run(e.day, e.area, e.who, e.ip, e.hours);
            add.run(e.day, e.area, bits(e.hours), 1);
          } else {
            const fresh = e.hours & ~row.hours;
            if (!fresh) continue;
            db.prepare('UPDATE traffic_seen SET hours = ? WHERE day = ? AND area_id = ? AND who = ?').run(row.hours | e.hours, e.day, e.area, e.who);
            add.run(e.day, e.area, bits(fresh), 0);
          }
          written++;
        }
      });
      return written;
    },
  };
}
const MAX_PENDING = 20000;
// on the way out (the server closing): what is still in memory is written
export const safeFlush = (traffic, db) => safe(() => traffic.flush(db));
const bits = (n) => {
  let c = 0;
  for (let x = n >>> 0; x; x &= x - 1) c++;
  return c;
};

// ---- watching a plot -------------------------------------------------------------------------------------------------------------------
const watchable = (row, account) => {
  if (!row.owner_name || !row.claimable || factsOf(row).admin) fail(409, 'Only a business can be watched.', 'not_watchable');
  if (row.owner_account === account.id) fail(409, 'This is your own business.', 'own_plot');
};
// GET /plots/:id/watch (signed in): whether I watch it; the tenant gets how many watch their plot instead (never who).
export function watchState(db, account, plotId) {
  requireAccount(account);
  const row = getPlot(db, plotId);
  if (row.owner_account === account.id) return { watching: false, watchers: db.prepare('SELECT COUNT(*) AS n FROM plot_watches WHERE plot_id = ?').get(row.id).n };
  return { watching: Boolean(db.prepare('SELECT 1 FROM plot_watches WHERE plot_id = ? AND account_id = ?').get(row.id, account.id)) };
}
// GET /admin/plots/:id/watchers (admin): who watches a plot, first first.
export function watchersOf(db, plotId) {
  const row = getPlot(db, plotId);
  const watchers = db.prepare('SELECT w.account_id AS accountId, a.username, w.created_at AS since FROM plot_watches w JOIN accounts a ON a.id = w.account_id WHERE w.plot_id = ? ORDER BY w.created_at, w.account_id').all(row.id);
  return { plotId: row.id, title: row.title, watchers: watchers.map((w) => ({ ...w })) };
}
// POST /plots/:id/watch (signed in): email me when this business's lease ends and when the plot opens to a buyout.
export function watchPlot(db, account, plotId) {
  requireAccount(account);
  return transaction(db, () => {
    const row = getPlot(db, plotId);
    watchable(row, account);
    if (db.prepare('SELECT 1 FROM plot_watches WHERE plot_id = ? AND account_id = ?').get(row.id, account.id)) return { watching: true };
    if (db.prepare('SELECT COUNT(*) AS n FROM plot_watches WHERE account_id = ?').get(account.id).n >= MAX_WATCHES) fail(409, `You can watch up to ${MAX_WATCHES} plots. Stop watching one first.`, 'too_many_watches');
    db.prepare('INSERT INTO plot_watches (plot_id, account_id, created_at) VALUES (?,?,?)').run(row.id, account.id, now());
    return { watching: true };
  });
}
export function unwatchPlot(db, account, plotId) {
  requireAccount(account);
  db.prepare('DELETE FROM plot_watches WHERE plot_id = ? AND account_id = ?').run(getPlot(db, plotId).id, account.id);
  return { watching: false };
}
// The minute's job: each watcher of a plot whose lease has ended (its grace days, GRACE_DAYS), or has opened to a buyout, is emailed once for that lease end
// (to a verified address with notices on, as the lease notices are: engage.mjs noticeAddress). A watcher who now holds the plot is dropped.
export function sendWatchNotices(db, at = now()) {
  let sent = 0;
  const rows = db.prepare('SELECT w.account_id AS watcher, w.notified, p.* FROM plot_watches w JOIN plots p ON p.id = w.plot_id WHERE p.lease_end IS NOT NULL').all();
  for (const r of rows) {
    if (r.owner_account === r.watcher) {
      db.prepare('DELETE FROM plot_watches WHERE plot_id = ? AND account_id = ?').run(r.id, r.watcher);
      continue;
    }
    const state = leaseState(r.lease_end, at, r.lease_days);
    if (state !== 'grace' && state !== 'open') continue;
    const key = `${state}:${r.lease_end}`;
    if (r.notified === key) continue;
    const to = noticeAddress(db, r.watcher);
    if (to) {
      const opens = new Date(r.lease_end + GRACE_DAYS * DAY).toUTCString();
      const subject = state === 'grace' ? `${r.title}: the lease you are watching has ended` : `${r.title} is open to a buyout`;
      const days = `${GRACE_DAYS} day${GRACE_DAYS === 1 ? '' : 's'}`;
      const body =
        state === 'grace'
          ? `The lease on ${r.title} (plot #${r.id}), a plot you are watching, has ended. Its tenant has ${days} to renew. If they don't, anyone can take it over from ${opens}. We will email you again then.`
          : `${r.title} (plot #${r.id}), a plot you are watching, is open to a buyout: its lease ended and the tenant did not renew in time. Anyone can take it over now, until the tenant renews. To stop these emails, open the plot's card and press Watching.`;
      enqueue(db, { to, kind: `watch_${state}`, subject, body });
      sent++;
    }
    db.prepare('UPDATE plot_watches SET notified = ? WHERE plot_id = ? AND account_id = ?').run(key, r.id, r.watcher);
  }
  return { sent };
}

// ---- housekeeping ------------------------------------------------------------------------------------------------------------------------
// The hour's job: raw intents after 180 days, and the "already counted" rows of traffic after two (the daily counts are kept).
export function pruneEconomy(db, at = now()) {
  const intents = Number(db.prepare('DELETE FROM plot_intents WHERE at < ?').run(at - INTENT_DAYS * DAY).changes);
  const seen = Number(db.prepare('DELETE FROM traffic_seen WHERE day < ?').run(dayOf(at - TRAFFIC_SEEN_DAYS * DAY)).changes);
  return { intents, seen };
}

// ---- the report --------------------------------------------------------------------------------------------------------------------------
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const TIERS = ['ordinary', 'prime', 'luxury', 'grand'];
const CLAIM_STEPS = ['card_open', 'hold', 'quote', 'checkout', 'claimed', 'failed', 'abandoned'];
const TAKEOVER_STEPS = ['card_open', 'open', 'quote', 'checkout', 'taken_over', 'failed'];

// GET /admin/economy?from=YYYY-MM-DD&to=YYYY-MM-DD (UTC days, both included; the last 30 days by default, at most 366): per tier, per district
// and in all, every plot that can be leased (not Old Town's houses, not the headquarters). Definitions: docs/monetization/plot_economy_data.md.
export function economyReport(db, { from, to, at = now() } = {}) {
  const toDay = DAY_RE.test(String(to ?? '')) ? String(to) : dayOf(at);
  const fromDay = DAY_RE.test(String(from ?? '')) ? String(from) : dayOf(Date.parse(`${toDay}T00:00:00Z`) - 29 * DAY);
  const start = Date.parse(`${fromDay}T00:00:00Z`);
  const end = Date.parse(`${toDay}T00:00:00Z`) + DAY;
  if (!(start < end)) fail(400, 'from must be on or before to.', 'bad_range');
  if (end - start > 366 * DAY) fail(400, 'At most 366 days at a time.', 'bad_range');
  const until = Math.min(end, at);
  // the world's start: the seed writes every plot's updated_at, and a plot nobody has touched keeps it
  const worldStart = db.prepare('SELECT MIN(updated_at) AS t FROM plots').get().t ?? start;
  const from0 = Math.max(start, worldStart);

  const rows = db.prepare('SELECT * FROM plots WHERE claimable = 1').all().filter((r) => !factsOf(r).admin);
  const byPlot = (sql, ...args) => new Map(db.prepare(sql).all(...args).map((r) => [r.plot_id, r]));
  const firstClaim = byPlot("SELECT plot_id, MIN(at) AS at FROM ledger WHERE kind = 'claim' GROUP BY plot_id");
  const visits = byPlot("SELECT plot_id, COUNT(*) AS n FROM events WHERE kind = 'visit' AND verified = 1 AND at >= ? AND at < ? GROUP BY plot_id", start, end);
  const store = byPlot("SELECT b.plot_id, COUNT(*) AS n FROM business_events e JOIN businesses b ON b.id = e.business_id WHERE b.plot_id IS NOT NULL AND e.kind = 'store' AND e.verified = 1 AND e.at >= ? AND e.at < ? GROUP BY b.plot_id", start, end);
  // ...plus the daily totals kept for days whose rows reached the end of their retention (services/api/retention.mjs)
  const addKept = (map, plotId, k) => map.set(plotId, { plot_id: plotId, n: (map.get(plotId)?.n ?? 0) + k });
  for (const [id, k] of keptByTarget(db, 'events', { kind: 'visit', from: start, to: end })) addKept(visits, Number(id), k);
  const plotOf = db.prepare('SELECT plot_id FROM businesses WHERE id = ?');
  for (const [id, k] of keptByTarget(db, 'business_events', { kind: 'store', from: start, to: end })) {
    const plotId = plotOf.get(Number(id))?.plot_id;
    if (plotId != null) addKept(store, plotId, k);
  }
  const takeovers = byPlot("SELECT plot_id, COUNT(*) AS n FROM ledger WHERE kind = 'takeover' AND at >= ? AND at < ? GROUP BY plot_id", start, end);
  const renewals = byPlot("SELECT plot_id, COUNT(*) AS n FROM ledger WHERE kind = 'renew' AND at >= ? AND at < ? GROUP BY plot_id", start, end);
  const watchers = byPlot('SELECT plot_id, COUNT(*) AS n FROM plot_watches GROUP BY plot_id');
  // the people who reached each step for each plot (a person is an account, a hashed visitor number, or failing both a network), verified only
  const steps = new Map();
  for (const r of db.prepare("SELECT plot_id, kind, step, COUNT(DISTINCT COALESCE('a' || account_id, 'v' || visitor, 'n' || ip_hash)) AS n FROM plot_intents WHERE verified = 1 AND at >= ? AND at < ? GROUP BY plot_id, kind, step").all(start, end)) {
    const kind = r.kind === 'occupied' ? 'takeover' : r.kind; // a leased business's card: demand for a taken location, shown with the take-overs
    const m = steps.get(r.plot_id) ?? steps.set(r.plot_id, {}).get(r.plot_id);
    m[`${kind}.${r.step}`] = (m[`${kind}.${r.step}`] ?? 0) + r.n;
  }
  const quotes = new Map();
  for (const r of db.prepare("SELECT plot_id, price_cents FROM plot_intents WHERE kind = 'claim' AND step = 'quote' AND verified = 1 AND price_cents IS NOT NULL AND at >= ? AND at < ?").all(start, end)) (quotes.get(r.plot_id) ?? quotes.set(r.plot_id, []).get(r.plot_id)).push(r.price_cents);
  const orders = new Map();
  for (const o of db.prepare("SELECT target, status, request FROM orders WHERE product = 'lease' AND created_at >= ? AND created_at < ?").all(start, end)) {
    const action = safe(() => JSON.parse(o.request || '{}').action);
    if (action !== 'claim' && action !== 'takeover') continue;
    const id = Number(String(o.target).split(':')[1]);
    const m = orders.get(id) ?? orders.set(id, { started: 0, paid: 0, expired: 0, refunded: 0, refundedTakeovers: 0 }).get(id);
    m.started++;
    if (m[o.status] != null) m[o.status]++;
    if (o.status === 'refunded' && action === 'takeover') m.refundedTakeovers++;
  }
  const traffic = new Map(db.prepare('SELECT area_id, SUM(passes) AS passes, SUM(players) AS players FROM street_traffic WHERE day >= ? AND day <= ? GROUP BY area_id').all(fromDay, toDay).map((r) => [r.area_id, r]));

  const groups = new Map();
  const group = (id, label) => groups.get(id) ?? groups.set(id, { id, label, rows: [] }).get(id);
  for (const r of rows) {
    const f = factsOf(r);
    const tier = tierOfPlot(f);
    for (const g of [group(`tier:${tier}`, tier), group(`district:${r.district}`, f.district ?? r.district), group('all', 'All plots')]) g.rows.push({ r, f });
  }
  const summarise = ({ id, label, rows: list }) => {
    const n = (m, r) => m.get(r.id)?.n ?? 0;
    const sum = (fn) => list.reduce((a, x) => a + fn(x), 0);
    const step = (key) => sum(({ r }) => steps.get(r.id)?.[key] ?? 0);
    const vacant = list.filter(({ r }) => !r.owner_name);
    // a plot is empty until its first claim (a claim is only ever of an empty plot), or all along if it is empty now; a plot with the city's own
    // business at the start was never empty (no plot is emptied again: a lapsed lease waits for a take-over)
    const emptyDays = ({ r }) => {
      const claimed = firstClaim.get(r.id)?.at;
      const emptyUntil = claimed ?? (r.owner_name ? from0 : until);
      return Math.max(0, Math.min(emptyUntil, until) - from0) / DAY;
    };
    const areas = new Set(list.map(({ f }) => areaOf(f.x, f.z)));
    const tr = id === 'all' ? [...traffic.values()] : [...areas].map((a) => traffic.get(a)).filter(Boolean);
    const claim = Object.fromEntries(CLAIM_STEPS.map((s) => [s, step(`claim.${s}`)]));
    const take = Object.fromEntries(TAKEOVER_STEPS.map((s) => [s, step(`takeover.${s}`)]));
    const ord = list.reduce((a, { r }) => {
      const m = orders.get(r.id);
      if (m) for (const k of Object.keys(a)) a[k] += m[k];
      return a;
    }, { started: 0, paid: 0, expired: 0, refunded: 0, refundedTakeovers: 0 });
    const completions = sum(({ r }) => n(takeovers, r));
    const failed = take.failed + ord.refundedTakeovers;
    return {
      id,
      label,
      plots: list.length,
      occupied: list.length - vacant.length,
      vacant: vacant.length,
      vacancyRate: ratio(vacant.length, list.length),
      meanDaysEmpty: list.length ? Math.round((sum(emptyDays) / list.length) * 10) / 10 : 0,
      vacantForDays: vacant.length ? Math.round(((at - worldStart) / DAY) * 10) / 10 : 0,
      visits: sum(({ r }) => n(visits, r)),
      storeEntries: sum(({ r }) => n(store, r)),
      traffic: { areas: id === 'all' ? traffic.size : areas.size, passes: tr.reduce((a, t) => a + t.passes, 0), players: tr.reduce((a, t) => a + t.players, 0) },
      claim: {
        steps: claim,
        conversion: { cardToHold: ratio(claim.hold, claim.card_open), holdToQuote: ratio(claim.quote, claim.hold), quoteToCheckout: ratio(claim.checkout, claim.quote), checkoutToClaim: ratio(claim.claimed, claim.checkout), quoteToClaim: ratio(claim.claimed, claim.quote), cardToClaim: ratio(claim.claimed, claim.card_open) },
        medianQuoteCents: median(list.flatMap(({ r }) => quotes.get(r.id) ?? [])),
      },
      takeover: { cardOpens: take.card_open, attempts: take.open, quotes: take.quote, checkouts: take.checkout, completions, failed, abandoned: Math.max(0, take.open - completions - failed) },
      orders: { started: ord.started, paid: ord.paid, expired: ord.expired, refunded: ord.refunded },
      renewals: sum(({ r }) => n(renewals, r)),
      // leases of players that ended in the range and are still not renewed (a renewal moves the end)
      lapses: list.filter(({ r }) => r.owner_account && r.lease_end && r.lease_end >= start && r.lease_end < until).length,
      watchers: sum(({ r }) => n(watchers, r)),
      watchedPlots: list.filter(({ r }) => n(watchers, r) > 0).length,
    };
  };
  const all = [...groups.values()];
  const plotsByArea = new Map();
  for (const r of rows) {
    const f = factsOf(r);
    plotsByArea.set(areaOf(f.x, f.z), (plotsByArea.get(areaOf(f.x, f.z)) ?? 0) + 1);
  }
  return {
    from: fromDay,
    to: toDay,
    at,
    areaSize: AREA_SIZE,
    total: summarise(groups.get('all') ?? { id: 'all', label: 'All plots', rows: [] }),
    tiers: TIERS.map((t) => groups.get(`tier:${t}`)).filter(Boolean).map(summarise),
    districts: all.filter((g) => g.id.startsWith('district:')).map(summarise).sort((a, b) => a.label.localeCompare(b.label)),
    topWatched: rows
      .filter((r) => watchers.get(r.id))
      .sort((a, b) => watchers.get(b.id).n - watchers.get(a.id).n || a.id - b.id)
      .slice(0, 10)
      .map((r) => ({ plotId: r.id, title: r.title, watchers: watchers.get(r.id).n, lease: leaseState(r.lease_end, at, r.lease_days), watchedBy: watchersOf(db, r.id).watchers.map(({ accountId, username }) => ({ accountId, username })) })),
    topAreas: [...traffic.entries()]
      .sort((a, b) => b[1].passes - a[1].passes || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([area, t]) => ({ area, passes: t.passes, players: t.players, plots: plotsByArea.get(area) ?? 0 })),
  };
}
