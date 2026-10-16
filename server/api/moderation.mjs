import { transaction } from './db.mjs';
import { ApiError, fail, getPlot, requireAccount, text } from './core.mjs';
import { checkText } from './textcheck.mjs';
export { checkText };

// Moderation: a first filter on everything players write, reports from other players, an admin queue, and bans.
//   1. filter   screens text before it is saved (blocked words, link floods, shouting, repeated characters);
//               an image or text can also go to an outside moderation service (MODERATION_WEBHOOK_URL)
//   2. reports  any signed-in player can report feedback, a business or an ad; three different reporters hide a feedback message at once
//               (chat messages are reported through messaging.mjs; they share this queue as kinds `message` and `nearby`)
//   3. admin    GET /admin/reports and POST /admin/reports/{id}/resolve (dismiss | remove | ban) with ADMIN_TOKEN, or `npm run moderate`
//   4. bans     a banned account is signed out everywhere and cannot sign in, claim, post or buy
const now = () => Date.now();

// Screens the text fields of a request body. `spec` lists the fields and how many links each may have. Throws a 422 with a message.
export function screen(body, spec, words) {
  for (const [field, links] of Object.entries(spec)) {
    const r = checkText(body?.[field], { links, words });
    if (!r.ok) throw new ApiError(422, r.reason, 'content_rejected').withErrors({ [field]: r.reason });
  }
}

// An outside moderation service (optional): POST { kind: 'text' | 'image', text?, image? } and expect { allowed: boolean, reason? }.
// If it cannot be reached the content is allowed (a down service must not stop the game) and it is left to reports.
export async function screenWithService(body, env = process.env) {
  if (!env.MODERATION_WEBHOOK_URL) return;
  const items = [];
  for (const f of ['title', 'description', 'headline', 'tagline', 'advertiser', 'message', 'couponText']) if (body?.[f]) items.push({ kind: 'text', text: String(body[f]) });
  if (body?.logo?.kind === 'image' && body.logo.image) items.push({ kind: 'image', image: body.logo.image });
  for (const item of items) {
    let verdict = { allowed: true };
    try {
      const res = await fetch(env.MODERATION_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.MODERATION_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.MODERATION_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify(item), signal: AbortSignal.timeout(4000) });
      if (res.ok) verdict = await res.json();
    } catch {
      /* unreachable: allow, and rely on reports */
    }
    if (verdict.allowed === false) throw new ApiError(422, verdict.reason || (item.kind === 'image' ? 'That picture is not allowed.' : 'That text is not allowed here.'), 'content_rejected');
  }
}

// ---- reports ------------------------------------------------------------------------------------------------------------------
const KINDS = ['feedback', 'plot', 'ad'];
const REASONS = ['spam', 'offensive', 'misleading', 'other'];
export const AUTO_HIDE_AT = 3;

export function report(db, account, input) {
  requireAccount(account);
  const kind = KINDS.includes(input.kind) ? input.kind : fail(400, 'kind must be feedback, plot or ad.', 'bad_kind');
  const reason = REASONS.includes(input.reason) ? input.reason : 'other';
  const id = String(input.id ?? '');
  const author = target(db, kind, id).account;
  if (author === account.id) fail(409, 'You cannot report your own content.', 'own_content');
  return transaction(db, () => {
    const had = db.prepare('SELECT 1 FROM reports WHERE kind = ? AND target_id = ? AND reporter = ?').get(kind, id, account.id);
    if (had) return { reported: true, already: true };
    db.prepare('INSERT INTO reports (kind, target_id, reporter, reason, note, created_at) VALUES (?,?,?,?,?,?)').run(kind, id, account.id, reason, text(input.note, 200) || null, now());
    let hidden = false;
    if (kind === 'feedback') {
      const n = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE kind = 'feedback' AND target_id = ?").get(id).n;
      if (n >= AUTO_HIDE_AT) {
        db.prepare('UPDATE feedback SET hidden = 2 WHERE id = ? AND hidden = 0').run(Number(id));
        hidden = true;
      }
    }
    return { reported: true, already: false, hidden };
  });
}

// What a report points at, and who made it. (Chat messages are reported through messaging.mjs, which checks the reporter received them.)
function target(db, kind, id) {
  if (kind === 'message' || kind === 'nearby') {
    const m = db.prepare(`SELECT sender FROM ${kind === 'message' ? 'messages' : 'nearby_messages'} WHERE id = ?`).get(Number(id)) ?? fail(404, 'No such message.', 'no_target');
    return { account: m.sender };
  }
  if (kind === 'feedback') {
    const f = db.prepare('SELECT id, account_id, plot_id FROM feedback WHERE id = ?').get(Number(id)) ?? fail(404, 'No such message.', 'no_target');
    return { account: f.account_id, plot: f.plot_id };
  }
  if (kind === 'plot') {
    const p = getPlot(db, id);
    if (!p.owner_name) fail(404, 'There is no business here.', 'no_target');
    return { account: p.owner_account, plot: p.id };
  }
  const s = db.prepare('SELECT id, owner_account, ad FROM ad_slots WHERE id = ?').get(id) ?? fail(404, 'No such ad space.', 'no_target');
  if (!s.ad) fail(404, 'That ad space is empty.', 'no_target');
  return { account: s.owner_account, slot: s.id };
}

