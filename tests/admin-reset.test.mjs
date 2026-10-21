// A forgotten admin password (services/api/admin.mjs, docs/architecture/backend.md#admin-password-reset): an admin's email address and its
// one-use confirmation link, the reset link asked for on /admin/forgot (the same answer whether the account exists or not, the limits), the
// link itself (32 random bytes, only its SHA-256 kept, 30 minutes, once, a new one voids the old), the reset (every session ends, the lockout
// is cleared, a disabled admin is refused), the ADMIN_TOKEN fallback (and its lockout per network), the database upgraded in place, and that
// no link, token or password is ever written to the database, the outbox, the audit trail or the log.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../services/api/server.mjs';
import * as admin from '../services/api/admin.mjs';
import { SCRUBBED } from '../services/api/engage.mjs';
import { openDb } from '../services/api/db.mjs';
import { validate, ADMIN_ACCOUNTS, ADMIN_EMAIL, ADMIN_EMAIL_VERIFY_RESULT, ADMIN_RESET_CHECK_RESULT, ADMIN_RESET_REQUEST_RESULT, ADMIN_RESET_RESULT, ADMIN_RESET_REQUEST, ADMIN_RESET_CONFIRM, ADMIN_RESET_TOKEN, ADMIN_EMAIL_SET } from '@voxelventure/shared-types';

let fails = 0;
// the checks print with the console as it was (what the API prints is collected below, to look for secrets), and their details only on a failure
const say = console.log.bind(console);
const check = (name, ok, extra = '') => { if (!ok) fails++; say(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); };
const holds = (name, contract, value) => { const errors = validate(contract.schema, value); check(`${name} holds ${contract.id} v${contract.version}`, errors.length === 0, errors.slice(0, 3).join('; ')); };

const printed = [];
for (const k of ['log', 'warn', 'error']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => (printed.push(a.map(String).join(' ')), orig(...a));
}

// ---- the link on its own: only its SHA-256 is kept, 30 minutes, a new one voids the old
{
  const db = openDb(':memory:');
  const a = await admin.createAdmin(db, { username: 'unit', password: 'a long unit password' });
  const t0 = 5_000_000;
  const v1 = admin.issueToken(db, a.id, 'reset', { now: t0 });
  check('a link is 32 random bytes', Buffer.from(v1, 'base64url').length === 32);
  const row = db.prepare('SELECT * FROM admin_tokens').get();
  check('the database keeps only its SHA-256', row.token_hash === crypto.createHash('sha256').update(v1).digest('hex') && !JSON.stringify(row).includes(v1));
  check('it is good for 30 minutes, not a moment more', admin.findToken(db, v1, 'reset', t0 + 30 * 60000 - 1) && !admin.findToken(db, v1, 'reset', t0 + 30 * 60000));
  check('a reset link is not an email link', !admin.findToken(db, v1, 'verify', t0));
  const v2 = admin.issueToken(db, a.id, 'reset', { now: t0 + 1000 });
  check('a new link voids the older one', !admin.findToken(db, v1, 'reset', t0 + 2000) && admin.findToken(db, v2, 'reset', t0 + 2000));
  check('expired links are pruned', admin.pruneTokens(db, t0 + 31 * 60000 + 1000) === 1 && db.prepare('SELECT COUNT(*) AS n FROM admin_tokens').get().n === 0);
  const lim = admin.createRateLimit({ max: 3, windowMs: 3600_000 });
  check('the request limit: 3 an hour, then free again an hour later', lim.take('k', 0) && lim.take('k', 1) && lim.take('k', 2) && !lim.take('k', 3) && lim.take('k', 3600_001));
  db.close();
}

