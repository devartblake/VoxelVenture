import crypto from 'node:crypto';
import { transaction } from './db.mjs';
import { ApiError, fail, getPlot, requireAccount } from './core.mjs';
import { screenWithService } from './moderation.mjs';
import { checkText, cleanMessage } from './textcheck.mjs';

// Messaging (docs/architecture/chat_messaging_plan.md): the API owns everything about it that lasts or needs an account.
//   tickets     a signed-in game gets a one-use ticket and hands it to the presence server, which redeems it here: that is how a
//               connection is bound to an account (the presence server never takes an account id from a client)
//   nearby      the presence server asks here before it passes a signed-in player's line on: the filter, the account's budget,
//               blocks, and a short-lived copy as evidence for reports
//   inbox       one-to-one conversations: requests, history, read positions, mute; a business inquiry is one about a building
//   blocks, reports, retention, and an outbox of "your inbox changed" notices for the presence server to deliver to one account
// Settings (environment): MESSAGING_NEARBY=0 / MESSAGING_INBOX=0 / MESSAGING_INQUIRIES=0 switch a part off (reading stays possible),
// MESSAGING_SENDS_PER_MINUTE (20), MESSAGING_NEW_PER_DAY (5, for accounts without a confirmed email), MESSAGING_NEARBY_PER_MINUTE (20),
// MESSAGING_NEARBY_DAYS (7), MESSAGING_INBOX_DAYS (90), MESSAGING_REPORT_DAYS (180).
const now = () => Date.now();
const DAY = 86400000;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const NEARBY_MAX = 140;
export const INBOX_MAX = 1000;
const TICKET_MS = 60000;
const MAX_RECIPIENTS = 200;
const PAGE = 50;

export function settingsFrom(env = process.env) {
  const n = (v, d) => (Number(v) > 0 ? Number(v) : d);
  return {
    nearby: env.MESSAGING_NEARBY !== '0',
    inbox: env.MESSAGING_INBOX !== '0',
    inquiries: env.MESSAGING_INQUIRIES !== '0',
    sendsPerMinute: n(env.MESSAGING_SENDS_PER_MINUTE, 20),
    newPerDay: n(env.MESSAGING_NEW_PER_DAY, 5),
    nearbyPerMinute: n(env.MESSAGING_NEARBY_PER_MINUTE, 20),
    nearbyDays: n(env.MESSAGING_NEARBY_DAYS, 7),
    inboxDays: n(env.MESSAGING_INBOX_DAYS, 90),
    reportDays: n(env.MESSAGING_REPORT_DAYS, 180),
  };
}

// The same refusal for "blocked", "declined" and "turned requests off", so a sender cannot tell which it was.
const notAllowed = () => fail(403, 'This message cannot be sent.', 'not_allowed');
const notFound = () => fail(404, 'No such conversation.', 'not_found');
const rateLimited = (message, retryAfterMs) => {
  const e = new ApiError(429, message, 'rate_limited');
  e.retryAfterMs = retryAfterMs;
  throw e;
};
const off = () => fail(503, 'Messages are switched off for now.', 'unavailable');

// ---- tickets: binding a presence connection to an account -----------------------------------------------------------------
function sessionAccount(db, sessionHash) {
  const s = db.prepare('SELECT s.account_id, s.expires_at, a.banned, a.username FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?').get(String(sessionHash ?? ''));
  return s && s.expires_at > now() && !s.banned ? { id: s.account_id, username: s.username } : null;
}

export function issueTicket(db, account, token) {
  requireAccount(account);
  const ticket = crypto.randomBytes(24).toString('hex');
  const expiresAt = now() + TICKET_MS;
  db.prepare('DELETE FROM messaging_tickets WHERE expires_at < ?').run(now());
  db.prepare('INSERT INTO messaging_tickets (ticket_hash, account_id, session_hash, expires_at) VALUES (?,?,?,?)').run(sha(ticket), account.id, sha(token), expiresAt);
  return { ticket, expiresAt };
}

