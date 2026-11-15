// The game's Gold, held by the server (docs/architecture/backend.md, "Currency"). The rule behind every line here: nobody creates value. A page never sends an amount: it says what
// happened ("I reached the chest", "a fish bit") and the server decides if that can pay and how much, from lib/game/goldRules.js, the cosmetics' prices, the fish table and the
// chest and hunt formulas. Every payment is one row in game_gold_ledger with a key that is unique per account (a claim happens once), written in the same transaction as the
// balance it changes, and the balance always equals the sum of its ledger (auditCurrency checks both wallets).
import crypto from 'node:crypto';
import { imp } from '../../scripts/lib-loader.mjs';
import { ApiError, requireAccount } from './core.mjs';
import { transaction } from './db.mjs';

const { generateCity } = await imp('city/cityGenerator.js');
const { COSMETIC_BY_ID, DEFAULT_APPEARANCE, DEFAULT_OWNED, RAFFLE_COST, drawRafflePrize } = await imp('game/cosmetics.js');
const { HUNT_BONUS, HUNT_COUNT, HUNT_GOLD, POTD_VISIT_GOLD, dailyChest, plotOfTheDay, scavengerHunt } = await imp('game/daily.js');
const { FISH_BY_ID, FISH_DAILY_CAP, pickFish } = await imp('sim/vehicles.js');
const { BILLBOARD_QUEST_GOLD, BILLBOARD_QUEST_SECONDS, CLAIM_RADIUS, FISH_MIN_GAP_MS, MAX_SPEED, PLOT_CLAIM_RADIUS, RAFFLE_MIN_GAP_MS, dayStart, utcDay } = await imp('game/goldRules.js');

const fail = (status, message, code) => { throw new ApiError(status, message, code); };
const now = () => Date.now();
const cities = new Map();
const cityOf = (seed) => { if (!cities.has(seed)) cities.set(seed, generateCity(seed)); return cities.get(seed); };
const random = () => crypto.randomInt(0, 1_000_000_000) / 1_000_000_000; // the server's dice (fishing, the raffle)

/** Writes one Gold movement. Returns false when this key was already written (the claim already happened). Call inside a transaction. */
export function post(db, accountId, { delta, reason, ref = null, key, evidence = null, at = now() }) {
  if (!Number.isInteger(delta)) throw new Error('Gold moves in whole numbers');
  const wrote = db.prepare('INSERT OR IGNORE INTO game_gold_ledger (account_id, delta, reason, ref, key, at, evidence) VALUES (?,?,?,?,?,?,?)').run(accountId, delta, reason, ref, key, at, evidence ? JSON.stringify(evidence) : null);
  if (!Number(wrote.changes)) return false;
  if (delta) {
    const have = db.prepare('SELECT game_gold AS g FROM accounts WHERE id = ?').get(accountId).g;
    if (have + delta < 0) throw new ApiError(409, `You have ${have} Gold.`, 'not_enough_gold');
    db.prepare('UPDATE accounts SET game_gold = game_gold + ? WHERE id = ?').run(delta, accountId);
  }
  return true;
}

export const balance = (db, accountId) => db.prepare('SELECT game_gold AS gold, gold AS credits FROM accounts WHERE id = ?').get(accountId);

// ---- where the player says they are: the server checks it can be true
/**
 * "Reported" evidence: the page says where the avatar is. The server accepts it if it is within `radius` of the real spot (the server works the spot out itself) and the avatar could have
 * got there from the last place it reported (MAX_SPEED). This stops casual forgery and bounds what a forger can do (a claim is once a day, for a fixed amount); it does not prove the avatar
 * was there. Proof will come from the presence server's own view of the avatar (docs: "Currency", phase 2).
 */
function reported(db, accountId, input, target, radius, at = now()) {
  const x = Number(input?.x), z = Number(input?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1e5 || Math.abs(z) > 1e5) fail(400, 'Say where you are.', 'no_position');
  if (Math.hypot(x - target.x, z - target.z) > radius) fail(409, 'You are not close enough.', 'too_far');
  const last = db.prepare('SELECT evidence FROM game_gold_ledger WHERE account_id = ? AND evidence IS NOT NULL ORDER BY id DESC LIMIT 1').get(accountId);
  if (last) {
    const e = JSON.parse(last.evidence);
    const seconds = Math.max(1, (at - e.at) / 1000);
    if (at - e.at < 600000 && Math.hypot(x - e.x, z - e.z) / seconds > MAX_SPEED) fail(409, 'That is further than you could have moved.', 'too_fast');
  }
  return { kind: 'reported', x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, at };
}

