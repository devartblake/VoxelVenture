// The server holds every balance (services/api/gold.mjs; docs/architecture/backend.md, "Currency"): nobody creates their own value. The principles, each tested: an additive
// migration; no endpoint takes an amount; claims are atomic, once, capped and rate limited; the server rolls the dice and sets the prices; spending is checked against the server's
// balance; every balance equals its ledger; a guest earns nothing; the page's word does not make a hunt win.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../services/api/server.mjs';
import { openDb } from '../services/api/db.mjs';
import * as gold from '../services/api/gold.mjs';
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const SEED = 20260101;
const SITE = 'https://site.test';
const { generateCity } = await imp('city/cityGenerator.js');
const { COSMETIC_BY_ID, RAFFLE_COST, RAFFLE_PRIZES } = await imp('game/cosmetics.js');
const { HUNT_BONUS, HUNT_GOLD, POTD_VISIT_GOLD, dailyChest, plotOfTheDay, scavengerHunt } = await imp('game/daily.js');
const { FISH, FISH_DAILY_CAP } = await imp('sim/vehicles.js');
const { BILLBOARD_QUEST_GOLD, BILLBOARD_QUEST_SECONDS, utcDay } = await imp('game/goldRules.js');
const city = generateCity(SEED);
const day = utcDay();
const chest = dailyChest(city.layout.intersections, SEED, day);
const stars = scavengerHunt(city.layout, city.plots, SEED, day);
const potd = plotOfTheDay(city.plots, SEED, day);

// ---- a database from before there was server Gold is upgraded in place, and nothing in it is lost
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vv-currency-')), 'old.db');
{
  const old = openDb(file);
  old.prepare("INSERT INTO accounts (username, pass_salt, pass_hash, created_at, gold) VALUES ('Old', 's', 'h', 1, 100)").run();
  old.prepare("INSERT INTO gold_ledger (account_id, delta, reason, at) VALUES (1, 100, 'starter', 1)").run();
  old.exec('DROP TABLE game_gold_ledger; DROP TABLE game_inventory; DROP TABLE game_profile; DROP TABLE game_timers; ALTER TABLE accounts DROP COLUMN game_gold');
  old.close();
  const upgraded = openDb(file);
  const row = upgraded.prepare('SELECT gold, game_gold FROM accounts WHERE username = ?').get('Old');
  check('a database from before server Gold is upgraded in place: the Credits are kept and the Gold starts at 0', row.gold === 100 && row.game_gold === 0);
  check('opening it again changes nothing (the upgrade is repeatable)', (() => { upgraded.close(); const again = openDb(file); const r = again.prepare('SELECT gold, game_gold FROM accounts').get(); again.close(); return r.gold === 100 && r.game_gold === 0; })());
}