// Used once, within a minute, and only while the sign-in it came from is still good. `binding` identifies that sign-in to the
// presence server from then on (it asks about it again every half minute: signing out or a ban ends the binding).
export function redeemTicket(db, ticket) {
  return transaction(db, () => {
    const hash = sha(ticket ?? '');
    const row = db.prepare('SELECT * FROM messaging_tickets WHERE ticket_hash = ?').get(hash);
    if (row) db.prepare('DELETE FROM messaging_tickets WHERE ticket_hash = ?').run(hash);
    const who = row && row.expires_at > now() ? sessionAccount(db, row.session_hash) : null;
    if (!who || who.id !== row.account_id) fail(401, 'That ticket is not valid.', 'unauthenticated');
    return { accountId: who.id, username: who.username, binding: row.session_hash };
  });
}

// The account a binding (a presence connection's sign-in) belongs to, or null if it has ended. For the messaging service.
export const bindingAccount = (db, binding) => sessionAccount(db, binding);

// Which of these bindings are still good (the rest are signed out, expired or banned).
export function checkBindings(db, bindings) {
  const list = (Array.isArray(bindings) ? bindings : []).slice(0, 5000).map(String);
  return { valid: list.filter((b) => sessionAccount(db, b)) };
}

// ---- blocks -----------------------------------------------------------------------------------------------------------------
// Of `others`, the accounts that `id` has blocked or that have blocked `id`.
function blockedAmong(db, id, others) {
  const ids = [...new Set(others.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== id))];
  if (!ids.length) return new Set();
  const q = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT blocked AS other FROM account_blocks WHERE blocker = ? AND blocked IN (${q}) UNION SELECT blocker AS other FROM account_blocks WHERE blocked = ? AND blocker IN (${q})`).all(id, ...ids, id, ...ids);
  return new Set(rows.map((r) => r.other));
}
const isBlocked = (db, a, b) => blockedAmong(db, a, [b]).size > 0;

function accountByRef(db, { accountId, username } = {}) {
  if (accountId != null && Number.isInteger(Number(accountId))) return db.prepare('SELECT id, username, banned, dm_requests FROM accounts WHERE id = ?').get(Number(accountId));
  if (typeof username === 'string' && username.trim()) return db.prepare('SELECT id, username, banned, dm_requests FROM accounts WHERE username = ?').get(username.trim().slice(0, 20));
  return null;
}

export function block(db, account, input) {
  requireAccount(account);
  const other = accountByRef(db, input) ?? fail(404, 'No such player.', 'no_account');
  if (other.id === account.id) fail(400, 'You cannot block yourself.', 'self');
  db.prepare('INSERT OR IGNORE INTO account_blocks (blocker, blocked, at) VALUES (?,?,?)').run(account.id, other.id, now());
  return { blocked: { id: other.id, username: other.username } };
}
export function unblock(db, account, otherId) {
  requireAccount(account);
  db.prepare('DELETE FROM account_blocks WHERE blocker = ? AND blocked = ?').run(account.id, Number(otherId));
  return { ok: true };
}

export function getSettings(db, account) {
  requireAccount(account);
  const a = db.prepare('SELECT dm_requests FROM accounts WHERE id = ?').get(account.id);
  const blocks = db.prepare('SELECT b.blocked AS id, a.username, b.at FROM account_blocks b JOIN accounts a ON a.id = b.blocked WHERE b.blocker = ? ORDER BY b.at DESC').all(account.id);
  return { requests: Boolean(a.dm_requests), blocks };
}
export function setSettings(db, account, input) {
  requireAccount(account);
  if (typeof input?.requests === 'boolean') db.prepare('UPDATE accounts SET dm_requests = ? WHERE id = ?').run(input.requests ? 1 : 0, account.id);
  return getSettings(db, account);
}

// ---- nearby -----------------------------------------------------------------------------------------------------------------
const nearbyBudget = new Map(); // account id -> the times of its recent nearby lines (every connection and tab together)

// The presence server asks before passing on a signed-in player's line: who said it (from the binding), whether it may be said,
// and which of the players in range may hear it (blocks, both ways). The line is kept a few days as evidence for reports.
export async function acceptNearby(db, input, cfg, env = process.env) {
  if (!cfg.nearby) off();
  const who = sessionAccount(db, input?.binding) ?? fail(401, 'Sign in again to chat.', 'unauthenticated');
  const said = cleanMessage(input?.text, NEARBY_MAX);
  if (!said) fail(400, 'Write something first.', 'empty');
  const verdict = checkText(said, { links: 0 });
  if (!verdict.ok) fail(422, verdict.reason, 'content_rejected');
  await screenWithService({ message: said }, env);
  const t = now();
  const recent = (nearbyBudget.get(who.id) ?? []).filter((x) => t - x < 60000);
  if (recent.length >= cfg.nearbyPerMinute) rateLimited('You are chatting very fast. Wait a moment.', 60000 - (t - recent[0]));
  recent.push(t);
  nearbyBudget.set(who.id, recent);
  const candidates = (Array.isArray(input?.recipients) ? input.recipients : []).slice(0, MAX_RECIPIENTS).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const blocked = blockedAmong(db, who.id, candidates);
  const deliverTo = [...new Set(candidates.filter((id) => !blocked.has(id)))];
  const r = db.prepare('INSERT INTO nearby_messages (sender, room, body, recipients, at) VALUES (?,?,?,?,?)').run(who.id, String(input?.room ?? '').slice(0, 40), said, JSON.stringify(deliverTo), t);
  return { messageId: `n${Number(r.lastInsertRowid)}`, text: said, at: t, accountId: who.id, username: who.username, blocked: [...blocked] };
}
setInterval(() => {
  const t = now();
  for (const [id, list] of nearbyBudget) if (!list.some((x) => t - x < 60000)) nearbyBudget.delete(id);
}, 60000).unref();

// ---- the inbox --------------------------------------------------------------------------------------------------------------
const newConversationId = () => crypto.randomBytes(12).toString('base64url');
const memberOf = (db, conversationId, accountId) => db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND account_id = ?').get(String(conversationId), accountId);
const requireMember = (db, conversationId, accountId) => memberOf(db, conversationId, accountId) ?? notFound();
const othersIn = (db, conversationId, accountId) => db.prepare('SELECT m.*, a.username, a.banned, a.dm_requests FROM conversation_members m JOIN accounts a ON a.id = m.account_id WHERE m.conversation_id = ? AND m.account_id != ?').all(conversationId, accountId);
const cleanClientId = (v) => (typeof v === 'string' && /^[\w-]{8,64}$/.test(v) ? v : fail(400, 'Each message needs its own id (8 to 64 letters, digits, - or _).', 'bad_client_id'));

async function cleanBody(input, env) {
  const body = cleanMessage(input?.text, INBOX_MAX, { lines: true });
  if (!body) fail(400, 'Write something first.', 'empty');
  const verdict = checkText(body, { links: 1 });
  if (!verdict.ok) fail(422, verdict.reason, 'content_rejected');
  await screenWithService({ message: body }, env);
  return body;
}

function messageView(row, me) {
  return { id: row.id, ref: `m${row.id}`, conversationId: row.conversation_id, sender: { id: row.sender, username: row.username ?? null }, mine: row.sender === me, text: row.state === 'ok' ? row.body : null, state: row.state, at: row.at, ...(row.sender === me ? { clientMessageId: row.client_id } : {}) };
}

function conversationView(db, row, me) {
  const mine = memberOf(db, row.id, me);
  const [other] = othersIn(db, row.id, me);
  const last = row.last_message_id ? db.prepare('SELECT m.*, a.username FROM messages m JOIN accounts a ON a.id = m.sender WHERE m.id = ?').get(row.last_message_id) : null;
  const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND id > ? AND sender != ?').get(row.id, mine.last_read, me).n;
  const sentByMe = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender = ?').get(row.id, me).n;
  const blocked = other ? isBlocked(db, me, other.id) : false;
  return {
    id: row.id,
    kind: row.kind,
    other: other ? { id: other.account_id, username: other.username } : null,
    plot: row.plot_id ? { id: row.plot_id, title: row.plot_title, youOwnedIt: row.owner_account === me } : null,
    status: mine.status,
    // a request I sent that they have not answered: one message until they do (a decline looks the same as no answer)
    waiting: Boolean(other && other.status !== 'accepted' && sentByMe > 0),
    muted: Boolean(mine.muted),
    lastRead: mine.last_read,
    unread,
    blocked,
    lastAt: row.last_at,
    lastMessage: last ? { ...messageView(last, me), text: last.state === 'ok' ? last.body.slice(0, 120) : null } : null,
  };
}

// What needs attention: unread messages in accepted conversations, and requests waiting for an answer.
export function summary(db, account) {
  requireAccount(account);
  const unread = db.prepare("SELECT COUNT(*) AS n FROM conversation_members cm JOIN messages m ON m.conversation_id = cm.conversation_id WHERE cm.account_id = ? AND cm.status = 'accepted' AND m.id > cm.last_read AND m.sender != ?").get(account.id, account.id).n;
  const requests = db.prepare("SELECT COUNT(*) AS n FROM conversation_members WHERE account_id = ? AND status = 'pending'").get(account.id).n;
  return { unread, requests };
}

// box: inbox (accepted) | requests (waiting for me). Newest first; `cursor` is the last item's lastMessageId from the previous page.
export function listConversations(db, account, { box = 'inbox', cursor, limit } = {}) {
  requireAccount(account);
  const status = box === 'requests' ? 'pending' : 'accepted';
  const n = Math.max(1, Math.min(PAGE, Number(limit) || 30));
  const before = Number(cursor) > 0 ? Number(cursor) : Number.MAX_SAFE_INTEGER;
  const rows = db.prepare('SELECT c.* FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id WHERE m.account_id = ? AND m.status = ? AND c.last_message_id < ? ORDER BY c.last_message_id DESC LIMIT ?').all(account.id, status, before, n);
  const conversations = rows.map((r) => conversationView(db, r, account.id));
  return { conversations, nextCursor: rows.length === n ? rows[rows.length - 1].last_message_id : null, ...summary(db, account) };
}

export function getConversation(db, account, id) {
  requireAccount(account);
  requireMember(db, id, account.id);
  return conversationView(db, db.prepare('SELECT * FROM conversations WHERE id = ?').get(String(id)), account.id);
}

// A page of messages, oldest first: the newest `limit`, or those before / after a message id (one or the other, not both).
export function listMessages(db, account, id, { before, after, limit } = {}) {
  requireAccount(account);
  requireMember(db, id, account.id);
  if (before != null && after != null) fail(400, 'Ask for messages before or after one, not both.', 'bad_cursor');
  const n = Math.max(1, Math.min(PAGE, Number(limit) || PAGE));
  const sel = 'SELECT m.*, a.username FROM messages m JOIN accounts a ON a.id = m.sender WHERE m.conversation_id = ?';
  let rows;
  if (after != null) rows = db.prepare(`${sel} AND m.id > ? ORDER BY m.id ASC LIMIT ?`).all(String(id), Number(after) || 0, n + 1);
  else rows = db.prepare(`${sel} AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(String(id), Number(before) > 0 ? Number(before) : Number.MAX_SAFE_INTEGER, n + 1).reverse();
  const more = rows.length > n;
  if (more) rows = after != null ? rows.slice(0, n) : rows.slice(1);
  return { messages: rows.map((r) => messageView(r, account.id)), more };
}

