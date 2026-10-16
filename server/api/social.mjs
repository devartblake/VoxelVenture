import crypto from 'node:crypto';
import { fail } from './core.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// Welcome posts on VoxelVenture's X account (idea 02, section 5; docs/social_posts.md): when a business joins, the platform posts
// "Welcome <name> to <district>! @<handle> <link>". Only for owners who opted in (the profile's "welcome my business on X" box), so their
// handle is never posted without their say-so. The link carries utm_source=x, so the owner's figures show what the post brought.
//
//   SOCIAL_POSTS   off (default: nothing is queued) | review (an admin approves each post first) | auto (posted as they come)
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET   the X account's OAuth 1.0a keys (a developer app with write access)
//   X_API_URL      the API address (default https://api.x.com; the tests use a stand-in)
//   SOCIAL_MAX_PER_DAY   at most this many posts in 24 hours (default 20); the rest wait their turn
//   PUBLIC_SITE_URL      the site's address for the links (falls back to API_ORIGIN)
const { districtOf } = await imp('business/profile.js');
const DAY = 86400000;
const MAX_ATTEMPTS = 5;
const now = () => Date.now();

export const modeOf = (env = process.env) => (['review', 'auto'].includes(env.SOCIAL_POSTS) ? env.SOCIAL_POSTS : 'off');
const siteOf = (env) => String(env.PUBLIC_SITE_URL || env.API_ORIGIN || '').replace(/\/+$/, '');