// ---- an older database is upgraded in place (admin_accounts without the email columns)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-admin-migrate-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE admin_accounts (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, password_changed_at INTEGER, last_login_at INTEGER, disabled INTEGER NOT NULL DEFAULT 0)');
  old.prepare('INSERT INTO admin_accounts (username, password_hash, created_at) VALUES (?, ?, ?)').run('veteran', 'scrypt$x', 1);
  old.close();
  const db = openDb(file);
  const cols = db.prepare('PRAGMA table_info(admin_accounts)').all().map((c) => c.name);
  check('an older database gets email and email_verified_at, keeping its admins', cols.includes('email') && cols.includes('email_verified_at') && admin.byUsername(db, 'veteran')?.email === null);
  check('and the one-use links table', db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'admin_tokens'").get());
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- the API, with an outbox that is read here instead of sent
const SITE = 'https://site.test';
const TOKEN = 'reset-machine-token';
const DELAY = 120;
const mail = [];
const transport = { name: 'test', send: async (m) => { mail.push(m); } };
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, origin: SITE, transport, adminLogin: { delayMs: DELAY }, env: { ADMIN_TOKEN: TOKEN, IP_SALT: 'salt', TRUST_PROXY: '1' } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const db = api.db;
let ipN = 1;
const freshIp = () => `10.1.${Math.floor(ipN / 250)}.${ipN++ % 250}`;
const call = async (method, p, { body, token, cookie, origin = SITE, ip = freshIp(), type = 'application/json' } = {}) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(type ? { 'Content-Type': type } : {}), ...(origin ? { Origin: origin } : {}), 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: `${admin.COOKIE}=${cookie}` } : {}) },
    body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, cookie: res.headers.get('set-cookie') };
};
const login = async (username, password, opts = {}) => {
  const r = await call('POST', '/admin/session', { body: { username, password }, ...opts });
  return { ...r, value: (new RegExp(`${admin.COOKIE}=([^;]*)`).exec(r.cookie ?? '') ?? [])[1] ?? null };
};
// the next email to `to` (delivery runs at once after a link is queued)
const mailTo = async (to, after = 0) => {
  for (let i = 0; i < 50; i++) {
    const m = mail.slice(after).find((x) => x.to === to);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 20));
  }
  return null;
};
const linkIn = (m, page) => (new RegExp(`${SITE.replace(/\./g, '\\.')}/admin/${page}#token=([A-Za-z0-9_-]{43})`).exec(m?.body ?? '') ?? [])[1] ?? null;
const audits = (action) => db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id').all(action).map((r) => ({ ...r, detail: JSON.parse(r.detail ?? 'null') }));
const sessionsOf = (id) => db.prepare('SELECT COUNT(*) AS n FROM admin_sessions WHERE admin_id = ?').get(id).n;

const OWNER_PW = 'the owner first password';
const SECOND_PW = 'second admin password';
const RESET_PW = 'Reset by email at last';
const TOKEN_PW = 'Reset with the token 9';
const WEAK = 'owner';
const typed = [OWNER_PW, SECOND_PW, RESET_PW, TOKEN_PW, TOKEN, 'wrong-token-guess'];
const links = [];

