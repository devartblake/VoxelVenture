// The admin sign-in (services/api/admin.mjs, docs/architecture/backend.md#admin-sign-in): the first account made once with ADMIN_TOKEN, the
// password hash, signing in for a session cookie (its flags), CORS with credentials only for the site, the CSRF checks, idle and absolute expiry,
// signing out, lockouts, changing a password (other sessions end), adding and disabling admins, the presence monitor's figures through the API,
// ADMIN_TOKEN still working everywhere, the command line, and that no password is ever written to the database, the audit trail or the log.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../services/api/server.mjs';
import * as admin from '../services/api/admin.mjs';
import { checkApiEnv } from '../services/api/config.mjs';
import { openDb } from '../services/api/db.mjs';
import { validate, ADMIN_SESSION, ADMIN_SETUP_STATE, ADMIN_ACCOUNT, ADMIN_ACCOUNTS, ADMIN_PASSWORD_CHANGE_RESULT, ADMIN_PRESENCE } from '@voxelventure/shared-types';
import { root, imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const holds = (name, contract, value) => { const errors = validate(contract.schema, value); check(`${name} holds ${contract.id}`, errors.length === 0, errors.slice(0, 3).join('; ')); };

// everything the API prints, to check no password reaches the log
const printed = [];
for (const k of ['log', 'warn', 'error']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => (printed.push(a.map(String).join(' ')), orig(...a));
}

// ---- the hash
const h = await admin.hashPassword('correct horse battery');
const parts = h.split('$');
check('the hash is scrypt$N$r$p$salt$hash with N = 2^15, r = 8, p = 1', parts.length === 6 && parts[0] === 'scrypt' && parts[1] === '32768' && parts[2] === '8' && parts[3] === '1', h.slice(0, 22));
check('with a 16-byte salt and a 32-byte hash', Buffer.from(parts[4], 'base64url').length === 16 && Buffer.from(parts[5], 'base64url').length === 32);
check('the same password twice gives two different hashes (salted)', h !== (await admin.hashPassword('correct horse battery')));
check('the right password matches, a wrong one does not', (await admin.verifyPassword('correct horse battery', h)) && !(await admin.verifyPassword('correct horse batterz', h)));
check('weak or absurd parameters are refused', admin.parseHash(h) && !admin.parseHash(h.replace('$32768$', '$1024$')) && !admin.parseHash(h.replace('$32768$', '$30000$')) && !admin.parseHash('plain') && !(await admin.verifyPassword('x', 'scrypt$1024$8$1$abc$def')));

// ---- where the sign-in page goes next (lib/data/admin.js): a path on this site only
const { safeNext, loginHref, passwordProblem } = await imp('data/admin.js');
check('?next= keeps a path on this site, with its query', safeNext('/admin/pilot?weeks=8') === '/admin/pilot?weeks=8' && safeNext('/discover') === '/discover');
check('never another host or a script', ['//evil.test', '/\\evil.test', 'https://evil.test/admin', 'javascript:alert(1)', '/\t/evil.test', '', null].every((n) => safeNext(n) === '/admin'));
check('never back to the sign-in or the setup', safeNext('/admin/login?next=/x') === '/admin' && safeNext('/admin/setup') === '/admin');
check('the login link carries it', loginHref('/admin/economy') === '/admin/login?next=%2Fadmin%2Feconomy');
check('the forms check the password rules first', passwordProblem('amy', 'short') && passwordProblem('amyamyamyamy', 'AMYAMYAMYAMY') && passwordProblem('amy', 'Long enough pw1', 'other') && !passwordProblem('amy', 'Long enough pw1', 'Long enough pw1'));

// ---- the login guard on its own: 5 failures in 15 minutes lock for 15 minutes
const g = admin.createLoginGuard();
const t0 = 1_000_000;
let lockedAt = -1;
for (let i = 0; i < 5; i++) if (g.fail(['user:x'], t0 + i * 1000)) lockedAt = i;
check('the fifth failure locks the key', lockedAt === 4 && g.locked(['user:x'], t0 + 5000));
check('for 15 minutes, then it is free again', g.locked(['user:x'], t0 + 4000 + 15 * 60000 - 1) && !g.locked(['user:x'], t0 + 4000 + 15 * 60000));
const g2 = admin.createLoginGuard();
for (let i = 0; i < 4; i++) g2.fail(['user:y'], t0 + i * 5 * 60000);
check('failures older than 15 minutes do not count', !g2.locked(['user:y'], t0 + 15 * 60000 + 1));

// ---- the API
const SITE = 'https://site.test';
const TOKEN = 'admin-machine-token';
const presence = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ uptime: 5, now: Date.now(), players: [{ id: 1, name: 'Pat' }], recentErrors: [], load: {}, sawSecret: req.headers['x-notify-secret'] === 'mp-secret' }));
});
await new Promise((r) => presence.listen(0, r));
const DELAY = 150;
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, origin: SITE, adminLogin: { delayMs: DELAY }, env: { ADMIN_TOKEN: TOKEN, IP_SALT: 'salt', TRUST_PROXY: '1', MP_NOTIFY_SECRET: 'mp-secret', MP_STATUS_URL: `http://127.0.0.1:${presence.address().port}/status` } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const db = api.db;
let ipN = 1;
const freshIp = () => `10.0.0.${ipN++}`;
// a call: JSON, from the site (Origin), from one network; `cookie` is the session cookie's value
const call = async (method, p, { body, token, cookie, origin = SITE, ip = '10.9.9.9', type = 'application/json', headers = {} } = {}) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(type ? { 'Content-Type': type } : {}), ...(origin ? { Origin: origin } : {}), 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: `${admin.COOKIE}=${cookie}` } : {}), ...headers },
    body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, headers: res.headers, cookie: res.headers.get('set-cookie') };
};
const cookieOf = (setCookie) => (new RegExp(`${admin.COOKIE}=([^;]*)`).exec(setCookie ?? '') ?? [])[1] ?? null;
const login = async (username, password, opts = {}) => {
  const r = await call('POST', '/admin/session', { body: { username, password }, ip: opts.ip ?? freshIp(), ...opts });
  return { ...r, value: cookieOf(r.cookie) };
};
const OWNER_PW = 'a long owner password';
const SECOND_PW = 'second admin password';
const NEW_PW = 'the owner changed it';
const typedPasswords = [OWNER_PW, SECOND_PW, NEW_PW, 'wrong password 1', 'MySecretPass123!x'];

