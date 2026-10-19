// The VoxelVenture API: accounts, plots, claiming, events and statistics (see docs/architecture/backend.md).
//
//   node --experimental-sqlite services/api/server.mjs            (npm run api)
//
//   API_PORT      port to listen on                     (default 3002)
//   API_HOST      address to listen on                  (default: every interface; use 127.0.0.1 behind a reverse proxy)
//   API_DB        database file, or :memory:            (default services/api/data/voxelventure.db)
//   API_SEED      the world's seed                      (default 20260101)
//   API_ORIGIN    the web app's origin for CORS         (default *: set it in production)
//   PUBLIC_API_URL  the address in email links          (default http://localhost:<port>)
//   MAIL_WEBHOOK_URL / MAIL_WEBHOOK_TOKEN / MAIL_FROM   send email through a mail API; without it, messages are written to MAIL_DIR
//   MP_NOTIFY_URL / MP_NOTIFY_SECRET   tell the presence server to push changes to every player instantly
//   ADMIN_TOKEN   lets POST /admin/newsletter send the Plot of the Day newsletter
//   HUMAN_MIN_AGE_MS / HUMAN_VISIT_CAP / HUMAN_CLICK_CAP / IP_SALT / TRUST_PROXY   the proof-of-human rules for visits and clicks (defaults: 3000 ms of presence first, 3 visits and 1 click per network per building per day)
//   STATS_TZ_OFFSET_MIN   the time zone of "yesterday" in the statistics, in minutes from UTC (default 0)
//   MESSAGING_*   chat and messages: switches and limits (see services/api/messaging.mjs). The presence server reaches the /internal/messaging
//                 routes with MP_NOTIFY_SECRET, the secret the two servers already share.
//   MESSAGING_SERVICE_URL   the Python messaging service (services/messaging, docs/architecture/node_fastapi_architecture_plan.md). When set, this API
//                 forwards the messaging routes there and stops writing, notifying and pruning messages itself; accounts, sessions,
//                 tickets and plots stay here, and the service asks about them through /internal/identity and /internal/plots.
//   NODE_ENV=production (or API_STRICT=1)  refuse to start with unsafe settings (services/api/config.mjs)
//   INTERNAL_SECRET  the credential the messaging service and this API use with each other (needed with MESSAGING_SERVICE_URL)
//   STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / PUBLIC_SITE_URL / TERMS_URL   payments through Stripe Checkout (services/api/billing.mjs)
//   SOCIAL_POSTS / X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET / PUBLIC_SITE_URL   welcome posts on X (services/api/social.mjs)
//   REFERRAL_SECRET  signs referral codes (?ref= links, services/api/business.mjs). Set it in production; changing it voids every shared link
//   PROFILE_VIEW_CAP / PROFILE_CTA_CAP   verified profile views and call-to-action presses per network per profile per day (defaults 3 and 1)
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import * as core from './core.mjs';
import * as engage from './engage.mjs';
import * as mod from './moderation.mjs';
import * as market from './market.mjs';
import * as stats from './stats.mjs';
import * as community from './community.mjs';
import * as messaging from './messaging.mjs';
import * as business from './business.mjs';
import * as auditLog from './audit.mjs';
import * as social from './social.mjs';
import * as billing from './billing.mjs';
import * as conversions from './conversions.mjs';
import * as pilot from './pilot.mjs';
import * as interiors from './interiors.mjs';
import * as economy from './economy.mjs';
import { dryRun, transaction } from './db.mjs';
import { checkApiEnv, isProduction } from './config.mjs';
import { createReporter } from '../../lib/net/sentry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApi({ dbFile = ':memory:', seed = 20260101, origin = '*', rate = { perMinute: 240, authPerMinute: 20 }, transport = null, deliverEveryMs = 5000, env = process.env } = {}) {
  const db = openDb(dbFile);
  const seeded = core.seedWorld(db, seed);
  const adsSeeded = core.seedAds(db, seed);
  const brandsSeeded = engage.seedBrands(db, seed);
  const mail = transport ?? engage.createTransport(env);
  // unexpected errors (the 500s) go to Sentry when SENTRY_DSN is set (deploy/MONITORING.md)
  const reporter = createReporter({ dsn: env.SENTRY_DSN, service: 'api', environment: env.SENTRY_ENVIRONMENT, release: env.SENTRY_RELEASE });
  const deliver = () => engage.deliverOutbox(db, mail).catch(() => {});
  const noticeTimer = deliverEveryMs > 0 ? setInterval(() => { try { market.sendNotices(db); community.sendLeaseNotices(db); } catch { /* the next minute tries again */ } }, 60000) : null;
  noticeTimer?.unref();
  // the plot economy's data (economy.mjs): foot traffic is counted in memory and written once a minute; run-out claim holds and watchers' emails too
  const traffic = economy.createTraffic({ salt: env.IP_SALT });
  const economyTimer = deliverEveryMs > 0 ? setInterval(() => { try { traffic.flush(db); economy.sweepHolds(db); economy.sendWatchNotices(db); } catch (e) { console.error('economy:', e.message); } }, 60000) : null;
  economyTimer?.unref();
  const chat = messaging.settingsFrom(env);
  // With the messaging service set up, messages are its business alone: this API forwards the routes and runs none of the jobs,
  // so the two never both send the same notice or prune the same data.
  const messagingService = (env.MESSAGING_SERVICE_URL || '').replace(/\/+$/, '');
  const pruneTimer = deliverEveryMs > 0 ? setInterval(() => { try { stats.prunePresence(db); conversions.pruneInquiries(db, env.INQUIRY_DAYS); economy.pruneEconomy(db); if (!messagingService) messaging.prune(db, chat); } catch { /* the next hour tries again */ } }, 3600000) : null;
  pruneTimer?.unref();
  // "your inbox changed" notices go to the presence server as soon as they are written, and again every two seconds for any that failed
  const notices = () => (messagingService ? Promise.resolve() : messaging.deliverNotices(db, env)).catch(() => {});
  const noticeTimer2 = deliverEveryMs > 0 && !messagingService ? setInterval(notices, 2000) : null;
  noticeTimer2?.unref();
  const mailTimer = deliverEveryMs > 0 ? setInterval(deliver, deliverEveryMs) : null;
  mailTimer?.unref();
  // welcome posts on X (social.mjs): sent once a minute, and at once after one is queued or approved
  const postSocial = () => social.deliver(db, env).catch((e) => console.error('social posts:', e.message));
  const socialTimer = deliverEveryMs > 0 ? setInterval(postSocial, 60000) : null;
  socialTimer?.unref();
  // billing (billing.mjs): ask Stripe about pending orders and running Pro plans every hour, so a lost webhook is caught
  const reconcileBilling = () => billing.reconcile(db, env, fetch, afterPaid).catch((e) => console.error('billing reconcile:', e.message));
  const billingTimer = deliverEveryMs > 0 && billing.billingOn(env) ? setInterval(reconcileBilling, 3600000) : null;
  billingTimer?.unref();
  // tell the presence server something changed, so every player's game refreshes at once (fire and forget)
  const push = (kind, ids = []) => {
    if (!env.MP_NOTIFY_URL) return;
    fetch(env.MP_NOTIFY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notify-Secret': env.MP_NOTIFY_SECRET || '' }, body: JSON.stringify({ kind, ids }) }).catch(() => {});
  };  // a paid lease or stall has just been carried out (billing.mjs): tell the other players, and send what the free version sends at once
  const afterPaid = (f) => {
    economy.onFulfilled(db, f); // a paid claim or take-over is a step of the plot economy's data
    if (f.kind === 'market') push('market', [f.stallId]);
    else {
      push('plot', [f.plotId]);
      if (f.action === 'claim' && social.welcomePlot(db, f.plotId, f.accountId, env)) setImmediate(postSocial);
      if (f.action === 'takeover') engage.notifyTakeover(db, f.out.previousAccount, { title: f.out.plot.title, newOwner: f.out.plot.owner, paidOut: null, plotId: f.out.plot.id });
    }
    deliver();
  };

  // the visitor's address: behind Caddy (TRUST_PROXY=1) every connection comes from 127.0.0.1, so it is the first X-Forwarded-For entry
  const clientIp = (req) => (env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';
  const hits = new Map(); // ip -> { start, n, auth }

  const limited = (ip, auth) => {
    const t = Date.now();
    let h = hits.get(ip);
    if (!h || t - h.start > 60000) hits.set(ip, (h = { start: t, n: 0, auth: 0 }));
    h.n++;
    if (auth) h.auth++;
    return h.n > rate.perMinute || h.auth > rate.authPerMinute;
  };
  setInterval(() => { for (const [ip, h] of hits) if (Date.now() - h.start > 60000) hits.delete(ip); }, 60000).unref();

  // a request's JSON body, at most `max` bytes (a redesigned interior may be larger than anything else: interiors.mjs)
  const body = (req, max = 150_000) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > max) {
          reject(new core.ApiError(413, 'That is too large.', 'too_large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
        } catch {
          reject(new core.ApiError(400, 'The body is not valid JSON.', 'bad_json'));
        }
      });
      req.on('error', reject);
    });

  const page = (ok, good, bad) => ({ __html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VoxelVenture</title><body style="font-family:system-ui;background:#050816;color:#f8fafc;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>${ok ? good : 'Something is wrong'}</h1>${ok ? '' : `<p>${bad}</p>`}<p style="color:#94a3b8">You can close this tab.</p></div>` });

  // Everything a player writes is checked before it is saved: the word filter, then (if one is set up) the outside moderation service.
  async function screened(req, spec) {
    const b = await body(req);
    mod.screen(b, spec);
    await mod.screenWithService(b, env);
    return b;
  }
  // what verifying a visitor's event needs: their network (hashed), their browser, and the caps (business.mjs, conversions.mjs)
  const visitCtx = (req) => ({
    ip: clientIp(req),
    userAgent: req.headers['user-agent'],
    salt: env.IP_SALT,
    secret: business.referralSecret(env),
    viewCap: env.PROFILE_VIEW_CAP ? Number(env.PROFILE_VIEW_CAP) : undefined,
    ctaCap: env.PROFILE_CTA_CAP ? Number(env.PROFILE_CTA_CAP) : undefined,
  });
  // what verifying a step of the plot economy's data needs (economy.mjs): as a visit, a few seconds of presence first
  const intentCtx = (req) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'], salt: env.IP_SALT, minAgeMs: env.HUMAN_MIN_AGE_MS != null ? Number(env.HUMAN_MIN_AGE_MS) : undefined });
  const BUSINESS = { title: 0, description: 1, website: 1 };
  const PROFILE = { name: 0, tagline: 0, description: 1 };
  const adminOnly = (token) => {
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) throw new core.ApiError(403, 'Not allowed.', 'forbidden');
  };
  // the presence server's own calls (redeeming a ticket, a nearby line, checking sign-ins): only with the shared secret
  const internalOnly = (req) => {
    if (!env.MP_NOTIFY_SECRET || req.headers['x-internal-secret'] !== env.MP_NOTIFY_SECRET) throw new core.ApiError(403, 'Not allowed.', 'forbidden');
  };
  const written = (out) => (setImmediate(notices), out);
  // the messaging service's own calls (who is signed in, who owns a building, a ban): only with INTERNAL_SECRET
  const serviceOnly = (req) => {
    if (!env.INTERNAL_SECRET || req.headers['x-internal-secret'] !== env.INTERNAL_SECRET) throw new core.ApiError(403, 'Not allowed.', 'forbidden');
  };
  // A change and its audit record in one transaction (audit.mjs): if either fails, neither happens.
  const A = auditLog;
  const logged = (actor, action, target, fn, detail = null) =>
    transaction(db, () => {
      const out = fn();
      A.audit(db, typeof actor === 'function' ? actor(out) : actor, action, typeof target === 'function' ? target(out) : target, detail ? detail(out) : null);
      return out;
    });
  const identityView = (a) => ({ id: a.id, username: a.username, banned: Boolean(a.banned), emailVerified: Boolean(a.email_verified) });

  // Routes that belong to the messaging service when there is one. /messaging/ticket stays here: tickets are part of signing in.
  const MESSAGING_ROUTE = /^\/(conversations(\/.*)?|messaging\/(?!ticket$).+|plots\/\d+\/inquiries|internal\/messaging\/nearby)$/;
  // Passes a request on to the messaging service unchanged (the caller's own sign-in goes with it; the service checks it with us).
  async function forward(req, res, url, headers) {
    const internal = url.pathname.startsWith('/internal/');
    if (internal && (!env.MP_NOTIFY_SECRET || req.headers['x-internal-secret'] !== env.MP_NOTIFY_SECRET)) throw new core.ApiError(403, 'Not allowed.', 'forbidden');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const ip = clientIp(req);
    let out;
    try {
      out = await fetch(messagingService + url.pathname + url.search, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, 'X-Internal-Secret': env.INTERNAL_SECRET || '', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      res.writeHead(503, headers);
      return res.end(JSON.stringify({ error: 'Messages are not available right now. Try again in a moment.', code: 'unavailable' }));
    }
    res.writeHead(out.status, headers);
    res.end(await out.text());
  }

  async function route(req, url) {
    const m = req.method;
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
    const account = core.accountFromToken(db, token);
    let r;

    if (m === 'GET' && p === '/health') return { ok: true, now: Date.now(), plots: db.prepare('SELECT COUNT(*) AS n FROM plots').get().n, adSlots: db.prepare('SELECT COUNT(*) AS n FROM ad_slots').get().n };
    if (m === 'POST' && p === '/auth/signup') {
      const b = await body(req);
      const out = logged((o) => A.byAccount(o.account), 'account.create', (o) => ({ kind: 'account', id: o.account.id }), () => core.signup(db, b), (o) => ({ username: o.account.username }));
      if (b.ref) business.attributeSignup(db, out.account.id, String(b.ref), business.referralSecret(env));
      if (b.email) {
        try {
          out.account = engage.setEmail(db, out.account, { email: b.email }).account;
        } catch {
          /* a bad email must not stop the account: they can add one later */
        }
      }
      return out;
    }
    if (m === 'POST' && p === '/auth/login') return core.login(db, await body(req));
    if (m === 'POST' && p === '/auth/logout') return core.logout(db, token), { ok: true };
    if (m === 'GET' && p === '/me') return { account: core.requireAccount(account) };
    if (m === 'GET' && p === '/plots') {
      const q = url.searchParams;
      return core.directory(db, { sort: q.get('sort') ?? 'value', q: q.get('q') ?? '', limit: Math.min(1000, Number(q.get('limit')) || 1000), offset: Math.max(0, Number(q.get('offset')) || 0) });
    }
    if (m === 'GET' && p === '/plots/state') return { ...core.worldState(db), botw: community.buildingOfTheWeek(db) };
    if ((r = p.match(/^\/plots\/(\d+)$/)) && m === 'GET') return core.plotView(db, core.getPlot(db, r[1]));
    if ((r = p.match(/^\/plots\/(\d+)\/stats$/)) && m === 'GET') return core.plotStats(db, r[1]) ?? { empty: true };
    if ((r = p.match(/^\/plots\/(\d+)\/history$/)) && m === 'GET') return core.history(db, r[1]);
    // a claim and a take-over are refused while another player holds the plot, and their outcome is a step of the plot economy's data (economy.tracked)
    if ((r = p.match(/^\/plots\/(\d+)\/claim$/)) && m === 'POST') {
      const b = await screened(req, BUSINESS);
      return economy.tracked(db, account, r[1], 'claim', async () => {
        if (billing.billingOn(env)) return billing.payLease(db, account, r[1], 'claim', b, env); // paid: the claim happens once the payment arrives
        const out = logged(A.byAccount(account), 'plot.claim', { kind: 'plot', id: r[1] }, () => core.claimPlot(db, account, r[1], b), (o) => ({ title: o.title, value: o.value, leaseDays: o.lease?.days ?? null }));
        push('plot', [Number(r[1])]);
        if (social.welcomePlot(db, r[1], account.id, env)) setImmediate(postSocial);
        return out;
      });
    }
    if ((r = p.match(/^\/plots\/(\d+)\/takeover$/)) && m === 'POST') {
      const b = await screened(req, BUSINESS);
      return economy.tracked(db, account, r[1], 'takeover', async () => {
        if (billing.billingOn(env)) return billing.payLease(db, account, r[1], 'takeover', b, env);
        const out = logged(A.byAccount(account), 'plot.takeover', { kind: 'plot', id: r[1] }, () => core.takeOverPlot(db, account, r[1], b), (o) => ({ title: o.plot.title, paidOut: o.paidOut, previousOwner: o.previousOwner, previousAccount: o.previousAccount ?? null }));
        engage.notifyTakeover(db, out.previousAccount, { title: out.plot.title, newOwner: out.plot.owner, paidOut: out.paidOut, plotId: out.plot.id });
        delete out.previousAccount;
        push('plot', [Number(r[1])]);
        deliver();
        return out;
      });
    }
    // the plot economy's data (economy.mjs, docs/monetization/plot_economy_data.md): the claim hold, the steps the game sends, watching a plot
    if ((r = p.match(/^\/plots\/(\d+)\/hold$/))) {
      if (m === 'GET') return economy.holdView(db, account, r[1]);
      if (m === 'POST') return economy.holdPlot(db, account, r[1], await body(req), intentCtx(req));
      if (m === 'DELETE') return economy.releaseHold(db, account, r[1]);
    }
    if ((r = p.match(/^\/plots\/(\d+)\/intent$/)) && m === 'POST') return economy.clientIntent(db, account, r[1], await body(req), intentCtx(req));
    if ((r = p.match(/^\/plots\/(\d+)\/watch$/))) {
      if (m === 'GET') return economy.watchState(db, account, r[1]);
      if (m === 'POST') return economy.watchPlot(db, account, r[1]);
      if (m === 'DELETE') return economy.unwatchPlot(db, account, r[1]);
    }
    if (m === 'GET' && p === '/admin/economy') return (adminOnly(token), economy.economyReport(db, { from: url.searchParams.get('from'), to: url.searchParams.get('to') }));
    if ((r = p.match(/^\/plots\/(\d+)$/)) && m === 'PATCH') {
      const b = await screened(req, { description: 1 });
      const out = logged(A.byAccount(account), 'plot.update', { kind: 'plot', id: r[1] }, () => core.updateBusiness(db, account, r[1], b), () => ({ fields: ['logo', 'description', 'exterior'].filter((k) => b[k] !== undefined) }));
      push('plot', [Number(r[1])]); // everyone sees the new logo or outside at once
      return out;
    }
    // the owner pays for a more elaborate outside (core.upgradeExterior): with payments on through Stripe, like a lease; without, at once
    if ((r = p.match(/^\/plots\/(\d+)\/exterior$/)) && m === 'POST') {
      const b = await body(req);
      const shown = (o) => ({ plot: o.plot, paid: o.paid });
      if (billing.billingOn(env)) {
        const out = await billing.payLease(db, account, r[1], 'exterior', b, env);
        if (out.checkout) return out;
        push('plot', [Number(r[1])]);
        return shown(out);
      }
      const out = logged(A.byAccount(account), 'plot.exterior', { kind: 'plot', id: r[1] }, () => core.upgradeExterior(db, account, r[1], b), (o) => ({ paid: o.paid, diff: o.diff, value: o.plot.value }));
      push('plot', [Number(r[1])]);
      return shown(out);
    }
    // the owner's redesigned interior (interiors.mjs): anyone reads it, only the owner changes it
    if ((r = p.match(/^\/plots\/(\d+)\/interior$/)) && m === 'GET') return interiors.getInterior(db, r[1]);
    if ((r = p.match(/^\/plots\/(\d+)\/interior$/)) && m === 'PUT') {
      const b = await body(req, interiors.MAX_BODY_BYTES);
      return logged(A.byAccount(account), 'plot.interior_save', { kind: 'plot', id: r[1] }, () => interiors.saveInterior(db, account, r[1], b), (o) => ({ revision: o.revision, nodes: Object.keys(o.design.nodes).length, bytes: JSON.stringify(o.design).length }));
    }
    if ((r = p.match(/^\/plots\/(\d+)\/interior$/)) && m === 'DELETE') {
      const b = await body(req);
      return logged(A.byAccount(account), 'plot.interior_delete', { kind: 'plot', id: r[1] }, () => interiors.deleteInterior(db, account, r[1], b), (o) => ({ revision: o.revision }));
    }
    if (m === 'POST' && p === '/events') {
      const b = await body(req);
      // the network the request came from (the first address in X-Forwarded-For when a trusted proxy sets it), only ever kept hashed
      const ip = clientIp(req);
      return core.recordEvent(db, account, b, { ip, userAgent: req.headers['user-agent'], salt: env.IP_SALT, minAgeMs: env.HUMAN_MIN_AGE_MS != null ? Number(env.HUMAN_MIN_AGE_MS) : undefined, visitCap: env.HUMAN_VISIT_CAP ? Number(env.HUMAN_VISIT_CAP) : undefined, clickCap: env.HUMAN_CLICK_CAP ? Number(env.HUMAN_CLICK_CAP) : undefined });
    }
    if ((r = p.match(/^\/plots\/(\d+)\/storefront$/)) && m === 'GET') return engage.storefront(db, account, r[1], { visitor: url.searchParams.get('visitor') });
    if ((r = p.match(/^\/plots\/(\d+)\/storefront$/)) && m === 'PUT') {
      const out = engage.setBrand(db, account, r[1], await screened(req, { couponText: 0 }));
      push('plot', [Number(r[1])]);
      return out;
    }
    if ((r = p.match(/^\/plots\/(\d+)\/coupon$/)) && m === 'POST') return engage.claimCoupon(db, account, r[1], await body(req));
    if ((r = p.match(/^\/plots\/(\d+)\/quest\/(start|complete|fund)$/)) && m === 'POST') {
      if (r[2] === 'start') return engage.startQuest(db, account, r[1]);
      if (r[2] === 'complete') return engage.completeQuest(db, account, r[1]);
      return engage.fundQuest(db, account, r[1], (await body(req)).gold);
    }
    if ((r = p.match(/^\/plots\/(\d+)\/feedback$/)) && m === 'POST') return engage.postFeedback(db, account, r[1], await screened(req, { message: 1 }));
    if ((r = p.match(/^\/plots\/(\d+)\/feedback\/(\d+)\/(hide|show)$/)) && m === 'POST') return engage.hideFeedback(db, account, r[1], r[2], r[3] === 'hide');
    if ((r = p.match(/^\/plots\/(\d+)\/leads$/)) && m === 'GET') return engage.leadsFor(db, account, 'plot', r[1]);
    if ((r = p.match(/^\/ads\/([\w-]+)\/leads$/)) && m === 'GET') return engage.leadsFor(db, account, 'ad', r[1]);
    if (m === 'POST' && p === '/leads') return engage.subscribe(db, await body(req));
    if (m === 'GET' && p === '/leads/confirm') return page(engage.confirmLead(db, url.searchParams.get('token')), 'You are signed up', 'That link is not valid or has expired.');
    if (m === 'GET' && p === '/leads/unsubscribe') return page(engage.unsubscribeLead(db, url.searchParams.get('token')), 'You are unsubscribed', 'That link is not valid.');
    if (m === 'GET' && p === '/me/verify') return page(engage.verifyEmail(db, url.searchParams.get('token')), 'Email confirmed', 'That link is not valid or was already used.');
    if (m === 'PATCH' && p === '/me') return engage.setEmail(db, account, await body(req));
    if (m === 'GET' && p === '/me/leads') return engage.myLeads(db, account);
    if (m === 'POST' && p === '/reports') {
      const b = await body(req);
      return logged(A.byAccount(account), 'report.create', { kind: String(b.kind ?? ''), id: b.id }, () => mod.report(db, account, b), (o) => ({ reason: b.reason ?? 'other', already: o.already, hidden: o.hidden ?? false }));
    }
    if (m === 'GET' && p === '/admin/reports') return (adminOnly(token), { reports: mod.queue(db, url.searchParams.get('status') ?? 'open') });
    if (m === 'GET' && p === '/admin/reports/ids') return (adminOnly(token), { id: mod.firstReportId(db, url.searchParams.get('kind'), url.searchParams.get('id')) });
    if ((r = p.match(/^\/admin\/reports\/(\d+)\/resolve$/)) && m === 'POST') {
      adminOnly(token);
      const action = (await body(req)).action;
      const rep = db.prepare('SELECT kind, target_id FROM reports WHERE id = ?').get(Number(r[1]));
      return logged(A.ADMIN, 'report.resolve', { kind: rep?.kind ?? 'report', id: rep?.target_id ?? r[1] }, () => mod.resolve(db, r[1], action), (o) => ({ report: Number(r[1]), action: o.action, reports: o.resolved, banned: o.banned }));
    }
    if ((r = p.match(/^\/admin\/accounts\/(\d+)\/(ban|unban)$/)) && m === 'POST') {
      adminOnly(token);
      const reason = r[2] === 'ban' ? (await body(req)).reason : null;
      logged(A.ADMIN, `account.${r[2]}`, { kind: 'account', id: r[1] }, () => (r[2] === 'ban' ? mod.ban(db, Number(r[1]), reason) : mod.unban(db, Number(r[1]))), () => (reason ? { reason: String(reason).slice(0, 200) } : null));
      return { ok: true };
    }
    if (m === 'GET' && p === '/admin/audit') {
      adminOnly(token);
      const q = url.searchParams;
      return A.list(db, { targetKind: q.get('target_kind'), targetId: q.get('target_id'), action: q.get('action'), actorId: q.get('actor'), before: q.get('before'), limit: q.get('limit') });
    }
    if (m === 'GET' && p === '/admin/social') return (adminOnly(token), social.list(db, url.searchParams.get('status') ?? 'review', env));
    if ((r = p.match(/^\/admin\/social\/(\d+)\/(approve|reject)$/)) && m === 'POST') {
      adminOnly(token);
      const out = logged(A.ADMIN, `social.${r[2]}`, { kind: 'social_post', id: r[1] }, () => social.decide(db, r[1], r[2]), (o) => ({ text: o.text }));
      if (r[2] === 'approve') setImmediate(postSocial);
      return out;
    }
    if (m === 'GET' && p === '/admin/audit/verify') return (adminOnly(token), A.verifyChain(db));
    if (m === 'GET' && p === '/me/wallet') return engage.wallet(db, account);
    if (m === 'POST' && p === '/admin/newsletter') {
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) throw new core.ApiError(403, 'Not allowed.', 'forbidden');
      const out = logged(A.ADMIN, 'newsletter.send', { kind: 'newsletter', id: new Date().toISOString().slice(0, 10) }, () => engage.sendNewsletter(db, new Date()), (o) => ({ queued: o.queued, already: Boolean(o.already) }));
      deliver();
      return out;
    }
    // leases, and Building of the Week
    if ((r = p.match(/^\/plots\/(\d+)\/renew$/)) && m === 'POST') {
      const b = await body(req);
      if (billing.billingOn(env)) return billing.payLease(db, account, r[1], 'renew', b, env);
      const out = logged(A.byAccount(account), 'plot.renew', { kind: 'plot', id: r[1] }, () => community.renewLease(db, account, r[1], b), (o) => ({ paid: o.paid, leaseDays: o.plot?.lease?.days ?? null }));
      push('plot', [Number(r[1])]);
      return out;
    }
    if ((r = p.match(/^\/admin\/plots\/(\d+)\/lease$/)) && m === 'POST') {
      adminOnly(token);
      const state = (await body(req)).state;
      return logged(A.ADMIN, 'plot.lease_state', { kind: 'plot', id: r[1] }, () => community.setLeaseState(db, r[1], state), () => ({ state }));
    }
    if (m === 'POST' && p === '/admin/leases/notices') return (adminOnly(token), community.sendLeaseNotices(db, Number((await body(req)).now) || Date.now()));
    if (m === 'GET' && p === '/votes') return community.votesView(db, account);
    if (m === 'POST' && p === '/hunt/complete') return community.completeHunt(db, account, await body(req));
    if (m === 'POST' && p === '/vote') return community.castVote(db, account, (await body(req)).plotId);
    // presence and analytics
    if (m === 'POST' && p === '/presence/ping') {
      const b = await body(req);
      const out = stats.ping(db, { visitor: b.visitor, headers: req.headers, account });
      if (out.ok && b.areas) traffic.note(db, { account, visitor: b.visitor, areas: b.areas, ctx: intentCtx(req) }); // the areas passed outdoors (economy.mjs)
      return out;
    }
    if (m === 'GET' && p === '/stats/overview') return stats.overview(db, { offsetMin: Number(env.STATS_TZ_OFFSET_MIN) || 0 });
    // the pop-up market
    if (m === 'GET' && p === '/market') return market.marketSummary(db, seed);
    if (m === 'GET' && p === '/market/mine') return market.myBookings(db, account);
    if (m === 'POST' && p === '/market/book') {
      const b = await screened(req, { brand: 0, product: 1 });
      if (billing.billingOn(env)) return billing.payStall(db, seed, account, b, env); // paid: a pending booking holds the stall until the payment arrives
      const out = logged(A.byAccount(account), 'market.book', (o) => ({ kind: 'booking', id: o.booking.id }), () => market.book(db, seed, account, b), (o) => ({ stall: o.stall.id, site: b.siteCode ?? null, week: b.week ?? null, cents: o.paid }));
      push('market', [out.stall.id]);
      return out;
    }
    if ((r = p.match(/^\/market\/bookings\/(\d+)$/)) && m === 'PATCH') return market.updateStall(db, account, r[1], await screened(req, { brand: 0, product: 1, offer: 1 }));
    if ((r = p.match(/^\/market\/bookings\/(\d+)\/visit$/)) && m === 'POST') return market.visit(db, account, r[1], (await body(req)).visitor);
    if (m === 'POST' && p === '/admin/market/notices') return (adminOnly(token), market.sendNotices(db, Number((await body(req)).now) || Date.now()));
    if ((r = p.match(/^\/market\/bookings\/(\d+)\/cancel$/)) && m === 'POST') {
      // a paid booking is refunded in full first (which also cancels it); the checks (yours, not started) come first either way
      const refundable = billing.paidOrderFor(db, `booking:${Number(r[1])}`);
      if (refundable) {
        dryRun(db, () => market.cancelBooking(db, account, r[1]));
        await billing.refundOrder(db, refundable.id, A.byAccount(account), env, fetch, 'cancelled by the stallholder before it opened');
      }
      return logged(A.byAccount(account), 'market.cancel', { kind: 'booking', id: r[1] }, () => (refundable ? { ok: true, refunded: refundable.cents } : market.cancelBooking(db, account, r[1])));
    }
    if ((r = p.match(/^\/market\/(SD-\d{4})(?:\/(\d{4}-\d{2}-\d{2}))?$/)) && m === 'GET') return market.marketWeek(db, seed, r[1], r[2]);
    if (m === 'POST' && p === '/admin/market/layout') {
      adminOnly(token);
      const b = await body(req);
      return logged(A.ADMIN, 'market.layout', { kind: 'market', id: `${b.siteCode ?? b.site ?? ''}/${b.week ?? b.weekStart ?? ''}` }, () => market.setLayout(db, seed, b), () => ({ published: b.published ?? null }));
    }
    if (m === 'GET' && p === '/admin/market') return (adminOnly(token), market.adminWeek(db, seed, url.searchParams.get('week') || undefined));
    // free business profiles and referral links (services/api/business.mjs)
    if (m === 'GET' && p === '/businesses') {
      const q = url.searchParams;
      return business.listProfiles(db, { category: q.get('category') ?? '', district: q.get('district') ?? '', q: q.get('q') ?? '', sort: q.get('sort') ?? 'new', limit: q.get('limit'), offset: q.get('offset') });
    }
    if (m === 'POST' && p === '/businesses') {
      const b = await screened(req, PROFILE);
      const out = logged(A.byAccount(account), 'business.create', (o) => ({ kind: 'business', id: o.slug }), () => business.createProfile(db, account, b), (o) => ({ name: o.name, category: o.category, announce: o.announce }));
      if (social.welcomeBusiness(db, out.slug, env)) setImmediate(postSocial);
      return out;
    }
    if (m === 'GET' && p === '/businesses/sitemap') return { entries: business.sitemapEntries(db) };
    if (m === 'GET' && p === '/businesses/featured') { const f = billing.featured(db, url.searchParams.get('placement') || 'discover'); return { sponsored: f.sponsored.map(business.profileView), launches: f.launches.map(business.profileView) }; } // sponsored and launch-week profiles
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})$/)) && m === 'GET') return business.getProfile(db, r[1]);
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})$/)) && m === 'PATCH') {
      const b = await screened(req, PROFILE);
      const out = logged(A.byAccount(account), 'business.update', { kind: 'business', id: r[1] }, () => business.updateProfile(db, account, r[1], b), () => ({ fields: Object.keys(b).slice(0, 12) }));
      if (social.welcomeBusiness(db, out.slug, env)) setImmediate(postSocial); // an owner who opts in later is welcomed then (still only once)
      return out;
    }
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/plot$/)) && m === 'PUT') {
      const plotId = (await body(req)).plotId ?? null;
      return logged(A.byAccount(account), 'business.link_plot', { kind: 'business', id: r[1] }, () => business.linkPlot(db, account, r[1], plotId), () => ({ plotId }));
    }
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/interest$/)) && m === 'POST') {
      const plan = (await body(req)).plan;
      return logged(A.byAccount(account), 'business.upgrade_interest', { kind: 'business', id: r[1] }, () => business.requestUpgrade(db, account, r[1], plan), () => ({ plan }));
    }
    // conversion measurement (conversions.mjs, docs/monetization/conversions.md)
    if (m === 'POST' && p === '/businesses/impressions') return conversions.recordImpressions(db, account, await body(req), visitCtx(req));
    // a business's server reports a sale with its own conversion key in the Authorization header (never in a URL); the pixel has no key and
    // only ever counts as browser-reported
    if (m === 'POST' && p === '/conversions') return conversions.recordPurchase(db, await body(req), { key: conversions.keyFromHeaders(req.headers) });
    if (m === 'GET' && p === '/conversions/pixel.gif') return conversions.purchasePixel(db, Object.fromEntries(url.searchParams), visitCtx(req));
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/tracking$/)) && m === 'GET') return conversions.trackingFor(db, account, r[1], env);
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/tracking\/key$/)) && m === 'POST') return logged(A.byAccount(account), 'conversion_key.rotate', { kind: 'business', id: r[1] }, () => conversions.rotateConversionKey(db, account, r[1]));
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/inquiries$/)) && m === 'POST') return conversions.createInquiry(db, account, r[1], await screened(req, { name: 0, message: 0, preferred: 0 }), { ...visitCtx(req), inquiryLimit: env.INQUIRY_LIMIT ? Number(env.INQUIRY_LIMIT) : undefined });
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/inquiries$/)) && m === 'GET') return conversions.listInquiries(db, account, r[1]);
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/inquiries\/(\d+)$/)) && m === 'PATCH') return conversions.setInquiryStatus(db, account, r[1], r[2], (await body(req)).status);
    if ((r = p.match(/^\/plots\/(\d+)\/coupon\/redeem$/)) && m === 'POST') {
      const b = await body(req);
      return logged(A.byAccount(account), 'coupon.redeem', { kind: 'plot', id: r[1] }, () => conversions.redeemCoupon(db, account, r[1], b), (o) => ({ ticket: o.ticket }));
    }
    if (m === 'GET' && p === '/admin/metrics/renewals') return (adminOnly(token), conversions.renewals(db));
    // the pilot (pilot.mjs, docs/monetization/pilot.md)
    if (m === 'GET' && p === '/admin/pilot') return (adminOnly(token), pilot.summary(db, { weeks: url.searchParams.get('weeks'), all: url.searchParams.get('all') === '1' }));
    if (m === 'GET' && p === '/admin/pilot.csv') return (adminOnly(token), pilot.summaryCsv(db, { weeks: url.searchParams.get('weeks'), all: url.searchParams.get('all') === '1' }));
    if (m === 'POST' && p === '/admin/pilot/members') {
      adminOnly(token);
      const b = await body(req);
      return logged(A.ADMIN, 'pilot.add', { kind: 'business', id: String(b.slug ?? '') }, () => pilot.addMember(db, String(b.slug ?? ''), b));
    }
    if ((r = p.match(/^\/admin\/pilot\/members\/([a-z0-9-]{1,48})$/)) && m === 'DELETE') return (adminOnly(token), logged(A.ADMIN, 'pilot.remove', { kind: 'business', id: r[1] }, () => pilot.removeMember(db, r[1])));
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/pilot-feedback$/)) && m === 'POST') { const b = await screened(req, { result: 0, missing: 0 }); return pilot.sendFeedback(db, account, r[1], b); }
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/events$/)) && m === 'POST') return business.recordProfileEvent(db, account, r[1], await body(req), visitCtx(req));
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/leads$/)) && m === 'GET') return engage.leadsFor(db, account, 'business', r[1]);
    if (m === 'GET' && p === '/me/businesses') return business.myProfiles(db, account, env);
    // billing (billing.mjs, docs/monetization/billing.md)
    if (m === 'GET' && p === '/billing/config') return { enabled: billing.billingOn(env), termsUrl: env.TERMS_URL || null };
    if (m === 'GET' && p === '/billing/availability') return billing.availability(db, url.searchParams.get('placement'));
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/checkout$/)) && m === 'POST') return billing.createCheckout(db, account, r[1], await body(req), env);
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/pro\/cancel$/)) && m === 'POST') return billing.cancelPro(db, account, r[1], env);
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/export\.csv$/)) && m === 'GET') return business.exportCsv(db, account, r[1]);
    if ((r = p.match(/^\/businesses\/([a-z0-9-]{1,48})\/offer$/)) && m === 'PUT') { const b = await screened(req, { text: 0 }); return logged(A.byAccount(account), 'business.offer', { kind: 'business', id: r[1] }, () => business.setOffer(db, account, r[1], b), (o) => ({ offer: o.offer })); }
    if (m === 'GET' && p === '/me/orders') return billing.myOrders(db, account);
    if ((r = p.match(/^\/me\/orders\/(\d+)$/)) && m === 'GET') return billing.orderStatus(db, account, r[1]);
    if (m === 'GET' && p === '/admin/billing/orders') return (adminOnly(token), billing.adminOrders(db, url.searchParams.get('status')));
    if ((r = p.match(/^\/admin\/billing\/orders\/(\d+)\/refund$/)) && m === 'POST') return (adminOnly(token), billing.refundOrder(db, r[1], A.ADMIN, env));
    if ((r = p.match(/^\/admin\/billing\/grant\/([a-z0-9-]{1,48})$/)) && m === 'POST') return (adminOnly(token), billing.grant(db, r[1], await body(req)));
    if (m === 'POST' && p === '/admin/billing/reconcile') return (adminOnly(token), billing.reconcile(db, env, fetch, afterPaid));
    if (m === 'GET' && p === '/me/referrals') return business.myReferrals(db, account, env);
    if (m === 'GET' && p === '/ads') return { slots: core.adSlots(db) };
    if ((r = p.match(/^\/ads\/([\w-]+)$/)) && m === 'GET') return core.getAdSlot(db, r[1]);
    if ((r = p.match(/^\/ads\/([\w-]+)\/history$/)) && m === 'GET') return { events: core.slotHistory(db, r[1]) };
    if ((r = p.match(/^\/ads\/([\w-]+)\/buy$/)) && m === 'POST') {
      const b = await screened(req, { advertiser: 0, headline: 0, tagline: 1, url: 1 });
      const out = logged(A.byAccount(account), 'ad.buy', { kind: 'ad', id: r[1] }, () => core.buySlot(db, account, r[1], b), (o) => ({ advertiser: o.slot.ad.advertiser, value: o.slot.value, paidOut: o.paidOut, previousAdvertiser: o.previousAdvertiser }));
      if (out.previousAdvertiser) engage.notifyAdTakeover(db, out.previousAccount, { slot: out.slot.label, newAdvertiser: out.slot.ad.advertiser, paidOut: out.paidOut });
      delete out.previousAccount;
      push('ad', [r[1]]);
      deliver();
      return out;
    }
    if (m === 'POST' && p === '/ad-events') {
      const ip = clientIp(req);
      return core.recordAdEvent(db, account, await body(req), { ip, userAgent: req.headers['user-agent'], salt: env.IP_SALT, minAgeMs: env.HUMAN_MIN_AGE_MS != null ? Number(env.HUMAN_MIN_AGE_MS) : undefined, visitCap: env.HUMAN_VISIT_CAP ? Number(env.HUMAN_VISIT_CAP) : undefined, clickCap: env.HUMAN_CLICK_CAP ? Number(env.HUMAN_CLICK_CAP) : undefined });
    }
    if (m === 'GET' && p === '/world/stats') return core.worldStats(db, 0);
    if (m === 'GET' && p === '/world/live') return stats.liveCity(db); // the admin headquarters' live panel (totals only)
    // what the messaging service asks (docs/architecture/node_fastapi_architecture_plan.md): this API stays the authority on accounts and plots
    if (m === 'POST' && p === '/internal/identity/session') {
      serviceOnly(req);
      const who = core.accountFromToken(db, String((await body(req)).token ?? '')); // null when signed out, expired or banned
      if (!who) throw new core.ApiError(401, 'Sign in first.', 'unauthorized');
      return { account: identityView(db.prepare('SELECT * FROM accounts WHERE id = ?').get(who.id)) };
    }
    if (m === 'POST' && p === '/internal/identity/binding') {
      serviceOnly(req);
      const who = messaging.bindingAccount(db, (await body(req)).binding);
      if (!who) throw new core.ApiError(401, 'Sign in again.', 'unauthenticated');
      return { account: identityView(db.prepare('SELECT * FROM accounts WHERE id = ?').get(who.id)) };
    }
    if (m === 'POST' && p === '/internal/identity/accounts') {
      serviceOnly(req);
      const b = await body(req);
      const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 500).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      const rows = ids.length ? db.prepare(`SELECT * FROM accounts WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
      if (typeof b.username === 'string' && b.username.trim()) rows.push(...db.prepare('SELECT * FROM accounts WHERE username = ?').all(b.username.trim().slice(0, 20)));
      return { accounts: rows.map(identityView) };
    }
    if ((r = p.match(/^\/internal\/identity\/accounts\/(\d+)\/ban$/)) && m === 'POST') {
      serviceOnly(req);
      const reason = (await body(req)).reason;
      logged(A.SERVICE, 'account.ban', { kind: 'account', id: r[1] }, () => mod.ban(db, Number(r[1]), reason), () => ({ reason: String(reason ?? '').slice(0, 200), by: 'messaging service' }));
      return { ok: true };
    }
    if ((r = p.match(/^\/internal\/plots\/(\d+)\/owner$/)) && m === 'GET') {
      serviceOnly(req);
      const plot = core.getPlot(db, r[1]);
      // the version changes whenever the plot changes hands (a claim or a take-over writes the ledger): an inquiry checks it again just before it is saved.
      // A renewal or an outside upgrade is the same tenant, so it does not count (core.HAND_CHANGES)
      const version = db.prepare(`SELECT MAX(id) AS v FROM ledger WHERE plot_id = ? AND kind IN (${core.HAND_CHANGES.map(() => '?').join(',')})`).get(plot.id, ...core.HAND_CHANGES).v ?? 0;
      return { plotId: plot.id, title: plot.title, ownerAccount: plot.owner_account ?? null, version };
    }
    // chat and messages (services/api/messaging.mjs)
    if (m === 'POST' && p === '/messaging/ticket') return messaging.issueTicket(db, account, token);
    if (m === 'POST' && p === '/internal/messaging/redeem') return (internalOnly(req), messaging.redeemTicket(db, (await body(req)).ticket));
    if (m === 'POST' && p === '/internal/messaging/bindings') return (internalOnly(req), messaging.checkBindings(db, (await body(req)).bindings));
    if (m === 'POST' && p === '/internal/messaging/nearby') return (internalOnly(req), await messaging.acceptNearby(db, await body(req), chat, env));
    if (m === 'GET' && p === '/messaging/summary') return messaging.summary(db, account);
    if (m === 'GET' && p === '/messaging/settings') return messaging.getSettings(db, account);
    if (m === 'PATCH' && p === '/messaging/settings') return messaging.setSettings(db, account, await body(req));
    if (m === 'POST' && p === '/messaging/blocks') return messaging.block(db, account, await body(req));
    if ((r = p.match(/^\/messaging\/blocks\/(\d+)$/)) && m === 'DELETE') return messaging.unblock(db, account, r[1]);
    if (m === 'POST' && p === '/messaging/reports') return messaging.reportMessage(db, account, await body(req));
    if (m === 'GET' && p === '/conversations') return messaging.listConversations(db, account, { box: url.searchParams.get('box') ?? 'inbox', cursor: url.searchParams.get('cursor'), limit: url.searchParams.get('limit') });
    if (m === 'POST' && p === '/conversations') return written(await messaging.startDirect(db, account, await body(req), chat, env));
    if ((r = p.match(/^\/conversations\/([\w-]{6,40})$/)) && m === 'GET') return messaging.getConversation(db, account, r[1]);
    if ((r = p.match(/^\/conversations\/([\w-]{6,40})\/messages$/)) && m === 'GET') {
      const q = url.searchParams;
      return messaging.listMessages(db, account, r[1], { before: q.get('before') ?? undefined, after: q.get('after') ?? undefined, limit: q.get('limit') });
    }
    if ((r = p.match(/^\/conversations\/([\w-]{6,40})\/messages$/)) && m === 'POST') return written(await messaging.sendMessage(db, account, r[1], await body(req), chat, env));
    if ((r = p.match(/^\/conversations\/([\w-]{6,40})\/request$/)) && m === 'POST') return written(messaging.respond(db, account, r[1], (await body(req)).action));
    if ((r = p.match(/^\/conversations\/([\w-]{6,40})\/read$/)) && m === 'POST') return written(messaging.markRead(db, account, r[1], (await body(req)).upTo));
    if ((r = p.match(/^\/conversations\/([\w-]{6,40})\/preferences$/)) && m === 'PATCH') return messaging.setPreferences(db, account, r[1], await body(req));
    if ((r = p.match(/^\/plots\/(\d+)\/inquiries$/)) && m === 'POST') return written(await messaging.startInquiry(db, account, r[1], await body(req), chat, env));
    throw new core.ApiError(404, 'Not found.', 'not_found');
  }

  const server = http.createServer(async (req, res) => {
    const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const send = (status, data) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') return send(204, {});
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
      // the presence server speaks for every player at once, so its own calls (with the shared secret) are not counted against one address
      const secret = req.headers['x-internal-secret'];
      // Stripe's webhook needs the exact bytes it signed, so it is read raw here, before anything parses it; Stripe is not rate limited
      if (req.method === 'POST' && url.pathname === '/billing/webhook') {
        const chunks = [];
        let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > 1_000_000) throw new core.ApiError(413, 'That is too large.', 'too_large');
          chunks.push(c);
        }
        return send(200, await billing.receiveWebhook(db, Buffer.concat(chunks).toString('utf8'), req.headers['stripe-signature'], env, fetch, afterPaid));
      }
      const internal = url.pathname.startsWith('/internal/') && secret && (secret === env.MP_NOTIFY_SECRET || secret === env.INTERNAL_SECRET);
      if (!internal && limited(clientIp(req) || '?', url.pathname.startsWith('/auth/'))) throw new core.ApiError(429, 'Slow down.', 'rate_limited');
      // MESSAGING_READONLY=1: a pause for moving messages (deploy/README.md): everything can be read, nothing about messages is written
      if (env.MESSAGING_READONLY === '1' && req.method !== 'GET' && MESSAGING_ROUTE.test(url.pathname.replace(/\/+$/, ''))) throw new core.ApiError(503, 'Messages are read-only for a few minutes while we do maintenance.', 'unavailable');
      if (messagingService && MESSAGING_ROUTE.test(url.pathname.replace(/\/+$/, ''))) return await forward(req, res, url, headers);
      const out = await route(req, url);
      if (out && out.__raw) {
        res.writeHead(200, { ...headers, 'Content-Type': out.__raw.type, ...(out.__raw.filename ? { 'Content-Disposition': `attachment; filename="${out.__raw.filename}"` } : {}), ...(out.__raw.cache ? { 'Cache-Control': out.__raw.cache } : {}) });
        return res.end(out.__raw.body);
      }
      if (out && out.__html) {
        res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(out.__html);
      }
      send(200, out);
    } catch (e) {
      if (e instanceof core.ApiError) return send(e.status, { error: e.message, code: e.code, ...(e.errors ? { errors: e.errors } : {}), ...(e.data ?? {}), ...(e.retryAfterMs ? { retryAfterMs: Math.ceil(e.retryAfterMs) } : {}) });
      console.error('api error:', e);
      // the route without ids or tokens, so one bug on /plots/12 and /plots/97 is one issue and no secret leaves the machine
      reporter.capture(e, { tags: { route: `${req.method} ${(url?.pathname ?? '?').replace(/\/(\d+|[^/]{20,})(?=\/|$)/g, '/:id')}` } });
      send(500, { error: 'Something went wrong.', code: 'server_error' });
    }
  });
  return { server, db, seeded, adsSeeded, brandsSeeded, deliver, postSocial, reporter, traffic, close: () => new Promise((r) => server.close(() => (clearInterval(mailTimer), clearInterval(noticeTimer2), clearInterval(socialTimer), clearInterval(billingTimer), clearInterval(economyTimer), economy.safeFlush(traffic, db), db.close(), r()))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  // in production, unsafe or missing settings stop the start (services/api/config.mjs): better down than serving with test rules or no secrets
  const settings = checkApiEnv(process.env);
  for (const w of settings.warnings) console.warn(`settings: ${w}`);
  if (isProduction(process.env) && settings.errors.length) {
    for (const e of settings.errors) console.error(`settings: ${e}`);
    console.error('The API will not start in production until these are fixed (see deploy/README.md; check a file with npm run check:env -- <file>).');
    process.exit(1);
  }
  const port = Number(process.env.API_PORT || 3002);
  const api = createApi({ dbFile: process.env.API_DB || path.join(here, 'data', 'voxelventure.db'), seed: Number(process.env.API_SEED || 20260101), origin: process.env.API_ORIGIN || '*' });
  const host = process.env.API_HOST || undefined;
  api.server.listen(port, host, () => console.log(`VoxelVenture API on ${host ?? ''}:${port} (${api.seeded.seeded ? `seeded ${api.seeded.plots} plots` : 'existing world'})`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => api.close().then(() => process.exit(0))); // systemd stops a service with SIGTERM
  // a crash is reported before the process goes (systemd starts it again in 3 seconds)
  for (const ev of ['uncaughtException', 'unhandledRejection']) {
    process.on(ev, (error) => {
      console.error(`${ev}:`, error);
      api.reporter.capture(error, { tags: { kind: ev } }).finally(() => process.exit(1));
    });
  }
}