const api = createApi({ dbFile: ':memory:', seed: SEED, deliverEveryMs: 0, origin: SITE, rate: { perMinute: 100000, authPerMinute: 100000 }, env: { ADMIN_TOKEN: 'admin-machine-token', IP_SALT: 'salt', TRUST_PROXY: '1' } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const db = api.db;
let ipN = 1;
const call = async (method, p, { body, token, ip = `10.1.0.${ipN++ % 250}` } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Origin: SITE, 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data };
};
const signup = async (name) => (await call('POST', '/auth/signup', { body: { username: name, password: 'longenough1' } })).data;
const ana = await signup('Ana');
const ben = await signup('Ben');
const accountOf = (name) => ({ id: db.prepare('SELECT id FROM accounts WHERE username = ?').get(name).id, username: name });
const A = accountOf('Ana'), B = accountOf('Ben');
const walletOf = (a) => gold.balance(db, a.id);
const grant = (a, n, key) => gold.post(db, a.id, { delta: n, reason: 'chest', key }); // the test stands in for an earlier payment

// ---- guests earn nothing
const guest = await call('GET', '/game/state');
check('a guest is told they are not signed in, and is given the server\'s day', guest.data.signedIn === false && guest.data.day === day);
check('a guest cannot claim anything: the chest, a star, a fish, a purchase, a raffle ticket are all 401', (await Promise.all([['/game/chest', { x: 0, z: 0 }], ['/game/star', { index: 0, x: 0, z: 0 }], ['/game/fish', { castId: 'abcdefgh' }], ['/game/shop/buy', { itemId: 'hat-cap' }], ['/game/raffle', {}]].map(([p, b]) => call('POST', p, { body: b })))).every((r) => r.status === 401));

// ---- the chest: the server works out where it is and how much it pays; the page's numbers are ignored
const far = await call('POST', '/game/chest', { token: ana.token, body: { x: chest.x + 200, z: chest.z } });
check('too far from the chest is refused (409), and nothing is paid', far.status === 409 && far.data.code === 'too_far' && walletOf(A).gold === 0);
const noPos = await call('POST', '/game/chest', { token: ana.token, body: {} });
check('no position at all is refused', noPos.status === 400);
const opened = await call('POST', '/game/chest', { token: ana.token, body: { x: chest.x, z: chest.z, gold: 99999, amount: 99999, delta: 99999 } });
check('at the chest it pays the server\'s amount, whatever amount the page sent', opened.status === 200 && opened.data.paid === chest.gold && walletOf(A).gold === chest.gold, `${opened.data.paid} of ${chest.gold}`);
const again = await call('POST', '/game/chest', { token: ana.token, body: { x: chest.x, z: chest.z } });
check('the chest pays once a day: asking again is 409 and the balance does not move', again.status === 409 && again.data.code === 'already_done' && walletOf(A).gold === chest.gold);
check('another account has its own chest', (await call('POST', '/game/chest', { token: ben.token, body: { x: chest.x, z: chest.z } })).status === 200 && walletOf(B).gold === chest.gold);

// ---- movement that cannot be true is refused (reported evidence: a bound, not a proof)
const dayBase = Date.parse(`${day}T00:30:00Z`); // fixed times inside the server's day, so the day's stars are the ones computed above
const ivy = accountOf((await signup('Ivy'), 'Ivy'));
const first = stars[0], second = stars[1];
const farStar = Math.hypot(first.x - second.x, first.z - second.z);
const ok1 = gold.collectStar(db, SEED, ivy, { index: 0, x: first.x, z: first.z }, dayBase);
let tooFast = null;
try { gold.collectStar(db, SEED, ivy, { index: 1, x: second.x, z: second.z }, dayBase + 500); } catch (e) { tooFast = e; }
check('two stars further apart than anything could move in the time are refused (too_fast)', farStar < 31 || (ok1.paid === HUNT_GOLD && tooFast?.code === 'too_fast'), `${farStar.toFixed(0)} units in 0.5 s`);

// ---- the scavenger hunt: three stars, the bonus once, and the vote bonus only because the server saw them
const hal = await signup('Hal');
const H = accountOf('Hal');
const before = await call('POST', '/hunt/complete', { token: hal.token, body: { day, found: [0, 1, 2] } });
check('the word of the page that the hunt is won is not enough (409): it cannot print a Building of the Week vote', before.status === 409 && !db.prepare('SELECT 1 FROM hunt_wins WHERE account_id = ?').get(H.id));
let paid = 0;
stars.forEach((s, i) => { paid += gold.collectStar(db, SEED, H, { index: s.index, x: s.x, z: s.z }, dayBase + (i + 1) * 3600000).paid; });
check('three stars pay 15 each and the bonus once: the total the server works out', paid === HUNT_GOLD * 3 + HUNT_BONUS && walletOf(H).gold === paid, `${paid}`);
check('the hunt is won because the server paid all three, and /hunt/complete now agrees', !!db.prepare('SELECT 1 FROM hunt_wins WHERE account_id = ? AND day = ?').get(H.id, day) && (await call('POST', '/hunt/complete', { token: hal.token, body: { day, found: [] } })).status === 200);
let dupe = null;
try { gold.collectStar(db, SEED, H, { index: 0, x: stars[0].x, z: stars[0].z }, dayBase + 5 * 3600000); } catch (e) { dupe = e; }
check('a star is paid once, and the bonus is not paid again', dupe?.code === 'already_done' && walletOf(H).gold === paid);

// ---- the Plot of the Day
if (potd) {
  const jo = await signup('Joe'); // a fresh account: it has not just been somewhere else
  const bad = await call('POST', '/game/potd', { token: jo.token, body: { plotId: potd.id + 1, x: potd.x, z: potd.z } });
  const good = await call('POST', '/game/potd', { token: jo.token, body: { plotId: potd.id, x: potd.x, z: potd.z } });
  check('the Plot of the Day pays its fixed bonus once, only for the real plot, only when you are there', bad.status === 409 && good.status === 200 && good.data.paid === POTD_VISIT_GOLD && (await call('POST', '/game/potd', { token: jo.token, body: { plotId: potd.id, x: potd.x, z: potd.z } })).status === 409, `${bad.status} ${good.status} ${good.data?.code ?? ''}`);
}

// ---- fishing: the server rolls the fish, a cast counts once, there is a gap between fish and a cap a day
const carl = accountOf((await signup('Carl'), 'Carl'));
let at = Date.now();
const c1 = gold.catchFish(db, carl, { castId: 'cast-0001-aaaa' }, at);
check('the server picks the fish (the page cannot), from the game\'s own table', FISH.some((f) => f.id === c1.fish.id) && c1.paid >= 0 && c1.paid <= FISH.find((f) => f.id === c1.fish.id).gold);
let repeat = null;
try { gold.catchFish(db, carl, { castId: 'cast-0001-aaaa' }, at + 10000); } catch (e) { repeat = e; }
check('the same cast is not counted twice', repeat?.code === 'already_done');
let quick = null;
try { gold.catchFish(db, carl, { castId: 'cast-0002-bbbb' }, at + 500); } catch (e) { quick = e; }
check('a second fish a moment later is refused: the line needs time to bite (429)', quick?.status === 429);
let total = c1.paid;
for (let i = 2; i < 400; i++) { at += 4000; total += gold.catchFish(db, carl, { castId: `cast-${String(i).padStart(4, '0')}-zzzz` }, at).paid; }
const dayOf = (t) => utcDay(t);
check(`fishing pays at most ${FISH_DAILY_CAP} Gold a day, however many fish: ${total} Gold from 400 casts over ${(at - Date.now()) / 3600000 | 0}+ hours`, (() => { const per = new Map(); for (const r of db.prepare("SELECT delta, at FROM game_gold_ledger WHERE account_id = ? AND reason = 'fish'").all(carl.id)) per.set(dayOf(r.at), (per.get(dayOf(r.at)) ?? 0) + r.delta); return [...per.values()].every((n) => n <= FISH_DAILY_CAP) && per.size >= 1; })());

// ---- an ad: the server keeps the clock
const ad = city.billboards.find((b) => b.kind !== 'banner');
const dee = accountOf((await signup('Dee'), 'Dee'));
const t1 = Date.now();
let early = null;
gold.startBillboard(db, SEED, dee, { billboardId: ad.id }, t1);
try { gold.completeBillboard(db, SEED, dee, { billboardId: ad.id }, t1 + 2000); } catch (e) { early = e; }
check('an ad quest cannot be completed early (409)', early?.code === 'too_early' && walletOf(dee).gold === 0);
const done = gold.completeBillboard(db, SEED, dee, { billboardId: ad.id }, t1 + BILLBOARD_QUEST_SECONDS * 1000);
check('after the time it pays the fixed amount, once per billboard', done.paid === BILLBOARD_QUEST_GOLD && walletOf(dee).gold === BILLBOARD_QUEST_GOLD && (() => { try { gold.completeBillboard(db, SEED, dee, { billboardId: ad.id }, t1 + 60000); return false; } catch (e) { return e.code === 'not_started' || e.code === 'already_done'; } })());
check('a billboard that does not exist pays nothing', (await call('POST', '/game/billboard/start', { token: ana.token, body: { billboardId: 'nope' } })).status === 404);

// ---- spending: the server's prices, the server's balance, the server's inventory
const eve = accountOf((await signup('Eve'), 'Eve'));
const hat = COSMETIC_BY_ID['hat-top'];
const poor = await call('POST', '/game/shop/buy', { token: (await call('POST', '/auth/login', { body: { username: 'Eve', password: 'longenough1' } })).data.token, body: { itemId: hat.id, price: 0 } });
check('you cannot buy what you cannot afford (409), and the price you name is ignored', poor.status === 409 && poor.data.code === 'not_enough_gold');
grant(eve, hat.price + 10, 'grant-1');
const eveToken = (await call('POST', '/auth/login', { body: { username: 'Eve', password: 'longenough1' } })).data.token;
const bought = await call('POST', '/game/shop/buy', { token: eveToken, body: { itemId: hat.id, price: 0 } });
check('a purchase costs the shop\'s price, from the server\'s balance, and the item is held by the server', bought.status === 200 && walletOf(eve).gold === 10 && bought.data.owned[hat.id] === true && bought.data.appearance.hat === hat.id);
check('you cannot buy the same thing twice, and the balance is unchanged', (await call('POST', '/game/shop/buy', { token: eveToken, body: { itemId: hat.id } })).status === 409 && walletOf(eve).gold === 10);
check('you can only wear what you own (409)', (await call('POST', '/game/appearance', { token: eveToken, body: { hat: 'hat-crown' } })).status === 409 && (await call('POST', '/game/appearance', { token: eveToken, body: { hat: 'hat-none' } })).status === 200);
check('the state a page loads is the server\'s: balance, inventory, what is worn', (await call('GET', '/game/state', { token: eveToken })).data.owned[hat.id] === true);

// ---- the raffle: the server\'s dice, the server\'s prices
const frank = accountOf((await signup('Frank'), 'Frank'));
grant(frank, 100000, 'grant-big');
let spent = 0, won = 0, prizeOk = true;
const allowed = new Set(RAFFLE_PRIZES.map((p) => p.gold));
let tt = Date.now();
for (let i = 0; i < 300; i++) { tt += 2000; const r = gold.enterRaffle(db, frank, tt); spent += RAFFLE_COST; won += r.prize; prizeOk &&= allowed.has(r.prize); }
check('every raffle prize is one of the table\'s, the ticket costs what it says, and the balance follows exactly', prizeOk && walletOf(frank).gold === 100000 - spent + won, `${won} won for ${spent}`);
check('the raffle pays back less than it takes (a Gold sink)', won < spent);
check('tickets cannot be bought faster than one a second (429)', (() => { try { gold.enterRaffle(db, frank, tt + 100); return false; } catch (e) { return e.status === 429; } })());
const poorRaffle = accountOf((await signup('Gus'), 'Gus'));
check('with less than a ticket\'s price the raffle refuses (409) and nothing moves', (() => { try { gold.enterRaffle(db, poorRaffle, Date.now()); return false; } catch (e) { return e.code === 'not_enough_gold' && walletOf(poorRaffle).gold === 0; } })());

// ---- Credits: the other wallet is the server's too, and no page can add to it
check('there is no way to add Credits by saying so: a quest cannot be completed without starting it (409)', (await call('POST', `/plots/${city.plots.find((p) => p.owner)?.id ?? 1}/quest/complete`, { token: ana.token, body: { gold: 9999, paid: 9999 } })).status >= 400);
check('and an owner cannot move more Credits into a budget than they have (409)', (await call('POST', `/plots/${city.plots.find((p) => p.owner)?.id ?? 1}/quest/fund`, { token: ana.token, body: { gold: 999999, amount: 999999 } })).status >= 400);

// ---- the invariant, for both wallets, and the audit that checks it
const audit = gold.auditCurrency(db);
check('every Gold balance equals the sum of its ledger and every Credits balance the sum of its own', audit.ok && audit.accounts >= 6, JSON.stringify(audit.mismatches));
check('the admin\'s audit says the same, and needs the admin', (await call('GET', '/admin/currency/audit', { token: 'admin-machine-token' })).data?.ok === true && (await call('GET', '/admin/currency/audit', { token: ana.token })).status >= 400);
db.prepare('UPDATE accounts SET game_gold = game_gold + 5 WHERE id = ?').run(A.id);
const tampered = gold.auditCurrency(db);
check('a balance changed without a ledger row is caught: 5 Gold out of nowhere', !tampered.ok && tampered.mismatches.some((m) => m.account === 'Ana' && m.wallet === 'gold' && m.balance - m.ledger === 5));
db.prepare('UPDATE accounts SET game_gold = game_gold - 5 WHERE id = ?').run(A.id);
db.prepare('UPDATE accounts SET gold = gold + 7 WHERE id = ?').run(B.id);
check('and the same for Credits', gold.auditCurrency(db).mismatches.some((m) => m.account === 'Ben' && m.wallet === 'credits'));
db.prepare('UPDATE accounts SET gold = gold - 7 WHERE id = ?').run(B.id);
check('put right, the audit is clean again', gold.auditCurrency(db).ok);

// ---- the contracts describe what the server really sends, and no request has an amount in it
const types = await import('@voxelventure/shared-types');
const holds = (name, contract, value) => { const errors = types.validate(contract.schema, value); check(`${name} satisfies ${contract.id}`, errors.length === 0, errors.slice(0, 2).join('; ')); };
holds('the answer to the chest', types.GAME_PAID, opened.data);
holds('a bought item', types.GAME_PAID, bought.data);
holds('the state of a signed-in account', types.GAME_STATE, (await call('GET', '/game/state', { token: eveToken })).data);
holds('the state of a guest', types.GAME_STATE, guest.data);
holds('the ledger', types.GAME_LEDGER, (await call('GET', '/game/ledger', { token: eveToken })).data);
holds('the audit', types.ADMIN_CURRENCY_AUDIT, gold.auditCurrency(db));
check('no request contract has an amount, a price, a prize or a delta', [types.GAME_REACH, types.GAME_STAR, types.GAME_FISH, types.GAME_BILLBOARD, types.GAME_BUY].every((c) => !Object.keys(c.schema.properties).some((k) => /gold|amount|price|prize|delta|paid|cost/i.test(k))));

api.server.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
