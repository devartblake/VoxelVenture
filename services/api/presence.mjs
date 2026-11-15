// What the presence server tells the API (docs/architecture/presence_positions.md): DERIVED events about where signed-in accounts were (never a track), and the anti-bot flags.
//
//   POST /internal/presence/events    batches of events from the presence server (shared secret: the same one as the other /internal routes). Validated, and stored once.
//   POST /internal/presence/summary   the accounts the presence server's anti-bot scoring flags right now, and the ones it has stopped flagging.
//
// The events are what task goals are checked against (lib/game/taskRules.js, services/api/tasks.mjs): the server's own records, so a page's word is never taken. They are kept
// RETENTION.presenceEventDays (10) days, long enough for a weekly task and a margin, then deleted (`purge`, hourly).
//
// A flag holds an account's task rewards back while its score is at or over REVIEW_SCORE (60). A flag does not stay on its own: it expires FLAG_TTL_MS after the last summary that
// repeated it (the presence server repeats it every half minute while it holds), so a restart of the presence server cannot leave an account stuck. An admin can clear one for a day.
import { transaction } from './db.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

const { RETENTION } = await imp('legal/retention.js');

export const EVENT_DAYS = RETENTION.presenceEventDays;
export const BUCKET_MS = 10 * 60000; // an 'in' event is kept once per place, phase and ten minutes: it says "was there", and a dwell
export const FLAG_TTL_MS = Number(process.env.PRESENCE_FLAG_TTL_MS || 10 * 60000);
export const CLEAR_MS = 24 * 3600000; // how long an admin's clear lasts
export const REVIEW_SCORE = Number(process.env.PRESENCE_REVIEW_SCORE || 60);
const KINDS = new Set(['in', 'pass', 'loop', 'distance']);
const PHASES = new Set(['dawn', 'day', 'dusk', 'night']);
const MODES = new Set(['walk', 'car', 'boat']);
const REF = /^(district|place|zone|edge|road):[\w .:'&-]{1,80}$/;
const MAX_BATCH = 500;
const MAX_AGE_MS = 15 * 60000; // an event older than this is not believed (the presence server sends within seconds)
const text = (v, n) => String(v ?? '').replace(/\p{Cc}/gu, ' ').slice(0, n);

/** Stores a batch. Returns { accepted, rejected }. Idempotent: the same batch twice stores it once. */
export function ingest(db, events, now = Date.now()) {
  if (!Array.isArray(events)) return { accepted: 0, rejected: 0 };
  let accepted = 0, rejected = 0;
  const known = new Map();
  const exists = (id) => { if (!known.has(id)) known.set(id, Boolean(db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(id))); return known.get(id); };
  const putIn = db.prepare(`INSERT INTO presence_events (account_id, kind, ref, phase, bucket, mode, district, first_at, last_at, n, dwell, metres)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT (account_id, kind, ref, phase, bucket, mode, district) DO UPDATE SET last_at = MAX(last_at, excluded.last_at), dwell = MAX(dwell, excluded.dwell), n = n + 1`);
  transaction(db, () => {
    for (const e of events.slice(0, MAX_BATCH)) {
      const accountId = Number(e?.accountId);
      const at = Number(e?.at);
      const phase = e?.phase === undefined ? '' : String(e.phase);
      const mode = e?.mode === undefined ? '' : String(e.mode);
      const ok = Number.isInteger(accountId) && accountId > 0 && exists(accountId) && KINDS.has(e?.kind) && Number.isFinite(at) && Math.abs(now - at) <= MAX_AGE_MS
        && (phase === '' || PHASES.has(phase)) && (mode === '' || MODES.has(mode))
        && (e.kind === 'distance' ? MODES.has(e.ref) : REF.test(String(e.ref)));
      if (!ok) { rejected++; continue; }
      const district = text(e.district ?? '', 20);
      const dwell = Math.max(0, Math.min(86400, Math.floor(Number(e.dwell) || 0)));
      if (e.kind === 'distance') {
        // a distance is an amount: one row per event (its `bucket` is its own time), so a repeated batch is not counted twice, and one event can never be more than a thirty-second walk or drive
        const metres = Math.max(0, Math.min(600, Math.floor(Number(e.metres) || 0)));
        if (!metres) { rejected++; continue; }
        putIn.run(accountId, 'distance', e.ref, phase, at, e.ref, district, at, at, 0, metres);
      } else {
        putIn.run(accountId, e.kind, e.ref, phase, Math.floor(at / BUCKET_MS), mode, '', at, at, dwell, 0);
      }
      accepted++;
    }
  });
  return { accepted, rejected };
}

/** The events of one account inside a window, as the task rules read them: [{ kind, ref, phase, at, dwell, metres, mode, district }]. */
export function eventsFor(db, accountId, start, end) {
  return db.prepare('SELECT kind, ref, phase, last_at AS at, dwell, metres, mode, district FROM presence_events WHERE account_id = ? AND last_at >= ? AND last_at < ? ORDER BY last_at').all(accountId, start, end);
}

/** Deletes what is older than the retention. Returns how many rows. */
export function purge(db, now = Date.now()) {
  return Number(db.prepare('DELETE FROM presence_events WHERE last_at < ?').run(now - EVENT_DAYS * 86400000).changes);
}

// ---- the flags
/** The summary from the presence server: replaces the flags of the accounts listed, drops the ones it says it has cleared (an admin's clear is kept). */
export function summarize(db, body, now = Date.now()) {
  const list = Array.isArray(body?.flagged) ? body.flagged.slice(0, 500) : [];
  const gone = Array.isArray(body?.cleared) ? body.cleared.slice(0, 500) : [];
  let flagged = 0, cleared = 0;
  transaction(db, () => {
    for (const f of list) {
      const id = Number(f?.accountId);
      const score = Math.max(0, Math.min(100, Math.floor(Number(f?.score) || 0)));
      if (!Number.isInteger(id) || id <= 0 || !score || !db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(id)) continue;
      const flags = (Array.isArray(f.flags) ? f.flags : []).slice(0, 12).map((x) => ({ name: text(x?.name, 40), weight: Math.max(0, Math.min(100, Math.floor(Number(x?.weight) || 0))), detail: text(x?.detail, 200) }));
      db.prepare(`INSERT INTO presence_flags (account_id, score, flags, updated_at, first_flagged_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET score = excluded.score, flags = excluded.flags, updated_at = excluded.updated_at`).run(id, score, JSON.stringify(flags), now, now);
      flagged++;
    }
    for (const raw of gone) {
      const id = Number(raw);
      if (Number.isInteger(id)) cleared += Number(db.prepare('DELETE FROM presence_flags WHERE account_id = ? AND (cleared_until IS NULL OR cleared_until <= ?)').run(id, now).changes);
    }
  });
  return { flagged, cleared };
}

/** { score, flags, since } when this account's rewards are held back right now, else null. */
export function holdFor(db, accountId, now = Date.now()) {
  const r = db.prepare('SELECT score, flags, updated_at, first_flagged_at, cleared_until FROM presence_flags WHERE account_id = ?').get(accountId);
  if (!r || r.score < REVIEW_SCORE || now - r.updated_at > FLAG_TTL_MS || (r.cleared_until && r.cleared_until > now)) return null;
  return { score: r.score, flags: JSON.parse(r.flags), since: r.first_flagged_at };
}

/** Marks a hold as noticed (the first time in six hours) and returns true then, so the audit trail gets one entry and not one per attempt. */
export function noteHold(db, accountId, now = Date.now()) {
  const r = db.prepare('SELECT held_at FROM presence_flags WHERE account_id = ?').get(accountId);
  if (r?.held_at && now - r.held_at < 6 * 3600000) return false;
  db.prepare('UPDATE presence_flags SET held_at = ? WHERE account_id = ?').run(now, accountId);
  return true;
}

/** For the admin: every flag with its account, newest first, and whether it holds rewards now. */
export function listFlags(db, now = Date.now()) {
  return db.prepare('SELECT f.account_id AS accountId, a.username, f.score, f.flags, f.updated_at AS updatedAt, f.first_flagged_at AS firstFlaggedAt, f.cleared_by AS clearedBy, f.cleared_at AS clearedAt, f.cleared_until AS clearedUntil FROM presence_flags f JOIN accounts a ON a.id = f.account_id ORDER BY f.updated_at DESC LIMIT 200')
    .all()
    .map((r) => ({ ...r, flags: JSON.parse(r.flags), held: Boolean(holdFor(db, r.accountId, now)), stale: now - r.updatedAt > FLAG_TTL_MS, reviewScore: REVIEW_SCORE }));
}

/** An admin clears a flag for a day. Returns false when there is no such flag. */
export function clearFlag(db, accountId, adminLabel, now = Date.now()) {
  const r = db.prepare('UPDATE presence_flags SET cleared_by = ?, cleared_at = ?, cleared_until = ? WHERE account_id = ?').run(text(adminLabel, 40), now, now + CLEAR_MS, accountId);
  return Number(r.changes) > 0;
}

/** The numbers for the admin presence page. */
export function summary(db, now = Date.now()) {
  const events = db.prepare('SELECT COUNT(*) AS n FROM presence_events').get().n;
  const accounts = db.prepare('SELECT COUNT(DISTINCT account_id) AS n FROM presence_events WHERE last_at >= ?').get(now - 86400000).n;
  return { events, accountsToday: accounts, retentionDays: EVENT_DAYS, reviewScore: REVIEW_SCORE, flags: listFlags(db, now).filter((f) => f.held).length };
}
