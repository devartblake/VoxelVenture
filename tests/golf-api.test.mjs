// The mini-golf course's saved leaderboard (services/api/golf.mjs, docs/world/minigolf.md, "The saved leaderboard"): the page sends the putts of a finished round and the server plays them again;
// a score is never sent. A round that does not replay is refused; the board is each account's best round.
import { createApi } from '../services/api/server.mjs';
import * as golf from '../services/api/golf.mjs';
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { buildWorld } = await imp('world/buildWorld.js');
const { GOLF, newBall, putt, stepBall } = await imp('world/golfPhysics.js');
const course = buildWorld().courses[0];
const PAR = course.holes.reduce((a, h) => a + h.par, 0);
const phys = (h) => ({ cup: h.cup, segments: h.segments });

/** Plays a hole the way a person would: from where the ball lies, the putt (of a few tried) that drops, else the one that ends nearest the cup. Returns the putts as the page sends them. */
function playHole(h, skill = 1) {
  const ball = newBall(h.tee), list = [];
  while (!ball.sunk && ball.strokes < GOLF.maxStrokes) {
    const toCup = Math.atan2(h.cup.z - ball.z, h.cup.x - ball.x);
    let best = null;
    for (const da of [0, -0.12, 0.12, -0.3, 0.3, -0.6, 0.6, Math.PI / 2, -Math.PI / 2, Math.PI, 0.9, -0.9]) {
      const a = Math.round((Number.isFinite(h.aim) && ball.strokes === 0 ? h.aim + da * 0.3 : toCup + da) * 1000);
      for (let p = 150; p <= 1000; p += 50 * skill) {
        const t = { ...ball }; putt(t, a / 1000, p / 1000);
        for (let i = 0; t.moving && i < 400; i++) stepBall(t, phys(h), 0.1);
        const d = Math.hypot(t.x - h.cup.x, t.z - h.cup.z);
        if (!best || (t.sunk && !best.sunk) || (t.sunk === best.sunk && d < best.d)) best = { a, p, d, sunk: t.sunk };
      }
    }
    list.push([best.a, best.p]);
    putt(ball, best.a / 1000, best.p / 1000);
    for (let i = 0; ball.moving && i < 400; i++) stepBall(ball, phys(h), 0.1);
  }
  return list;
}
const round = (skill = 1) => course.holes.map((h) => playHole(h, skill));

