// Chat and messages (docs/architecture/chat_messaging_plan.md): signed-in identity on the presence server, nearby chat with answers, blocks,
// reports and bans, the inbox (requests, history, read positions, retries), business inquiries and take-overs, and retention.
// Starts its own API and presence server on free ports. (About 15 seconds.)
//
// This is also the messaging contract (docs/architecture/node_fastapi_architecture_plan.md): with MESSAGING_IMPL=fastapi it starts the Python
// messaging service (services/messaging) as well, the Node API forwards the messaging routes to it, and every check below must pass
// unchanged. tests/messaging-fastapi.test.mjs runs it that way.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { root, sleep, imp } from './helpers.mjs';

const FASTAPI = process.env.MESSAGING_IMPL === 'fastapi';
const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const [apiPort, mpPort, msgPort] = [await free(), await free(), await free()];
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-chat-'));
const common = { ...process.env, MP_NOTIFY_SECRET: 'shh', INTERNAL_SECRET: 'inside', ADMIN_TOKEN: 'admin-secret', MESSAGING_NEW_PER_DAY: '4', MESSAGING_SENDS_PER_MINUTE: '12' };
const mp = spawn(process.execPath, [path.join(root, 'services', 'multiplayer', 'server.mjs')], { cwd: root, env: { ...common, MP_PORT: String(mpPort), MP_LOG_DIR: logDir, MP_API_URL: `http://localhost:${apiPort}`, MP_RECHECK_MS: '700' }, stdio: 'ignore' });
const api = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], {
  cwd: root,
  env: { ...common, API_PORT: String(apiPort), API_DB: ':memory:', MP_NOTIFY_URL: `http://localhost:${mpPort}/notify`, ...(FASTAPI ? { MESSAGING_SERVICE_URL: `http://localhost:${msgPort}` } : {}) },
  stdio: 'ignore',
});
const msgDir = path.join(root, 'services', 'messaging');
const python = [path.join(msgDir, '.venv', 'Scripts', 'python.exe'), path.join(msgDir, '.venv', 'bin', 'python')].find((p) => fs.existsSync(p));
const svc = FASTAPI ? spawn(python, ['-m', 'app'], { cwd: msgDir, env: { ...common, MESSAGING_PORT: String(msgPort), MESSAGING_DB: ':memory:', NODE_API_URL: `http://localhost:${apiPort}`, MP_NOTIFY_URL: `http://localhost:${mpPort}/notify` }, stdio: 'ignore' }) : null;
const base = `http://localhost:${apiPort}`;
const adminBase = FASTAPI ? `http://localhost:${msgPort}` : base; // chat reports live with whoever owns messaging
console.log(`messaging served by ${FASTAPI ? 'the FastAPI service (through the Node API)' : 'the Node API'}`);
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const call = async (method, p, { token, body, headers = {}, at = base } = {}) => {
  const res = await fetch(at + p, { method, headers: { 'Content-Type': 'application/json', ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const signup = async (username) => (await call('POST', '/auth/signup', { body: { username, password: 'longenough1' } })).data;
let seq = 0;
const cid = () => `test-${Date.now().toString(36)}-${++seq}`;

// a game connection: says hello, keeps everything it is sent, and can wait for one kind of message. Every message the presence server
// sends is also held to the protocol's contracts at the end (packages/shared-types, ADR 0004): signed-in identity, auth.revoked and
// inbox.changed are only seen with a real API, which this test has.
const presenceSeen = [];
const connect = (name, room, x) =>
  new Promise((resolve) => {
    const s = new WebSocket(`ws://localhost:${mpPort}`);
    const c = { s, inbox: [], send: (m) => s.send(JSON.stringify(m)) };
    c.wait = async (pred, ms = 3000) => { for (let t = 0; t < ms; t += 50) { const hit = c.inbox.find(pred); if (hit) return hit; await sleep(50); } return null; };
    s.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      c.inbox.push(m);
      presenceSeen.push(m);
    });
    s.on('open', () => { c.send({ type: 'hello', name, room, x, z: 0, appearance: {}, account: 1 }); setTimeout(() => resolve(c), 250); });
  });
const authAs = async (c, who) => {
  const { ticket } = (await call('POST', '/messaging/ticket', { token: who.token })).data;
  c.send({ type: 'auth', ticket });
  return c.wait((m) => m.type === 'auth.ok' || m.type === 'auth.failed');
};
const say = async (c, text, id = cid()) => {
  c.send({ type: 'chat.send', clientMessageId: id, channel: 'nearby', text });
  return c.wait((m) => (m.type === 'chat.accepted' || m.type === 'chat.rejected') && m.clientMessageId === id && !m.seen && (m.seen = true));
};

try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/health')).ok && (await fetch(`http://localhost:${mpPort}/health`)).ok && (!FASTAPI || (await fetch(`${adminBase}/health`)).ok)) break; } catch { /* starting */ } await sleep(250); }
  const [amy, bob, cat, dan, eve] = [await signup('amy'), await signup('bob'), await signup('cat'), await signup('dan'), await signup('eve')];

  // ---- phase 0: who is speaking comes from the API, never from the client
  const A = await connect('amy', 'c1', 0);
  const B = await connect('Bob-the-guest', 'c1', 10);
  const C = await connect('cat', 'c1', 500); // in the city, far away
  const welcome = A.inbox.find((m) => m.type === 'welcome');
  check('the welcome says accounts and chat v2 are on, guest chat off (the API is set up)', welcome?.features?.accounts === true && welcome.features.chat === 2 && welcome.features.guestChat === false, JSON.stringify(welcome?.features));
  check('a guest cannot chat when the API is set up', (await say(B, 'hello?'))?.code === 'unauthenticated');
  check('a ticket needs a sign-in', (await call('POST', '/messaging/ticket')).status === 401);
  B.send({ type: 'auth', ticket: 'f'.repeat(48) });
  check('a made-up ticket is refused', (await B.wait((m) => m.type === 'auth.failed'))?.code === 'unauthenticated');
  check('the internal routes need the shared secret', (await call('POST', '/internal/messaging/redeem', { body: { ticket: 'x' } })).status === 403 && (await call('POST', '/internal/messaging/nearby', { body: {} })).status === 403);
  const okA = await authAs(A, amy);
  check('a real ticket binds the connection to the account', okA?.type === 'auth.ok' && okA.account.id === amy.account.id && okA.account.username === 'amy');
  const { ticket: once } = (await call('POST', '/messaging/ticket', { token: bob.token })).data;
  await sleep(1100); // one sign-in attempt a second per connection
  B.send({ type: 'auth', ticket: once });
  check('bob binds with his ticket', (await B.wait((m) => m.type === 'auth.ok'))?.account.username === 'bob');
  const E = await connect('someone', 'c1', 20);
  await sleep(1100);
  E.send({ type: 'auth', ticket: once });
  check('a ticket works once only', (await E.wait((m) => m.type === 'auth.failed'))?.code === 'unauthenticated');
  const amyId = A.inbox.find((w) => w.type === 'welcome').id;
  const seenAmy = await B.wait((m) => m.type === 'profile' && m.player.id === amyId && m.player.verified && m.player.name === 'amy' && m.player.account === amy.account.id);
  check('other players see amy as a verified account with her account name', Boolean(seenAmy));
  check('what a client says about its own account is ignored', !B.inbox.some((m) => m.type === 'snapshot' && (m.enter ?? []).some((p) => p.name === 'someone' && p.verified)));
  B.send({ type: 'profile', name: 'amy', appearance: {} });
  await sleep(300);
  const bobSeen = [...A.inbox].reverse().find((m) => m.type === 'profile' && m.player.account === bob.account.id);
  check('a signed-in player cannot rename themselves to look like someone else', !bobSeen || bobSeen.player.name === 'bob', JSON.stringify(bobSeen?.player?.name));
  await authAs(C, cat);

  // ---- phase 1: nearby chat
  const first = await say(A, 'Hello neighbours!');
  check('a line is accepted with a server message id', first?.type === 'chat.accepted' && /^n\d+$/.test(first.messageId), JSON.stringify(first));
  const heard = await B.wait((m) => m.type === 'chat' && m.messageId === first?.messageId);
  check('bob (in range) hears it, marked as amy\'s verified account', heard?.text === 'Hello neighbours!' && heard.verified === true && heard.account === amy.account.id && heard.name === 'amy');
  check('cat (far away in the same city) does not', !(await C.wait((m) => m.type === 'chat', 400)));
  check('amy hears her own line once', A.inbox.filter((m) => m.type === 'chat' && m.messageId === first?.messageId).length === 1);
  const repeatId = first ? A.inbox.find((m) => m.type === 'chat.accepted')?.clientMessageId : null;
  A.send({ type: 'chat.send', clientMessageId: repeatId, text: 'Hello neighbours!' });
  await sleep(300);
  check('sending the same message id again repeats the answer and says nothing twice', A.inbox.filter((m) => m.type === 'chat.accepted' && m.clientMessageId === repeatId).length === 2 && B.inbox.filter((m) => m.type === 'chat' && m.text === 'Hello neighbours!').length === 1);
  const fastId = cid();
  const fast = await say(A, 'again', fastId);
  check('a second line within a second is refused, with how long to wait', fast?.code === 'rate_limited' && fast.retryAfterMs > 0, JSON.stringify(fast));
  await sleep(1100);
  check('Retry with the same id works once the wait is over', (await say(A, 'again', fastId))?.type === 'chat.accepted');
  await sleep(1100);
  check('the word filter applies to chat', (await say(A, 'cheap v1agra here'))?.code === 'content_rejected');
  await sleep(1100);
  check('nearby chat carries no links', (await say(A, 'see http://spam.test'))?.code === 'content_rejected');
  await sleep(1100);
  check('an empty line is refused', (await say(A, '   '))?.code === 'empty');
  const D = await connect('dan', 'c2', 0);
  await authAs(D, dan);
  await sleep(1100);
  const inC1 = await say(A, 'only city one');
  check('a line stays in its own city', inC1?.type === 'chat.accepted' && !(await D.wait((m) => m.type === 'chat', 400)));

  // reports on nearby lines: only someone who heard it, evidence from the server's copy
  check('someone who did not hear a line cannot report it', (await call('POST', '/messaging/reports', { token: cat.token, body: { messageId: first.messageId, category: 'spam' } })).status === 404);
  check('you cannot report your own line', (await call('POST', '/messaging/reports', { token: amy.token, body: { messageId: first.messageId } })).status === 409);
  const rep = await call('POST', '/messaging/reports', { token: bob.token, body: { messageId: first.messageId, category: 'spam', text: 'forged' } });
  check('bob can report what he heard', rep.status === 200 && rep.data.reported);
  const queue = (await call('GET', '/admin/reports', { token: 'admin-secret', at: adminBase })).data.reports;
  const qNearby = queue.find((r) => r.kind === 'nearby' && r.id === first.messageId.slice(1));
  check('the moderator sees the line as the server kept it (not what the reporter sent)', qNearby?.text === 'Hello neighbours!' && qNearby.author === 'amy' && qNearby.authorBanned === false && qNearby.where === 'nearby chat, city c1', JSON.stringify(qNearby));

  // blocks, both ways, applied by the server before delivery
  check('blocking needs a real account', (await call('POST', '/messaging/blocks', { token: bob.token, body: { accountId: 99999 } })).status === 404);
  check('bob blocks amy', (await call('POST', '/messaging/blocks', { token: bob.token, body: { accountId: amy.account.id } })).status === 200);
  await sleep(1100);
  const afterBlock = await say(A, 'can you hear me');
  check('amy\'s line is still accepted (she is not told about the block)...', afterBlock?.type === 'chat.accepted');
  check('...but bob does not get it', !(await B.wait((m) => m.type === 'chat' && m.text === 'can you hear me', 500)));
  const bobSays = await say(B, 'hi amy?');
  check('and amy does not get bob\'s lines either', bobSays?.type === 'chat.accepted' && !(await A.wait((m) => m.type === 'chat' && m.text === 'hi amy?', 500)));
  check('the block list shows it, and unblocking works', (await call('GET', '/messaging/settings', { token: bob.token })).data.blocks.some((b) => b.username === 'amy') && (await call('DELETE', `/messaging/blocks/${amy.account.id}`, { token: bob.token })).status === 200);

  // signing out and bans end the binding within the re-check interval
  const DE = await connect('eve', 'c1', 5);
  check('eve binds', (await authAs(DE, eve))?.type === 'auth.ok');
  await call('POST', `/admin/accounts/${eve.account.id}/ban`, { token: 'admin-secret', body: { reason: 'test' } });
  check('a ban ends eve\'s binding within a minute (here: the test\'s short re-check)', Boolean(await DE.wait((m) => m.type === 'auth.revoked', 3000)));
  await sleep(1100);
  check('and she can no longer chat', (await say(DE, 'still here'))?.code === 'unauthenticated');
  await call('POST', '/auth/logout', { token: dan.token });
  check('signing out ends the binding too', Boolean(await D.wait((m) => m.type === 'auth.revoked', 3000)));
  const dan2 = (await call('POST', '/auth/login', { body: { username: 'dan', password: 'longenough1' } })).data;

  // ---- phase 2: the inbox
  const send = (who, conv, text, id = cid()) => call('POST', `/conversations/${conv}/messages`, { token: who.token, body: { text, clientMessageId: id } });
  const start = await call('POST', '/conversations', { token: amy.token, body: { accountId: bob.account.id, text: 'Hi Bob,\nfancy a coffee?', clientMessageId: cid() } });
  const conv = start.data?.conversation?.id;
  check('amy starts a conversation with bob; line breaks are kept', start.status === 200 && conv && start.data.message.text === 'Hi Bob,\nfancy a coffee?', JSON.stringify(start.data).slice(0, 120));
  check('it is in amy\'s inbox and waiting for bob', (await call('GET', '/conversations', { token: amy.token })).data.conversations.some((c) => c.id === conv && c.waiting));
  const bobReq = (await call('GET', '/conversations?box=requests', { token: bob.token })).data;
  check('and in bob\'s Requests, not his inbox', bobReq.conversations.some((c) => c.id === conv && c.other.username === 'amy') && bobReq.requests === 1 && !(await call('GET', '/conversations', { token: bob.token })).data.conversations.length);
  const note = await B.wait((m) => m.type === 'inbox.changed' && m.conversationId === conv);
  check('bob\'s game is nudged at once, with no message text in the nudge', Boolean(note) && note.text === undefined && Object.keys(note).sort().join() === 'conversationId,eventId,type', JSON.stringify(note));
  check('cat\'s game is not', !C.inbox.some((m) => m.type === 'inbox.changed'));
  check('amy cannot send more until bob answers', (await send(amy, conv, 'hello??')).data?.code === 'request_pending');
  check('someone outside the conversation cannot read it (and cannot tell it exists)', (await call('GET', `/conversations/${conv}/messages`, { token: cat.token })).status === 404 && (await call('GET', '/conversations/nope-nope-nope/messages', { token: cat.token })).status === 404 && (await send(cat, conv, 'hi')).status === 404);
  const bobView = (await call('GET', `/conversations/${conv}/messages`, { token: bob.token })).data;
  check('bob can read the request before answering', bobView.messages.length === 1 && bobView.messages[0].sender.username === 'amy' && bobView.messages[0].clientMessageId === undefined);
  const replyId = cid();
  const reply = await send(bob, conv, 'Sure!', replyId);
  check('replying accepts the request', reply.status === 200 && (await call('GET', `/conversations/${conv}`, { token: bob.token })).data.status === 'accepted');
  const again = await send(bob, conv, 'Sure!', replyId);
  check('a retry with the same id gives back the first copy, not a second message', again.status === 200 && again.data.duplicate === true && again.data.message.id === reply.data.message.id);
  check('the same id for different words is refused', (await send(bob, conv, 'Different', replyId)).status === 409);
  for (const t of ['one', 'two', 'three']) await send(amy, conv, t);
  const sumBob = (await call('GET', '/messaging/summary', { token: bob.token })).data;
  check('bob has three unread', sumBob.unread === 3, JSON.stringify(sumBob));
  const page = (await call('GET', `/conversations/${conv}/messages?limit=2`, { token: bob.token })).data;
  check('pages come newest-last, with "more" when there is more', page.messages.map((m) => m.text).join() === 'two,three' && page.more === true);
  const older = (await call('GET', `/conversations/${conv}/messages?limit=2&before=${page.messages[0].id}`, { token: bob.token })).data;
  check('and before= goes further back', older.messages.map((m) => m.text).join() === 'Sure!,one');
  check('before and after together are refused', (await call('GET', `/conversations/${conv}/messages?before=5&after=1`, { token: bob.token })).status === 400);
  const newest = page.messages[1].id;
  const read = (await call('POST', `/conversations/${conv}/read`, { token: bob.token, body: { upTo: newest + 1000 } })).data;
  check('reading up to the newest clears the count (and cannot run past the newest)', read.unread === 0 && read.lastRead === newest);
  check('the read position never moves backwards', (await call('POST', `/conversations/${conv}/read`, { token: bob.token, body: { upTo: 1 } })).data.lastRead === newest);
  check('muting keeps the messages coming', (await call('PATCH', `/conversations/${conv}/preferences`, { token: bob.token, body: { muted: true } })).data.muted === true && (await send(amy, conv, 'four')).status === 200 && (await call('GET', '/messaging/summary', { token: bob.token })).data.unread === 1);

  // offline: bob's game is closed; the message waits for him
  B.s.close();
  await send(amy, conv, 'are you there?');
  check('a message sent while bob is offline is there when he comes back', (await call('GET', `/conversations/${conv}/messages?after=${newest}`, { token: bob.token })).data.messages.some((m) => m.text === 'are you there?'));

  // reports on private messages
  const toReport = (await call('GET', `/conversations/${conv}/messages?limit=1`, { token: bob.token })).data.messages[0];
  check('someone outside the conversation cannot report its messages', (await call('POST', '/messaging/reports', { token: cat.token, body: { messageId: toReport.ref } })).status === 404);
  check('bob reports amy\'s message', (await call('POST', '/messaging/reports', { token: bob.token, body: { messageId: toReport.ref, category: 'offensive' } })).data?.reported === true);
  const rid = (await call('GET', `/admin/reports/ids?kind=message&id=${toReport.id}`, { token: 'admin-secret', at: adminBase })).data.id;
  await call('POST', `/admin/reports/${rid}/resolve`, { token: 'admin-secret', body: { action: 'remove' }, at: adminBase });
  const gone = (await call('GET', `/conversations/${conv}/messages?limit=1`, { token: amy.token })).data.messages[0];
  check('a moderator can take it down: both sides see it removed', gone.state === 'removed' && gone.text === null);

  // declines, blocks and "no requests" all look the same to the sender
  const catStart = await call('POST', '/conversations', { token: cat.token, body: { username: 'amy', text: 'hey amy', clientMessageId: cid() } });
  await call('POST', `/conversations/${catStart.data.conversation.id}/request`, { token: amy.token, body: { action: 'decline' } });
  const afterDecline = await call('POST', '/conversations', { token: cat.token, body: { username: 'amy', text: 'please?', clientMessageId: cid() } });
  await call('POST', '/messaging/blocks', { token: amy.token, body: { username: 'dan' } });
  const blockedStart = await call('POST', '/conversations', { token: dan2.token, body: { username: 'amy', text: 'hello', clientMessageId: cid() } });
  await call('PATCH', '/messaging/settings', { token: bob.token, body: { requests: false } });
  const noRequests = await call('POST', '/conversations', { token: dan2.token, body: { username: 'bob', text: 'hello', clientMessageId: cid() } });
  check('a declined, a blocked and a "no requests" sender all get the same answer', [afterDecline, blockedStart, noRequests].every((r) => r.status === 403 && r.data.code === 'not_allowed' && r.data.error === afterDecline.data.error), [afterDecline, blockedStart, noRequests].map((r) => r.status).join());
  check('a decline is not announced to the sender', !(await call('GET', `/conversations/${catStart.data.conversation.id}`, { token: cat.token })).data.declined);

  // limits: new conversations a day (no confirmed email) and sends a minute
  const fresh = [];
  for (let i = 0; i < 5; i++) fresh.push(await signup(`fresh${i}`));
  const starts = [];
  for (const f of fresh) starts.push((await call('POST', '/conversations', { token: dan2.token, body: { accountId: f.account.id, text: 'hi', clientMessageId: cid() } })).status);
  check('an unconfirmed account can start 4 (here) new conversations a day', starts.join() === '200,200,200,200,429', starts.join());
  const pair = (await call('POST', '/conversations', { token: fresh[0].token, body: { accountId: dan2.account.id, text: 'hi dan', clientMessageId: cid() } })).data.conversation.id;
  let lastStatus = 0;
  for (let i = 0; i < 12; i++) lastStatus = (await send(fresh[0], pair, `msg ${i}`)).status;
  check('sending is limited per minute (here 12), with a wait time', lastStatus === 429, String(lastStatus));

  // ---- phase 3: business inquiries
  const { generateCity } = await imp('city/cityGenerator.js');
  const lot = generateCity(20260101).plots.find((p) => !p.owner && p.districtId !== 'suburb');
  const biz = { title: 'Amy Bakery', buildingType: 'restaurant', website: 'https://amy.test', variant: 'cafe', logo: { kind: 'generated' }, description: 'Bread.' };
  check('amy claims a lot', (await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: biz })).status === 200);
  check('nobody can message an empty lot\'s owner', (await call('POST', `/plots/${generateCity(20260101).plots.filter((p) => !p.owner && p.districtId !== 'suburb')[3].id}/inquiries`, { token: cat.token, body: { text: 'hi', clientMessageId: cid() } })).status === 409);
  check('or their own building', (await call('POST', `/plots/${lot.id}/inquiries`, { token: amy.token, body: { text: 'hi', clientMessageId: cid() } })).status === 400);
  const inq = await call('POST', `/plots/${lot.id}/inquiries`, { token: cat.token, body: { text: 'Do you do gluten-free?', clientMessageId: cid() } });
  const inqId = inq.data?.conversation?.id;
  check('cat asks the owner about the building', inq.status === 200 && inq.data.conversation.kind === 'business_inquiry' && inq.data.conversation.plot.title === 'Amy Bakery');
  const amyReqs = (await call('GET', '/conversations?box=requests', { token: amy.token })).data.conversations;
  check('amy finds it in her Requests, with the building', amyReqs.some((c) => c.id === inqId && c.plot?.id === lot.id && c.plot.youOwnedIt));
  await send(amy, inqId, 'Yes we do!');
  // the building changes hands
  await call('POST', `/admin/plots/${lot.id}/lease`, { token: 'admin-secret', body: { state: 'open' } });
  const price = (await call('GET', `/plots/${lot.id}`)).data.value;
  const take = await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Bakery', expectedPrice: Math.round(price * 1.25 * 100) / 100 } });
  check('bob takes the building over', take.status === 200, JSON.stringify(take.data).slice(0, 80));
  check('the new owner cannot read the old owner\'s inquiries', (await call('GET', `/conversations/${inqId}/messages`, { token: bob.token })).status === 404);
  check('the old owner and the customer still have their conversation', (await call('GET', `/conversations/${inqId}/messages`, { token: amy.token })).status === 200 && (await call('GET', `/conversations/${inqId}/messages`, { token: cat.token })).status === 200);
  const inq2 = await call('POST', `/plots/${lot.id}/inquiries`, { token: cat.token, body: { text: 'New owner: still gluten-free?', clientMessageId: cid() } });
  check('a new inquiry goes to the new owner, in a new conversation', inq2.status === 200 && inq2.data.conversation.id !== inqId && inq2.data.conversation.other.username === 'bob');

  // ---- retention and the notice outbox (in-process, on a fresh database; the Python service has its own: services/messaging/tests)
  if (FASTAPI) throw Object.assign(new Error('done'), { done: true });
  const m = await import(pathToFileURL(path.join(root, 'services', 'api', 'messaging.mjs')).href);
  const { createApi } = await import(pathToFileURL(path.join(root, 'services', 'api', 'server.mjs')).href);
  const local = createApi({ deliverEveryMs: 0, env: {} });
  const db = local.db;
  const x = db.prepare("INSERT INTO accounts (username, pass_salt, pass_hash, created_at) VALUES ('x','s','h',0)").run().lastInsertRowid;
  const y = db.prepare("INSERT INTO accounts (username, pass_salt, pass_hash, created_at) VALUES ('y','s','h',0)").run().lastInsertRowid;
  const old = Date.now() - 100 * 86400000;
  const week = Date.now() - 10 * 86400000; // past the 7 days nearby lines are kept
  const n1 = db.prepare("INSERT INTO nearby_messages (sender, room, body, recipients, at) VALUES (?, 'r', 'old line', ?, ?)").run(x, JSON.stringify([Number(y)]), week).lastInsertRowid;
  const n2 = db.prepare("INSERT INTO nearby_messages (sender, room, body, recipients, at) VALUES (?, 'r', 'reported line', ?, ?)").run(x, JSON.stringify([Number(y)]), week).lastInsertRowid;
  db.prepare("INSERT INTO reports (kind, target_id, reporter, reason, created_at) VALUES ('nearby', ?, ?, 'spam', ?)").run(String(n2), y, old);
  db.prepare("INSERT INTO conversations (id, kind, created_by, created_at, last_at) VALUES ('conv-old', 'direct', ?, ?, ?)").run(x, old, old);
  db.prepare("INSERT INTO messages (conversation_id, sender, client_id, body, at) VALUES ('conv-old', ?, 'old-message', 'ancient', ?)").run(x, old);
  const pruned = m.prune(db, m.settingsFrom({}));
  check('retention wipes old nearby lines and inbox messages, but keeps one under an open report', pruned.nearby === 1 && pruned.inbox === 1 && db.prepare('SELECT body FROM nearby_messages WHERE id = ?').get(n1).body === null && db.prepare('SELECT body FROM nearby_messages WHERE id = ?').get(n2).body === 'reported line');
  db.prepare("INSERT INTO messaging_outbox (account_id, event, next_at, created_at) VALUES (?, '{\"type\":\"inbox.changed\",\"conversationId\":\"c\"}', 0, 0)").run(x);
  await m.deliverNotices(db, { MP_NOTIFY_URL: 'http://127.0.0.1:9/notify', MP_NOTIFY_SECRET: 'shh' });
  const row = db.prepare('SELECT status, attempts, next_at FROM messaging_outbox').get();
  check('a notice the presence server could not take is kept and retried later', row.status === 'pending' && row.attempts === 1 && row.next_at > Date.now());
  await local.close();
} catch (e) {
  if (!e.done) throw e;
} finally {
  mp.kill();
  api.kill();
  svc?.kill();
  await sleep(300);
  fs.rmSync(logDir, { recursive: true, force: true });
}
{
  const { check: fits, presenceContract } = await import('@voxelventure/shared-types');
  const misfits = presenceSeen.map((m) => ({ m, c: presenceContract('server', m) })).filter(({ m, c }) => !c || !fits(c, m).ok);
  const kinds = new Set(presenceSeen.map((m) => m.type));
  check(`every one of the ${presenceSeen.length} presence messages fits the protocol's contracts (with signed-in players)`, misfits.length === 0 && ['auth.ok', 'auth.revoked', 'inbox.changed'].every((t) => kinds.has(t)), misfits.slice(0, 3).map(({ m, c }) => `${m.type}: ${c ? fits(c, m).errors.join('; ') : 'not in the protocol'}`).join(' | ') || [...kinds].join(','));
}
if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('ALL OK');
process.exit(0);
