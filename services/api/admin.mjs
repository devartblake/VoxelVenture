import crypto from 'node:crypto';
import { ApiError } from './core.mjs';
import { transaction } from './db.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// Admin accounts and their sign-in (docs/architecture/backend.md#admin-sign-in). Admins are not players: they live in admin_accounts, each with
// a salted scrypt hash of their password, and sign in at /admin/login for a session cookie. The API's ADMIN_TOKEN stays the machine credential
// (scripts, verify:live, npm run moderate) and is what creates the first admin account (POST /admin/setup, once).
//
// The cookie holds 32 random bytes; the database keeps only their SHA-256, so a copy of the database signs nobody in. A session ends 12 hours
// after it began, or after 2 hours without a request, whichever is first.

export const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32, saltBytes: 16 };
export const SESSION = { absoluteMs: 12 * 3600_000, idleMs: 2 * 3600_000, touchEveryMs: 60_000 };
export const COOKIE = '__Host-vv_admin';
export const LOGIN_LIMIT = { failures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const { PASSWORD_MIN, passwordProblem } = await imp('data/adminPassword.js');
export { PASSWORD_MIN };
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/;
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const scrypt = (password, salt, { N, r, p, keylen }) =>
  new Promise((resolve, reject) => crypto.scrypt(String(password).normalize('NFC'), salt, keylen, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }, (e, key) => (e ? reject(e) : resolve(key))));

