// Presence and analytics: the rules with a controlled clock (stats-unit.mjs), then the HTTP endpoints against a real server.
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { root, sleep } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const unit = execFileSync(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'tests', 'stats-unit.mjs')], { cwd: root, encoding: 'utf8' });
for (const line of unit.split('\n').filter((l) => l.startsWith('{'))) {
  const r = JSON.parse(line);
  check(r.name, r.ok, r.extra);
}

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const port = await free();
const proc = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'server', 'api', 'server.mjs')], { cwd: root, env: { ...process.env, API_PORT: String(port), API_DB: ':memory:', ADMIN_TOKEN: 'admin-secret', HUMAN_MIN_AGE_MS: '0', HUMAN_VISIT_CAP: '1000', HUMAN_CLICK_CAP: '1000' }, stdio: 'ignore' });
const base = `http://localhost:${port}`;
const call = async (method, p, { body, headers = {} } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 test', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { /* starting */ } await sleep(250); }
  const empty = (await call('GET', '/stats/overview')).data;
  check('a new database has nobody online and nothing recorded', empty.online === 0 && empty.arrivals.length === 0 && empty.activity.every((a) => a.total === 0));
  check('a ping from a browser counts', (await call('POST', '/presence/ping', { body: { visitor: 'browser-one' }, headers: { 'CF-IPCountry': 'NL' } })).data.ok === true);
  await call('POST', '/presence/ping', { body: { visitor: 'browser-two' }, headers: { 'CF-IPCountry': 'US' } });
  await call('POST', '/presence/ping', { body: { visitor: 'browser-two' }, headers: { 'CF-IPCountry': 'US' } });
  check('a bot is not counted', (await call('POST', '/presence/ping', { body: { visitor: 'crawler-1' }, headers: { 'User-Agent': 'SomeBot/1.0' } })).data.ok === false);
  const o = (await call('GET', '/stats/overview')).data;
  check('the overview shows who is online and the latest arrivals', o.online === 2 && o.arrivals.length === 2 && o.arrivals[0].country === 'United States' && o.arrivals[1].code === 'NL' && o.windowSeconds === 35, JSON.stringify(o));
  check('the city visits are counted per arrival, not per ping', o.activity.find((a) => a.label === 'City visits').total === 2);
  // a built plot to visit: the first one with an owner
  const plots = (await call('GET', '/plots?limit=1')).data;
  const plotId = plots.entries[0].plot.id;
  check('building views and clicks are recorded as events', (await call('POST', '/events', { body: { plotId, kind: 'visit', visitor: 'browser-one' } })).status === 200 && (await call('POST', '/events', { body: { plotId, kind: 'click', visitor: 'browser-one' } })).status === 200);
  const after = (await call('GET', '/stats/overview')).data;
  const bv = after.activity.find((a) => a.label === 'Building views');
  const wc = after.activity.find((a) => a.label === 'Website clicks');
  check('...and show up for today (the last 7 days) and in the total, not yesterday', bv.total === 1 && bv.last7 === 1 && bv.yesterday === 0 && wc.total === 1 && wc.last7 === 1, JSON.stringify(after.activity));
} finally {
  proc.kill();
}
console.log(fails ? `${fails} failed` : 'ALL OK');
process.exit(fails ? 1 : 0);