try {
  await call('POST', '/admin/setup', { token: TOKEN, body: { username: 'owner', password: OWNER_PW } });
  const ownerId = admin.byUsername(db, 'owner').id;
  const s1 = await login('owner', OWNER_PW);

  // ---- the admin's email
  const none = await call('GET', '/admin/email', { cookie: s1.value });
  check('a new admin has no email', none.status === 200 && none.data.email === null && none.data.emailVerified === false);
  holds('GET /admin/email', ADMIN_EMAIL, none.data);
  check('setting it needs a session (not the token)', (await call('POST', '/admin/email', { token: TOKEN, origin: null, body: { email: 'a@b.test' } })).data.code === 'session_required');
  check('and the site\'s Origin (CSRF)', (await call('POST', '/admin/email', { cookie: s1.value, origin: 'https://evil.test', body: { email: 'a@b.test' } })).data.code === 'csrf');
  check('a bad address is refused', (await call('POST', '/admin/email', { cookie: s1.value, body: { email: 'not an email' } })).data.code === 'bad_email');
  holds('the body', ADMIN_EMAIL_SET, { email: 'Owner@Example.test' });
  const set = await call('POST', '/admin/email', { cookie: s1.value, body: { email: 'Owner@Example.test' } });
  check('a signed-in admin sets their email: kept in lowercase, unconfirmed, a link sent', set.status === 200 && set.data.email === 'owner@example.test' && set.data.emailVerified === false && set.data.sent === true, JSON.stringify(set.data));
  holds('POST /admin/email', ADMIN_EMAIL, set.data);
  const verifyMail = await mailTo('owner@example.test');
  const vlink = linkIn(verifyMail, 'verify-email');
  links.push(vlink);
  check('the confirmation email has a one-use link to /admin/verify-email (after "#", never sent to a server)', Boolean(vlink) && /30 minutes/.test(verifyMail.body) && /ignore this email/i.test(verifyMail.body), verifyMail?.body);
  check('the outbox keeps no working link once it is sent', db.prepare("SELECT body FROM outbox WHERE kind = 'admin_verify'").all().every((r) => r.body === SCRUBBED));
  check('the email change is audited, without the address', audits('admin.email_set').length === 1 && !JSON.stringify(audits('admin.email_set')).includes('example.test'));

  // unconfirmed: a reset request sends nothing
  const before = mail.length;
  const unconf = await call('POST', '/admin/password-reset/request', { body: { login: 'owner' } });
  await new Promise((r) => setTimeout(r, 100));
  check('with the email unconfirmed, a reset request sends nothing (and answers the same)', unconf.status === 200 && mail.length === before && audits('admin.password_reset_request').at(-1).detail.outcome === 'no_verified_email');
  check('nor by the unconfirmed address', (await call('POST', '/admin/password-reset/request', { body: { login: 'owner@example.test' } })).status === 200 && mail.length === before && audits('admin.password_reset_request').at(-1).detail.outcome === 'unknown');

  check('a made-up confirmation link is refused', (await call('POST', '/admin/email/verify', { body: { token: crypto.randomBytes(32).toString('base64url') } })).data.code === 'verify_invalid');
  const verified = await call('POST', '/admin/email/verify', { body: { token: vlink } });
  check('opening the link confirms the address (no session needed)', verified.status === 200 && verified.data.username === 'owner' && verified.data.email === 'owner@example.test');
  holds('POST /admin/email/verify', ADMIN_EMAIL_VERIFY_RESULT, verified.data);
  check('it works once', (await call('POST', '/admin/email/verify', { body: { token: vlink } })).data.code === 'verify_invalid');
  check('the Account page sees it confirmed', (await call('GET', '/admin/email', { cookie: s1.value })).data.emailVerified === true);
  check('setting the same confirmed address again changes nothing and sends nothing', (await call('POST', '/admin/email', { cookie: s1.value, body: { email: 'owner@example.test' } })).data.emailVerified === true && mail.length === before);

  // the Admins page shows each admin's email and whether it is confirmed
  await call('POST', '/admin/admins', { cookie: s1.value, body: { username: 'second', password: SECOND_PW } });
  const secondId = admin.byUsername(db, 'second').id;
  const listed = await call('GET', '/admin/admins', { cookie: s1.value });
  check('the Admins list has each email and its status', listed.data.admins.find((a) => a.username === 'owner').email === 'owner@example.test' && listed.data.admins.find((a) => a.username === 'owner').emailVerified === true && listed.data.admins.find((a) => a.username === 'second').email === null);
  holds('GET /admin/admins', ADMIN_ACCOUNTS, listed.data);
  const s2 = await login('second', SECOND_PW);
  check('two admins cannot share an address', (await call('POST', '/admin/email', { cookie: s2.value, body: { email: 'OWNER@example.test' } })).data.code === 'email_taken');

  // ---- asking for a reset link: the same answer whatever the account
  holds('the body', ADMIN_RESET_REQUEST, { login: 'owner' });
  const t = Date.now();
  const unknown = await call('POST', '/admin/password-reset/request', { body: { login: 'nobody-here' } });
  check('an unknown account: 200 with the generic message, after the fixed pause', unknown.status === 200 && /If that account has a confirmed email/.test(unknown.data.message) && Date.now() - t >= DELAY);
  holds('POST /admin/password-reset/request', ADMIN_RESET_REQUEST_RESULT, unknown.data);
  check('an account without an email: the very same answer', JSON.stringify((await call('POST', '/admin/password-reset/request', { body: { login: 'second' } })).data) === JSON.stringify(unknown.data));
  const n0 = mail.length;
  const known = await call('POST', '/admin/password-reset/request', { body: { login: 'OWNER' } });
  check('a known account with a confirmed email: the very same answer', JSON.stringify(known.data) === JSON.stringify(unknown.data));
  const resetMail1 = await mailTo('owner@example.test', n0);
  const r1 = linkIn(resetMail1, 'reset');
  links.push(r1);
  check('and a reset email with a one-use link to /admin/reset', Boolean(r1), resetMail1?.body);
  check('the email says who asked (the account, the time), how long it lasts and to ignore it if not you', /"owner"/.test(resetMail1.body) && /\d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(resetMail1.body) && /within 30 minutes/.test(resetMail1.body) && /It works once/.test(resetMail1.body) && /If you did not ask for this, ignore this email/.test(resetMail1.body) && !/10\.1\./.test(resetMail1.body));
  check('a request must be JSON from the site', (await call('POST', '/admin/password-reset/request', { type: 'text/plain', body: '{"login":"owner"}' })).status === 403 && (await call('POST', '/admin/password-reset/request', { origin: 'https://evil.test', body: { login: 'owner' } })).status === 403);
  check('each request is audited, naming only a real admin', audits('admin.password_reset_request').some((a) => a.detail.outcome === 'sent' && a.detail.username === 'owner') && !JSON.stringify(audits('admin.password_reset_request')).includes('nobody-here'));

  const n1 = mail.length;
  await call('POST', '/admin/password-reset/request', { body: { login: 'Owner@Example.TEST' } });
  const r2 = linkIn(await mailTo('owner@example.test', n1), 'reset');
  links.push(r2);
  check('asking by the confirmed email works too', Boolean(r2) && r2 !== r1);
  check('and voids the older link', (await call('POST', '/admin/password-reset/check', { body: { token: r1 } })).data.valid === false);
  const checked = await call('POST', '/admin/password-reset/check', { body: { token: r2 } });
  check('the newer link is good, and whose it is', checked.data.valid === true && checked.data.username === 'owner' && checked.data.expiresAt > Date.now() + 29 * 60000);
  holds('POST /admin/password-reset/check', ADMIN_RESET_CHECK_RESULT, checked.data);
  check('looking does not use it up', (await call('POST', '/admin/password-reset/check', { body: { token: r2 } })).data.valid === true);
  check('the database keeps only its SHA-256', db.prepare('SELECT token_hash FROM admin_tokens WHERE purpose = ?').all('reset').map((r) => r.token_hash).join() === crypto.createHash('sha256').update(r2).digest('hex'));

  // ---- the reset with the link: lock the owner out first (5 failures from one network), and have two sessions open
  const home = '10.77.0.1';
  for (let i = 0; i < 5; i++) await login('owner', `wrong password ${i}`, { ip: home });
  check('the owner is locked out (even the right password fails)', (await login('owner', OWNER_PW, { ip: '10.77.0.2' })).status === 401 && (await login('owner', OWNER_PW, { ip: home })).status === 401);
  check('the old link is refused', (await call('POST', '/admin/password-reset/confirm', { body: { token: r1, password: RESET_PW } })).data.code === 'reset_invalid');
  check('a weak new password is refused, and the link stays good', (await call('POST', '/admin/password-reset/confirm', { body: { token: r2, password: WEAK } })).data.code === 'weak_password' && (await call('POST', '/admin/password-reset/check', { body: { token: r2 } })).data.valid === true);
  holds('the body', ADMIN_RESET_CONFIRM, { token: r2, password: RESET_PW });
  check('the owner has sessions open before', sessionsOf(ownerId) >= 1);
  const done = await call('POST', '/admin/password-reset/confirm', { body: { token: r2, password: RESET_PW }, ip: home });
  check('a good link and password: the password is reset', done.status === 200 && done.data.ok === true && done.data.username === 'owner' && done.data.endedSessions >= 1, JSON.stringify(done.data));
  holds('POST /admin/password-reset/confirm', ADMIN_RESET_RESULT, done.data);
  check('every session of that admin ended', sessionsOf(ownerId) === 0 && (await call('GET', '/admin/session', { cookie: s1.value })).status === 401);
  check('the other admin is still signed in', (await call('GET', '/admin/session', { cookie: s2.value })).status === 200);
  check('the link works once', (await call('POST', '/admin/password-reset/confirm', { body: { token: r2, password: 'Another one 123' } })).data.code === 'reset_invalid' && db.prepare("SELECT COUNT(*) AS n FROM admin_tokens WHERE purpose = 'reset'").get().n === 0);
  const back = await login('owner', RESET_PW, { ip: home });
  check('the lockout is cleared: the owner signs in at once with the new password, from the locked network too', back.status === 200);
  check('the old password no longer works', (await login('owner', OWNER_PW)).status === 401);
  check('the reset is audited, by that admin, via the email link', audits('admin.password_reset').some((a) => a.actor_kind === 'admin' && a.actor_id === ownerId && a.detail.via === 'email link'));
  check('a bad link is audited as a failure', audits('admin.password_reset_failed').some((a) => a.detail.reason === 'bad_link'));

  // ---- expiry: a link 30 minutes old is refused
  const n2 = mail.length;
  await call('POST', '/admin/password-reset/request', { body: { login: 'owner' } });
  const r3 = linkIn(await mailTo('owner@example.test', n2), 'reset');
  links.push(r3);
  db.prepare("UPDATE admin_tokens SET expires_at = ? WHERE purpose = 'reset'").run(Date.now() - 1);
  check('an expired link is refused', (await call('POST', '/admin/password-reset/check', { body: { token: r3 } })).data.valid === false && (await call('POST', '/admin/password-reset/confirm', { body: { token: r3, password: 'Too late for this 1' } })).data.code === 'reset_invalid');

  // ---- the limits: 3 emails an hour per admin (the 4th is answered the same and sends nothing), 10 requests an hour per network
  const n3 = mail.length;
  const fourth = await call('POST', '/admin/password-reset/request', { body: { login: 'owner' } });
  await new Promise((r) => setTimeout(r, 100));
  check('a 4th link within the hour for one admin: the same answer, no email', fourth.status === 200 && JSON.stringify(fourth.data) === JSON.stringify(unknown.data) && mail.length === n3 && audits('admin.password_reset_request').at(-1).detail.outcome === 'admin_limit');
  const net = '10.88.0.1';
  const answers = [];
  for (let i = 0; i < 11; i++) answers.push((await call('POST', '/admin/password-reset/request', { body: { login: `nobody${i}` }, ip: net })).status);
  check('10 requests an hour from one network, then 429', answers.slice(0, 10).every((s) => s === 200) && answers[10] === 429, answers.join());
  check('another network is not affected', (await call('POST', '/admin/password-reset/request', { body: { login: 'nobody' } })).status === 200);

  // ---- a disabled admin cannot reset
  const s2b = await login('second', SECOND_PW);
  await call('POST', '/admin/email', { cookie: s2b.value, body: { email: 'second@example.test' } });
  const v2 = linkIn(await mailTo('second@example.test'), 'verify-email');
  links.push(v2);
  check('the second admin confirms an address too', (await call('POST', '/admin/email/verify', { body: { token: v2 } })).status === 200);
  const n4 = mail.length;
  await call('POST', '/admin/password-reset/request', { body: { login: 'second' } });
  const r4 = linkIn(await mailTo('second@example.test', n4), 'reset');
  links.push(r4);
  const owner2 = await login('owner', RESET_PW);
  check('the owner disables the second admin', (await call('PATCH', `/admin/admins/${secondId}`, { cookie: owner2.value, body: { disabled: true } })).data.admin.disabled === true);
  const n5 = mail.length;
  await call('POST', '/admin/password-reset/request', { body: { login: 'second' } });
  await new Promise((r) => setTimeout(r, 100));
  check('a disabled admin gets no reset email (the same answer)', mail.length === n5 && audits('admin.password_reset_request').at(-1).detail.outcome === 'disabled');
  check('a link from before is shown as no longer good', (await call('POST', '/admin/password-reset/check', { body: { token: r4 } })).data.valid === false);
  const refused = await call('POST', '/admin/password-reset/confirm', { body: { token: r4, password: 'Second is back 12' } });
  check('and refused: the admin stays disabled with the old password', refused.status === 409 && refused.data.code === 'disabled' && admin.byId(db, secondId).disabled === 1 && (await admin.verifyPassword(SECOND_PW, admin.byId(db, secondId).password_hash)));

  // ---- the fallback: the server's ADMIN_TOKEN
  holds('the body', ADMIN_RESET_TOKEN, { username: 'owner', password: TOKEN_PW });
  const tokIp = '10.99.0.1';
  const noTok = await call('POST', '/admin/password-reset/token', { body: { username: 'owner', password: TOKEN_PW }, ip: tokIp });
  check('without the token: 401, the generic message', noTok.status === 401 && noTok.data.code === 'reset_failed');
  check('a player\'s sign-in is not the token', (await call('POST', '/admin/password-reset/token', { token: (await call('POST', '/auth/signup', { body: { username: 'Player9', password: 'longenough1' } })).data.token, body: { username: 'owner', password: TOKEN_PW } })).data.code === 'reset_failed');
  for (let i = 0; i < 4; i++) await call('POST', '/admin/password-reset/token', { token: 'wrong-token-guess', body: { username: 'owner', password: TOKEN_PW }, ip: tokIp });
  const lockedTok = await call('POST', '/admin/password-reset/token', { token: TOKEN, body: { username: 'owner', password: TOKEN_PW }, ip: tokIp });
  check('5 wrong tokens from one network lock it: even the right token is refused there', lockedTok.status === 401 && lockedTok.data.code === 'reset_failed' && (await admin.verifyPassword(RESET_PW, admin.byId(db, ownerId).password_hash)));
  check('the failures and the lockout are audited', audits('admin.password_reset_failed').filter((a) => a.detail.reason === 'bad_token').length >= 5 && audits('admin.lockout').some((a) => a.detail.username === null));
  check('a wrong token counts as a failed sign-in of that network', (await login('owner', RESET_PW, { ip: tokIp })).status === 401);
  check('the token cannot enable a disabled admin', (await call('POST', '/admin/password-reset/token', { token: TOKEN, origin: null, body: { username: 'second', password: 'Second is back 12' } })).data.code === 'disabled' && admin.byId(db, secondId).disabled === 1);
  check('an unknown username: 404', (await call('POST', '/admin/password-reset/token', { token: TOKEN, origin: null, body: { username: 'nobody', password: TOKEN_PW } })).status === 404);
  check('the same password rule', (await call('POST', '/admin/password-reset/token', { token: TOKEN, origin: null, body: { username: 'owner', password: WEAK } })).data.code === 'weak_password');
  for (let i = 0; i < 5; i++) await login('owner', `wrong again ${i}`);
  check('the owner is locked out again', (await login('owner', RESET_PW)).status === 401);
  const open1 = await call('GET', '/admin/session', { cookie: owner2.value });
  const viaToken = await call('POST', '/admin/password-reset/token', { token: TOKEN, body: { username: 'owner', password: TOKEN_PW } });
  check('the right token from another network resets the password', viaToken.status === 200 && viaToken.data.username === 'owner' && open1.status === 200, JSON.stringify(viaToken.data));
  holds('POST /admin/password-reset/token', ADMIN_RESET_RESULT, viaToken.data);
  check('it ends every session of that admin', viaToken.data.endedSessions >= 1 && sessionsOf(ownerId) === 0);
  check('and clears the lockout: the new password signs in at once', (await login('owner', TOKEN_PW)).status === 200);
  check('it is audited as the admin token, naming the admin', audits('admin.password_reset').some((a) => a.actor_kind === 'admin' && a.actor_id === null && a.detail.via === 'admin token' && a.detail.username === 'owner'));

  // ---- changing or removing the address tells the old one
  const owner3 = await login('owner', TOKEN_PW);
  const n6 = mail.length;
  const moved = await call('POST', '/admin/email', { cookie: owner3.value, body: { email: 'new-owner@example.test' } });
  check('a new address is unconfirmed until its link is opened', moved.data.email === 'new-owner@example.test' && moved.data.emailVerified === false, JSON.stringify(moved.data));
  const notice = await mailTo('owner@example.test', n6);
  check('the old confirmed address is told (with no link)', /changed to another address/.test(notice?.body ?? '') && !/#token=/.test(notice.body));
  const nv = linkIn(await mailTo('new-owner@example.test', n6), 'verify-email');
  links.push(nv);
  const removed = await call('POST', '/admin/email', { cookie: owner3.value, body: { email: '' } });
  check('removing the address', removed.data.email === null && removed.data.emailVerified === false && audits('admin.email_removed').length === 1);
  check('its confirmation link no longer works', (await call('POST', '/admin/email/verify', { body: { token: nv } })).data.code === 'verify_invalid');

  // ---- nothing secret anywhere
  await new Promise((r) => setTimeout(r, 150));
  const dump = JSON.stringify(['admin_accounts', 'admin_sessions', 'admin_tokens', 'audit_log', 'outbox'].map((t) => db.prepare(`SELECT * FROM ${t}`).all()));
  check('the links were all read from the outbox', links.length >= 7 && links.every(Boolean), String(links.length));
  check('no link, token or password is in the database, the outbox or the audit trail', links.every((l) => !dump.includes(l)) && typed.every((s) => !dump.includes(s)));
  check('every one-use email in the outbox has had its text removed', db.prepare("SELECT body FROM outbox WHERE kind IN ('admin_reset', 'admin_verify')").all().every((r) => r.body === SCRUBBED));
  check('nor in the log', [...links, ...typed].every((s) => !printed.some((l) => l.includes(s))));
} catch (e) {
  fails++;
  console.log('FAIL crashed:', e.stack);
} finally {
  await api.close();
}

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