// Writes one message (inside a transaction) and queues a notice for every member. Returns { message, duplicate }.
function insertMessage(db, conversationId, senderId, clientId, body, members) {
  const t = now();
  const r = db.prepare('INSERT INTO messages (conversation_id, sender, client_id, body, at) VALUES (?,?,?,?,?)').run(conversationId, senderId, clientId, body, t);
  const id = Number(r.lastInsertRowid);
  db.prepare('UPDATE conversations SET last_message_id = ?, last_at = ? WHERE id = ?').run(id, t, conversationId);
  db.prepare('UPDATE conversation_members SET last_read = ? WHERE conversation_id = ? AND account_id = ?').run(id, conversationId, senderId); // you have read what you wrote
  enqueue(db, members, { type: 'inbox.changed', conversationId });
  return db.prepare('SELECT m.*, a.username FROM messages m JOIN accounts a ON a.id = m.sender WHERE m.id = ?').get(id);
}

// A retry of a message already saved (same client id) gets the saved one back; the same id for different words is refused.
function earlier(db, senderId, clientId, conversationId, body) {
  const row = db.prepare('SELECT m.*, a.username FROM messages m JOIN accounts a ON a.id = m.sender WHERE m.sender = ? AND m.client_id = ?').get(senderId, clientId);
  if (!row) return null;
  if ((conversationId && row.conversation_id !== conversationId) || row.body !== body) fail(409, 'That message id was already used for another message.', 'id_reused');
  return row;
}

