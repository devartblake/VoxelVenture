import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { transaction } from './db.mjs';
import { ApiError, fail, getPlot, publicAccount, requireAccount, text } from './core.mjs';
import { imp } from '../../scripts/lib-loader.mjs';
import { leadTarget } from './business.mjs';

// Everything that turns visitors into leads and customers: a business's offers (coupon, visit quest with a Gold budget, video, game demo),
// the email sign-ups it collects (double opt-in), its feedback board, and the email the server sends (confirmations, take-over notices,
// the Plot of the Day newsletter). No HTTP in here: server.mjs routes to these functions.
const { generateCity } = await imp('city/cityGenerator.js');
const { toEmbedUrl } = await imp('content/embeds.js');
const now = () => Date.now();
const DAY = 86400000;
const token = () => crypto.randomBytes(24).toString('hex');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const cleanEmail = (v) => {
  const e = text(v, 120).toLowerCase();
  return EMAIL.test(e) && e.length <= 120 ? e : fail(400, 'That email address does not look right.', 'bad_email');
};
const gold = (db, accountId, delta, reason, ref) => {
  db.prepare('UPDATE accounts SET gold = gold + ? WHERE id = ?').run(delta, accountId);
  db.prepare('INSERT INTO gold_ledger (account_id, delta, reason, ref, at) VALUES (?,?,?,?,?)').run(accountId, delta, reason, ref ?? null, now());
};
const visitorOf = (account, input) => (account ? `a${account.id}` : `x${text(input?.visitor, 40) || 'anonymous'}`);

// ---- offers: coupon, quest, video, game ---------------------------------------------------------------------------------
// Gives the city's own businesses the offers the generator made for them (once), and a budget for their quest.
export function seedBrands(db, seed = 20260101) {
  const city = generateCity(seed);
  const set = db.prepare('UPDATE plots SET brand = ?, quest_budget = ? WHERE id = ? AND brand IS NULL AND owner_account IS NULL');
  let n = 0;
  transaction(db, () => {
    for (const p of city.plots) {
      if (!p.brand) continue;
      const b = { video: null, game: null, coupon: p.brand.coupon ? { code: p.brand.coupon.code, text: p.brand.coupon.text, total: p.brand.coupon.total } : null, quest: p.brand.quest ?? null };
      n += Number(set.run(JSON.stringify(b), b.quest ? b.quest.gold * 40 : 0, p.id).changes);
    }
  });
  return n;
}

function brandOf(db, row) {
  const b = row.brand ? JSON.parse(row.brand) : { video: null, game: null, coupon: null, quest: null };
  const claimed = b.coupon ? db.prepare('SELECT COUNT(*) AS n FROM coupon_claims WHERE plot_id = ?').get(row.id).n : 0;
  return {
    video: b.video ?? null,
    game: b.game ?? null,
    coupon: b.coupon ? { ...b.coupon, claimed } : null,
    quest: b.quest ? { ...b.quest, budget: row.quest_budget, active: row.quest_budget >= b.quest.gold } : null,
  };
}

// What a visitor sees when they walk in: the offers, what they have already done here, and the feedback board.
export function storefront(db, account, plotId, input = {}) {
  const row = getPlot(db, plotId);
  if (!row.owner_name) fail(404, 'There is no business here.', 'no_business');
  const brand = brandOf(db, row);
  const me = visitorOf(account, input);
  const mine = db.prepare('SELECT code, ticket, redeemed_at FROM coupon_claims WHERE plot_id = ? AND visitor = ?').get(row.id, me);
  const own = Boolean(account && row.owner_account === account.id);
  return {
    plotId: row.id,
    own,
    brand: own ? brand : { ...brand, coupon: brand.coupon && { ...brand.coupon, code: undefined } },
    myCoupon: mine?.code ?? null,
    myTicket: mine?.ticket ?? null, // shown with the code: the owner marks it redeemed at the till (conversions.mjs)
    myCouponRedeemed: Boolean(mine?.redeemed_at),
    questDone: Boolean(account && db.prepare('SELECT 1 FROM quest_claims WHERE plot_id = ? AND account_id = ?').get(row.id, account.id)),
    feedback: listFeedback(db, row, account),
  };
}