const todayGold = (db, accountId, reason, day) => db.prepare('SELECT COALESCE(SUM(delta), 0) AS n FROM game_gold_ledger WHERE account_id = ? AND reason = ? AND at >= ? AND at < ?').get(accountId, reason, dayStart(day), dayStart(day) + 86400000).n;
const answer = (db, accountId, extra = {}) => ({ ...extra, gold: balance(db, accountId).gold });

// ---- the daily finds
export function openChest(db, seed, account, input, at = now()) {
  requireAccount(account);
  const day = utcDay(at);
  const chest = dailyChest(cityOf(seed).layout.intersections, seed, day);
  if (!chest) fail(404, 'There is no chest today.', 'no_chest');
  return transaction(db, () => {
    const proof = reported(db, account.id, input, chest, CLAIM_RADIUS, at);
    if (!post(db, account.id, { delta: chest.gold, reason: 'chest', ref: day, key: `chest:${day}`, evidence: proof, at })) fail(409, 'You opened today\'s chest already.', 'already_done');
    return answer(db, account.id, { paid: chest.gold, day });
  });
}

export function visitPlotOfTheDay(db, seed, account, input, at = now()) {
  requireAccount(account);
  const day = utcDay(at);
  const city = cityOf(seed);
  const potd = plotOfTheDay(city.plots, seed, day);
  if (!potd || Number(input?.plotId) !== potd.id) fail(409, 'That is not today\'s Plot of the Day.', 'not_potd');
  return transaction(db, () => {
    const proof = reported(db, account.id, input, potd, PLOT_CLAIM_RADIUS, at);
    if (!post(db, account.id, { delta: POTD_VISIT_GOLD, reason: 'potd', ref: String(potd.id), key: `potd:${day}`, evidence: proof, at })) fail(409, 'You visited today\'s Plot of the Day already.', 'already_done');
    return answer(db, account.id, { paid: POTD_VISIT_GOLD, day });
  });
}

export function collectStar(db, seed, account, input, at = now()) {
  requireAccount(account);
  const day = utcDay(at);
  const city = cityOf(seed);
  const spots = scavengerHunt(city.layout, city.plots, seed, day);
  const index = Number(input?.index);
  const spot = Number.isInteger(index) ? spots[index] : null;
  if (!spot) fail(400, 'There is no such star.', 'no_star');
  return transaction(db, () => {
    const proof = reported(db, account.id, input, spot, CLAIM_RADIUS, at);
    if (!post(db, account.id, { delta: HUNT_GOLD, reason: 'star', ref: `${day}#${index}`, key: `star:${day}:${index}`, evidence: proof, at })) fail(409, 'You have that star already.', 'already_done');
    const found = db.prepare("SELECT ref FROM game_gold_ledger WHERE account_id = ? AND reason = 'star' AND ref LIKE ?").all(account.id, `${day}#%`).map((r) => Number(r.ref.split('#')[1]));
    let paid = HUNT_GOLD;
    let all = false;
    if (found.length >= HUNT_COUNT) {
      all = true;
      if (post(db, account.id, { delta: HUNT_BONUS, reason: 'hunt_bonus', ref: day, key: `hunt-bonus:${day}`, at })) paid += HUNT_BONUS;
      db.prepare('INSERT OR IGNORE INTO hunt_wins (account_id, day, at) VALUES (?,?,?)').run(account.id, day, at); // the extra Building of the Week vote comes from here, never from the page
    }
    return answer(db, account.id, { paid, found: found.sort(), all, day });
  });
}