function sendBudget(db, senderId, cfg) {
  const t = now();
  const rows = db.prepare('SELECT at FROM messages WHERE sender = ? AND at > ? ORDER BY at').all(senderId, t - 60000);
  if (rows.length >= cfg.sendsPerMinute) rateLimited('You are sending messages very fast. Wait a moment.', 60000 - (t - rows[0].at));
}

// New conversations a day for an account without a confirmed email (spam is cheap; a confirmed address is not).
function newContactBudget(db, account, cfg) {
  if (db.prepare('SELECT email_verified FROM accounts WHERE id = ?').get(account.id)?.email_verified) return;
  const n = db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE created_by = ? AND created_at > ?').get(account.id, now() - DAY).n;
  if (n >= cfg.newPerDay) rateLimited(`You can start ${cfg.newPerDay} new conversations a day until you confirm your email (Account).`, DAY);
}

export async function sendMessage(db, account, conversationId, input, cfg, env = process.env) {
  requireAccount(account);
  if (!cfg.inbox) off();
  const id = String(conversationId);
  const clientId = cleanClientId(input?.clientMessageId);
  const body = await cleanBody(input, env);
  return transaction(db, () => {
    const mine = requireMember(db, id, account.id);
    const again = earlier(db, account.id, clientId, id, body);
    if (again) return { message: messageView(again, account.id), duplicate: true };
    const others = othersIn(db, id, account.id);
    if (others.some((o) => o.banned || isBlocked(db, account.id, o.account_id))) notAllowed();
    if (others.some((o) => o.status === 'declined')) notAllowed();
    if (others.some((o) => o.status === 'pending') && db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender = ?').get(id, account.id).n > 0) fail(409, 'They have not accepted your message yet. You can send more once they do.', 'request_pending');
    sendBudget(db, account.id, cfg);
    if (mine.status !== 'accepted') db.prepare("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = ? AND account_id = ?").run(id, account.id); // replying accepts a request
    const row = insertMessage(db, id, account.id, clientId, body, [account.id, ...others.map((o) => o.account_id)]);
    return { message: messageView(row, account.id), duplicate: false };
  });
}

// Starts (or continues) a conversation with another player: { accountId | username, text, clientMessageId }. A first message is a
// request: it waits in their Requests until they accept, decline or reply.
export async function startDirect(db, account, input, cfg, env = process.env) {
  requireAccount(account);
  if (!cfg.inbox) off();
  const clientId = cleanClientId(input?.clientMessageId);
  const body = await cleanBody(input, env);
  const to = accountByRef(db, input);
  if (to && to.id === account.id) fail(400, 'That is you.', 'self');
  if (!to || to.banned) notAllowed();
  const key = [account.id, to.id].sort((a, b) => a - b).join(':');
  const existing = db.prepare('SELECT id FROM conversations WHERE pair_key = ?').get(key);
  if (existing) {
    const out = await sendMessage(db, account, existing.id, { text: body, clientMessageId: clientId }, cfg, env);
    return { conversation: getConversation(db, account, existing.id), ...out };
  }
  return transaction(db, () => {
    const again = earlier(db, account.id, clientId, null, body);
    if (again) return { conversation: conversationView(db, db.prepare('SELECT * FROM conversations WHERE id = ?').get(again.conversation_id), account.id), message: messageView(again, account.id), duplicate: true };
    if (isBlocked(db, account.id, to.id) || !to.dm_requests) notAllowed();
    newContactBudget(db, account, cfg);
    sendBudget(db, account.id, cfg);
    const id = newConversationId();
    const t = now();
    db.prepare("INSERT INTO conversations (id, kind, pair_key, created_by, created_at, last_at) VALUES (?, 'direct', ?, ?, ?, ?)").run(id, key, account.id, t, t);
    db.prepare("INSERT INTO conversation_members (conversation_id, account_id, status) VALUES (?, ?, 'accepted'), (?, ?, 'pending')").run(id, account.id, id, to.id);
    const row = insertMessage(db, id, account.id, clientId, body, [account.id, to.id]);
    return { conversation: conversationView(db, db.prepare('SELECT * FROM conversations WHERE id = ?').get(id), account.id), message: messageView(row, account.id), duplicate: false };
  });
}

// A message to whoever owns a building now. The conversation belongs to the two people in it: if the building changes hands, the new
// owner gets new inquiries only, never the old ones. Asking again about the same building to the same owner continues the thread.
export async function startInquiry(db, account, plotId, input, cfg, env = process.env) {
  requireAccount(account);
  if (!cfg.inbox || !cfg.inquiries) off();
  const clientId = cleanClientId(input?.clientMessageId);
  const body = await cleanBody(input, env);
  const plot = getPlot(db, plotId);
  return transaction(db, () => {
    const owner = db.prepare('SELECT owner_account, title FROM plots WHERE id = ?').get(plot.id); // read again inside the transaction: a take-over may have just happened
    if (!owner.owner_account) fail(409, 'Nobody owns this building, so there is nobody to message.', 'no_owner');
    if (owner.owner_account === account.id) fail(400, 'This is your own building.', 'self');
    const again = earlier(db, account.id, clientId, null, body);
    if (again) return { conversation: conversationView(db, db.prepare('SELECT * FROM conversations WHERE id = ?').get(again.conversation_id), account.id), message: messageView(again, account.id), duplicate: true };
    const to = db.prepare('SELECT id, banned FROM accounts WHERE id = ?').get(owner.owner_account);
    if (to.banned || isBlocked(db, account.id, to.id)) notAllowed();
    const thread = db.prepare("SELECT c.id FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.account_id = ? WHERE c.kind = 'business_inquiry' AND c.created_by = ? AND c.plot_id = ? AND c.owner_account = ?").get(to.id, account.id, plot.id, to.id);
    let id = thread?.id;
    if (id) {
      const them = memberOf(db, id, to.id);
      if (them.status === 'declined') notAllowed();
      if (them.status === 'pending') fail(409, 'The owner has not answered your last message yet.', 'request_pending');
      if (memberOf(db, id, account.id).status !== 'accepted') db.prepare("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = ? AND account_id = ?").run(id, account.id);
    } else {
      newContactBudget(db, account, cfg);
      id = newConversationId();
      const t = now();
      db.prepare("INSERT INTO conversations (id, kind, plot_id, plot_title, owner_account, created_by, created_at, last_at) VALUES (?, 'business_inquiry', ?, ?, ?, ?, ?, ?)").run(id, plot.id, owner.title, to.id, account.id, t, t);
      db.prepare("INSERT INTO conversation_members (conversation_id, account_id, status) VALUES (?, ?, 'accepted'), (?, ?, 'pending')").run(id, account.id, id, to.id);
    }
    sendBudget(db, account.id, cfg);
    const row = insertMessage(db, id, account.id, clientId, body, [account.id, to.id]);
    return { conversation: conversationView(db, db.prepare('SELECT * FROM conversations WHERE id = ?').get(id), account.id), message: messageView(row, account.id), duplicate: false };
  });
}

// Accept or decline a request. A decline is not announced to the sender (they just see no answer).
export function respond(db, account, id, action) {
  requireAccount(account);
  if (!['accept', 'decline'].includes(action)) fail(400, 'action must be accept or decline.', 'bad_action');
  return transaction(db, () => {
    const mine = requireMember(db, id, account.id);
    const status = action === 'accept' ? 'accepted' : 'declined';
    if (mine.status !== status) {
      db.prepare('UPDATE conversation_members SET status = ? WHERE conversation_id = ? AND account_id = ?').run(status, String(id), account.id);
      enqueue(db, action === 'accept' ? [account.id, ...othersIn(db, String(id), account.id).map((o) => o.account_id)] : [account.id], { type: 'inbox.changed', conversationId: String(id) });
    }
    return getConversation(db, account, id);
  });
}

// I have seen everything up to this message. Never moves backwards, and never past the newest message.
export function markRead(db, account, id, upTo) {
  requireAccount(account);
  const mine = requireMember(db, id, account.id);
  const newest = db.prepare('SELECT last_message_id FROM conversations WHERE id = ?').get(String(id)).last_message_id;
  const to = Math.min(Math.max(0, Number(upTo) || 0), newest);
  if (to > mine.last_read) {
    transaction(db, () => {
      db.prepare('UPDATE conversation_members SET last_read = ? WHERE conversation_id = ? AND account_id = ? AND last_read < ?').run(to, String(id), account.id, to);
      enqueue(db, [account.id], { type: 'inbox.changed', conversationId: String(id) }); // my other tabs and devices update their counts
    });
  }
  return { lastRead: Math.max(mine.last_read, to), ...summary(db, account) };
}

export function setPreferences(db, account, id, input) {
  requireAccount(account);
  requireMember(db, id, account.id);
  if (typeof input?.muted === 'boolean') db.prepare('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND account_id = ?').run(input.muted ? 1 : 0, String(id), account.id);
  return getConversation(db, account, id);
}

// ---- reports ----------------------------------------------------------------------------------------------------------------
const CATEGORIES = ['spam', 'offensive', 'misleading', 'other'];

// Report a message by its server id ("m12" in the inbox, "n34" nearby). Only someone who received it can, and what it said is
// copied into the report from the server's own record (never from the client).
export function reportMessage(db, account, input) {
  requireAccount(account);
  const ref = String(input?.messageId ?? '');
  const reason = CATEGORIES.includes(input?.category) ? input.category : 'other';
  let kind;
  let id;
  let evidence;
  if (/^m\d+$/.test(ref)) {
    kind = 'message';
    id = Number(ref.slice(1));
    const m = db.prepare('SELECT m.*, a.username FROM messages m JOIN accounts a ON a.id = m.sender WHERE m.id = ?').get(id);
    if (!m || !memberOf(db, m.conversation_id, account.id)) fail(404, 'No such message.', 'no_target');
    if (m.sender === account.id) fail(409, 'You cannot report your own message.', 'own_content');
    evidence = { conversationId: m.conversation_id, sender: m.sender, senderName: m.username, text: m.body, at: m.at };
  } else if (/^n\d+$/.test(ref)) {
    kind = 'nearby';
    id = Number(ref.slice(1));
    const m = db.prepare('SELECT n.*, a.username FROM nearby_messages n JOIN accounts a ON a.id = n.sender WHERE n.id = ?').get(id);
    if (!m || !JSON.parse(m.recipients).includes(account.id)) fail(404, 'No such message.', 'no_target');
    if (m.sender === account.id) fail(409, 'You cannot report your own message.', 'own_content');
    evidence = { room: m.room, sender: m.sender, senderName: m.username, text: m.body, at: m.at };
  } else fail(400, 'messageId must be a server message id.', 'bad_message_id');
  const had = db.prepare('SELECT 1 FROM reports WHERE kind = ? AND target_id = ? AND reporter = ?').get(kind, String(id), account.id);
  if (had) return { reported: true, already: true };
  db.prepare('INSERT INTO reports (kind, target_id, reporter, reason, note, evidence, created_at) VALUES (?,?,?,?,?,?,?)').run(kind, String(id), account.id, reason, typeof input?.note === 'string' ? cleanMessage(input.note, 200) || null : null, JSON.stringify(evidence), now());
  return { reported: true, already: false };
}

// ---- notices for one account (the outbox) ----------------------------------------------------------------------------------------
function enqueue(db, accountIds, event) {
  const t = now();
  const ins = db.prepare('INSERT INTO messaging_outbox (account_id, event, next_at, created_at) VALUES (?,?,?,?)');
  for (const id of new Set(accountIds)) ins.run(id, JSON.stringify(event), t, t);
}

// Hands the waiting notices to the presence server (POST <MP_NOTIFY_URL without /notify>/notify-accounts), which passes each one only to
// that account's own connections. A notice is only a nudge to fetch: the messages themselves are always read from here. Without a
// presence server the notices are dropped (the game polls instead).
let delivering = false;
export async function deliverNotices(db, env = process.env) {
  if (delivering) return { sent: 0 };
  delivering = true;
  try {
    const t = now();
    if (!env.MP_NOTIFY_URL) {
      db.prepare("UPDATE messaging_outbox SET status = 'sent' WHERE status = 'pending'").run();
      return { sent: 0 };
    }
    const rows = db.prepare("SELECT * FROM messaging_outbox WHERE status = 'pending' AND next_at <= ? ORDER BY id LIMIT 200").all(t);
    if (!rows.length) return { sent: 0 };
    const url = env.MP_NOTIFY_URL.replace(/\/notify\/?$/, '') + '/notify-accounts';
    let ok = false;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notify-Secret': env.MP_NOTIFY_SECRET || '' }, body: JSON.stringify({ events: rows.map((r) => ({ account: r.account_id, event: { ...JSON.parse(r.event), eventId: String(r.id) } })) }), signal: AbortSignal.timeout(4000) });
      ok = res.ok;
    } catch {
      /* the presence server is down: try again later */
    }
    const done = db.prepare("UPDATE messaging_outbox SET status = 'sent' WHERE id = ?");
    const retry = db.prepare("UPDATE messaging_outbox SET attempts = attempts + 1, next_at = ?, status = CASE WHEN attempts + 1 >= 8 THEN 'dead' ELSE 'pending' END WHERE id = ?");
    for (const r of rows) (ok ? done.run(r.id) : retry.run(t + Math.min(60000, 1000 * 2 ** r.attempts), r.id));
    return { sent: ok ? rows.length : 0 };
  } finally {
    delivering = false;
  }
}

