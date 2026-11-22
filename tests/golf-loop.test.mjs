// The second nine, "The Adventure Loop" (lib/world/minigolf.js LOOP, lib/world/golfPark.js generateLoopGrounds, docs/world/minigolf.md): nine holes east of the park, harder than the first nine, joined to the park by a
// path through a gap in its fence, playable (every hole can be holed), saved to its own leaderboard, and baked.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
import { createApi } from '../services/api/server.mjs';
import * as golf from '../services/api/golf.mjs';

const { bad, total } = problemTally();
const { buildWorld } = await imp('world/buildWorld.js');
const { PALETTE } = await imp('world/track.js');
const PAL_SAND = PALETTE.findIndex((p) => p.name === 'sand');
const { GOLF, newBall, putt, stepBall } = await imp('world/golfPhysics.js');
const world = buildWorld();
const [first, loop] = world.courses;
if (!loop || loop.id !== 'harbor-adventure' || loop.holes.length !== 9) bad('a second course of nine holes', JSON.stringify(loop?.id));
else {
  if (!(loop.par > first.par)) bad('the second nine is harder: more par than the first', `${loop.par} vs ${first.par}`);
  const turns = (c) => c.holes.reduce((n, h) => n + (h.kind === 'straight' ? 0 : h.kind === 'block' || h.kind === 'windmill' || h.kind === 'castle' ? 1 : 2), 0);
  if (!(turns(loop) > turns(first))) bad('and has more turns and things in the way', `${turns(loop)} vs ${turns(first)}`);
  // it does not touch the first nine's park but for the way in
  const P1 = first.park.bounds, P2 = loop.park.bounds;
  if (!(P2.x0 >= P1.x1 - 1) && P2.z0 < P1.z1 && P2.z1 > P1.z0 && P2.x0 < P1.x1) bad('the second nine\'s grounds start where the first park ends', `${P2.x0} ${P1.x1}`);
  // the way in: the first park's fence has a gap where its link is, and the two paths meet there
  const link = first.park.link, ring0 = loop.park.ring;
  if (!link || Math.abs(link.x - P1.x1) > 1) bad('the first park has a link on its east edge', JSON.stringify(link));
  const inQuad = (q, x, z) => { let pos = false, neg = false; for (let i = 0; i < 4; i++) { const ax = q[1 + i * 2], az = q[2 + i * 2], bx = q[1 + ((i + 1) % 4) * 2], bz = q[2 + ((i + 1) % 4) * 2], c = (bx - ax) * (z - az) - (bz - az) * (x - ax); if (c > 1e-9) pos = true; if (c < -1e-9) neg = true; } return !(pos && neg); }; // (a point inside a painted quad)
  const PATH = PALETTE.findIndex((p) => p.name === 'path'), onPath = (park, x, z) => park.surface.some((q) => q[0] === PATH && inQuad(q, x, z));
  if (!onPath(first.park, link.x - 2, link.z) || !onPath(first.park, link.x + 4, link.z) || !onPath(loop.park, ring0.x0 - 1, link.z)) bad('a path runs from the first park through the gap into the second nine', JSON.stringify(link));
  if (first.park.props.some((p) => /fence/.test(p.m) && Math.abs(p.x - link.x) < 2 && Math.abs(p.z - link.z) < 4)) bad('the gap in the fence', '');
  // the path goes on to the loop round the nine holes
  const ring = loop.park.ring;
  if (!onPath(loop.park, loop.park.logo.spineX, ring.z0 + 1) || !onPath(loop.park, loop.park.logo.spineX, (ring.z0 + ring.z1) / 2) || !onPath(loop.park, ring.x0 - 1, link.z)) bad('the half brain and its spine run through the nine holes', '');
  // the grounds: the arch with the name, a board of its own, lamps that glow, the yard of barrels and crates
  if (!['THE ADVENTURE LOOP', 'LEADERS'].every((t) => loop.park.labels.some((l) => l.text === t))) bad('the arch and the board have signs', loop.park.labels.map((l) => l.text).join());
  if (!loop.park.props.some((p) => p.m === 'park-crate') || !loop.park.props.some((p) => p.m === 'park-barrel')) bad('a yard of barrels and crates', '');
  if (!loop.park.props.some((p) => p.m === 'lightPostModern')) bad('lamps', '');
  if (loop.park.props.some((p) => !/^park-|^lightPostModern$/.test(p.m))) bad('every prop is the park\'s', '');
  // its own clubhouse, shop and rest spot, on a plaza south of the loop joined to it by a path
  { const pk = loop.park;
    if (!pk.club || !pk.shop || !pk.rest || !pk.plaza) bad('a clubhouse, a shop and a rest spot of its own', Object.keys(pk).join());
    else {
      if (pk.boxes.length < 150) bad('the clubhouse, shop, wreck and torches are painted boxes, not grey models', String(pk.boxes.length));
      if (!pk.props.some((p) => p.m === 'park-stallFood') || !pk.props.some((p) => p.m === 'park-stallDrinks')) bad('a food stall and a drinks stall', '');
      if (!pk.surface.some((q) => q[0] === PAL_SAND)) bad('sand under the wreck', '');
      if (!['THE CAPTAIN\'S CABIN', 'BALLS & MAPS', 'REST STOP'].every((t) => pk.labels.some((l) => l.text === t))) bad('they have signs', pk.labels.map((l) => l.text).join());
      if (!onPath(pk, pk.club.x, pk.ring.z1 + 2)) bad('a path joins the loop to the clubhouse', '');
      for (const t of [pk.club, pk.shop, pk.rest]) if (t.x < pk.plaza.x0 || t.x > pk.plaza.x1 || t.z < pk.plaza.z0 || t.z > pk.plaza.z1) bad('each stands on the plaza', JSON.stringify(t));
      if (!pk.areas.includes(pk.plaza)) bad('the plaza is checked as ground like the rest', '');
    } }
  // nothing stands on the holes or the loop
  for (const p of loop.park.props) if (/palm|rock|bush|flower/.test(p.m) && p.x > ring.x0 - 1 && p.x < ring.x1 + 1 && p.z > ring.z0 - 1 && p.z < ring.z1 + 1) { bad('no plant on the course or its loop', JSON.stringify(p)); break; }
  // every hole can be holed: a search for a putt that drops, stroke by stroke, aiming down the lane (the tile centres of the hole, in order, are the way) and keeping the putt that gets furthest along it
  const phys = (h) => ({ cup: h.cup, segments: h.segments });
  const centres = (h) => loop.tiles.filter((t) => /^(end|straight|corner|hole-round|obstacle-block)$/.test(t.m) && t.x > h.bounds.x0 - 1 && t.x < h.bounds.x1 + 1 && t.z > h.bounds.z0 - 1 && t.z < h.bounds.z1 + 1);
  const solve = (h) => {
    const ball = newBall(h.tee), P = phys(h), C = centres(h), list = [];
    const progress = (b) => { let bi = 0, bd = Infinity; C.forEach((c, i) => { const d = Math.hypot(c.x - b.x, c.z - b.z); if (d < bd) { bd = d; bi = i; } }); return bi * 10 - bd; };
    while (!ball.sunk && ball.strokes < GOLF.maxStrokes) {
      const here = progress(ball), near = C.map((c, i) => [i, Math.hypot(c.x - ball.x, c.z - ball.z)]).sort((x, y) => x[1] - y[1])[0][0];
      let best = null;
      for (const target of [...C.slice(near + 1, near + 6), h.cup]) for (const da of [0, -0.1, 0.1, -0.25, 0.25]) for (let pw = 100; pw <= 1000; pw += 50) {
        const a = Math.round((Math.atan2(target.z - ball.z, target.x - ball.x) + da) * 1000), t = { ...ball };
        putt(t, a / 1000, pw / 1000);
        for (let i = 0; t.moving && i < 400; i++) stepBall(t, P, 0.1);
        const sc = t.sunk ? 1e9 : progress(t) - here * 0 - (Math.hypot(t.x - h.cup.x, t.z - h.cup.z)) * 0.01;
        if (!best || sc > best.sc) best = { a, pw, sc, sunk: t.sunk };
      }
      list.push([best.a, best.pw]);
      putt(ball, best.a / 1000, best.pw / 1000);
      for (let i = 0; ball.moving && i < 400; i++) stepBall(ball, P, 0.1);
    }
    return { ball, list };
  };
  const solved = loop.holes.map((h) => solve(h));
  loop.holes.forEach((h, i) => { if (!solved[i].ball.sunk) bad(`hole ${h.n} (${h.kind}) can be holed`, `${solved[i].ball.strokes} strokes`); });
  const putts = solved.map((x) => x.list);
  // its own leaderboard on the server: a round replays against this course
  const card = golf.replay(loop, putts);
  if (card.length !== 9) bad('a round of the second nine replays', JSON.stringify(card));
  const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, origin: 'https://site.test', rate: { perMinute: 100000, authPerMinute: 100000 }, env: { ADMIN_TOKEN: 'admin-machine-token', IP_SALT: 'salt' } });
  await new Promise((r) => api.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${api.server.address().port}`;
  const call = async (method, p, { token, body } = {}) => { const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Origin: 'https://site.test', 'X-Forwarded-For': '10.4.0.1', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: await res.json().catch(() => ({})) }; };
  const su = (await call('POST', '/auth/signup', { body: { username: 'Loopy', password: 'longenough1' } })).data;
  const r = await call('POST', '/golf/round', { token: su.token, body: { course: loop.id, putts } });
  if (r.status !== 200 || r.data.par !== loop.par) bad('the server keeps a round of the second nine against its par', JSON.stringify(r.data));
  const lb = (await call('GET', `/golf/leaderboard?course=${loop.id}`)).data, lb1 = (await call('GET', '/golf/leaderboard?course=harbor-minigolf')).data;
  if (lb.board?.length !== 1 || lb1.board?.length !== 0 || lb.par !== loop.par) bad('each nine has its own board', JSON.stringify([lb, lb1]));
  api.server.close();
  // the baked manifest
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
  const mc = manifest.courses?.[1];
  if (!mc || mc.id !== loop.id || mc.holes.length !== 9 || mc.par !== loop.par || !mc.park?.board) bad('the manifest has the second nine, its holes and its board', JSON.stringify(mc?.id));
  else {
    let props = 0;
    const b = mc.bounds;
    for (const c of manifest.chunks) { if (c.cx * 128 > b.x1 || (c.cx + 1) * 128 < b.x0 || c.cz * 128 > b.z1 || (c.cz + 1) * 128 < b.z0) continue; const j = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')); props += (j.props ?? []).filter((p) => /^golf-/.test(p.m) && p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1).length; }
    if (props !== loop.tiles.length) bad('every tile of the second nine is baked', `${props} of ${loop.tiles.length}`);
  }
  console.log(`golf loop: par ${loop.par} (the first nine ${first.par}), ${loop.tiles.length} tiles, ${loop.park.props.length} models in the grounds, card ${card.join(' ')}`);
}
if (total()) process.exitCode = 1;
