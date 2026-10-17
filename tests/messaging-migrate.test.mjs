// Moving messaging from the Node API to the Python service (docs/architecture/node_fastapi_architecture_plan.md, step 4, rehearsed): messages,
// requests, read positions, blocks, settings and reports are made on the Node API, what every player sees is recorded through the
// public routes, the data is copied with services/messaging/app/migrate_from_node.py, and the same routes, now served by the
// Python service, must show exactly the same. Then new messages carry on from the old ids. Skipped without the service's Python.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { root, sleep } from './helpers.mjs';

const dir = path.join(root, 'services', 'messaging');
const python = [path.join(dir, '.venv', 'Scripts', 'python.exe'), path.join(dir, '.venv', 'bin', 'python')].find((p) => fs.existsSync(p));
if (!python) {
  console.log('SKIP: no services/messaging/.venv (see services/messaging/README.md)');
  process.exit(0);
}
const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-migrate-'));
const nodeDb = path.join(tmp, 'voxelventure.db');
const msgDb = path.join(tmp, 'messaging.db');
const common = { ...process.env, MP_NOTIFY_SECRET: 'shh', INTERNAL_SECRET: 'inside', ADMIN_TOKEN: 'admin-secret' };
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const children = [];
const startApi = async (port, extra = {}) => {
  const p = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'server', 'api', 'server.mjs')], { cwd: root, env: { ...common, API_PORT: String(port), API_DB: nodeDb, ...extra }, stdio: 'ignore' });
  children.push(p);
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/health`)).ok) break; } catch { /* starting */ } await sleep(250); }
  return p;
};
const stop = (p) => new Promise((resolve) => { p.once('exit', resolve); p.kill(); });
let seq = 0;
const cid = () => `mig-${Date.now().toString(36)}-${++seq}`;

try {
  let port = await free();
  let base = `http://localhost:${port}`;
  const call = async (method, p, { token, body, at } = {}) => {
    const res = await fetch((at ?? base) + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(p.startsWith('/internal/') ? { 'X-Internal-Secret': 'shh' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  let api = await startApi(port);
  const signup = async (username) => (await call('POST', '/auth/signup', { body: { username, password: 'longenough1' } })).data;
  const users = { amy: await signup('amy'), bob: await signup('bob'), cat: await signup('cat'), dan: await signup('dan') };

  // ---- a history on the Node API
  const ab = (await call('POST', '/conversations', { token: users.amy.token, body: { username: 'bob', text: 'Hi Bob!', clientMessageId: cid() } })).data.conversation.id;
  await call('POST', `/conversations/${ab}/messages`, { token: users.bob.token, body: { text: 'Hello Amy,\nhow are you?', clientMessageId: cid() } });
  for (const t of ['one', 'two', 'three']) await call('POST', `/conversations/${ab}/messages`, { token: users.amy.token, body: { text: t, clientMessageId: cid() } });
  const page = (await call('GET', `/conversations/${ab}/messages?limit=2`, { token: users.bob.token })).data.messages;
  await call('POST', `/conversations/${ab}/read`, { token: users.bob.token, body: { upTo: page[0].id } }); // bob has read up to "two"
  await call('PATCH', `/conversations/${ab}/preferences`, { token: users.bob.token, body: { muted: true } });
  await call('POST', '/conversations', { token: users.cat.token, body: { username: 'amy', text: 'Can I ask you something?', clientMessageId: cid() } }); // a request amy has not answered
  const lastClientId = cid();
  const dc = (await call('POST', '/conversations', { token: users.dan.token, body: { username: 'cat', text: 'Hey cat', clientMessageId: lastClientId } })).data.conversation.id;
  await call('POST', `/conversations/${dc}/request`, { token: users.cat.token, body: { action: 'decline' } });
  await call('POST', '/messaging/blocks', { token: users.amy.token, body: { username: 'dan' } });
  await call('PATCH', '/messaging/settings', { token: users.bob.token, body: { requests: false } });
  const toReport = (await call('GET', `/conversations/${ab}/messages?limit=1`, { token: users.bob.token })).data.messages[0];
  await call('POST', '/messaging/reports', { token: users.bob.token, body: { messageId: toReport.ref, category: 'spam' } });
  // a nearby line, through the presence server's own routes (a ticket, then a line)
  const { ticket } = (await call('POST', '/messaging/ticket', { token: users.amy.token })).data;
  const { binding } = (await call('POST', '/internal/messaging/redeem', { body: { ticket } })).data;
  const line = (await call('POST', '/internal/messaging/nearby', { body: { binding, room: 'c1', text: 'hello all', recipients: [users.bob.account.id] } })).data;
  await call('POST', '/messaging/reports', { token: users.bob.token, body: { messageId: line.messageId, category: 'offensive' } });

  // what every player sees, through the public routes
  const snapshot = async () => {
    const out = {};
    for (const [name, u] of Object.entries(users)) {
      const view = { summary: (await call('GET', '/messaging/summary', { token: u.token })).data, settings: (await call('GET', '/messaging/settings', { token: u.token })).data, boxes: {} };
      for (const box of ['inbox', 'requests']) {
        const list = (await call('GET', `/conversations?box=${box}`, { token: u.token })).data;
        view.boxes[box] = list;
        for (const c of list.conversations) view[c.id] = (await call('GET', `/conversations/${c.id}/messages`, { token: u.token })).data;
      }
      out[name] = view;
    }
    return out;
  };
  const before = await snapshot();
  check('the history is there on the Node API', before.bob.boxes.inbox.conversations.length === 1 && before.amy.boxes.requests.conversations.length === 1 && before.bob.summary.unread === 1, JSON.stringify(before.bob.summary));

  // ---- move: pause messaging writes (MESSAGING_READONLY=1), copy, check
  await stop(api);
  api = await startApi(port, { MESSAGING_READONLY: '1' });
  const paused = await call('POST', `/conversations/${ab}/messages`, { token: users.amy.token, body: { text: 'during the pause', clientMessageId: cid() } });
  const pausedRead = await call('POST', `/conversations/${ab}/read`, { token: users.bob.token, body: { upTo: 999 } });
  check('during the pause, messages can be read but nothing is written (not even a read position)', paused.status === 503 && pausedRead.status === 503 && (await call('GET', '/messaging/summary', { token: users.bob.token })).data.unread === 1, `${paused.status} ${pausedRead.status}`);
  check('...while the rest of the game carries on', (await call('GET', '/plots?limit=1')).status === 200 && (await call('POST', '/messaging/ticket', { token: users.amy.token })).status === 200);
  await stop(api);
  const run = spawnSync(python, ['-m', 'app.migrate_from_node', '--node-db', nodeDb, '--messaging-db', msgDb], { cwd: dir, encoding: 'utf8' });
  const result = (() => { try { return JSON.parse(run.stdout); } catch { return null; } })();
  check('the copy reconciles with the source (counts, ids, read positions)', run.status === 0 && result?.problems?.length === 0, run.stderr.slice(0, 300) || JSON.stringify(result?.problems));
  check('it copied the conversations, messages, blocks, settings, reports and the nearby line', result && result.copied.conversations === 3 && result.copied.messages === 7 && result.copied.account_blocks === 1 && result.copied.messaging_settings === 1 && result.copied.messaging_reports === 2 && result.copied.nearby_messages === 1, JSON.stringify(result?.copied));
  const again = spawnSync(python, ['-m', 'app.migrate_from_node', '--node-db', nodeDb, '--messaging-db', msgDb], { cwd: dir, encoding: 'utf8' });
  check('running it again is refused (no second set of messages)', again.status !== 0 && /refusing/.test(again.stderr));

  // ---- switch: the Node API forwards messaging to the service, which owns the copied data
  const msgPort = await free();
  const svc = spawn(python, ['-m', 'app'], { cwd: dir, env: { ...common, MESSAGING_PORT: String(msgPort), MESSAGING_DB: msgDb, NODE_API_URL: `http://localhost:${port}` }, stdio: 'ignore' });
  children.push(svc);
  api = await startApi(port, { MESSAGING_SERVICE_URL: `http://localhost:${msgPort}` });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${msgPort}/health`)).ok) break; } catch { /* starting */ } await sleep(250); }
  const after = await snapshot();
  const diff = Object.keys(before).filter((n) => JSON.stringify(before[n]) !== JSON.stringify(after[n]));
  check('every player sees exactly the same through the service (lists, unread, requests, pages, settings, blocks)', diff.length === 0, diff.map((n) => `${n}: ${JSON.stringify(before[n]).slice(0, 200)} vs ${JSON.stringify(after[n]).slice(0, 200)}`).join(' | '));
  const retry = await call('POST', '/conversations', { token: users.dan.token, body: { username: 'cat', text: 'Hey cat', clientMessageId: lastClientId } });
  check('a retry of a message sent before the move still finds the first copy', retry.status === 200 && retry.data.duplicate === true, JSON.stringify(retry.data).slice(0, 120));
  const fresh = await call('POST', `/conversations/${ab}/messages`, { token: users.bob.token, body: { text: 'After the move', clientMessageId: cid() } });
  const maxBefore = Math.max(...before.bob[ab].messages.map((x) => x.id));
  check('new messages carry on after the old ids, in the same conversation', fresh.status === 200 && fresh.data.message.id > maxBefore, JSON.stringify(fresh.data).slice(0, 120));
  const queue = (await call('GET', '/admin/reports', { token: 'admin-secret', at: `http://localhost:${msgPort}` })).data.reports;
  check('the open reports moved with their evidence', queue.length === 2 && queue.some((q) => q.kind === 'nearby' && q.text === 'hello all') && queue.some((q) => q.kind === 'message' && q.author === 'amy'), JSON.stringify(queue).slice(0, 200));
  check('tickets stay with the Node API and still work', (await call('POST', '/messaging/ticket', { token: users.cat.token })).status === 200);
} catch (e) {
  fails++;
  console.log('FAIL the migration test crashed:', e.stack);
} finally {
  for (const c of children) c.kill();
  await sleep(500);
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