// `scrypt$N$r$p$salt$hash` (salt and hash in base64url). The parameters travel with the hash, so they can be raised later without a migration.
export async function hashPassword(password, params = SCRYPT) {
  const salt = crypto.randomBytes(params.saltBytes ?? 16);
  const key = await scrypt(password, salt, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${b64(salt)}$${b64(key)}`;
}

// Reads a stored hash; null for anything that is not one this code accepts (too weak or absurdly expensive parameters included).
export function parseHash(stored) {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]{16,})\$([A-Za-z0-9_-]{32,})$/.exec(String(stored ?? ''));
  if (!m) return null;
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (N < 2 ** 15 || N > 2 ** 17 || (N & (N - 1)) !== 0 || r < 8 || r > 16 || p < 1 || p > 4) return null;
  const salt = Buffer.from(m[4], 'base64url');
  const hash = Buffer.from(m[5], 'base64url');
  if (salt.length < 16 || hash.length < 32) return null;
  return { N, r, p, salt, hash };
}

// true when the password is the one the hash was made from (compared in constant time)
export async function verifyPassword(password, stored) {
  const h = parseHash(stored);
  if (!h) return false;
  const key = await scrypt(password, h.salt, { N: h.N, r: h.r, p: h.p, keylen: h.hash.length });
  return crypto.timingSafeEqual(key, h.hash);
}

// A hash nobody's password matches, checked when the username is unknown so the answer takes as long as a real one.
let decoy = null;
const decoyHash = async () => (decoy ??= await hashPassword(crypto.randomBytes(32).toString('hex')));

export function checkUsername(username) {
  const u = String(username ?? '').trim();
  if (!USERNAME.test(u)) throw new ApiError(400, 'A username is 3 to 32 letters, numbers, dots, dashes or underscores, starting with a letter or number.', 'bad_username');
  return u;
}
export function checkPassword(username, password) {
  const pw = String(password ?? '');
  const problem = passwordProblem(username, pw); // lib/data/adminPassword.js: 8+ characters, 3 of 4 kinds, not the username, not a common one
  if (problem) throw new ApiError(400, problem, 'weak_password');
  return pw;
}

export const adminView = (a) => ({ id: a.id, username: a.username, createdAt: a.created_at, lastLoginAt: a.last_login_at ?? null, disabled: Boolean(a.disabled) });
export const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM admin_accounts').get().n;
export const byUsername = (db, username) => db.prepare('SELECT * FROM admin_accounts WHERE username = ? COLLATE NOCASE').get(String(username ?? '').trim());
export const byId = (db, id) => db.prepare('SELECT * FROM admin_accounts WHERE id = ?').get(Number(id));
export const list = (db) => db.prepare('SELECT * FROM admin_accounts ORDER BY id').all().map(adminView);

// Adds an admin. The hash is made first (it is slow), then the row is written in one transaction with `check` (e.g. "there is no admin yet").
export async function createAdmin(db, { username, password }, { now = Date.now(), check = null, audit = null } = {}) {
  const u = checkUsername(username);
  const pw = checkPassword(u, password);
  const hash = await hashPassword(pw);
  return transaction(db, () => {
    check?.();
    if (byUsername(db, u)) throw new ApiError(409, 'There is already an admin with that username.', 'username_taken');
    const id = Number(db.prepare('INSERT INTO admin_accounts (username, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?)').run(u, hash, now, now).lastInsertRowid);
    const admin = adminView(byId(db, id));
    audit?.(admin);
    return admin;
  });
}

// A new password for an admin. Every session of theirs ends, except `keepSession` (the one that asked for the change).
export async function setPassword(db, adminId, password, { now = Date.now(), keepSession = null, enable = false, audit = null } = {}) {
  const a = byId(db, adminId);
  if (!a) throw new ApiError(404, 'There is no such admin.', 'not_found');
  const pw = checkPassword(a.username, password);
  const hash = await hashPassword(pw);
  return transaction(db, () => {
    db.prepare(`UPDATE admin_accounts SET password_hash = ?, password_changed_at = ?${enable ? ', disabled = 0' : ''} WHERE id = ?`).run(hash, now, a.id);
    const ended = keepSession
      ? db.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND id_hash != ?').run(a.id, sha256(keepSession)).changes
      : db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(a.id).changes;
    audit?.({ ended });
    return { admin: adminView(byId(db, a.id)), endedSessions: Number(ended) };
  });
}

// Switches an admin off (their sessions end at once) or on again. An admin cannot switch themselves off, and the last one cannot be switched off.
export function setDisabled(db, adminId, disabled, { actorId = null, audit = null } = {}) {
  return transaction(db, () => {
    const a = byId(db, adminId);
    if (!a) throw new ApiError(404, 'There is no such admin.', 'not_found');
    if (disabled && actorId != null && Number(actorId) === a.id) throw new ApiError(409, 'You cannot disable your own account.', 'self');
    if (disabled && !a.disabled && db.prepare('SELECT COUNT(*) AS n FROM admin_accounts WHERE disabled = 0').get().n <= 1) throw new ApiError(409, 'This is the last admin who can sign in.', 'last_admin');
    db.prepare('UPDATE admin_accounts SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, a.id);
    if (disabled) db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(a.id);
    const out = adminView(byId(db, a.id));
    audit?.(out);
    return out;
  });
}

// ---- sessions

export function createSession(db, adminId, now = Date.now()) {
  const value = b64(crypto.randomBytes(32));
  const expiresAt = now + SESSION.absoluteMs;
  db.prepare('INSERT INTO admin_sessions (id_hash, admin_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(sha256(value), adminId, now, now, expiresAt);
  return { value, expiresAt };
}

// The admin a cookie's value belongs to, or null (unknown, ended, idle too long, past its 12 hours, or the admin is disabled).
export function sessionAdmin(db, value, now = Date.now()) {
  if (!value || typeof value !== 'string' || value.length > 100) return null;
  const s = db.prepare('SELECT s.*, a.username, a.disabled FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_id WHERE s.id_hash = ?').get(sha256(value));
  if (!s) return null;
  if (s.disabled || now >= s.expires_at || now - s.last_seen_at >= SESSION.idleMs) {
    db.prepare('DELETE FROM admin_sessions WHERE id_hash = ?').run(s.id_hash);
    return null;
  }
  if (now - s.last_seen_at >= SESSION.touchEveryMs) db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id_hash = ?').run(now, s.id_hash);
  const seen = now - s.last_seen_at >= SESSION.touchEveryMs ? now : s.last_seen_at;
  return { id: s.admin_id, username: s.username, expiresAt: s.expires_at, idleExpiresAt: Math.min(s.expires_at, seen + SESSION.idleMs) };
}

export const endSession = (db, value) => (value ? db.prepare('DELETE FROM admin_sessions WHERE id_hash = ?').run(sha256(String(value))).changes : 0);
export const pruneSessions = (db, now = Date.now()) => db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ? OR last_seen_at <= ?').run(now, now - SESSION.idleMs).changes;

// The cookie: only for the API's own host (no Domain), sent back only from the site itself (SameSite=Strict: voxelventure.app and
// api.voxelventure.app are the same site), never readable by scripts, only over HTTPS. The __Host- prefix makes the browser enforce all that.
export const sessionCookie = (value, maxAgeMs) => `${COOKIE}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}; HttpOnly; Secure; SameSite=Strict`;
export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
export function readCookie(req) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return null;
}

// ---- signing in

// Failed sign-ins per network and per username: 5 within 15 minutes and that key is locked for 15 minutes (in memory: a restart forgets them).
export function createLoginGuard({ failures = LOGIN_LIMIT.failures, windowMs = LOGIN_LIMIT.windowMs, lockMs = LOGIN_LIMIT.lockMs } = {}) {
  const keys = new Map(); // key -> { fails: [at], lockedUntil }
  const get = (k) => keys.get(k) ?? keys.set(k, { fails: [], lockedUntil: 0 }).get(k);
  const prune = (now) => { for (const [k, v] of keys) if (v.lockedUntil <= now && !v.fails.some((t) => now - t < windowMs)) keys.delete(k); };
  setInterval(() => prune(Date.now()), 60_000).unref();
  return {
    locked: (ks, now = Date.now()) => ks.some((k) => (keys.get(k)?.lockedUntil ?? 0) > now),
    // records a failure; true when it locked a key just now
    fail(ks, now = Date.now()) {
      let lockedNow = false;
      for (const k of ks) {
        const v = get(k);
        v.fails = v.fails.filter((t) => now - t < windowMs);
        v.fails.push(now);
        if (v.fails.length >= failures && v.lockedUntil <= now) ((v.lockedUntil = now + lockMs), (v.fails = []), (lockedNow = true));
      }
      return lockedNow;
    },
    succeed: (ks) => ks.forEach((k) => keys.delete(k)),
  };
}

const FAILED = 'That username and password did not work, or there have been too many tries. Wait a few minutes and try again.';

// Checks a username and password. Resolves the admin row, or throws one generic 401 for every kind of failure (unknown, wrong, disabled, locked),
// after a fixed delay. `record(kind, admin)` is told what happened, for the audit trail; the password itself never leaves this function.
export async function signIn(db, { username, password }, { guard, ip, delayMs = 400, now = Date.now, record = () => {} }) {
  const u = String(username ?? '').trim().slice(0, 64);
  const pw = String(password ?? '');
  const keys = [`ip:${ip || '?'}`, `user:${u.toLowerCase()}`];
  const fail = async (reason, admin) => {
    const lockedNow = reason !== 'locked' && guard.fail(keys, now());
    record(reason, admin);
    if (lockedNow) record('lockout', admin);
    await new Promise((r) => setTimeout(r, delayMs));
    throw new ApiError(401, FAILED, 'login_failed');
  };
  const admin = u ? byUsername(db, u) : null;
  if (guard.locked(keys, now())) return fail('locked', admin);
  const ok = await verifyPassword(pw, admin?.password_hash ?? (await decoyHash()));
  if (!admin) return fail('unknown_user', null);
  if (!ok) return fail('bad_password', admin);
  if (admin.disabled) return fail('disabled', admin);
  guard.succeed(keys);
  db.prepare('UPDATE admin_accounts SET last_login_at = ? WHERE id = ?').run(now(), admin.id);
  return admin;
}
