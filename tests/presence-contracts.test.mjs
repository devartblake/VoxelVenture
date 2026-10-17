// The presence protocol's contracts (packages/shared-types/src/contracts/multiplayer-*-v2.js; docs/architecture/adr/0004-presence-protocol-contracts.md):
// the golden examples fit them (and the broken ones do not); a real presence server's every message fits them; the server checks hello and auth
// strictly and answers another protocol version; and the browser client (lib/net/multiplayer.js) sends and handles exactly the protocol's types.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { root, sleep } from './helpers.mjs';
import { PRESENCE_CLIENT, PRESENCE_PROTOCOL, PRESENCE_SERVER, check as fits, presenceContract, validate } from '@voxelventure/shared-types';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const golden = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'presence-v2.json'), 'utf8'));

// ---- the validator's tuple and either-or shapes
const tuple = { type: 'array', minItems: 2, maxItems: 2, prefixItems: [{ type: 'integer' }, { anyOf: [{ type: 'string' }, { type: 'integer', enum: [0] }] }] };
check('a fixed-position array checks each position', validate(tuple, [1, 'a']).length === 0 && validate(tuple, [1, 0]).length === 0 && validate(tuple, [1, 5]).length === 1 && validate(tuple, ['x', 'a']).length === 1);
check('anyOf takes the first shape that fits, and says so when none does', validate({ anyOf: [{ type: 'string' }, { type: 'null' }] }, null).length === 0 && /fits none of 2/.test(validate({ anyOf: [{ type: 'string' }, { type: 'null' }] }, 3)[0]));

// ---- the contracts and the golden examples
check('the protocol is version 2', PRESENCE_PROTOCOL === 2);
for (const [from, all] of [['client', PRESENCE_CLIENT], ['server', PRESENCE_SERVER]]) {
  for (const [type, contract] of Object.entries(all)) {
    const examples = golden[from][type] ?? [];
    const bad = examples.map((m) => fits(contract, m)).filter((r) => !r.ok);
    check(`${from} ${type}: has golden examples and they fit`, examples.length > 0 && bad.length === 0, bad.map((r) => r.errors.join('; ')).join(' | '));
  }
  check(`${from}: every golden example is a protocol message`, Object.keys(golden[from]).every((t) => all[t]), Object.keys(golden[from]).filter((t) => !all[t]).join(', '));
  for (const m of golden.invalid[from]) check(`${from}: a broken ${m.type} does not fit`, !fits(presenceContract(from, m), m).ok, JSON.stringify(m));
}
check('a field the protocol does not know is allowed (an older server must not refuse a newer client)', fits(PRESENCE_CLIENT.hello, { ...golden.client.hello[0], something: 'new' }).ok);
check('only hello and the sign-in messages are held strictly by the server', Object.values(PRESENCE_CLIENT).filter((c) => c.strict).map((c) => c.id).sort().join() === 'presence.client.auth,presence.client.auth.clear,presence.client.hello');

// ---- the browser client speaks exactly the protocol (by the types it sends and the types it handles)
const clientSrc = fs.readFileSync(path.join(root, 'lib', 'net', 'multiplayer.js'), 'utf8');
const sent = new Set([...clientSrc.matchAll(/send\(\{ type: '([\w.]+)'/g)].map((m) => m[1]).concat([...clientSrc.matchAll(/\{ type: '(error)'/g)].map((m) => m[1])));
const handled = new Set([...clientSrc.matchAll(/m\.type === '([\w.]+)'/g)].map((m) => m[1]));
check('every message the client sends is in the protocol, and every one in the protocol is sent', [...sent].sort().join() === Object.keys(PRESENCE_CLIENT).sort().join(), [...sent].sort().join());
check('the client handles every message the server can send', Object.keys(PRESENCE_SERVER).every((t) => handled.has(t)), Object.keys(PRESENCE_SERVER).filter((t) => !handled.has(t)).join(', '));
const serverSrc = fs.readFileSync(path.join(root, 'services', 'multiplayer', 'server.mjs'), 'utf8');
// the types the server writes: as objects ({ type: 'welcome', ... }) and as the pre-built snapshot string ('{"type":"snapshot", ...')
const serverSends = new Set([...serverSrc.matchAll(/type: '([\w.]+)'/g), ...serverSrc.matchAll(/"type":"([\w.]+)"/g)].map((m) => m[1]));
check('every message type the server writes is in the protocol, and it writes them all', [...serverSends].sort().join() === Object.keys(PRESENCE_SERVER).sort().join(), [...serverSends].sort().join());

// ---- a real presence server: every message it sends fits its contract
const PORT = 3600 + Math.floor(Math.random() * 300);
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-presence-contracts-'));
const SECRET = 'contract-notify';
const proc = spawn(process.execPath, [path.join(root, 'services', 'multiplayer', 'server.mjs')], { cwd: root, env: { ...process.env, MP_PORT: String(PORT), MP_LOG_DIR: logDir, MP_NOTIFY_SECRET: SECRET, MP_API_URL: '' }, stdio: 'ignore' });
const all = []; // every message any test client was sent
const connect = (hello) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const c = { ws, inbox: [], closed: null };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      c.inbox.push(m);
      all.push(m);
    });
    ws.on('close', (code) => (c.closed = code));
    ws.on('open', () => {
      if (hello) ws.send(JSON.stringify(hello));
      setTimeout(() => resolve(c), 250);
    });
    ws.on('error', () => resolve(c));
  });
