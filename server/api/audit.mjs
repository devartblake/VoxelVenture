import crypto from 'node:crypto';
import { text } from './core.mjs';

// The audit trail: an append-only, hash-chained record of every change that matters to money, ownership or moderation (docs/authoritative_data.md).
// Each row's hash covers its own fields and the previous row's hash, so editing or removing a row outside the API is detectable with verifyChain().
// The table's triggers refuse UPDATE and DELETE outright (schema.sql).
const GENESIS = '0'.repeat(64);
const digest = (r) => crypto.createHash('sha256').update(JSON.stringify([r.prev_hash, r.at, r.actor_kind, r.actor_id ?? null, r.action, r.target_kind, r.target_id ?? null, r.detail ?? null])).digest('hex');

// Who did it: an account, the admin (ADMIN_TOKEN), another server of ours (a shared secret), or the server itself (timers).
export const byAccount = (account) => ({ kind: 'account', id: account?.id ?? null });
export const ADMIN = { kind: 'admin', id: null };
export const SERVICE = { kind: 'service', id: null };
export const SYSTEM = { kind: 'system', id: null };

// Writes one row. Call it inside the same transaction as the change when there is one; on its own otherwise.
export function audit(db, actor, action, target, detail = null) {
  const last = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
  const row = { prev_hash: last?.hash ?? GENESIS, at: Date.now(), actor_kind: actor.kind, actor_id: actor.id ?? null, action: text(action, 60), target_kind: text(target.kind, 30), target_id: target.id == null ? null : text(String(target.id), 80), detail: detail == null ? null : JSON.stringify(detail).slice(0, 4000) };
  row.hash = digest(row);
  db.prepare('INSERT INTO audit_log (at, actor_kind, actor_id, action, target_kind, target_id, detail, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?)').run(row.at, row.actor_kind, row.actor_id, row.action, row.target_kind, row.target_id, row.detail, row.prev_hash, row.hash);
  return row.hash;
}

const view = (r) => ({ id: r.id, at: r.at, actor: { kind: r.actor_kind, id: r.actor_id, name: r.username ?? null }, action: r.action, target: { kind: r.target_kind, id: r.target_id }, detail: r.detail ? JSON.parse(r.detail) : null, hash: r.hash });

// The trail, newest first, optionally for one target, one action or one actor; `before` pages back.
export function list(db, { targetKind, targetId, action, actorId, before, limit = 100 } = {}) {
  const where = [];
  const args = [];
  if (targetKind) (where.push('l.target_kind = ?'), args.push(String(targetKind)));
  if (targetId) (where.push('l.target_id = ?'), args.push(String(targetId)));
  if (action) (where.push('l.action = ?'), args.push(String(action)));
  if (actorId) (where.push("l.actor_kind = 'account' AND l.actor_id = ?"), args.push(Number(actorId)));
  if (before) (where.push('l.id < ?'), args.push(Number(before)));
  const n = Math.max(1, Math.min(500, Number(limit) || 100));
  const rows = db.prepare(`SELECT l.*, a.username FROM audit_log l LEFT JOIN accounts a ON a.id = l.actor_id AND l.actor_kind = 'account' ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.id DESC LIMIT ?`).all(...args, n);
  return { entries: rows.map(view), next: rows.length === n ? rows[rows.length - 1].id : null };
}

// Recomputes the whole chain. { ok, rows } or { ok: false, rows, brokenAt } (the id of the first row that does not match).
export function verifyChain(db) {
  let prev = GENESIS;
  let rows = 0;
  for (const r of db.prepare('SELECT * FROM audit_log ORDER BY id').iterate()) {
    rows++;
    if (r.prev_hash !== prev || digest(r) !== r.hash) return { ok: false, rows, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, rows };
}