// ---- retention --------------------------------------------------------------------------------------------------------------------
// Nearby lines are wiped after a week, inbox messages after 90 days, report evidence 180 days after the report is closed; anything
// under an open report is kept until it is decided. Spent tickets and delivered notices go after a day.
export function prune(db, cfg, at = now()) {
  const held = (kind) => `SELECT target_id FROM reports WHERE kind = '${kind}' AND status = 'open'`;
  const nearby = db.prepare(`UPDATE nearby_messages SET body = NULL, state = 'expired' WHERE state = 'ok' AND at < ? AND CAST(id AS TEXT) NOT IN (${held('nearby')})`).run(at - cfg.nearbyDays * DAY).changes;
  db.prepare(`DELETE FROM nearby_messages WHERE at < ? AND CAST(id AS TEXT) NOT IN (SELECT target_id FROM reports WHERE kind = 'nearby')`).run(at - (cfg.nearbyDays + 30) * DAY);
  const inbox = db.prepare(`UPDATE messages SET body = NULL, state = 'expired' WHERE state = 'ok' AND at < ? AND CAST(id AS TEXT) NOT IN (${held('message')})`).run(at - cfg.inboxDays * DAY).changes;
  const evidence = db.prepare("UPDATE reports SET evidence = NULL WHERE evidence IS NOT NULL AND status = 'resolved' AND resolved_at < ?").run(at - cfg.reportDays * DAY).changes;
  db.prepare("DELETE FROM messaging_outbox WHERE status != 'pending' AND created_at < ?").run(at - DAY);
  db.prepare('DELETE FROM messaging_tickets WHERE expires_at < ?').run(at);
  return { nearby, inbox, evidence };
}