const sendTo = (c, m) => c.ws.send(JSON.stringify(m));
const got = (c, type) => c.inbox.filter((m) => m.type === type);
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* starting */ }
    await sleep(150);
  }
  const amy = await connect({ ...golden.client.hello[0], name: 'Amy', room: 'contract-city', x: 0, z: 0 });
  const bob = await connect({ ...golden.client.hello[1], name: 'Bob', room: 'contract-city', x: 2, z: 1 }); // no `v`: an older game
  check('a hello in protocol 2 is welcomed', got(amy, 'welcome').length === 1 && got(amy, 'welcome')[0].protocol === PRESENCE_PROTOCOL);
  check('a hello without a version is welcomed too (taken to be this protocol)', got(bob, 'welcome').length === 1);
  await sleep(400);
  sendTo(amy, { type: 'state', x: 1, z: 1, yaw: 0.5, moving: true, emote: 'wave', veh: { kind: 'car', boatKind: null, color: '#ef4444' } });
  sendTo(amy, golden.client.parked[0]);
  sendTo(amy, golden.client.profile[0]);
  sendTo(amy, golden.client.perf[0]);
  sendTo(amy, golden.client.error[0]);
  sendTo(amy, golden.client['chat.send'][0]);
  await sleep(300);
  sendTo(amy, { ...golden.client['chat.send'][0], clientMessageId: 'c_0002-abcd' }); // within a second: refused
  sendTo(amy, golden.client['chat.send'][0]); // the same id again: the same answer
  sendTo(bob, { type: 'auth', ticket: 't_123456' }); // no accounts here: unavailable
  sendTo(bob, { type: 'auth' }); // no ticket: refused without asking anyone
  await fetch(`http://localhost:${PORT}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notify-Secret': SECRET }, body: JSON.stringify({ kind: 'plots', ids: [12, 13] }) });
  await sleep(800);
  sendTo(amy, { type: 'state', x: 500, z: 500, yaw: 0, moving: false, emote: null, veh: null }); // walks out of Bob's view
  await sleep(1200);

  const kinds = [...new Set(all.map((m) => m.type))].sort();
  const misfits = all.map((m) => ({ m, contract: presenceContract('server', m) })).map(({ m, contract }) => ({ m, r: contract ? fits(contract, m) : { ok: false, errors: ['not a protocol message'] } })).filter((x) => !x.r.ok);
  check('the server sent the messages this run expects', ['auth.failed', 'chat', 'chat.accepted', 'chat.rejected', 'online', 'parked', 'profile', 'snapshot', 'welcome', 'world'].every((t) => kinds.includes(t)), kinds.join(', '));
  check(`every one of the ${all.length} messages the server sent fits its contract`, misfits.length === 0, misfits.slice(0, 3).map((x) => `${x.m.type}: ${x.r.errors.join('; ')} in ${JSON.stringify(x.m).slice(0, 200)}`).join(' | '));
  check('a snapshot has who came into view, what moved and who left', all.some((m) => m.type === 'snapshot' && m.enter) && all.some((m) => m.type === 'snapshot' && m.players.length) && all.some((m) => m.type === 'snapshot' && m.exit));
  check('a sign-in without a ticket is refused as a bad request; one with a ticket, as unavailable here', got(bob, 'auth.failed').some((m) => m.code === 'bad_request') && got(bob, 'auth.failed').some((m) => m.code === 'unavailable'));
  check('a repeated line id gets the same answer', got(amy, 'chat.accepted').length === 2 && got(amy, 'chat.accepted')[0].messageId === got(amy, 'chat.accepted')[1].messageId);

  // the strict hello, and another protocol version
  const wrong = await connect({ type: 'hello', room: 20260101 });
  check('a hello that does not fit its contract is answered invalid, and not welcomed', got(wrong, 'invalid').length === 1 && got(wrong, 'invalid')[0].of === 'hello' && /\$\.room/.test(got(wrong, 'invalid')[0].errors[0]) && got(wrong, 'welcome').length === 0);
  sendTo(wrong, { type: 'hello', room: 'contract-city', name: 'Fixed' });
  await sleep(300);
  check('the same connection can then say hello properly', got(wrong, 'welcome').length === 1);
  const future = await connect({ type: 'hello', v: 3, room: 'contract-city' });
  await sleep(300);
  check('a hello in another protocol is told which one this server speaks, and closed (4002)', got(future, 'protocol.unsupported').length === 1 && got(future, 'protocol.unsupported')[0].supported.includes(2) && future.closed === 4002 && got(future, 'welcome').length === 0, `closed ${future.closed}`);
  check('those answers fit their contracts too', [...got(wrong, 'invalid'), ...got(future, 'protocol.unsupported')].every((m) => fits(presenceContract('server', m), m).ok));
  for (const c of [amy, bob, wrong]) c.ws.close();
} catch (err) {
  fails++;
  console.log('FAIL', err.stack);
} finally {
  proc.kill();
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall presence contract checks passed');
process.exit(fails ? 1 : 0);