// The owner sets the offers. Videos and games go through the same embed rules as the game (known services only).
export function setBrand(db, account, plotId, input) {
  requireAccount(account);
  return transaction(db, () => {
    const row = getPlot(db, plotId);
    if (row.owner_account !== account.id) fail(403, 'This is not your business.', 'forbidden');
    const errors = {};
    const video = toEmbedUrl('video', input.videoUrl);
    if (!video.ok) errors.videoUrl = video.error;
    const game = toEmbedUrl('game', input.gameUrl);
    if (!game.ok) errors.gameUrl = game.error;
    let coupon = null;
    const couponText = text(input.couponText, 80);
    if (couponText) {
      const total = Math.floor(Number(input.couponTotal));
      const code = text(input.couponCode, 16) || `${row.title.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'VV'}-${row.id}`;
      if (!(total >= 1 && total <= 500)) errors.couponTotal = 'Between 1 and 500 coupons.';
      if (!/^[A-Za-z0-9-]{3,16}$/.test(code)) errors.couponCode = '3-16 letters, numbers or dashes.';
      coupon = { code, text: couponText, total };
    }
    let quest = null;
    if (input.questOn) {
      const seconds = Math.floor(Number(input.questSeconds));
      const g = Math.floor(Number(input.questGold));
      if (!(seconds >= 10 && seconds <= 120)) errors.questSeconds = 'Between 10 and 120 seconds.';
      if (!(g >= 1 && g <= 50)) errors.questGold = 'Between 1 and 50 Credits.';
      quest = { label: 'Visit and look around', seconds, gold: g };
    }
    if (Object.keys(errors).length) throw new ApiError(400, 'Some of the storefront is not valid.', 'bad_storefront').withErrors(errors);
    db.prepare('UPDATE plots SET brand = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ video: video.url ? { url: video.url, service: video.service } : null, game: game.url ? { url: game.url, service: game.service } : null, coupon, quest }), now(), row.id);
    return storefront(db, account, row.id);
  });
}

// A visitor claims the coupon: one per visitor, limited stock, atomic, and never the owner's own.
export function claimCoupon(db, account, plotId, input = {}) {
  return transaction(db, () => {
    const row = getPlot(db, plotId);
    const brand = brandOf(db, row);
    if (!brand.coupon) fail(404, 'This business has no coupon.', 'no_coupon');
    if (account && row.owner_account === account.id) fail(409, 'You cannot claim your own coupon.', 'own_coupon');
    const me = visitorOf(account, input);
    const had = db.prepare('SELECT code, ticket FROM coupon_claims WHERE plot_id = ? AND visitor = ?').get(row.id, me);
    if (had) return { code: had.code, ticket: had.ticket ?? null, already: true, left: brand.coupon.total - brand.coupon.claimed };
    if (brand.coupon.claimed >= brand.coupon.total) fail(409, 'All the coupons have been claimed.', 'coupons_gone');
    // a ticket per claim (unique for this storefront), so the owner can mark exactly this claim redeemed
    let ticket;
    do ticket = crypto.randomBytes(3).toString('hex').toUpperCase();
    while (db.prepare('SELECT 1 FROM coupon_claims WHERE plot_id = ? AND ticket = ?').get(row.id, ticket));
    db.prepare('INSERT INTO coupon_claims (plot_id, visitor, code, at, ticket) VALUES (?,?,?,?,?)').run(row.id, me, brand.coupon.code, now(), ticket);
    return { code: brand.coupon.code, ticket, already: false, left: brand.coupon.total - brand.coupon.claimed - 1 };
  });
}

// ---- quests: Gold paid from the business's own budget -----------------------------------------------------------------
// The owner puts Gold from their wallet into the quest budget; visitors are paid out of it. When it is empty the quest stops.
export function fundQuest(db, account, plotId, amount) {
  requireAccount(account);
  const g = Math.floor(Number(amount));
  if (!(g >= 1 && g <= 100000)) fail(400, 'Choose an amount of Gold.', 'bad_amount');
  return transaction(db, () => {
    const row = getPlot(db, plotId);
    if (row.owner_account !== account.id) fail(403, 'This is not your business.', 'forbidden');
    const wallet = db.prepare('SELECT gold FROM accounts WHERE id = ?').get(account.id).gold;
    if (wallet < g) fail(409, `You have ${wallet} Credits in your wallet.`, 'not_enough_gold');
    gold(db, account.id, -g, 'quest_budget', String(row.id));
    db.prepare('UPDATE plots SET quest_budget = quest_budget + ? WHERE id = ?').run(g, row.id);
    return { budget: row.quest_budget + g, wallet: wallet - g };
  });
}

// A visitor starts the visit (the clock is the server's), then completes it after the time the quest asks for.
export function startQuest(db, account, plotId) {
  requireAccount(account);
  const row = getPlot(db, plotId);
  const q = brandOf(db, row).quest;
  if (!q) fail(404, 'There is no quest here.', 'no_quest');
  if (row.owner_account === account.id) fail(409, 'You cannot earn Gold from your own business.', 'own_quest');
  if (db.prepare('SELECT 1 FROM quest_claims WHERE plot_id = ? AND account_id = ?').get(row.id, account.id)) return { done: true, seconds: q.seconds, gold: q.gold };
  db.prepare('INSERT OR IGNORE INTO quest_sessions (plot_id, account_id, started_at) VALUES (?,?,?)').run(row.id, account.id, now());
  return { done: false, seconds: q.seconds, gold: q.gold, active: q.active };
}
export function completeQuest(db, account, plotId, clock = now) {
  requireAccount(account);
  return transaction(db, () => {
    const row = getPlot(db, plotId);
    const q = brandOf(db, row).quest;
    if (!q) fail(404, 'There is no quest here.', 'no_quest');
    if (row.owner_account === account.id) fail(409, 'You cannot earn Gold from your own business.', 'own_quest');
    if (db.prepare('SELECT 1 FROM quest_claims WHERE plot_id = ? AND account_id = ?').get(row.id, account.id)) fail(409, 'You already earned the Gold here.', 'already_done');
    const s = db.prepare('SELECT started_at FROM quest_sessions WHERE plot_id = ? AND account_id = ?').get(row.id, account.id);
    if (!s) fail(409, 'Start the visit first.', 'not_started');
    const spent = (clock() - s.started_at) / 1000;
    if (spent < q.seconds - 1) fail(409, `Stay ${Math.ceil(q.seconds - spent)} more seconds.`, 'too_early');
    if (row.quest_budget < q.gold) return { paid: 0, reason: 'budget_empty', wallet: publicAccount(db, account.id).gold };
    db.prepare('UPDATE plots SET quest_budget = quest_budget - ? WHERE id = ?').run(q.gold, row.id);
    gold(db, account.id, q.gold, 'quest', String(row.id));
    db.prepare('INSERT INTO quest_claims (plot_id, account_id, gold, at) VALUES (?,?,?,?)').run(row.id, account.id, q.gold, now());
    db.prepare('DELETE FROM quest_sessions WHERE plot_id = ? AND account_id = ?').run(row.id, account.id);
    return { paid: q.gold, wallet: publicAccount(db, account.id).gold };
  });
}
export const wallet = (db, account) => ({ gold: publicAccount(db, requireAccount(account).id).gold, ledger: db.prepare('SELECT delta, reason, ref, at FROM gold_ledger WHERE account_id = ? ORDER BY id DESC LIMIT 30').all(account.id) });

// ---- the feedback board ---------------------------------------------------------------------------------------------------
function listFeedback(db, row, account) {
  const own = Boolean(account && row.owner_account === account.id);
  return db.prepare(`SELECT id, author, message, hidden, at FROM feedback WHERE plot_id = ? AND hidden < 2 ${own ? '' : 'AND hidden = 0'} ORDER BY id DESC LIMIT 50`).all(row.id).map((f) => ({ id: f.id, author: f.author, message: f.message, hidden: Boolean(f.hidden), daysAgo: Math.floor((now() - f.at) / DAY), mine: Boolean(account && f.author === account.username) }));
}
export function postFeedback(db, account, plotId, input) {
  requireAccount(account);
  const message = text(input.message, 280);
  if (message.length < 3) fail(400, 'Write a few words.', 'too_short');
  return transaction(db, () => {
    const row = getPlot(db, plotId);
    if (!row.owner_name) fail(404, 'There is no business here.', 'no_business');
    const last = db.prepare('SELECT at FROM feedback WHERE plot_id = ? AND account_id = ? ORDER BY id DESC LIMIT 1').get(row.id, account.id);
    if (last && now() - last.at < 20000) fail(429, 'Wait a moment before posting again.', 'too_fast');
    if (db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE account_id = ? AND at > ?').get(account.id, now() - DAY).n >= 10) fail(429, 'That is enough feedback for today.', 'daily_limit');
    db.prepare('INSERT INTO feedback (plot_id, account_id, author, message, at) VALUES (?,?,?,?,?)').run(row.id, account.id, account.username, message, now());
    return { feedback: listFeedback(db, row, account) };
  });
}
export function hideFeedback(db, account, plotId, feedbackId, hidden = true) {
  requireAccount(account);
  const row = getPlot(db, plotId);
  if (row.owner_account !== account.id) fail(403, 'This is not your business.', 'forbidden');
  // hidden = 1: the owner hid it (they can show it again); hidden = 2: a moderator removed it (only a moderator can undo that)
  if (hidden) db.prepare('UPDATE feedback SET hidden = 1 WHERE id = ? AND plot_id = ? AND hidden = 0').run(Number(feedbackId), row.id);
  else db.prepare('UPDATE feedback SET hidden = 0 WHERE id = ? AND plot_id = ? AND hidden = 1').run(Number(feedbackId), row.id);
  return { feedback: listFeedback(db, row, account) };
}

// ---- leads: email sign-ups with double opt-in -----------------------------------------------------------------------------
const base = () => process.env.PUBLIC_API_URL || `http://localhost:${process.env.API_PORT || 3002}`;
export function subscribe(db, input) {
  const email = cleanEmail(input.email);
  const kind = ['plot', 'ad', 'world', 'business'].includes(input.targetKind) ? input.targetKind : fail(400, 'targetKind must be plot, ad, business or world.', 'bad_target');
  let id = kind === 'world' ? 'world' : String(input.targetId ?? '');
  let label = 'the VoxelVenture newsletter';
  if (kind === 'plot') label = getPlot(db, id).title;
  if (kind === 'business') {
    // a free profile whose call to action is its newsletter (targetId is its slug; the lead is kept under its id, which never changes)
    const b = leadTarget(db, id);
    if (!b.newsletter) fail(400, 'This business does not take newsletter sign-ups.', 'no_newsletter');
    id = String(b.id);
    label = b.name;
  }
  if (kind === 'ad') {
    const slot = db.prepare('SELECT ad FROM ad_slots WHERE id = ?').get(id) ?? fail(404, 'No such ad space.', 'no_slot');
    if (!slot.ad) fail(400, 'That ad space is empty.', 'empty_slot');
    label = JSON.parse(slot.ad).headline;
  }
  const had = db.prepare('SELECT * FROM leads WHERE target_kind = ? AND target_id = ? AND email = ?').get(kind, id, email);
  if (had?.status === 'confirmed') return { status: 'confirmed', sent: false };
  if (had && had.status === 'pending' && now() - had.created_at < 5 * 60000) return { status: 'pending', sent: false }; // do not mail the same address over and over
  const t = token();
  if (had) db.prepare("UPDATE leads SET status = 'pending', token = ?, created_at = ? WHERE id = ?").run(t, now(), had.id);
  else db.prepare('INSERT INTO leads (target_kind, target_id, email, token, source, created_at) VALUES (?,?,?,?,?,?)').run(kind, id, email, t, text(input.source, 30) || null, now());
  enqueue(db, { to: email, kind: 'confirm', subject: `Confirm your sign-up: ${label}`, body: `Someone (hopefully you) asked to hear from ${label} on VoxelVenture.\n\nConfirm: ${base()}/leads/confirm?token=${t}\n\nIf it was not you, ignore this email and nothing will be sent.` });
  return { status: 'pending', sent: true };
}
export function confirmLead(db, tok) {
  const r = db.prepare("UPDATE leads SET status = 'confirmed', confirmed_at = ? WHERE token = ? AND status = 'pending'").run(now(), String(tok));
  return Number(r.changes) > 0 || Boolean(db.prepare("SELECT 1 FROM leads WHERE token = ? AND status = 'confirmed'").get(String(tok)));
}
export function unsubscribeLead(db, tok) {
  return Number(db.prepare("UPDATE leads SET status = 'unsubscribed' WHERE token = ?").run(String(tok)).changes) > 0;
}
// The owner of a business or an ad space sees how many people signed up, and the confirmed addresses (never the pending ones).
export function leadsFor(db, account, kind, id) {
  requireAccount(account);
  let owner;
  if (kind === 'business') {
    const b = leadTarget(db, id); // a profile's leads are kept under its id; the route names it by slug
    id = String(b.id);
    owner = b.account;
  } else owner = kind === 'plot' ? getPlot(db, id).owner_account : (db.prepare('SELECT owner_account FROM ad_slots WHERE id = ?').get(String(id)) ?? fail(404, 'No such ad space.', 'no_slot')).owner_account;
  if (owner !== account.id) fail(403, 'These sign-ups are not yours.', 'forbidden');
  const rows = db.prepare('SELECT email, status, confirmed_at FROM leads WHERE target_kind = ? AND target_id = ?').all(kind, String(id));
  return { confirmed: rows.filter((r) => r.status === 'confirmed').map((r) => ({ email: r.email, at: r.confirmed_at })), pending: rows.filter((r) => r.status === 'pending').length, unsubscribed: rows.filter((r) => r.status === 'unsubscribed').length };
}

// Every sign-up for everything you own, in one list: your businesses and your ad spaces.
export function myLeads(db, account) {
  requireAccount(account);
  const one = (kind, id, title) => {
    const rows = db.prepare('SELECT email, status, confirmed_at FROM leads WHERE target_kind = ? AND target_id = ?').all(kind, String(id));
    return { kind, id, title, confirmed: rows.filter((r) => r.status === 'confirmed').map((r) => ({ email: r.email, at: r.confirmed_at })), pending: rows.filter((r) => r.status === 'pending').length, unsubscribed: rows.filter((r) => r.status === 'unsubscribed').length };
  };
  const plots = db.prepare('SELECT id, title FROM plots WHERE owner_account = ?').all(account.id).map((p) => one('plot', p.id, p.title));
  const ads = db.prepare('SELECT id, ad, label FROM ad_slots WHERE owner_account = ? AND ad IS NOT NULL').all(account.id).map((a) => one('ad', a.id, `${JSON.parse(a.ad).headline} (${a.label})`));
  const businesses = db.prepare("SELECT id, name FROM businesses WHERE account_id = ? AND status = 'published'").all(account.id).map((b) => one('business', b.id, b.name));
  const items = [...plots, ...ads, ...businesses];
  return { items, totals: { confirmed: items.reduce((n, i) => n + i.confirmed.length, 0), pending: items.reduce((n, i) => n + i.pending, 0) } };
}

// ---- account email -------------------------------------------------------------------------------------------------------
export function setEmail(db, account, input) {
  requireAccount(account);
  if (input.notify !== undefined) db.prepare('UPDATE accounts SET notify = ? WHERE id = ?').run(input.notify ? 1 : 0, account.id);
  if (input.email !== undefined) {
    if (input.email === '' || input.email === null) db.prepare('UPDATE accounts SET email = NULL, email_verified = 0, email_token = NULL WHERE id = ?').run(account.id);
    else {
      const email = cleanEmail(input.email);
      const t = token();
      db.prepare('UPDATE accounts SET email = ?, email_verified = 0, email_token = ? WHERE id = ?').run(email, t, account.id);
      enqueue(db, { to: email, kind: 'verify', subject: 'Confirm your email for VoxelVenture', body: `Hi ${account.username},\n\nConfirm this address to get notices about your plots and ad spaces: ${base()}/me/verify?token=${t}\n\nIf you did not ask for this, ignore it.` });
    }
  }
  return { account: publicAccount(db, account.id) };
}
export function verifyEmail(db, tok) {
  return Number(db.prepare("UPDATE accounts SET email_verified = 1, email_token = NULL WHERE email_token = ? AND email_token IS NOT NULL").run(String(tok)).changes) > 0;
}

// ---- email ----------------------------------------------------------------------------------------------------------------
export function enqueue(db, { to, subject, body, kind }) {
  db.prepare('INSERT INTO outbox (to_email, subject, body, kind, created_at) VALUES (?,?,?,?,?)').run(to, subject, body, kind, now());
}
// Notices go only to a verified address whose owner has not turned notices off.
export const noticeAddress = (db, accountId) => {
  if (!accountId) return null;
  const a = db.prepare('SELECT email, email_verified, notify FROM accounts WHERE id = ?').get(accountId);
  return a?.email && a.email_verified && a.notify ? a.email : null;
};
// A take-over's payout is game value, never money (docs/monetization/takeover_payouts.md; policy_review.md gap 3): the emails say so and
// show no currency sign.
const gameValue = (n) => `${Number(n).toLocaleString('en-US')} in game value (play money: no real money is paid)`;
export function notifyTakeover(db, previousAccount, { title, newOwner, paidOut, plotId }) {
  const to = noticeAddress(db, previousAccount);
  if (to) enqueue(db, { to, kind: 'takeover', subject: `${newOwner} took over ${title}`, body: `${newOwner} took over ${title} (plot #${plotId}) ${paidOut == null ? 'after your lease ended and its grace week passed' : `and the game credited you ${gameValue(paidOut)}: 25% more than its value in the game`}.\n\nYou can claim another plot at any time. To stop notices, turn them off in your account.` });
  return Boolean(to);
}
export function notifyAdTakeover(db, previousAccount, { slot, newAdvertiser, paidOut }) {
  const to = noticeAddress(db, previousAccount);
  if (to) enqueue(db, { to, kind: 'ad_takeover', subject: `${newAdvertiser} took over your ad space`, body: `${newAdvertiser} took over the ad space "${slot}"${paidOut ? ` and the game credited you ${gameValue(paidOut)}` : ''}.\n\nYou can buy another ad space at any time.` });
  return Boolean(to);
}

// The Plot of the Day newsletter: the day's pick and the three busiest businesses, to confirmed world sign-ups and to accounts with notices on.
export function buildNewsletter(db, date = new Date()) {
  // "busiest" is verified visits in the last seven days, never the generator's starting figures
  const built = db.prepare("SELECT p.id, p.title, p.owner_name, p.website, (SELECT COUNT(*) FROM events e WHERE e.plot_id = p.id AND e.kind = 'visit' AND e.verified = 1 AND e.at >= ?) AS recent FROM plots p WHERE p.owner_name IS NOT NULL AND p.building_type IS NOT NULL AND p.building_type != 'house' ORDER BY p.id").all(date.getTime() - 7 * 86400000);
  if (!built.length) return null;
  const key = date.toISOString().slice(0, 10);
  const h = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pick = built[h % built.length];
  const top = [...built].filter((p) => p.recent > 0).sort((a, b) => b.recent - a.recent || a.id - b.id).slice(0, 3);
  const line = (p) => `  #${p.id} ${p.title} (${p.owner_name})${p.website ? ` - ${p.website}` : ''}`;
  return { key, subject: `Plot of the Day: ${pick.title}`, body: `Today's Plot of the Day: ${pick.title}\n${line(pick)}\n\nWalk in for a bonus.${top.length ? ` The busiest businesses this week:\n${top.map(line).join('\n')}` : ''}\n\nSee you in the city.` };
}
export function sendNewsletter(db, date = new Date()) {
  const n = buildNewsletter(db, date);
  if (!n) return { queued: 0 };
  if (db.prepare("SELECT 1 FROM outbox WHERE kind = 'newsletter' AND subject = ? LIMIT 1").get(n.subject) && db.prepare("SELECT 1 FROM outbox WHERE kind = 'newsletter' AND created_at > ? LIMIT 1").get(now() - 20 * 3600000)) return { queued: 0, already: true };
  const list = db.prepare("SELECT email, token FROM leads WHERE target_kind = 'world' AND status = 'confirmed'").all();
  const accounts = db.prepare('SELECT email FROM accounts WHERE email IS NOT NULL AND email_verified = 1 AND notify = 1').all().map((a) => ({ email: a.email, token: null }));
  const seen = new Set();
  let queued = 0;
  for (const r of [...list, ...accounts]) {
    if (seen.has(r.email)) continue;
    seen.add(r.email);
    enqueue(db, { to: r.email, kind: 'newsletter', subject: n.subject, body: `${n.body}${r.token ? `\n\nUnsubscribe: ${base()}/leads/unsubscribe?token=${r.token}` : '\n\nTurn these off in your account.'}` });
    queued++;
  }
  return { queued, subject: n.subject };
}

// Sending. A transport is { name, send({ to, subject, body }) }.
//   file     writes each message to MAIL_DIR (default services/api/data/outbox): for development
//   webhook  POSTs JSON { from, to, subject, text } to MAIL_WEBHOOK_URL (any mail API or relay), with MAIL_WEBHOOK_TOKEN as a bearer token
export function createTransport(env = process.env, dataDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'data')) {
  if (env.MAIL_WEBHOOK_URL) {
    return {
      name: 'webhook',
      send: async (m) => {
        const res = await fetch(env.MAIL_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.MAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.MAIL_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify({ from: env.MAIL_FROM || 'VoxelVenture <no-reply@localhost>', to: m.to, subject: m.subject, text: m.body }) });
        if (!res.ok) throw new Error(`mail webhook answered ${res.status}`);
      },
    };
  }
  const dir = env.MAIL_DIR || path.join(dataDir, 'outbox');
  return {
    name: 'file',
    send: async (m) => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`), `To: ${m.to}\nSubject: ${m.subject}\n\n${m.body}\n`);
    },
  };
}
// Sends what is waiting; a failure is retried up to three times, then kept as failed.
export async function deliverOutbox(db, transport, limit = 50) {
  const rows = db.prepare("SELECT * FROM outbox WHERE status = 'pending' ORDER BY id LIMIT ?").all(limit);
  let sent = 0;
  for (const r of rows) {
    try {
      await transport.send({ to: r.to_email, subject: r.subject, body: r.body });
      db.prepare("UPDATE outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?").run(now(), r.id);
      sent++;
    } catch (e) {
      db.prepare("UPDATE outbox SET status = ?, error = ?, attempts = attempts + 1 WHERE id = ?").run(r.attempts + 1 >= 3 ? 'failed' : 'pending', String(e.message).slice(0, 200), r.id);
    }
  }
  return { sent, tried: rows.length };
}
