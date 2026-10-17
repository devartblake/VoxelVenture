// Journey: two signed-in players meet, talk, lose their connection and come back; and the presence server holds against malformed, stale
// and abusive clients (Track A of docs/architecture/external_voxel_repositories_adoption_plan.md; scenario `reconnect-and-recovery` in
// tests/fixtures/deterministic-pilot-city.mjs). No browser: presence agents speaking protocol 2, every message held to its contract.
import { runJourney } from '../agents/scenario.mjs';
import { merchantAgent, apiClient } from '../agents/merchant-agent.mjs';
import { presenceAgent, gameHello, misfits } from '../agents/presence-agent.mjs';
import { SCENARIOS } from '../fixtures/deterministic-pilot-city.mjs';
import { sleep } from '../helpers.mjs';

const scenario = SCENARIOS.reconnectRecovery;
const room = String(scenario.seed);
const status = async (j) => (await fetch(`${j.stack.mpUrl.replace(/^ws/, 'http')}/status`)).json();

await runJourney(scenario, { needs: { api: true, presence: true } }, async (j) => {
  const people = { ada: await merchantAgent(j, 'ada'), ben: await merchantAgent(j, 'ben') };
  const ticket = async (who) => (await people[who].call('POST', '/messaging/ticket')).data.ticket;
  let ada;
  let ben;
  let benTicket;

  await j.step('both-connect', async () => {
    ada = await presenceAgent(j, 'ada', gameHello('Ada', room, 0, 0));
    ben = await presenceAgent(j, 'ben', gameHello('Ben', room, 3, 0));
    await ada.expect('welcome', 'a welcome');
    await ben.expect('welcome', 'a welcome');
  });

  await j.step('signed-in', async () => {
    await people.ada.signUp();
    await people.ben.signUp();
    benTicket = await ticket('ben');
    j.expect((await ada.auth(await ticket('ada')))?.type === 'auth.ok', 'Ada is signed in by her ticket');
    j.expect((await ben.auth(benTicket))?.type === 'auth.ok', 'Ben is signed in by his ticket');
  });

  await j.step('see-each-other', async () => {
    await ada.expect((m) => m.type === 'snapshot' && (m.enter ?? []).some((p) => p.id === ben.id()), 'Ben comes into view');
    await ben.expect((m) => m.type === 'snapshot' && (m.enter ?? []).some((p) => p.id === ada.id()), 'Ada comes into view');
    await sleep(800);
    j.expect(ada.entered().filter((p) => p.id === ben.id()).length === 1 && ben.entered().filter((p) => p.id === ada.id()).length === 1, 'each has seen the other come into view exactly once');
    await ada.expect((m) => m.type === 'profile' && m.player.id === ben.id() && m.player.verified, 'Ben is shown as a signed-in account');
  });

  const line = { type: 'chat.send', clientMessageId: 'journey-line-0001', channel: 'nearby', text: 'Hello Ben' };
  await j.step('chat-heard-once', async () => {
    ada.send(line);
    const accepted = await ada.expect((m) => m.type === 'chat.accepted' && m.clientMessageId === line.clientMessageId, 'her line is accepted');
    await ben.expect((m) => m.type === 'chat' && m.messageId === accepted.messageId, 'Ben hears it');
    const at = ada.mark();
    ada.send(line); // the same line again, as a retry
    const again = await ada.expect((m) => m.type === 'chat.accepted' && m.clientMessageId === line.clientMessageId, 'the retry is answered', 5000, at);
    await sleep(600);
    j.expect(again.messageId === accepted.messageId && ben.all('chat').filter((m) => m.messageId === accepted.messageId).length === 1, 'the retry gets the same answer and Ben hears the line once', `${ben.all('chat').length} line(s) heard`);
  });

  await j.step('out-of-view', async () => {
    let at = ben.mark();
    ada.move(400, 400);
    await ben.expect((m) => m.type === 'snapshot' && (m.exit ?? []).includes(ada.id()), 'Ada walking away is seen as leaving', 5000, at);
    at = ben.mark();
    ada.move(1, 0);
    await ben.expect((m) => m.type === 'snapshot' && (m.enter ?? []).some((p) => p.id === ada.id()), 'and coming back as coming into view', 5000, at);
  });

  const lost = { type: 'chat.send', clientMessageId: 'journey-line-0002', channel: 'nearby', text: 'Are you still there?' };
  let lostAnswer;
  await j.step('forced-disconnect', async () => {
    await sleep(1100); // one line a second
    ben.send(lost);
    lostAnswer = await ben.expect((m) => m.type === 'chat.accepted' && m.clientMessageId === lost.clientMessageId, 'his line is accepted');
    await ada.expect((m) => m.type === 'chat' && m.messageId === lostAnswer.messageId, 'Ada hears it');
    const at = ada.mark();
    const oldId = ben.id();
    ben.drop(); // as if the answer never reached his phone: the game will retry the line on its new connection
    await ada.expect((m) => m.type === 'snapshot' && (m.exit ?? []).includes(oldId), 'Ben dropping is seen as leaving', 6000, at);
  });

  let ben2;
  await j.step('reconnect', async () => {
    const at = ada.mark();
    ben2 = await presenceAgent(j, 'ben-again', gameHello('Ben', room, 3, 0));
    await ben2.expect('welcome', 'a welcome on the new connection');
    j.expect((await ben2.auth(await ticket('ben')))?.type === 'auth.ok', 'Ben signs in again with a new ticket');
    await ada.expect((m) => m.type === 'snapshot' && (m.enter ?? []).some((p) => p.id === ben2.id()), 'Ada sees Ben come back', 6000, at);
    await sleep(800);
    j.expect(ada.entered(at).filter((p) => p.id === ben2.id()).length === 1 && !ada.entered(at).some((p) => p.id === ben.id()), 'he is seen once, as his new connection only');
    j.expect(ben2.entered().filter((p) => p.id === ada.id()).length === 1, 'and he sees Ada once');
  });

  await j.step('retry-after-reconnect', async () => {
    const at = ben2.mark();
    ben2.send(lost); // the game retries the line whose answer it never got
    const answer = await ben2.expect((m) => (m.type === 'chat.accepted' || m.type === 'chat.rejected') && m.clientMessageId === lost.clientMessageId, 'the retried line is answered', 5000, at);
    await sleep(700);
    const heard = ada.all('chat').filter((m) => m.text === lost.text).length;
    j.expect(answer.type === 'chat.accepted' && answer.messageId === lostAnswer.messageId && heard === 1, 'the retry after reconnecting gets the first answer, and Ada hears the line once', `${answer.type} ${answer.messageId ?? ''}, heard ${heard} time(s)`);
  });

  await j.step('stale-protocol', async () => {
    const old = await presenceAgent(j, 'old-game', { ...gameHello('Old', room), v: 1 });
    await old.expect('protocol.unsupported', 'a game speaking protocol 1 is told which one the server speaks');
    for (let i = 0; i < 20 && old.closed == null; i++) await sleep(100);
    j.expect(old.closed === 4002 && old.all('welcome').length === 0, 'and is closed without a welcome', `closed ${old.closed}`);
  });

  await j.step('spent-ticket', async () => {
    const thief = await presenceAgent(j, 'thief', gameHello('Thief', room, 5, 5));
    const r = await thief.auth(benTicket); // Ben's first ticket, already used
    j.expect(r?.type === 'auth.failed' && r.code === 'unauthenticated', 'a ticket already used cannot sign anyone in', JSON.stringify(r));
    thief.close();
  });

  await j.step('malformed-input', async () => {
    const odd = await presenceAgent(j, 'odd', null);
    odd.send('this is not JSON');
    odd.send({ type: 'hello', room: 7 }); // a room must be a string
    await odd.expect('invalid', 'a malformed hello is answered invalid');
    odd.send(gameHello('Odd', room, 6, 6));
    await odd.expect('welcome', 'the same connection then says hello properly');
    odd.send({ type: 'state', x: 1e12, z: 'north', yaw: null, moving: 'yes', veh: { kind: 'rocket' } });
    odd.send({ type: 'nonsense', anything: true });
    await sleep(500);
    const me = (await status(j)).players.find((p) => p.name === 'Odd');
    j.expect(me && Math.abs(me.x) <= 1e5 && me.z === 0, 'out-of-range and wrong-typed positions are clamped, not taken', JSON.stringify(me && { x: me.x, z: me.z }));
    odd.close();
  });

  await j.step('rate-limited', async () => {
    const flood = await presenceAgent(j, 'flood', gameHello('Flood', room, 2, 2));
    for (let i = 0; i < 400; i++) flood.move(2 + (i % 5), 2);
    await sleep(1200);
    j.expect((await fetch(`${j.stack.mpUrl.replace(/^ws/, 'http')}/health`)).ok, 'the server is still up after a flood');
    const at = ada.mark();
    const probe = { type: 'chat.send', clientMessageId: 'journey-line-0003', channel: 'nearby', text: 'Still here?' };
    ada.send(probe);
    await ada.expect((m) => m.type === 'chat.accepted' && m.clientMessageId === probe.clientMessageId, 'and the others can still talk', 5000, at);
    flood.close();
  });

  await j.step('slow-receiver', async () => {
    const slow = await presenceAgent(j, 'slow', gameHello('Slow', room, 4, 1));
    await slow.expect((m) => m.type === 'snapshot', 'the slow client is sent who is near');
    slow.pause();
    const at = ben2.mark();
    for (let i = 0; i < 30; i++) {
      ada.move(1 + (i % 3), i % 2);
      await sleep(100);
    }
    j.expect(ben2.inbox.slice(at).some((m) => m.type === 'snapshot'), 'the others keep getting updates while one client is not reading');
    const before = slow.mark();
    slow.resume();
    await slow.expect((m) => m.type === 'snapshot' || m.type === 'online', 'once it reads again it is sent updates', 5000, before);
    j.expect(slow.closed == null, 'and it was not disconnected');
    slow.close();
  });

  await j.step('no-outcomes-from-presence', async () => {
    const anon = apiClient(j);
    const plot = (await anon('GET', '/plots?limit=1')).data.entries[0].plot; // the directory: { entries: [{ number, rank, plot }] }
    const before = (await anon('GET', `/plots/${plot.id}/stats`)).data;
    // things a game could try to send: none of them is a presence message, and none may count
    for (const m of [{ type: 'event', kind: 'visit', plotId: plot.id }, { type: 'visit', plotId: plot.id, seconds: 600 }, { type: 'cta', plotId: plot.id }, { type: 'purchase', business: 'x', value: 99999 }, { type: 'state', x: plot.x, z: plot.z, inside: plot.id }]) ada.send(m);
    await sleep(800);
    const after = (await anon('GET', `/plots/${plot.id}/stats`)).data;
    j.expect(JSON.stringify(after) === JSON.stringify(before), 'a building\'s figures are unchanged by anything said to the presence server', `${JSON.stringify(before).slice(0, 120)} -> ${JSON.stringify(after).slice(0, 120)}`);
  });

  await j.step('every-message-in-contract', async () => {
    const total = [ada, ben, ben2].reduce((n, a) => n + a.inbox.length, 0);
    j.expect(misfits.length === 0, `every one of the ${total}+ messages sent to the agents fits its contract`, misfits.slice(0, 3).map((m) => `${m.type}: ${m.errors.join('; ')}`).join(' | '));
    for (const a of [ada, ben2]) a.close();
  });
});