// ---- fishing: the server rolls the fish
export function catchFish(db, account, input, at = now()) {
  requireAccount(account);
  const castId = String(input?.castId ?? '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(castId)) fail(400, 'A cast needs an id.', 'bad_cast');
  const day = utcDay(at);
  return transaction(db, () => {
    const last = db.prepare("SELECT at FROM game_gold_ledger WHERE account_id = ? AND reason = 'fish' ORDER BY id DESC LIMIT 1").get(account.id);
    if (last && at - last.at < FISH_MIN_GAP_MS) fail(429, 'Wait for the next bite.', 'too_fast');
    const fish = pickFish(random);
    const paid = Math.max(0, Math.min(fish.gold, FISH_DAILY_CAP - todayGold(db, account.id, 'fish', day)));
    if (!post(db, account.id, { delta: paid, reason: 'fish', ref: fish.id, key: `fish:${castId}`, at })) fail(409, 'That cast is already counted.', 'already_done');
    return answer(db, account.id, { fish: { id: fish.id, name: fish.name }, paid, capped: paid < fish.gold, goldToday: todayGold(db, account.id, 'fish', day) });
  });
}

// ---- looking at an ad: the server keeps the clock
export function startBillboard(db, seed, account, input, at = now()) {
  requireAccount(account);
  const id = billboardOf(seed, input);
  db.prepare('INSERT OR IGNORE INTO game_timers (account_id, key, started_at) VALUES (?,?,?)').run(account.id, `billboard:${id}`, at);
  return { ok: true, seconds: BILLBOARD_QUEST_SECONDS, gold: BILLBOARD_QUEST_GOLD, done: Boolean(db.prepare('SELECT 1 FROM game_gold_ledger WHERE account_id = ? AND key = ?').get(account.id, `billboard:${id}`)) };
}
export function completeBillboard(db, seed, account, input, at = now()) {
  requireAccount(account);
  const id = billboardOf(seed, input);
  return transaction(db, () => {
    const t = db.prepare('SELECT started_at FROM game_timers WHERE account_id = ? AND key = ?').get(account.id, `billboard:${id}`);
    if (!t) fail(409, 'Start looking first.', 'not_started');
    if ((at - t.started_at) / 1000 < BILLBOARD_QUEST_SECONDS - 1) fail(409, 'Look a little longer.', 'too_early');
    if (!post(db, account.id, { delta: BILLBOARD_QUEST_GOLD, reason: 'billboard', ref: id, key: `billboard:${id}`, at })) fail(409, 'You earned that already.', 'already_done');
    db.prepare('DELETE FROM game_timers WHERE account_id = ? AND key = ?').run(account.id, `billboard:${id}`);
    return answer(db, account.id, { paid: BILLBOARD_QUEST_GOLD });
  });
}
function billboardOf(seed, input) {
  const id = String(input?.billboardId ?? '');
  if (!cityOf(seed).billboards.some((b) => String(b.id) === id && b.kind !== 'banner')) fail(404, 'There is no such billboard.', 'no_billboard');
  return id;
}

// ---- the wardrobe and the raffle: spending, with the server's prices and the server's dice
export const ownedOf = (db, accountId) => ({ ...DEFAULT_OWNED, ...Object.fromEntries(db.prepare('SELECT item_id FROM game_inventory WHERE account_id = ?').all(accountId).map((r) => [r.item_id, true])) });
export const appearanceOf = (db, accountId) => { const row = db.prepare('SELECT appearance FROM game_profile WHERE account_id = ?').get(accountId); return { ...DEFAULT_APPEARANCE, ...(row ? JSON.parse(row.appearance) : {}) }; };
const saveAppearance = (db, accountId, appearance) => db.prepare('INSERT INTO game_profile (account_id, appearance) VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET appearance = excluded.appearance').run(accountId, JSON.stringify(appearance));

export function buy(db, account, input, at = now()) {
  requireAccount(account);
  const item = COSMETIC_BY_ID[String(input?.itemId ?? '')];
  if (!item) fail(404, 'There is no such item.', 'no_item');
  return transaction(db, () => {
    if (ownedOf(db, account.id)[item.id]) fail(409, 'You own that already.', 'already_owned');
    if (!post(db, account.id, { delta: -item.price, reason: 'buy', ref: item.id, key: `buy:${item.id}`, at })) fail(409, 'You own that already.', 'already_owned');
    db.prepare('INSERT INTO game_inventory (account_id, item_id, at) VALUES (?,?,?)').run(account.id, item.id, at);
    if (item.slot !== 'emote') saveAppearance(db, account.id, { ...appearanceOf(db, account.id), [item.slot]: item.id });
    return answer(db, account.id, { owned: ownedOf(db, account.id), appearance: appearanceOf(db, account.id) });
  });
}
export function equip(db, account, input) {
  requireAccount(account);
  const next = appearanceOf(db, account.id);
  const owned = ownedOf(db, account.id);
  for (const slot of ['shirt', 'pants', 'hat']) {
    if (input?.[slot] === undefined) continue;
    const item = COSMETIC_BY_ID[String(input[slot])];
    if (!item || item.slot !== slot || !owned[item.id]) fail(409, 'You do not own that.', 'not_owned');
    next[slot] = item.id;
  }
  saveAppearance(db, account.id, next);
  return { appearance: next };
}
const lastRaffle = new Map();
export function enterRaffle(db, account, at = now()) {
  requireAccount(account);
  if (at - (lastRaffle.get(account.id) ?? 0) < RAFFLE_MIN_GAP_MS) fail(429, 'One ticket at a time.', 'too_fast');
  lastRaffle.set(account.id, at);
  const ticket = crypto.randomUUID();
  return transaction(db, () => {
    post(db, account.id, { delta: -RAFFLE_COST, reason: 'raffle_ticket', ref: ticket, key: `raffle:${ticket}`, at });
    const prize = drawRafflePrize(random());
    if (prize) post(db, account.id, { delta: prize, reason: 'raffle_prize', ref: ticket, key: `raffle-prize:${ticket}`, at });
    return answer(db, account.id, { prize, cost: RAFFLE_COST });
  });
}

// ---- what a page shows: the server's whole view of one account's Gold
export function gameState(db, seed, account, at = now()) {
  const day = utcDay(at);
  if (!account) return { signedIn: false, day };
  const has = (key) => Boolean(db.prepare('SELECT 1 FROM game_gold_ledger WHERE account_id = ? AND key = ?').get(account.id, key));
  const stars = db.prepare("SELECT ref FROM game_gold_ledger WHERE account_id = ? AND reason = 'star' AND ref LIKE ?").all(account.id, `${day}#%`).map((r) => Number(r.ref.split('#')[1])).sort();
  const caught = {};
  for (const r of db.prepare("SELECT ref, COUNT(*) AS n FROM game_gold_ledger WHERE account_id = ? AND reason = 'fish' GROUP BY ref").all(account.id)) if (FISH_BY_ID[r.ref]) caught[r.ref] = r.n;
  const done = db.prepare("SELECT ref FROM game_gold_ledger WHERE account_id = ? AND reason = 'billboard'").all(account.id);
  return {
    signedIn: true,
    day,
    ...balance(db, account.id),
    owned: ownedOf(db, account.id),
    appearance: appearanceOf(db, account.id),
    daily: { chestDay: has(`chest:${day}`) ? day : null, potdDay: has(`potd:${day}`) ? day : null, huntDay: stars.length ? day : null, huntFound: stars },
    fishing: { day, goldToday: todayGold(db, account.id, 'fish', day), caught },
    completedQuests: Object.fromEntries(done.map((r) => [r.ref, true])),
  };
}

/** The newest Gold movements of an account, newest first. */
export function ledger(db, account, limit = 50) {
  requireAccount(account);
  return { ledger: db.prepare('SELECT delta, reason, ref, at FROM game_gold_ledger WHERE account_id = ? ORDER BY id DESC LIMIT ?').all(account.id, Math.max(1, Math.min(200, Number(limit) || 50))) };
}

/** The extra Building of the Week vote: the hunt counts as won only when the server saw all the stars (replaces the page's word for it). */
export function huntWonOnServer(db, account, day) {
  return db.prepare("SELECT COUNT(*) AS n FROM game_gold_ledger WHERE account_id = ? AND reason = 'star' AND ref LIKE ?").get(account.id, `${day}#%`).n >= HUNT_COUNT;
}

/**
 * The invariant: every wallet equals the sum of its ledger. Credits are accounts.gold with gold_ledger, Gold is accounts.game_gold with game_gold_ledger.
 * Returns { ok, accounts, mismatches: [{ account, wallet, balance, ledger }] }.
 */
export function auditCurrency(db) {
  const mismatches = [];
  const rows = db.prepare(`SELECT a.id, a.username, a.gold AS credits, a.game_gold AS gold,
      (SELECT COALESCE(SUM(delta), 0) FROM gold_ledger WHERE account_id = a.id) AS credits_ledger,
      (SELECT COALESCE(SUM(delta), 0) FROM game_gold_ledger WHERE account_id = a.id) AS gold_ledger FROM accounts a`).all();
  for (const r of rows) {
    if (r.credits !== r.credits_ledger) mismatches.push({ account: r.username, wallet: 'credits', balance: r.credits, ledger: r.credits_ledger });
    if (r.gold !== r.gold_ledger) mismatches.push({ account: r.username, wallet: 'gold', balance: r.gold, ledger: r.gold_ledger });
    if (r.gold < 0 || r.credits < 0) mismatches.push({ account: r.username, wallet: r.gold < 0 ? 'gold' : 'credits', balance: Math.min(r.gold, r.credits), ledger: 'negative' });
  }
  return { ok: mismatches.length === 0, accounts: rows.length, mismatches };
}