// X counts every link as 23 characters, whatever its length.
export const xLength = (text) => [...String(text).replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length;

// The post for a business: its name, its district, the owner's handle (only if given) and the tracked link. Never over 280.
export function welcomeText({ name, district, handle, url }) {
  const where = districtOf(district)?.name;
  const tag = handle ? ` @${handle}` : '';
  let title = String(name).replace(/[@#]/g, '').trim(); // a business name cannot tag or hashtag anyone else
  const make = () => `Welcome ${title} to VoxelVenture${where ? `'s ${where}` : ''}!${tag} Step inside: ${url}`;
  while (xLength(make()) > 280 && title.length > 4) title = `${title.slice(0, -2).trimEnd()}…`;
  return make();
}
const trackedLink = (env, path) => `${siteOf(env)}${path}${path.includes('?') ? '&' : '?'}utm_source=x&utm_medium=social&utm_campaign=welcome`;

// Queue the welcome for a new profile (called after it is created). Does nothing when posting is off, the owner did not opt in, or the site
// address is unknown. Returns the post row's status or null.
export function welcomeBusiness(db, slug, env = process.env) {
  const mode = modeOf(env);
  if (mode === 'off' || !siteOf(env)) return null;
  const b = db.prepare("SELECT * FROM businesses WHERE slug = ? AND status = 'published'").get(slug);
  if (!b || !b.announce) return null;
  const text = welcomeText({ name: b.name, district: b.district, handle: b.x_handle, url: trackedLink(env, `/business/${b.slug}`) });
  const status = mode === 'review' ? 'review' : 'queued';
  const r = db.prepare('INSERT OR IGNORE INTO social_posts (kind, target_kind, target_id, account_id, text, status, created_at) VALUES (?,?,?,?,?,?,?)').run('welcome', 'business', String(b.id), b.account_id, text, status, now());
  return Number(r.changes) ? status : null;
}

// Queue the welcome for a building claimed in the 3D city, for an owner who opted in on one of their profiles (it tags that handle).
export function welcomePlot(db, plotId, accountId, env = process.env) {
  const mode = modeOf(env);
  if (mode === 'off' || !siteOf(env)) return null;
  const consent = db.prepare("SELECT x_handle FROM businesses WHERE account_id = ? AND status = 'published' AND announce = 1 ORDER BY id LIMIT 1").get(accountId);
  if (!consent) return null;
  const p = db.prepare('SELECT id, title, district FROM plots WHERE id = ? AND owner_account = ?').get(Number(plotId), accountId);
  if (!p) return null;
  const text = welcomeText({ name: p.title, district: p.district, handle: consent.x_handle, url: trackedLink(env, `/b/${p.id}`) });
  const status = mode === 'review' ? 'review' : 'queued';
  const r = db.prepare('INSERT OR IGNORE INTO social_posts (kind, target_kind, target_id, account_id, text, status, created_at) VALUES (?,?,?,?,?,?,?)').run('welcome', 'plot', String(p.id), accountId, text, status, now());
  return Number(r.changes) ? status : null;
}

// ---- the review queue ---------------------------------------------------------------------------------------------------------
const view = (r) => ({ id: r.id, kind: r.kind, target: { kind: r.target_kind, id: r.target_id }, text: r.text, status: r.status, postId: r.post_id, url: r.post_id ? `https://x.com/i/status/${r.post_id}` : null, error: r.error, attempts: r.attempts, createdAt: r.created_at, postedAt: r.posted_at });
export function list(db, status = 'review', env = process.env) {
  return { mode: modeOf(env), configured: configured(env), posts: db.prepare('SELECT * FROM social_posts WHERE status = ? ORDER BY id').all(String(status)).map(view) };
}
export function decide(db, id, action) {
  if (!['approve', 'reject'].includes(action)) fail(400, 'action must be approve or reject.', 'bad_action');
  const r = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(Number(id)) ?? fail(404, 'No such post.', 'no_post');
  if (r.status !== 'review') fail(409, `This post is ${r.status}, not waiting for review.`, 'not_in_review');
  db.prepare('UPDATE social_posts SET status = ?, decided_at = ? WHERE id = ?').run(action === 'approve' ? 'queued' : 'rejected', now(), r.id);
  return view(db.prepare('SELECT * FROM social_posts WHERE id = ?').get(r.id));
}
// The owner's view of their welcome post (on their profile page).
export function postFor(db, targetKind, targetId) {
  const r = db.prepare('SELECT * FROM social_posts WHERE target_kind = ? AND target_id = ?').get(targetKind, String(targetId));
  return r ? { status: r.status, url: r.post_id ? `https://x.com/i/status/${r.post_id}` : null } : null;
}

// ---- sending -----------------------------------------------------------------------------------------------------------------
// OAuth 1.0a (RFC 5849) with HMAC-SHA1, as the X API expects for a post made by the account's own app. The JSON body is not signed.
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function oauthHeader(method, url, keys, { nonce = crypto.randomBytes(16).toString('hex'), timestamp = Math.floor(now() / 1000) } = {}) {
  const params = { oauth_consumer_key: keys.key, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(timestamp), oauth_token: keys.token, oauth_version: '1.0' };
  const u = new URL(url);
  const all = [...Object.entries(params), ...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1));
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(all.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  const signature = crypto.createHmac('sha1', `${enc(keys.secret)}&${enc(keys.tokenSecret)}`).update(base).digest('base64');
  return `OAuth ${Object.entries({ ...params, oauth_signature: signature }).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(', ')}`;
}
const keysOf = (env) => ({ key: env.X_API_KEY, secret: env.X_API_SECRET, token: env.X_ACCESS_TOKEN, tokenSecret: env.X_ACCESS_SECRET });
export const configured = (env = process.env) => Object.values(keysOf(env)).every(Boolean);

// Sends the posts that are due, oldest first, within the daily cap. A post whose business has been taken down since is skipped.
// Failures are retried with growing waits (a minute, 4, 16...) and given up after five tries; X's own rate limit waits until it resets.
export async function deliver(db, env = process.env, fetchImpl = fetch) {
  if (modeOf(env) === 'off' || !configured(env)) return { sent: 0 };
  const cap = Number(env.SOCIAL_MAX_PER_DAY) || 20;
  let room = cap - db.prepare("SELECT COUNT(*) AS n FROM social_posts WHERE status = 'posted' AND posted_at >= ?").get(now() - DAY).n;
  const due = db.prepare("SELECT * FROM social_posts WHERE status = 'queued' AND next_at <= ? ORDER BY id LIMIT 10").all(now());
  const endpoint = `${String(env.X_API_URL || 'https://api.x.com').replace(/\/+$/, '')}/2/tweets`;
  let sent = 0;
  for (const r of due) {
    if (room <= 0) break;
    const live = r.target_kind === 'business' ? db.prepare("SELECT 1 FROM businesses WHERE id = ? AND status = 'published'").get(Number(r.target_id)) : db.prepare('SELECT 1 FROM plots WHERE id = ? AND owner_account = ?').get(Number(r.target_id), r.account_id);
    if (!live) {
      db.prepare("UPDATE social_posts SET status = 'skipped', error = 'the business is no longer listed' WHERE id = ?").run(r.id);
      continue;
    }
    let res;
    let body = null;
    try {
      res = await fetchImpl(endpoint, { method: 'POST', headers: { Authorization: oauthHeader('POST', endpoint, keysOf(env)), 'Content-Type': 'application/json' }, body: JSON.stringify({ text: r.text }), signal: AbortSignal.timeout(10000) });
      body = await res.json().catch(() => null);
    } catch (e) {
      res = { ok: false, status: 0, headers: new Headers(), error: e.message };
    }
    if (res.ok && body?.data?.id) {
      db.prepare("UPDATE social_posts SET status = 'posted', post_id = ?, posted_at = ?, error = NULL, attempts = attempts + 1 WHERE id = ?").run(String(body.data.id), now(), r.id);
      sent++;
      room--;
      continue;
    }
    const error = (res.error ?? body?.detail ?? body?.title ?? `HTTP ${res.status}`).toString().slice(0, 300);
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset')) * 1000;
      db.prepare('UPDATE social_posts SET next_at = ?, error = ? WHERE id = ?').run(reset > now() ? reset : now() + 15 * 60000, `rate limited: ${error}`, r.id);
      break;
    }
    const attempts = r.attempts + 1;
    const permanent = res.status === 400 || res.status === 403; // duplicate text, a refused post, or the app lacks write access: retrying will not help
    db.prepare('UPDATE social_posts SET status = ?, attempts = ?, next_at = ?, error = ? WHERE id = ?').run(permanent || attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts, now() + 60000 * 4 ** (attempts - 1), error, r.id);
  }
  return { sent };
}