// ---- the admin queue ------------------------------------------------------------------------------------------------------------
// The open reports, grouped by what was reported, with what it says now.
export function queue(db, status = 'open') {
  const rows = db.prepare('SELECT kind, target_id, COUNT(*) AS n, MIN(id) AS first, GROUP_CONCAT(reason) AS reasons FROM reports WHERE status = ? GROUP BY kind, target_id ORDER BY n DESC, first').all(status);
  return rows.map((r) => {
    const t = (() => {
      try {
        return preview(db, r.kind, r.target_id);
      } catch {
        return { gone: true };
      }
    })();
    return { kind: r.kind, id: r.target_id, reports: r.n, reasons: [...new Set(String(r.reasons).split(','))], ...t };
  });
}
function preview(db, kind, id) {
  if (kind === 'message' || kind === 'nearby') {
    // what it said when it was first reported (the message itself may have expired since)
    const e = JSON.parse(db.prepare('SELECT evidence FROM reports WHERE kind = ? AND target_id = ? AND evidence IS NOT NULL ORDER BY id LIMIT 1').get(kind, String(id))?.evidence ?? 'null');
    const banned = e ? Boolean(db.prepare('SELECT banned FROM accounts WHERE id = ?').get(e.sender)?.banned) : false;
    return e ? { text: e.text ?? '(no text)', author: e.senderName, authorBanned: banned, where: kind === 'nearby' ? `nearby chat, city ${e.room}` : 'private message' } : { gone: true };
  }
  if (kind === 'feedback') {
    const f = db.prepare('SELECT f.message, f.author, f.hidden, f.plot_id, a.banned FROM feedback f JOIN accounts a ON a.id = f.account_id WHERE f.id = ?').get(Number(id));
    return f ? { text: f.message, author: f.author, plotId: f.plot_id, hidden: f.hidden > 0, authorBanned: Boolean(f.banned) } : { gone: true };
  }
  if (kind === 'plot') {
    const p = db.prepare('SELECT title, description, website, owner_name FROM plots WHERE id = ?').get(Number(id));
    return p ? { text: `${p.title}: ${p.description ?? ''} (${p.website})`, author: p.owner_name } : { gone: true };
  }
  const s = db.prepare('SELECT ad FROM ad_slots WHERE id = ?').get(id);
  const ad = s?.ad ? JSON.parse(s.ad) : null;
  return ad ? { text: `${ad.headline}: ${ad.tagline} (${ad.url})`, author: ad.advertiser } : { gone: true };
}

// dismiss: the report was wrong; remove: take the content down; ban: take it down and ban the account that made it.
export function resolve(db, reportId, action) {
  if (!['dismiss', 'remove', 'ban'].includes(action)) fail(400, 'action must be dismiss, remove or ban.', 'bad_action');
  return transaction(db, () => {
    const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(reportId)) ?? fail(404, 'No such report.', 'no_report');
    const where = db.prepare("SELECT id FROM reports WHERE kind = ? AND target_id = ? AND status = 'open'").all(r.kind, r.target_id).map((x) => x.id);
    let who = null;
    try {
      who = target(db, r.kind, r.target_id).account;
    } catch {
      /* the content is already gone */
    }
    if (action !== 'dismiss') {
      if (r.kind === 'message' || r.kind === 'nearby') db.prepare(`UPDATE ${r.kind === 'message' ? 'messages' : 'nearby_messages'} SET body = NULL, state = 'removed' WHERE id = ?`).run(Number(r.target_id));
      else if (r.kind === 'feedback') db.prepare('UPDATE feedback SET hidden = 2 WHERE id = ?').run(Number(r.target_id));
      else if (r.kind === 'plot') db.prepare("UPDATE plots SET description = NULL, logo = NULL, title = ?, website = 'https://example.com', brand = NULL, updated_at = ? WHERE id = ?").run(`Building #${r.target_id}`, now(), Number(r.target_id));
      else db.prepare('UPDATE ad_slots SET ad = NULL, owner_account = NULL, updated_at = ? WHERE id = ?').run(now(), r.target_id);
    }
    if (action === 'ban' && who) ban(db, who, `reported ${r.kind} ${r.target_id}`);
    else if (action === 'dismiss' && r.kind === 'feedback') db.prepare('UPDATE feedback SET hidden = 0 WHERE id = ? AND hidden = 2').run(Number(r.target_id));
    for (const id of where) db.prepare("UPDATE reports SET status = 'resolved', action = ?, resolved_at = ? WHERE id = ?").run(action, now(), id);
    return { resolved: where.length, action, banned: action === 'ban' && Boolean(who) };
  });
}

export function ban(db, accountId, reason = '') {
  db.prepare('UPDATE accounts SET banned = 1, ban_reason = ? WHERE id = ?').run(text(reason, 200) || null, accountId);
  db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId);
}
export function unban(db, accountId) {
  db.prepare('UPDATE accounts SET banned = 0, ban_reason = NULL WHERE id = ?').run(accountId);
}

// The id of the first open report on something (the queue groups reports; resolving one resolves them all).
export function firstReportId(db, kind, id) {
  return db.prepare("SELECT MIN(id) AS id FROM reports WHERE kind = ? AND target_id = ? AND status = 'open'").get(kind, String(id))?.id ?? fail(404, 'No open report on that.', 'no_report');
}