try {
  // the API starts with no admin account at all; the settings check knows nothing of admin credentials
  check('the settings check has no admin-credential rules', !checkApiEnv({}).errors.concat(checkApiEnv({}).warnings).some((e) => /ADMIN_USERNAME|ADMIN_PASSWORD/.test(e)));
  const state = await call('GET', '/admin/setup');
  check('with no admin yet, setup is needed', state.status === 200 && state.data.needed === true);
  holds('GET /admin/setup', ADMIN_SETUP_STATE, state.data);
  check('nobody is signed in', (await call('GET', '/admin/session')).status === 401);
  check('signing in before any account exists fails like any wrong password', (await login('owner', OWNER_PW)).status === 401);

  // ---- setup: once, with the token
  check('setup without the token is refused', (await call('POST', '/admin/setup', { body: { username: 'owner', password: OWNER_PW } })).status === 403);
  check('or with a wrong one', (await call('POST', '/admin/setup', { token: 'nope', body: { username: 'owner', password: OWNER_PW } })).status === 403);
  const player = (await call('POST', '/auth/signup', { body: { username: 'Player1', password: 'longenough1' } })).data;
  check('or with a player\'s sign-in', (await call('POST', '/admin/setup', { token: player.token, body: { username: 'owner', password: OWNER_PW } })).status === 403);
  const short = await call('POST', '/admin/setup', { token: TOKEN, body: { username: 'owner', password: 'short pw' } });
  check('a password under 8 characters is refused', (await call('POST', '/admin/setup', { token: TOKEN, body: { username: 'owner', password: 'Ab1!xyz' } })).data.code === 'weak_password');
  check('so is a short one with fewer than 3 kinds of character', short.status === 400 && short.data.code === 'weak_password');
  check('so is a common one', (await call('POST', '/admin/setup', { token: TOKEN, body: { username: 'owner', password: 'Password123' } })).data.code === 'weak_password');
  check('so is the username as the password', (await call('POST', '/admin/setup', { token: TOKEN, body: { username: 'ownerowner12', password: 'OwnerOwner12' } })).data.code === 'weak_password');
  const setup = await call('POST', '/admin/setup', { token: TOKEN, body: { username: 'owner', password: OWNER_PW } });
  check('with the token, the first admin is created', setup.status === 200 && setup.data.admin.username === 'owner' && !('password' in setup.data.admin) && !JSON.stringify(setup.data).includes('scrypt'));
  holds('POST /admin/setup', ADMIN_ACCOUNT, setup.data);
  const again = await call('POST', '/admin/setup', { token: TOKEN, body: { username: 'other', password: 'another long one' } });
  check('a second setup is refused with 409, even with the token', again.status === 409 && again.data.code === 'already_set_up' && admin.count(db) === 1);
  check('and setup is no longer needed', (await call('GET', '/admin/setup')).data.needed === false);
  const row = db.prepare('SELECT * FROM admin_accounts').get();
  check('the database keeps a scrypt hash with its parameters, not the password', /^scrypt\$32768\$8\$1\$/.test(row.password_hash) && row.password_hash !== OWNER_PW);

  // ---- signing in
  const t = Date.now();
  const bad = await login('owner', 'wrong password 1');
  check('a wrong password: 401 with a generic message, no cookie', bad.status === 401 && bad.data.code === 'login_failed' && !bad.cookie && /did not work/.test(bad.data.error));
  check('after a short fixed delay', Date.now() - t >= DELAY);
  const unknown = await login('nobody', 'wrong password 1');
  check('an unknown username gets the very same answer', unknown.status === 401 && unknown.data.error === bad.data.error);
  const ok = await login('OWNER', OWNER_PW);
  check('the right password signs in (the username in any case)', ok.status === 200 && ok.data.admin.username === 'owner' && Boolean(ok.value));
  holds('POST /admin/session', ADMIN_SESSION, ok.data);
  const flags = ok.cookie.split(';').map((s) => s.trim());
  check('the cookie is HttpOnly, Secure, SameSite=Strict, Path=/, no Domain, 12 hours', flags.includes('HttpOnly') && flags.includes('Secure') && flags.includes('SameSite=Strict') && flags.includes('Path=/') && !flags.some((f) => /^domain=/i.test(f)) && flags.includes('Max-Age=43200') && flags[0].startsWith('__Host-'), ok.cookie.replace(ok.value, '<value>'));
  check('its value is 32 random bytes', Buffer.from(ok.value, 'base64url').length === 32);
  const sessionRow = db.prepare('SELECT * FROM admin_sessions').get();
  check('the database keeps only its SHA-256', sessionRow.id_hash === crypto.createHash('sha256').update(ok.value).digest('hex') && !JSON.stringify(db.prepare('SELECT * FROM admin_sessions').all()).includes(ok.value));
  check('12 hours absolute', sessionRow.expires_at - sessionRow.created_at === 12 * 3600000);
  const me = await call('GET', '/admin/session', { cookie: ok.value });
  check('GET /admin/session says who is signed in', me.status === 200 && me.data.admin.username === 'owner');
  holds('GET /admin/session', ADMIN_SESSION, me.data);
  check('the sign-in is in the audit trail, with the network hashed', db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.login' AND actor_kind = 'admin' AND actor_id = ?").get(row.id).n === 1 && !JSON.stringify(db.prepare('SELECT * FROM audit_log').all()).includes('10.0.0.'));
  check('and so are the failures', db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.login_failed'").get().n >= 3);
  check('the last sign-in time is kept', db.prepare('SELECT last_login_at FROM admin_accounts WHERE id = ?').get(row.id).last_login_at >= t);
  check('a login must be JSON', (await call('POST', '/admin/session', { type: 'text/plain', body: JSON.stringify({ username: 'owner', password: OWNER_PW }) })).status === 403);
  check('and not come from another site', (await call('POST', '/admin/session', { origin: 'https://evil.test', body: { username: 'owner', password: OWNER_PW } })).status === 403);

  // ---- the admin routes take the session or the token
  check('an admin route with the session cookie works', (await call('GET', '/admin/pilot', { cookie: ok.value })).status === 200);
  check('with ADMIN_TOKEN too (scripts, verify:live, npm run moderate)', (await call('GET', '/admin/pilot', { token: TOKEN, origin: null })).status === 200 && (await call('GET', '/admin/audit/verify', { token: TOKEN, origin: null })).data.ok === true);
  check('with neither, 403 as before', (await call('GET', '/admin/pilot')).status === 403 && (await call('GET', '/admin/audit', { origin: null })).status === 403);
  check('a made-up cookie is nobody', (await call('GET', '/admin/pilot', { cookie: crypto.randomBytes(32).toString('base64url') })).status === 403);
  check('a player\'s token is nobody', (await call('GET', '/admin/pilot', { token: player.token })).status === 403);

  // ---- CSRF: a change with the cookie needs JSON and the site's Origin; the token does not
  const add = (opts) => call('POST', '/admin/pilot/members', { body: { slug: 'no-such-business' }, ...opts });
  check('a change with the cookie and no Origin is refused', (await add({ cookie: ok.value, origin: null })).data.code === 'csrf');
  check('from another origin too', (await add({ cookie: ok.value, origin: 'https://evil.test' })).data.code === 'csrf');
  check('and when it is not JSON (a form post)', (await add({ cookie: ok.value, type: 'application/x-www-form-urlencoded', body: 'slug=x' })).data.code === 'csrf');
  check('JSON from the site goes through (here: no such business, 404)', (await add({ cookie: ok.value })).status === 404);
  check('the token needs no Origin', (await add({ token: TOKEN, origin: null })).status === 404);
  check('a read with the cookie needs no Origin', (await call('GET', '/admin/pilot', { cookie: ok.value, origin: null })).status === 200);

  // ---- CORS
  const fromSite = await call('GET', '/admin/session', { cookie: ok.value });
  check('an admin route answers the site with its exact origin and credentials', fromSite.headers.get('access-control-allow-origin') === SITE && fromSite.headers.get('access-control-allow-credentials') === 'true' && /Origin/.test(fromSite.headers.get('vary') ?? ''));
  const fromEvil = await call('GET', '/admin/session', { cookie: ok.value, origin: 'https://evil.test' });
  check('another origin is not named and gets no credentials', fromEvil.headers.get('access-control-allow-origin') !== 'https://evil.test' && fromEvil.headers.get('access-control-allow-credentials') == null);
  const pre = await fetch(`${base}/admin/session`, { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  check('the preflight allows credentials for the site', pre.status === 204 && pre.headers.get('access-control-allow-origin') === SITE && pre.headers.get('access-control-allow-credentials') === 'true');
  const health = await call('GET', '/health');
  check('the public routes are unchanged: no credentials', health.headers.get('access-control-allow-origin') === SITE && health.headers.get('access-control-allow-credentials') == null);
  // development: API_ORIGIN unset ("*"): only a page on this machine gets credentials, and never in production
  const dev = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: TOKEN } });
  const prod = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: TOKEN, NODE_ENV: 'production' } });
  await new Promise((r) => dev.server.listen(0, r));
  await new Promise((r) => prod.server.listen(0, r));
  const cors = async (a, o) => (await fetch(`http://localhost:${a.server.address().port}/admin/session`, { headers: { Origin: o } })).headers;
  const local = await cors(dev, 'http://localhost:3000');
  const other = await cors(dev, 'https://evil.test');
  const prodLocal = await cors(prod, 'http://localhost:3000');
  check('in development, localhost gets credentials; another site gets "*" without them', local.get('access-control-allow-origin') === 'http://localhost:3000' && local.get('access-control-allow-credentials') === 'true' && other.get('access-control-allow-origin') === '*' && other.get('access-control-allow-credentials') == null);
  check('"*" with production settings gives credentials to nobody', prodLocal.get('access-control-allow-credentials') == null);
  await dev.close();
  await prod.close();

  // ---- expiry
  const idle = await login('owner', OWNER_PW);
  db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id_hash = ?').run(Date.now() - 2 * 3600000 - 1000, crypto.createHash('sha256').update(idle.value).digest('hex'));
  const idleMe = await call('GET', '/admin/session', { cookie: idle.value });
  check('two hours without a request ends a session (and clears the cookie)', idleMe.status === 401 && /Max-Age=0/.test(idleMe.cookie ?? '') && (await call('GET', '/admin/pilot', { cookie: idle.value })).status === 403);
  check('the ended session is deleted', !db.prepare('SELECT 1 FROM admin_sessions WHERE id_hash = ?').get(crypto.createHash('sha256').update(idle.value).digest('hex')));
  const old = await login('owner', OWNER_PW);
  db.prepare('UPDATE admin_sessions SET created_at = ?, expires_at = ?, last_seen_at = ? WHERE id_hash = ?').run(Date.now() - 12 * 3600000, Date.now() - 1, Date.now() - 1000, crypto.createHash('sha256').update(old.value).digest('hex'));
  check('twelve hours after signing in it ends, however active', (await call('GET', '/admin/session', { cookie: old.value })).status === 401);
  const fresh = await login('owner', OWNER_PW);
  db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id_hash = ?').run(Date.now() - 90 * 60000, crypto.createHash('sha256').update(fresh.value).digest('hex'));
  check('a request within the two hours keeps it going', (await call('GET', '/admin/pilot', { cookie: fresh.value })).status === 200 && db.prepare('SELECT last_seen_at FROM admin_sessions WHERE id_hash = ?').get(crypto.createHash('sha256').update(fresh.value).digest('hex')).last_seen_at > Date.now() - 60000);
  const unit = admin.createSession(db, row.id, 0);
  check('the session rules on a clock: idle at 2 hours, absolute at 12', admin.sessionAdmin(db, unit.value, 2 * 3600000 - 1) && admin.sessionAdmin(db, unit.value, 4 * 3600000 - 2) && !admin.sessionAdmin(db, unit.value, 12 * 3600000));

  // ---- signing out
  const out = await call('DELETE', '/admin/session', { cookie: fresh.value, body: {} });
  check('signing out clears the cookie', out.status === 200 && /Max-Age=0/.test(out.cookie ?? ''));
  check('and the session is gone on the server', (await call('GET', '/admin/session', { cookie: fresh.value })).status === 401 && (await call('GET', '/admin/pilot', { cookie: fresh.value })).status === 403);
  check('it is in the audit trail', db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.logout'").get().n === 1);
  check('signing out from another site is refused', (await call('DELETE', '/admin/session', { cookie: ok.value, origin: 'https://evil.test', body: {} })).status === 403);

  // ---- more admins
  const added = await call('POST', '/admin/admins', { cookie: ok.value, body: { username: 'second', password: SECOND_PW } });
  check('a signed-in admin adds another', added.status === 200 && added.data.admin.username === 'second');
  holds('POST /admin/admins', ADMIN_ACCOUNT, added.data);
  check('usernames are unique whatever the case', (await call('POST', '/admin/admins', { cookie: ok.value, body: { username: 'SECOND', password: 'yet another password' } })).status === 409);
  check('the same rules for its password', (await call('POST', '/admin/admins', { cookie: ok.value, body: { username: 'third', password: 'short' } })).status === 400);
  check('adding one needs an admin', (await call('POST', '/admin/admins', { body: { username: 'third', password: 'a third long password' } })).status === 403);
  const listed = await call('GET', '/admin/admins', { cookie: ok.value });
  check('the list shows both, with no hash', listed.data.admins.length === 2 && listed.data.me === row.id && !JSON.stringify(listed.data).includes('scrypt'));
  holds('GET /admin/admins', ADMIN_ACCOUNTS, listed.data);
  const second = await login('second', SECOND_PW);
  check('the new admin can sign in', second.status === 200);
  const secondId = added.data.admin.id;
  check('an admin cannot disable themselves', (await call('PATCH', `/admin/admins/${row.id}`, { cookie: ok.value, body: { disabled: true } })).data.code === 'self');
  const disabled = await call('PATCH', `/admin/admins/${secondId}`, { cookie: ok.value, body: { disabled: true } });
  check('disabling an admin', disabled.status === 200 && disabled.data.admin.disabled === true);
  check('ends their session at once', (await call('GET', '/admin/session', { cookie: second.value })).status === 401);
  const blocked = await login('second', SECOND_PW);
  check('a disabled admin cannot sign in (the same generic answer)', blocked.status === 401 && blocked.data.error === bad.data.error);
  check('the last admin who can sign in cannot be disabled (with the token)', (await call('PATCH', `/admin/admins/${row.id}`, { token: TOKEN, origin: null, body: { disabled: true } })).data.code === 'last_admin');
  check('enabling them again', (await call('PATCH', `/admin/admins/${secondId}`, { cookie: ok.value, body: { disabled: false } })).data.admin.disabled === false && (await login('second', SECOND_PW)).status === 200);
  check('each change is audited, by the admin who made it', ['admin.create', 'admin.disable', 'admin.enable'].every((a) => db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action = ? AND actor_kind = ? AND actor_id = ?').get(a, 'admin', row.id).n === 1));
  const trail = await call('GET', '/admin/audit?limit=5', { cookie: ok.value });
  check('the audit trail names the admin', trail.data.entries.some((e) => e.actor.kind === 'admin' && e.actor.name === 'owner'));

  // ---- changing a password
  const other1 = await login('owner', OWNER_PW);
  const other2 = await login('owner', OWNER_PW);
  check('a password change needs a session (the token is not an admin)', (await call('POST', '/admin/password', { token: TOKEN, origin: null, body: { currentPassword: OWNER_PW, newPassword: NEW_PW } })).data.code === 'session_required');
  check('and the current password', (await call('POST', '/admin/password', { cookie: ok.value, body: { currentPassword: 'wrong password 1', newPassword: NEW_PW } })).status === 401);
  check('the same rules for the new one', (await call('POST', '/admin/password', { cookie: ok.value, body: { currentPassword: OWNER_PW, newPassword: 'owner' } })).status === 400);
  const changed = await call('POST', '/admin/password', { cookie: ok.value, body: { currentPassword: OWNER_PW, newPassword: NEW_PW } });
  check('changing it ends the other sessions', changed.status === 200 && changed.data.endedSessions >= 2 && (await call('GET', '/admin/session', { cookie: other1.value })).status === 401 && (await call('GET', '/admin/session', { cookie: other2.value })).status === 401);
  holds('POST /admin/password', ADMIN_PASSWORD_CHANGE_RESULT, changed.data);
  check('but not the one that changed it', (await call('GET', '/admin/session', { cookie: ok.value })).status === 200);
  check('the old password no longer works, the new one does', (await login('owner', OWNER_PW)).status === 401 && (await login('owner', NEW_PW)).status === 200);
  check('the change is audited', db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.password_change'").get().n === 1);

  // ---- the presence monitor's figures
  check('the presence figures are for admins only', (await call('GET', '/admin/presence')).status === 403 && (await call('GET', '/admin/presence', { token: player.token })).status === 403);
  const pres = await call('GET', '/admin/presence', { cookie: ok.value });
  check('a signed-in admin gets the presence server\'s /status', pres.status === 200 && pres.data.players[0].name === 'Pat' && pres.data.sawSecret === true);
  holds('GET /admin/presence', ADMIN_PRESENCE, pres.data);
  check('so does ADMIN_TOKEN', (await call('GET', '/admin/presence', { token: TOKEN, origin: null })).status === 200);
  await new Promise((r) => presence.close(r));
  check('with the presence server down: 503', (await call('GET', '/admin/presence', { cookie: ok.value })).status === 503);

  // ---- lockouts: 5 failures in 15 minutes, per username and per network
  for (let i = 0; i < 5; i++) await login('second', 'wrong password 1');
  const lockedUser = await login('second', SECOND_PW);
  check('after 5 failures for a username, even the right password is refused (from a new network)', lockedUser.status === 401 && lockedUser.data.error === bad.data.error);
  check('the lockout is audited', db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.lockout'").get().n >= 1);
  check('other admins are not affected', (await login('owner', NEW_PW)).status === 200);
  const net = '10.200.0.1';
  for (let i = 0; i < 5; i++) await login(`guess${i}`, 'wrong password 1', { ip: net });
  check('after 5 failures from one network, it cannot sign anyone in', (await login('owner', NEW_PW, { ip: net })).status === 401);
  check('the same admin from another network can', (await login('owner', NEW_PW, { ip: '10.200.0.2' })).status === 200);

  // ---- no password anywhere
  const typedAsUsername = await login('MySecretPass123!x', 'x');
  check('a password typed into the username box is refused', typedAsUsername.status === 401);
  const dump = JSON.stringify([db.prepare('SELECT * FROM admin_accounts').all(), db.prepare('SELECT * FROM admin_sessions').all(), db.prepare('SELECT * FROM audit_log').all()]);
  check('no password is in the database or the audit trail (not even one typed as a username)', typedPasswords.every((pw) => !dump.includes(pw)));
  check('nor in the log', typedPasswords.every((pw) => !printed.some((l) => l.includes(pw))));
} catch (e) {
  fails++;
  console.log('FAIL crashed:', e.stack);
} finally {
  await api.close();
  if (presence.listening) presence.close();
}

// ---- the command line (npm run admin:create / admin:reset-password)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-admin-cli-'));
const dbFile = path.join(dir, 'admins.db');
const cli = (args, input) => spawnSync(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'scripts', 'admin-accounts.mjs'), ...args, '--db', dbFile], { input, encoding: 'utf8' });
try {
  const CLI_PW = 'typed on the server';
  const made = cli(['create', 'night-owl'], `${CLI_PW}\n${CLI_PW}\n`);
  check('admin:create prints only "created"', made.status === 0 && made.stdout.trim() === 'created' && !`${made.stdout}${made.stderr}`.includes(CLI_PW), made.stderr);
  check('a mismatched confirmation changes nothing', cli(['create', 'other-owl'], `${CLI_PW}\nsomething else entirely\n`).status === 1);
  check('a short password is refused', cli(['create', 'other-owl'], 'short\n').status === 1);
  check('the same username again is refused', cli(['create', 'NIGHT-OWL'], `${CLI_PW}\n`).status === 1);
  check('reset-password of nobody is refused', cli(['reset-password', 'nobody'], `${CLI_PW}\n`).status === 1);
  let cdb = openDb(dbFile);
  const owl = admin.byUsername(cdb, 'night-owl');
  check('the account is in the database with a scrypt hash', owl && /^scrypt\$32768\$/.test(owl.password_hash) && (await admin.verifyPassword(CLI_PW, owl.password_hash)));
  admin.createSession(cdb, owl.id);
  cdb.prepare('UPDATE admin_accounts SET disabled = 1 WHERE id = ?').run(owl.id);
  cdb.close();
  const RESET_PW = 'remembered at last';
  const reset = cli(['reset-password', 'night-owl'], `${RESET_PW}\n`);
  check('admin:reset-password prints only "password changed"', reset.status === 0 && reset.stdout.trim() === 'password changed' && !`${reset.stdout}${reset.stderr}`.includes(RESET_PW), reset.stderr);
  cdb = openDb(dbFile);
  const after = admin.byUsername(cdb, 'night-owl');
  check('the new password works, the old does not, its sessions ended, and it is enabled again', (await admin.verifyPassword(RESET_PW, after.password_hash)) && !(await admin.verifyPassword(CLI_PW, after.password_hash)) && cdb.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n === 0 && after.disabled === 0);
  const audited = cdb.prepare("SELECT action, detail FROM audit_log WHERE target_kind = 'admin' ORDER BY id").all();
  check('both are audited, without the passwords', audited.map((a) => a.action).join() === 'admin.create,admin.password_reset' && !JSON.stringify(audited).includes(CLI_PW) && !JSON.stringify(audited).includes(RESET_PW));
  cdb.close();
} catch (e) {
  fails++;
  console.log('FAIL the command line crashed:', e.stack);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- the Caddyfile templates: no password in Caddy, and the presence status never public (the monitor reads it through the API)
const caddy = fs.readFileSync(path.join(root, 'deploy', 'Caddyfile'), 'utf8');
const site = caddy.match(/^voxelventure\.app \{([\s\S]*?)^\}/m)?.[1] ?? '';
const play = caddy.match(/^play\.voxelventure\.app \{([\s\S]*?)^\}/m)?.[1] ?? '';
check('production\'s Caddyfile has no basic_auth and no password hash', !/basic_auth|REPLACE_WITH_A_CADDY_HASH/.test(caddy));
check('/mp-status answers 404 and nothing on the site reaches the presence server', /handle \/mp-status \{\s*respond 404/.test(site) && !site.includes('127.0.0.1:3001'));
check('the presence server\'s /status stays hidden on play.', /@private path \/status/.test(play) && /respond @private 404/.test(play));
const envExample = fs.readFileSync(path.join(root, 'deploy', 'env', 'api.env.example'), 'utf8');
check('no admin credentials in the settings templates', !/^#?\s*ADMIN_(USERNAME|PASSWORD)/m.test(envExample) && !/NEXT_PUBLIC_MP_HTTP=/.test(fs.readFileSync(path.join(root, 'deploy', 'env', 'web.env.example'), 'utf8')));

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
