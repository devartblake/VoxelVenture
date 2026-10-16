import crypto from 'node:crypto';
import { transaction } from './db.mjs';
import { ApiError, fail, requireAccount, text } from './core.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// Free business profiles, referral attribution and the owner's figures (docs/business_funnel.md). The rules (categories, districts, calls to
// action, validation, onboarding steps, upgrade prompts) are lib/business/profile.js, shared with the public pages.
//
//   profiles    any account can list up to MAX_PROFILES businesses for free; each gets a public page /business/<slug>
//   events      a profile view or a press of its call to action, verified like building visits (no bots, a per-network daily cap,
//               not the owner's own traffic, a call to action only after a view)
//   referrals   every account has a signed referral code; a link with ?ref=<code> credits the visits, presses, sign-ups and new
//               profiles it brings to that account (never an account referring itself)
//   interest    an owner asking for a paid plan before checkout exists is recorded: the demand signal for phase 4
const { cleanProfile, uniqueSlug, isSlug, isRefCode, onboardingSteps, upgradePrompts, profileReady, PLANS } = await imp('business/profile.js');

export const MAX_PROFILES = 5;
export const SOURCES = ['direct', 'search', 'social', 'referral', 'city'];
const DAY = 86400000;
const now = () => Date.now();
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|curl|wget|python-requests|preview|facebookexternalhit/i;

// ---- referral codes -------------------------------------------------------------------------------------------------------------
// "<account id in base 36>.<signature>": anyone can read whose it is, nobody can make one for another account without the secret.
const signature = (id, secret) => crypto.createHmac('sha256', secret).update(`ref:${id}`).digest('hex').slice(0, 10);
export const referralSecret = (env = process.env) => env.REFERRAL_SECRET || env.IP_SALT || 'voxelventure-referrals';
export const referralCode = (accountId, secret) => `${Number(accountId).toString(36)}.${signature(accountId, secret)}`;
// The account a code belongs to, or null when the code is malformed, forged or names no account.
export function referrerOf(db, code, secret) {
  if (!isRefCode(code)) return null;
  const [id36, sig] = String(code).split('.');
  const id = parseInt(id36, 36);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const want = signature(id, secret);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const a = db.prepare('SELECT id, banned FROM accounts WHERE id = ?').get(id);
  return a && !a.banned ? a.id : null;
}

// A new account that arrived through someone's link (called by POST /auth/signup).
export function attributeSignup(db, accountId, code, secret) {
  const by = referrerOf(db, code, secret);
  if (by && by !== accountId) db.prepare('UPDATE accounts SET referred_by = ? WHERE id = ? AND referred_by IS NULL').run(by, accountId);
}

// ---- profiles ---------------------------------------------------------------------------------------------------------------
export function profileView(row) {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    district: row.district,
    tagline: row.tagline,
    description: row.description,
    website: row.website,
    cta: JSON.parse(row.cta),
    plotId: row.plot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
const getRow = (db, slug) => (isSlug(slug) ? db.prepare("SELECT * FROM businesses WHERE slug = ? AND status = 'published'").get(String(slug)) : null) ?? fail(404, 'No such business.', 'no_business');
const ownRow = (db, account, slug) => {
  requireAccount(account);
  const row = getRow(db, slug);
  if (row.account_id !== account.id) fail(403, 'This is not your business.', 'forbidden');
  return row;
};
// cleanProfile's errors as the API's error: 400, with every field's message.
function checked(input, opts) {
  const r = cleanProfile(input, opts);
  if (!r.ok) throw new ApiError(400, Object.values(r.errors)[0], 'bad_profile').withErrors(r.errors);
  return r.value;
}

export function createProfile(db, account, input) {
  requireAccount(account);
  const v = checked({ cta: { kind: input?.website ? 'website' : 'newsletter' }, ...input }); // no call to action chosen: the website, or a newsletter without one
  return transaction(db, () => {
    const mine = db.prepare("SELECT COUNT(*) AS n FROM businesses WHERE account_id = ? AND status = 'published'").get(account.id).n;
    if (mine >= MAX_PROFILES) fail(409, `An account can list up to ${MAX_PROFILES} businesses.`, 'too_many');
    const taken = db.prepare('SELECT 1 FROM businesses WHERE slug = ?');
    const slug = uniqueSlug(v.name, (s) => Boolean(taken.get(s)));
    const referredBy = db.prepare('SELECT referred_by FROM accounts WHERE id = ?').get(account.id)?.referred_by ?? null;
    db.prepare('INSERT INTO businesses (slug, account_id, name, category, district, tagline, description, website, cta, referred_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(slug, account.id, v.name, v.category, v.district ?? null, v.tagline ?? null, v.description ?? null, v.website ?? null, JSON.stringify(v.cta), referredBy, now(), now());
    return profileView(getRow(db, slug));
  });
}

// The owner changes their profile. The slug stays (links to it keep working).
export function updateProfile(db, account, slug, input) {
  const row = ownRow(db, account, slug);
  const merged = { ...profileView(row), ...input };
  if (input.website !== undefined && input.cta === undefined && merged.cta.kind === 'website') merged.cta = { ...merged.cta, url: null };
  const v = checked(merged);
  db.prepare('UPDATE businesses SET name=?, category=?, district=?, tagline=?, description=?, website=?, cta=?, updated_at=? WHERE id=?')
    .run(v.name, v.category, v.district ?? null, v.tagline ?? null, v.description ?? null, v.website ?? null, JSON.stringify(v.cta), now(), row.id);
  return profileView(getRow(db, slug));
}

// Link (or, with plotId null, unlink) the owner's own building in the city: the profile then offers "Step inside".
export function linkPlot(db, account, slug, plotId) {
  const row = ownRow(db, account, slug);
  if (plotId == null) {
    db.prepare('UPDATE businesses SET plot_id = NULL, updated_at = ? WHERE id = ?').run(now(), row.id);
    return profileView(getRow(db, slug));
  }
  const plot = db.prepare('SELECT id, owner_account FROM plots WHERE id = ?').get(Number(plotId)) ?? fail(404, 'No such plot.', 'no_plot');
  if (plot.owner_account !== account.id) fail(403, 'You can only link a building you own.', 'forbidden');
  const other = db.prepare('SELECT slug FROM businesses WHERE plot_id = ? AND id != ?').get(plot.id, row.id);
  if (other) fail(409, 'That building is already linked to another of your profiles.', 'plot_linked');
  db.prepare('UPDATE businesses SET plot_id = ?, updated_at = ? WHERE id = ?').run(plot.id, now(), row.id);
  return profileView(getRow(db, slug));
}

export const getProfile = (db, slug) => profileView(getRow(db, slug));

// The public list: published profiles, filtered by category, district or words, newest first (or by name).
export function listProfiles(db, { category = '', district = '', q = '', sort = 'new', limit = 50, offset = 0 } = {}) {
  const where = ["status = 'published'"];
  const args = [];
  if (category) (where.push('category = ?'), args.push(String(category)));
  if (district) (where.push('district = ?'), args.push(String(district)));
  const needle = text(q, 60).toLowerCase();
  if (needle) {
    where.push("(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(tagline,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(description,'')) LIKE ? ESCAPE '\\')");
    const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like);
  }
  const order = sort === 'name' ? 'name COLLATE NOCASE, id' : 'created_at DESC, id DESC';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM businesses WHERE ${where.join(' AND ')}`).get(...args).n;
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = db.prepare(`SELECT * FROM businesses WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, n, Math.max(0, Number(offset) || 0));
  return { total, profiles: rows.map(profileView) };
}

// Every published slug with its last change, for the sitemap.
export const sitemapEntries = (db) => db.prepare("SELECT slug, updated_at AS updatedAt FROM businesses WHERE status = 'published' ORDER BY id").all();

// ---- events -----------------------------------------------------------------------------------------------------------------
// A visitor viewed a profile (sent after the page has been visible for a couple of seconds) or pressed its call to action.
// It is VERIFIED (counted) when: it is not a known bot; the visitor id is well formed; it is not the owner's own visit; the network has not
// already made `cap` of that kind for this profile today; and, for a press, the same visitor viewed the profile in the last day.
// Everything is kept for the record; a visitor repeating the same thing within a minute is one event.
export function recordProfileEvent(db, account, slug, input, ctx = {}) {
  const row = getRow(db, slug);
  const kind = ['view', 'cta'].includes(input.kind) ? input.kind : fail(400, 'kind must be view or cta.', 'bad_kind');
  const id = text(input.visitor, 40);
  const wellFormed = /^[A-Za-z0-9_-]{4,40}$/.test(id);
  const visitor = account ? `a${account.id}` : `x${wellFormed ? id : 'anonymous'}`;
  const last = db.prepare('SELECT at FROM business_events WHERE business_id = ? AND visitor = ? AND kind = ? ORDER BY id DESC LIMIT 1').get(row.id, visitor, kind);
  if (last && now() - last.at < 60000) return { counted: false };
  let ref = referrerOf(db, input.ref, ctx.secret ?? referralSecret());
  if (ref && account && ref === account.id) ref = null; // nobody is credited for their own visits
  const source = ref ? 'referral' : SOURCES.includes(input.source) ? input.source : 'direct';
  const ipHash = ctx.ip ? crypto.createHash('sha256').update(`${ctx.salt ?? 'voxelventure'}|${ctx.ip}`).digest('hex').slice(0, 16) : null;
  let verified = (account || wellFormed) && !BOT_UA.test(String(ctx.userAgent ?? '')) && !(account && account.id === row.account_id);
  if (verified && kind === 'cta') verified = Boolean(db.prepare("SELECT 1 FROM business_events WHERE business_id = ? AND visitor = ? AND kind = 'view' AND at >= ?").get(row.id, visitor, now() - DAY));
  if (verified && ipHash) {
    const cap = kind === 'cta' ? ctx.ctaCap ?? 1 : ctx.viewCap ?? 3;
    const used = db.prepare('SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = ? AND ip_hash = ? AND verified = 1 AND at >= ?').get(row.id, kind, ipHash, now() - DAY).n;
    if (used >= cap) verified = false;
  }
  db.prepare('INSERT INTO business_events (business_id, kind, source, ref_account, visitor, ip_hash, verified, at) VALUES (?,?,?,?,?,?,?,?)').run(row.id, kind, source, ref, visitor, ipHash, verified ? 1 : 0, now());
  return { counted: true, verified: Boolean(verified) };
}

// ---- the owner's view ---------------------------------------------------------------------------------------------------------
// Thirty days of verified figures for one profile. Never simulated: a profile with no visitors shows zeros.
export function profileStats(db, businessId, at = now()) {
  const since = at - 30 * DAY;
  const ev = db.prepare('SELECT kind, source, ref_account, visitor, at FROM business_events WHERE business_id = ? AND verified = 1 AND at >= ?').all(businessId, since);
  const views = ev.filter((e) => e.kind === 'view');
  const cta = ev.filter((e) => e.kind === 'cta');
  const days = Array.from({ length: 30 }, (_, k) => ({ ago: 29 - k, views: 0, cta: 0 }));
  for (const e of ev) days[29 - Math.min(29, Math.floor((at - e.at) / DAY))][e.kind === 'view' ? 'views' : 'cta']++;
  const bySource = Object.fromEntries(SOURCES.map((s) => [s, 0]));
  for (const e of views) bySource[e.source] = (bySource[e.source] ?? 0) + 1;
  const signups = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE target_kind = 'business' AND target_id = ? AND status = 'confirmed'").get(String(businessId)).n;
  return {
    simulated: false,
    verified: true,
    views: views.length,
    uniques: new Set(views.map((e) => e.visitor)).size,
    ctaClicks: cta.length,
    ctr: views.length ? cta.length / views.length : 0,
    referralVisits: views.filter((e) => e.ref_account != null).length,
    newsletterSignups: signups,
    sources: SOURCES.map((id) => ({ id, views: bySource[id] })),
    days,
  };
}

// The owner's profiles with their figures, onboarding steps and upgrade prompts, plus their referral link's results.
export function myProfiles(db, account, env = process.env) {
  requireAccount(account);
  const rows = db.prepare("SELECT * FROM businesses WHERE account_id = ? AND status = 'published' ORDER BY id").all(account.id);
  const interest = db.prepare('SELECT plan FROM upgrade_interest WHERE business_id = ?');
  return {
    referral: myReferrals(db, account, env),
    profiles: rows.map((row) => {
      const profile = profileView(row);
      const stats = profileStats(db, row.id);
      const steps = onboardingSteps(profile, stats);
      return { profile, stats, steps, ready: profileReady(steps), prompts: upgradePrompts(profile, stats).map((p) => ({ ...p, requested: interest.all(row.id).some((r) => r.plan === p.plan.id) })) };
    }),
  };
}

// What the account's referral link has brought in 30 days (visits and presses on any profile, new accounts and new profiles).
export function myReferrals(db, account, env = process.env, at = now()) {
  requireAccount(account);
  const since = at - 30 * DAY;
  const count = (sql, ...a) => db.prepare(sql).get(...a).n;
  return {
    code: referralCode(account.id, referralSecret(env)),
    visits: count("SELECT COUNT(*) AS n FROM business_events WHERE ref_account = ? AND kind = 'view' AND verified = 1 AND at >= ?", account.id, since),
    ctaClicks: count("SELECT COUNT(*) AS n FROM business_events WHERE ref_account = ? AND kind = 'cta' AND verified = 1 AND at >= ?", account.id, since),
    signups: count('SELECT COUNT(*) AS n FROM accounts WHERE referred_by = ? AND created_at >= ?', account.id, since),
    profiles: count('SELECT COUNT(*) AS n FROM businesses WHERE referred_by = ? AND created_at >= ?', account.id, since),
  };
}

// "Tell me when it is ready": an owner asks for a paid plan before checkout exists (one record per profile and plan).
export function requestUpgrade(db, account, slug, plan) {
  const row = ownRow(db, account, slug);
  if (!PLANS[plan]) fail(400, 'plan must be launch, pro or sponsored.', 'bad_plan');
  db.prepare('INSERT OR IGNORE INTO upgrade_interest (business_id, plan, account_id, at) VALUES (?,?,?,?)').run(row.id, plan, account.id, now());
  return { requested: true, plan };
}

// For the leads code: the profile (by slug) a newsletter sign-up is for, and who owns it.
export function leadTarget(db, slug) {
  const row = getRow(db, slug);
  const cta = JSON.parse(row.cta);
  return { id: row.id, name: row.name, account: row.account_id, newsletter: cta.kind === 'newsletter' };
}