const SITE = 'https://site.test';
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, origin: SITE, rate: { perMinute: 100000, authPerMinute: 100000 }, env: { ADMIN_TOKEN: 'admin-machine-token', IP_SALT: 'salt' } });
const { server, db } = api;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let ipN = 1;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: SITE, 'X-Forwarded-For': `10.3.0.${ipN++ % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const signup = async (name) => (await call('POST', '/auth/signup', { body: { username: name, password: 'longenough1' } })).data;
const ana = await signup('Ana'), ben = await signup('Ben');
const tokenOf = (s) => s.token ?? s.accessToken ?? s.session?.token;

const good = round(1);
const goodCard = golf.replay(course, good);
check('a round of nine holes replays to a card of nine scores', goodCard.length === 9 && goodCard.every((s) => Number.isInteger(s) && s >= 1 && s <= GOLF.maxStrokes + 4), JSON.stringify(goodCard));

// ---- the HTTP surface
{
  check('the board is public and empty at the start, with the par', (await call('GET', '/golf/leaderboard?course=harbor-minigolf')).data.board?.length === 0 && (await call('GET', '/golf/leaderboard?course=harbor-minigolf')).data.par === PAR);
  check('no such course: 404', (await call('GET', '/golf/leaderboard?course=nowhere')).status === 404);
  check('a round needs an account: 401 with none', (await call('POST', '/golf/round', { body: { course: course.id, putts: good } })).status === 401);
  check('and your own rounds need one too', (await call('GET', '/golf/me')).status === 401);
  const r = await call('POST', '/golf/round', { token: tokenOf(ana), body: { course: course.id, putts: good } });
  check('a round that replays is kept: the strokes are the replay\'s, with a rank of 1 and a record', r.status === 200 && r.data.strokes === goodCard.reduce((a, b) => a + b, 0) && r.data.rank === 1 && r.data.record === true && r.data.diff === r.data.strokes - PAR, JSON.stringify(r.data));
  const lb = (await call('GET', '/golf/leaderboard?course=harbor-minigolf')).data;
  check('the board lists her', lb.board.length === 1 && lb.board[0].name === 'Ana' && lb.board[0].strokes === r.data.strokes, JSON.stringify(lb));
  const me = await call('GET', '/golf/me', { token: tokenOf(ana) });
  check('her own page: best, rank and rounds', me.data.best === r.data.strokes && me.data.rank === 1 && me.data.rounds.length === 1, JSON.stringify(me.data));
  const again = await call('POST', '/golf/round', { token: tokenOf(ana), body: { course: course.id, putts: good } });
  check('a second round straight after is too soon: 429', again.status === 429, JSON.stringify(again.data));
}

// ---- a round that does not replay is refused
{
  const bad = async (name, putts) => { const r = await call('POST', '/golf/round', { token: tokenOf(ben), body: { course: course.id, putts } }); check(name, r.status === 422 || r.status === 400, `${r.status} ${JSON.stringify(r.data).slice(0, 90)}`); };
  await bad('eight holes, not nine', good.slice(0, 8));
  await bad('a hole with no putts', good.map((l, i) => (i === 2 ? [] : l)));
  await bad('a putt after the ball dropped', good.map((l, i) => (i === 0 ? [...l, [0, 500]] : l)));
  await bad('a hole not finished (one weak putt)', good.map((l, i) => (i === 1 ? [[0, 50]] : l)));
  await bad('a power out of range', good.map((l, i) => (i === 0 ? [[l[0][0], 5000], ...l.slice(1)] : l)));
  await bad('a fraction instead of whole thousandths', good.map((l, i) => (i === 0 ? [[l[0][0] + 0.5, l[0][1]], ...l.slice(1)] : l)));
  await bad('a score sent instead of putts', [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  check('and nothing of Ben\'s was kept', (await call('GET', '/golf/me', { token: tokenOf(ben) })).data.best === null);
}

// ---- the board: each account's best, fewest strokes first
{
  const slow = round(3); // a coarser golfer
  const sCard = golf.replay(course, slow), sTotal = sCard.reduce((a, b) => a + b, 0), gTotal = goodCard.reduce((a, b) => a + b, 0);
  const r = await call('POST', '/golf/round', { token: tokenOf(ben), body: { course: course.id, putts: slow } });
  check('Ben\'s round is kept', r.status === 200 && r.data.strokes === sTotal, JSON.stringify(r.data));
  const lb = (await call('GET', '/golf/leaderboard?course=harbor-minigolf&limit=5')).data.board;
  check('the board is fewest strokes first and each account once', lb.length === 2 && lb[0].strokes <= lb[1].strokes && new Set(lb.map((x) => x.name)).size === 2 && lb[0].strokes === Math.min(gTotal, sTotal), JSON.stringify(lb));
  check('a worse round later does not lower her best', (golf.submit(db, { id: db.prepare("SELECT id FROM accounts WHERE username = 'Ana'").get().id, username: 'Ana' }, { course: course.id, putts: slow }, Date.now() + 60_000)).best === Math.min(gTotal, sTotal) || gTotal > sTotal);
}

// ---- the page's own play and the server's replay agree: the store plays the putts at 60 frames a second, the server at 10 steps a second, the card is the same
{
  const { useGolf } = await imp('state/golfStore.js');
  const g = () => useGolf.getState();
  g().quit(); g().setCourse({ ...course, holes: course.holes.map((h) => ({ ...h, segments: h.segments.map((s) => [s.a.x, s.a.z, s.b.x, s.b.z, s.nx, s.nz]) })) }); // (the page has the baked manifest's form)
  g().start(1, { players: 1 });
  for (let n = 1; n <= 9; n++) {
    if (n > 1) g().next(null);
    const list = good[n - 1];
    for (const [a, p] of list) {
      useGolf.setState({ aim: a / 1000, power: p / 1000, charging: true });
      g().release();
      for (let i = 0; i < 60 * 45 && g().phase === 'roll'; i++) g().tick(1 / 60);
    }
    for (let i = 0; i < 4 && g().phase === 'roll'; i++) g().tick(1);
  }
  const card = g().cards[0];
  check('the page, playing the same putts in frames, makes the same card as the server replay', JSON.stringify(card) === JSON.stringify(goodCard), `${JSON.stringify(card)} vs ${JSON.stringify(goodCard)}`);
  check('and the putts it kept are the ones it was given', JSON.stringify(g().putts) === JSON.stringify(good));
  g().quit();
}

server.close();
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
