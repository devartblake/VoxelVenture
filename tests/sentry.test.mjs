// Error reporting (lib/net/sentry.mjs, deploy/MONITORING.md): the envelope Sentry expects, nothing sent without a DSN, repeats and floods
// held back, and the presence server passing on players' app errors (but not their names, networks or extension noise) to a stand-in Sentry.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createReporter, parseDsn, stackFrames } from '../lib/net/sentry.mjs';
import { root, sleep } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// ---- the DSN
const dsn = parseDsn('https://abc123@o9.ingest.sentry.io/4507');
check('a DSN gives the envelope address and the key', dsn?.url === 'https://o9.ingest.sentry.io/api/4507/envelope/' && dsn.key === 'abc123', JSON.stringify(dsn));
check('anything else is not a DSN', [undefined, '', 'nonsense', 'https://o9.ingest.sentry.io/4507', 'https://abc@o9.ingest.sentry.io/x'].every((d) => parseDsn(d) === null));

// ---- the stack
const frames = stackFrames('Error: boom\n    at inner (/srv/voxelventure/services/api/core.mjs:10:5)\n    at async route (file:///srv/voxelventure/services/api/server.mjs:300:12)\n    at node:internal/process/task_queues:95:5');
check('a stack becomes frames, oldest call first', frames.length === 3 && frames[2].function === 'inner' && frames[2].lineno === 10 && frames[1].filename === '/srv/voxelventure/services/api/server.mjs', JSON.stringify(frames));
check('Node\'s own frames are not marked as the app\'s', frames[0].in_app === false && frames[2].in_app === true);

// ---- the reporter
check('without a DSN nothing is sent', createReporter({ service: 'api' }).enabled === false && (await createReporter({ service: 'api' }).capture(new Error('x'))) === false);
const posts = [];
const fakeFetch = async (url, init) => { posts.push({ url, init }); return { ok: true, status: 200 }; };
const reporter = createReporter({ dsn: 'https://abc123@o9.ingest.sentry.io/4507', service: 'api', environment: 'staging', release: 'r42', fetchImpl: fakeFetch, maxPerMinute: 5 });
const sent = await reporter.capture(new TypeError('cannot read x'), { tags: { route: 'POST /claim' } });
const [head, item, body] = String(posts[0]?.init.body ?? '').split('\n').map((l) => JSON.parse(l || 'null'));
check('an error is posted to the envelope address, signed with the key', sent === true && posts[0].url === dsn.url && /sentry_key=abc123/.test(posts[0].init.headers['X-Sentry-Auth']));
check('the envelope is a header, an item header and the event', head.event_id === body.event_id && /^[0-9a-f]{32}$/.test(body.event_id) && item.type === 'event');
check('the event carries the error, the service, the environment, the release and the tags', body.exception.values[0].type === 'TypeError' && body.exception.values[0].value === 'cannot read x' && body.tags.service === 'api' && body.tags.route === 'POST /claim' && body.environment === 'staging' && body.release === 'r42' && body.exception.values[0].stacktrace.frames.length > 0, JSON.stringify(body));
check('no user, address or server name goes with it', !('user' in body) && !('server_name' in body) && !('request' in body));
await reporter.capture(new TypeError('cannot read x'));
check('the same error again within a minute is not sent again', posts.length === 1);
for (let i = 0; i < 10; i++) await reporter.capture(new Error(`different ${i}`));
check('past the limit a minute, the rest are dropped', posts.length === 5, `${posts.length} posts`);
const broken = createReporter({ dsn: 'https://k@sentry.test/1', service: 'api', fetchImpl: async () => { throw new Error('offline'); } });
check('Sentry being unreachable never throws', (await broken.capture(new Error('x'))) === false);

// ---- the presence server passes players' app errors on
const events = [];
const fake = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    events.push({ url: req.url, event: JSON.parse(b.split('\n')[2]) });
    res.end('{}');
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const PORT = 4591 + Math.floor(Math.random() * 400);
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-sentry-log-'));
const server = spawn(process.execPath, ['services/multiplayer/server.mjs'], { cwd: root, env: { ...process.env, MP_PORT: String(PORT), MP_LOG_DIR: logDir, SENTRY_DSN: `http://key1@127.0.0.1:${fake.address().port}/7`, SENTRY_ENVIRONMENT: 'test' }, stdio: 'ignore' });
await sleep(1200);
const ws = new WebSocket(`ws://localhost:${PORT}`);
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ type: 'hello', name: 'Secret Name', room: '2026', x: 0, z: 0, appearance: {}, device: {} }));
await sleep(150);
ws.send(JSON.stringify({ type: 'error', kind: 'error', message: 'Cannot read properties of undefined', stack: 'TypeError: x\n    at draw (https://voxelventure.app/_next/static/chunks/app.js:1:200)', url: '/b/bakery' }));
ws.send(JSON.stringify({ type: 'error', kind: 'injected', message: 'window.ethereum is not defined', url: '/' }));
ws.send(JSON.stringify({ type: 'error', kind: 'console.error', message: 'a console line', url: '/' }));
await sleep(600);
ws.close();
server.kill();
fake.close();
fs.rmSync(logDir, { recursive: true, force: true });
check('a player\'s app error reaches Sentry, tagged as the browser\'s', events.length === 1 && events[0].url === '/api/7/envelope/' && events[0].event.tags.service === 'web-client' && events[0].event.tags.page === '/b/bakery' && events[0].event.platform === 'javascript', JSON.stringify(events.map((e) => e.event.tags)));
check('extension noise and console lines stay out', events.every((e) => e.event.tags.kind === 'error'));
check('the player\'s name is not in it', !JSON.stringify(events).includes('Secret Name'));

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
