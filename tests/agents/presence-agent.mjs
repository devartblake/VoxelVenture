// A player on the presence server in a journey (tests/agents/scenario.mjs): speaks protocol 2 as the game does, keeps everything it is sent,
// and holds every message to the protocol's contracts (packages/shared-types, ADR 0004): a misfit is recorded, and the journey checks there
// are none. It can also misbehave on purpose: drop its connection, stop reading (a slow receiver), send malformed or stale messages.
import WebSocket from 'ws';
import { check as fits, presenceContract } from '@voxelventure/shared-types';
import { sleep } from '../helpers.mjs';
import { EnvironmentFailure, ProductFailure } from './scenario.mjs';

export const misfits = []; // every message any agent was sent that does not fit its contract

// connect(j, name, hello): opens a connection and (unless hello is null) says hello; resolves once it is open.
export function presenceAgent(j, name, hello) {
  if (!j.stack.mpUrl) throw new EnvironmentFailure('this run has no presence server (JOURNEY_MP_URL)');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(j.stack.mpUrl);
    const a = { name, ws, inbox: [], closed: null };
    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        misfits.push({ agent: name, raw: raw.toString().slice(0, 200), errors: ['not JSON'] });
        return;
      }
      a.inbox.push(m);
      const contract = presenceContract('server', m);
      const r = contract ? fits(contract, m) : { ok: false, errors: [`"${m.type}" is not in the protocol`] };
      if (!r.ok) misfits.push({ agent: name, type: m.type, errors: r.errors });
    });
    ws.on('close', (code) => (a.closed = code));
    ws.on('error', (err) => reject(new EnvironmentFailure(`could not connect to the presence server: ${err.message}`)));
    a.send = (m) => ws.readyState === 1 && ws.send(typeof m === 'string' ? m : JSON.stringify(m));
    // the first message (after `since`) that matches; null after `ms`
    a.waitFor = async (pred, ms = 5000, since = 0) => {
      const test = typeof pred === 'string' ? (m) => m.type === pred : pred;
      for (let t = 0; t <= ms; t += 50) {
        const hit = a.inbox.slice(since).find(test);
        if (hit) return hit;
        await sleep(50);
      }
      return null;
    };
    a.expect = async (pred, what, ms = 5000, since = 0) => {
      const hit = await a.waitFor(pred, ms, since);
      if (!hit) throw new ProductFailure(`expected within ${ms} ms, ${name}: ${what}`);
      return hit;
    };
    a.mark = () => a.inbox.length; // a position in the inbox, to wait for what comes after it
    a.all = (type) => a.inbox.filter((m) => m.type === type);
    // who this connection has been told came into view, and left it (protocol 2 snapshots)
    a.entered = (since = 0) => a.inbox.slice(since).filter((m) => m.type === 'snapshot').flatMap((m) => m.enter ?? []);
    a.exited = (since = 0) => a.inbox.slice(since).filter((m) => m.type === 'snapshot').flatMap((m) => m.exit ?? []);
    a.id = () => a.all('welcome').at(-1)?.id ?? null;
    a.auth = async (ticket) => {
      const at = a.mark();
      a.send({ type: 'auth', ticket });
      return a.waitFor((m) => m.type === 'auth.ok' || m.type === 'auth.failed', 5000, at);
    };
    a.move = (x, z) => a.send({ type: 'state', x, z, yaw: 0, moving: true, emote: null, veh: null });
    a.drop = () => ws.terminate(); // the connection just goes (a phone losing its signal), with no close handshake
    a.close = () => ws.close();
    a.pause = () => ws._socket?.pause(); // stops reading: the server's sends pile up on its side
    a.resume = () => ws._socket?.resume();
    ws.on('open', async () => {
      if (hello) a.send(hello);
      await sleep(200);
      resolve(a);
    });
  });
}

// A hello in the shape the game sends (lib/net/multiplayer.js).
export const gameHello = (name, room, x = 0, z = 0) => ({ type: 'hello', v: 2, name, room, x, z, appearance: { shirt: 'shirt-red', pants: 'pants-navy', hat: 'hat-cap' }, device: { ua: 'Mozilla/5.0 journey', screen: '1300x950@1', touch: false, url: '/' } });
