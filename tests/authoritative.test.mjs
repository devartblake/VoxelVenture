// Phase 3, authoritative data (docs/architecture/authoritative_data.md): every count the API serves is verified events only (no generated starting
// figures), the outside of a building is kept by the server, the audit trail records each change atomically and cannot be edited, the
// production settings check, and the deploy check (scripts/verify-live.mjs) against a running API.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { root } from './helpers.mjs';
import { createApi } from '../services/api/server.mjs';
import { checkApiEnv, checkWebEnv } from '../services/api/config.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const ADMIN = 'admin-secret';
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: ADMIN, HUMAN_MIN_AGE_MS: '0', HUMAN_VISIT_CAP: '1000', HUMAN_CLICK_CAP: '1000' } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { token, body } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const signup = async (username) => (await call('POST', '/auth/signup', { body: { username, password: 'longenough1' } })).data;

try {
  // ---- no generated figures in any count
  const state = (await call('GET', '/plots/state')).data;
  const built = state.plots.filter((p) => p.owner && p.buildingType && p.buildingType !== 'house');
  const seededBase = api.db.prepare('SELECT SUM(base_visits) AS n FROM plots').get().n;
  check('the seed still has its generated starting visits in the database', seededBase > 0, `${seededBase}`);
  check('but no plot in the world state counts them', state.plots.every((p) => p.visits === 0));
  check('nor a single plot, nor the world total', (await call('GET', `/plots/${built[0].id}`)).data.visits === 0 && (await call('GET', '/world/stats')).data.totalVisits === 0);
  check('no ad space counts generated views or clicks', (await call('GET', '/ads')).data.slots.every((s) => s.views === 0 && s.clicks === 0));

  // ---- the outside of a building, kept by the server
  const amy = await signup('Amy');
  const bob = await signup('Bob');
  const lot = state.plots.find((p) => !p.owner && api.db.prepare('SELECT claimable FROM plots WHERE id = ?').get(p.id).claimable);
  const biz = { title: 'Amy Tower', buildingType: 'office', website: 'https://amy.test', logo: { kind: 'generated' } };
  check('a building setup that is not an object is refused', (await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, exterior: 'tall' } })).status === 400);
  const before = api.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  const claim = await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: { ...biz, exterior: { floors: 999, palette: 'nope', crown: 'spire', wallColor: '#ABCDEF', model: '../../etc' } } });
  check('a claim keeps the outside, cleaned to the plot\'s limits', claim.status === 200 && claim.data.exterior && claim.data.exterior.floors <= 20 && claim.data.exterior.palette !== 'nope' && claim.data.exterior.wallColor === '#abcdef' && claim.data.exterior.model === null, JSON.stringify(claim.data.exterior));
  check('every player gets it in the world state', JSON.stringify((await call('GET', '/plots/state')).data.plots.find((p) => p.id === lot.id).exterior) === JSON.stringify(claim.data.exterior));
  const patched = await call('PATCH', `/plots/${lot.id}`, { token: amy.token, body: { exterior: { floors: 2, crown: 'none' } } });
  check('the owner changes it later', patched.data.exterior.floors === 2);
  check('nobody else can', (await call('PATCH', `/plots/${lot.id}`, { token: bob.token, body: { exterior: { floors: 9 } } })).status === 403);
  check('a description edit leaves the outside alone', (await call('PATCH', `/plots/${lot.id}`, { token: amy.token, body: { description: 'Offices to let.' } })).data.exterior.floors === 2);

  // ---- owner visits do not count
  await call('POST', '/presence/ping', { token: amy.token, body: { visitor: 'amy-device' } });
  await call('POST', '/presence/ping', { token: bob.token, body: { visitor: 'bob-device' } });
  const own = await call('POST', '/events', { token: amy.token, body: { plotId: lot.id, kind: 'visit', seconds: 30 } });
  const other = await call('POST', '/events', { token: bob.token, body: { plotId: lot.id, kind: 'visit', seconds: 30 } });
  check("the owner's own visit is recorded but not counted; a visitor's is", own.data.verified === false && other.data.verified === true && (await call('GET', `/plots/${lot.id}/stats`)).data.views === 1);

  // ---- the audit trail
  const audit = async (q = '') => (await call('GET', `/admin/audit${q}`, { token: ADMIN })).data;
  check('the audit trail is admin-only', (await call('GET', '/admin/audit')).status === 403 && (await call('GET', '/admin/audit', { token: amy.token })).status === 403);
  const forLot = (await audit(`?target_kind=plot&target_id=${lot.id}`)).entries;
  check('the claim and the edits are recorded, newest first, with who did them', forLot.map((e) => e.action).join() === 'plot.update,plot.update,plot.claim' && forLot.every((e) => e.actor.kind === 'account' && e.actor.name === 'Amy'), forLot.map((e) => e.action).join());
  check('the claim records its facts', forLot.at(-1).detail.title === 'Amy Tower' && forLot.at(-1).detail.value > 0 && forLot.at(-1).detail.leaseDays === 30);
  check('the edit records which fields changed', forLot[0].detail.fields.join() === 'description' && forLot[1].detail.fields.join() === 'exterior');
  const failed = api.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  check('a refused change writes no record', (await call('POST', `/plots/${lot.id}/claim`, { token: bob.token, body: biz })).status === 409 && api.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n === failed && failed > before);
  const prey = built[2];
  await call('POST', `/plots/${prey.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Co' } });
  const slot = (await call('GET', '/ads')).data.slots.find((s) => s.open);
  await call('POST', `/ads/${slot.id}/buy`, { token: bob.token, body: { advertiser: 'Bob Co', headline: 'Hello', url: 'https://bob.test', color: '#112233' } });
  await call('POST', '/reports', { token: amy.token, body: { kind: 'ad', id: slot.id, reason: 'spam' } });
  const rid = (await call('GET', `/admin/reports/ids?kind=ad&id=${slot.id}`, { token: ADMIN })).data.id;
  await call('POST', `/admin/reports/${rid}/resolve`, { token: ADMIN, body: { action: 'ban' } });
  const actions = (await audit()).entries.map((e) => e.action);
  for (const a of ['account.create', 'plot.takeover', 'ad.buy', 'report.create', 'report.resolve']) check(`${a} is recorded`, actions.includes(a));
  const takeover = (await audit('?action=plot.takeover')).entries[0];
  check('a take-over records the price paid and who was paid out', takeover.detail.paidOut > 0 && takeover.detail.previousOwner === prey.owner && takeover.actor.name === 'Bob');
  const resolved = (await audit('?action=report.resolve')).entries[0];
  check('a moderation decision is recorded as the admin\'s, with the outcome', resolved.actor.kind === 'admin' && resolved.detail.action === 'ban' && resolved.detail.banned === true && resolved.target.kind === 'ad');
  check("one account's actions can be listed", (await audit(`?actor=${bob.account.id}`)).entries.every((e) => e.actor.id === bob.account.id));
  check('the chain verifies', (await call('GET', '/admin/audit/verify', { token: ADMIN })).data.ok === true);
  let blocked = 0;
  for (const sql of ["UPDATE audit_log SET detail = '{}' WHERE id = 1", 'DELETE FROM audit_log WHERE id = 1']) {
    try {
      api.db.exec(sql);
    } catch (e) {
      if (/append-only/.test(e.message)) blocked++;
    }
  }
  check('the table refuses edits and deletions', blocked === 2);
  // someone with the database file drops the guard and edits a row: the chain shows where
  api.db.exec('DROP TRIGGER audit_log_no_update');
  api.db.exec("UPDATE audit_log SET detail = '{\"paidOut\":1}' WHERE action = 'plot.takeover'");
  const broken = (await call('GET', '/admin/audit/verify', { token: ADMIN })).data;
  check('an edit made outside the API breaks the chain at that row', broken.ok === false && broken.brokenAt === takeover.id, JSON.stringify(broken));

  // ---- the production settings check
  const good = { ADMIN_TOKEN: 'a'.repeat(40), IP_SALT: 'b'.repeat(40), MP_NOTIFY_SECRET: 'c'.repeat(40), REFERRAL_SECRET: 'd'.repeat(40), API_ORIGIN: 'https://voxel.test', PUBLIC_API_URL: 'https://api.voxel.test', API_DB: '/srv/db.sqlite', TRUST_PROXY: '1', MP_NOTIFY_URL: 'http://127.0.0.1:3001/notify', MAIL_WEBHOOK_URL: 'https://mail.test', SENTRY_DSN: 'https://abc123@o1.ingest.sentry.io/42' };
  check('good production settings pass', checkApiEnv(good).errors.length === 0 && checkApiEnv(good).warnings.length === 0, JSON.stringify(checkApiEnv(good)));
  check('an unreadable SENTRY_DSN stops the start', checkApiEnv({ ...good, SENTRY_DSN: 'https://sentry.io/42' }).errors.some((e) => e.includes('SENTRY_DSN')));
  check('no SENTRY_DSN is only a warning', checkApiEnv({ ...good, SENTRY_DSN: '' }).warnings.some((w) => w.includes('SENTRY_DSN')) && checkApiEnv({ ...good, SENTRY_DSN: '' }).errors.length === 0);
  const bad = checkApiEnv({ ...good, ADMIN_TOKEN: 'CHANGE_ME', IP_SALT: 'short', REFERRAL_SECRET: good.MP_NOTIFY_SECRET, API_ORIGIN: '*', API_DB: ':memory:', HUMAN_MIN_AGE_MS: '0', HUMAN_VISIT_CAP: '1000' }).errors.join(' | ');
  for (const k of ['ADMIN_TOKEN', 'IP_SALT is too short', 'different', 'API_ORIGIN', 'API_DB', 'HUMAN_MIN_AGE_MS', 'HUMAN_VISIT_CAP']) check(`a bad setting is caught: ${k}`, bad.includes(k));
  check('the web settings need the real API and site addresses', checkWebEnv({ NEXT_PUBLIC_LIVE_API_URL: 'https://api.example.com' }).errors.length === 2 && checkWebEnv({ NEXT_PUBLIC_LIVE_API_URL: 'https://api.voxel.test', NEXT_PUBLIC_SITE_URL: 'https://voxel.test', NEXT_PUBLIC_MP_URL: 'wss://play.voxel.test' }).errors.length === 0);
  const refused = spawnSync(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { env: { PATH: process.env.PATH, NODE_ENV: 'production', API_DB: ':memory:', API_PORT: '0' }, encoding: 'utf8', timeout: 20000 });
  check('in production the API refuses to start with unsafe settings', refused.status === 1 && /will not start in production/.test(refused.stderr), `status ${refused.status}`);

  // ---- the deploy check against this API
  const verify = (extra = []) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'verify-live.mjs'), '--api', base, ...extra], { encoding: 'utf8' });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('exit', (code) => resolve({ code, out }));
  });
  api.db.exec("CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;");
  const plain = await verify();
  check('verify:live passes against an authoritative API', plain.code === 0, plain.out.split('\n').filter((l) => l.startsWith('FAIL')).join('; '));
  const withAdmin = await verify(['--admin-token', ADMIN]);
  check('and with the admin token it finds the tampered audit row', withAdmin.code === 1 && /FAIL the audit trail is intact/.test(withAdmin.out));
} catch (e) {
  fails++;
  console.log('FAIL threw', e);
} finally {
  await api.close();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
