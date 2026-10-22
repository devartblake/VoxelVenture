// The retention clean-up jobs (services/api/retention.mjs, policy_review.md gap 7): each removes exactly what the data retention policy says
// and keeps the rest, the figures worked out from deleted rows (all-time visits, ad views, the stats panel, the economy report, stall visits) do
// not change, the jobs work in batches, and running them again changes nothing. On a seeded in-memory database, with no server.
import { openDb } from '../services/api/db.mjs';
import * as core from '../services/api/core.mjs';
import * as stats from '../services/api/stats.mjs';
import * as economy from '../services/api/economy.mjs';
import * as R from '../services/api/retention.mjs';
import { imp } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const DAY = 86400000;
const { RETENTION } = await imp('legal/retention.js');
const now = Date.now();
const ago = (days) => now - days * DAY;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

check('the jobs read the retention policy\'s own periods', R.RETENTION === RETENTION || JSON.stringify(R.RETENTION) === JSON.stringify(RETENTION));

const db = openDb(':memory:');
core.seedWorld(db, 20260101);
core.seedAds(db, 20260101);
const n = (sql, ...a) => db.prepare(sql).get(...a).n;
const account = (name) => Number(db.prepare('INSERT INTO accounts (username, pass_salt, pass_hash, created_at) VALUES (?,?,?,?)').run(name, 's', 'h', ago(500)).lastInsertRowid);
const amy = account('amy');
const plot = db.prepare("SELECT * FROM plots WHERE claimable = 1 AND owner_name IS NOT NULL AND building_type != 'house' AND json_extract(facts, '$.admin') = 0 ORDER BY id LIMIT 1").get();
const slot = db.prepare('SELECT * FROM ad_slots ORDER BY id LIMIT 1').get();

// ---- sessions
const ses = db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?,?,?)');
ses.run('gone', amy, ago(RETENTION.expiredSessionDays + 1));
ses.run('just-expired', amy, now - 3600000);
ses.run('live', amy, now + 10 * DAY);
check('expired sign-ins: deleted a day after they stopped working, the rest kept', R.pruneSessions(db, now) === 1 && !db.prepare("SELECT 1 FROM sessions WHERE token_hash = 'gone'").get() && n('SELECT COUNT(*) AS n FROM sessions') === 2);

// ---- the outbox
const mail = db.prepare('INSERT INTO outbox (to_email, subject, body, kind, status, created_at, sent_at, headers, error) VALUES (?,?,?,?,?,?,?,?,?)');
const oldSent = Number(mail.run('a@x.test', 'Old', 'secret body', 'newsletter', 'sent', ago(RETENTION.emailBodyDays + 1), ago(RETENTION.emailBodyDays + 1), '{"List-Unsubscribe":"<u>"}', null).lastInsertRowid);
const oldFailed = Number(mail.run('b@x.test', 'Failed', 'failed body', 'takeover', 'failed', ago(RETENTION.emailBodyDays + 5), null, null, 'bounced').lastInsertRowid);
const fresh = Number(mail.run('c@x.test', 'Fresh', 'fresh body', 'verify', 'sent', ago(3), ago(3), null, null).lastInsertRowid);
const waiting = Number(mail.run('d@x.test', 'Waiting', 'pending body', 'confirm', 'pending', ago(RETENTION.emailBodyDays + 2), null, null, null).lastInsertRowid);
const ancient = Number(mail.run('e@x.test', 'Ancient', 'ancient body', 'newsletter', 'sent', ago(RETENTION.emailRecordDays + 1), ago(RETENTION.emailRecordDays + 1), null, null).lastInsertRowid);
const out1 = R.pruneOutbox(db, now);
const row = (id) => db.prepare('SELECT * FROM outbox WHERE id = ?').get(id);
check('sent emails: the text, headers and error are wiped after the stated days', row(oldSent).body === R.WIPED && row(oldSent).headers === null && row(oldFailed).body === R.WIPED && row(oldFailed).error === null && row(oldSent).wiped_at === now, JSON.stringify(out1));
check('...and the send record is kept (to, kind, subject, when)', row(oldSent).to_email === 'a@x.test' && row(oldSent).kind === 'newsletter' && row(oldSent).subject === 'Old' && row(oldSent).sent_at != null);
check('a recent email and one still waiting to go out are untouched', row(fresh).body === 'fresh body' && row(waiting).body === 'pending body');
check('the send record is deleted after 13 months', !row(ancient) && out1.deleted === 1);

// ---- visits, clicks, ad views, profile events, stall visits: deleted after 13 months, their daily totals kept
const oldT = ago(RETENTION.eventDays + 3);
const ev = db.prepare('INSERT INTO events (plot_id, kind, visitor, at, verified, ip_hash) VALUES (?,?,?,?,?,?)');
for (let i = 0; i < 50; i++) ev.run(plot.id, 'visit', `x${i}`, oldT + i * 1000, 1, 'net');
for (let i = 0; i < 4; i++) ev.run(plot.id, 'click', `x${i}`, oldT, 1, 'net');
for (let i = 0; i < 5; i++) ev.run(plot.id, 'visit', `bot${i}`, oldT, 0, 'net'); // never counted
for (let i = 0; i < 6; i++) ev.run(plot.id, 'visit', `y${i}`, ago(5), 1, 'net');
const adEv = db.prepare('INSERT INTO ad_events (slot_id, kind, visitor, at, verified) VALUES (?,?,?,?,?)');
for (let i = 0; i < 7; i++) adEv.run(slot.id, 'view', `x${i}`, oldT, 1);
adEv.run(slot.id, 'click', 'x1', oldT, 1);
adEv.run(slot.id, 'view', 'y1', ago(2), 1);
const biz = Number(db.prepare("INSERT INTO businesses (slug, account_id, name, category, cta, plot_id, created_at, updated_at) VALUES ('amy-shop', ?, 'Amy Shop', 'retail', '{\"kind\":\"newsletter\"}', ?, ?, ?)").run(amy, plot.id, ago(500), ago(500)).lastInsertRowid);
const bev = db.prepare('INSERT INTO business_events (business_id, kind, visitor, at, verified, value_cents, report) VALUES (?,?,?,?,?,?,?)');
for (let i = 0; i < 3; i++) bev.run(biz, 'store', `x${i}`, oldT, 1, null, null);
bev.run(biz, 'purchase', 'x1', oldT, 1, 2500, 'server');
bev.run(biz, 'view', 'y1', ago(1), 1, null, null);
const booking = Number(db.prepare("INSERT INTO market_bookings (site_code, week_start, stall_id, account_id, account_name, start_at, end_at, hours, cents, created_at) VALUES ('SD-0001', '2025-01-06', 's1', ?, 'amy', ?, ?, 2, 500, ?)").run(amy, oldT, oldT + 7200000, oldT).lastInsertRowid);
for (let h = 0; h < 4; h++) db.prepare('INSERT INTO market_visits (booking_id, visitor, hour, at) VALUES (?,?,?,?)').run(booking, `v${h}`, h, oldT + h * 3600000);

const figures = () => {
  const report = economy.economyReport(db, { from: dayOf(oldT - 2 * DAY), to: dayOf(oldT + 2 * DAY), at: now });
  const overview = stats.overview(db, { now });
  return {
    plotVisits: core.plotView(db, core.getPlot(db, plot.id)).visits,
    stateVisits: core.worldState(db).plots.find((p) => p.id === plot.id).visits,
    worldTotal: core.worldStats(db).totalVisits,
    adViews: core.getAdSlot(db, slot.id).views,
    adClicks: core.getAdSlot(db, slot.id).clicks,
    panelViews: overview.activity.find((a) => a.label === 'Building views').total,
    panelClicks: overview.activity.find((a) => a.label === 'Website clicks').total,
    reportVisits: report.total.visits,
    reportStore: report.total.storeEntries,
    recentReportVisits: economy.economyReport(db, { at: now }).total.visits,
  };
};
const before = figures();
check('(the figures before: old and recent visits, ad views, store entries)', before.plotVisits === 56 && before.adViews === 8 && before.reportVisits === 50 && before.reportStore === 3 && before.recentReportVisits === 6, JSON.stringify(before));

// in batches: a run cut short (3 batches of 7) deletes part of the backlog, and every figure is still right
const partial = R.pruneEvents(db, now, { batch: 7, maxBatches: 3 });
check('the jobs work in batches: a run cut short leaves the rest for the next one', partial.events === 21 && n('SELECT COUNT(*) AS n FROM events WHERE at < ?', ago(RETENTION.eventDays)) === 38, JSON.stringify(partial));
check('...and the figures are the same halfway through', JSON.stringify(figures()) === JSON.stringify(before), JSON.stringify(figures()));
const rest = R.pruneEvents(db, now, { batch: 7, maxBatches: 100 });
const after = figures();
check('every event older than 13 months is deleted (visits, clicks, unverified ones, ad views, profile events, stall visits)', n('SELECT COUNT(*) AS n FROM events WHERE at < ?', ago(RETENTION.eventDays)) === 0 && n('SELECT COUNT(*) AS n FROM ad_events WHERE at < ?', ago(RETENTION.eventDays)) === 0 && n('SELECT COUNT(*) AS n FROM business_events WHERE at < ?', ago(RETENTION.eventDays)) === 0 && n('SELECT COUNT(*) AS n FROM market_visits') === 0, JSON.stringify(rest));
check('the recent ones are kept as they were', n('SELECT COUNT(*) AS n FROM events') === 6 && n('SELECT COUNT(*) AS n FROM ad_events') === 1 && n('SELECT COUNT(*) AS n FROM business_events') === 1);
check('all-time and range figures do not change: building visits, the world total, ad views and clicks, the stats panel, the economy report', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
check('the daily totals hold numbers only, verified rows only, with a purchase\'s value', n("SELECT SUM(n) AS n FROM daily_counts WHERE source = 'events' AND kind = 'visit'") === 50 && n("SELECT value_cents AS n FROM daily_counts WHERE source = 'business_events' AND kind = 'purchase'") === 2500 && db.prepare('PRAGMA table_info(daily_counts)').all().every((c) => !/visitor|ip|account/.test(c.name)));
check('a stall\'s visit count is kept too', n("SELECT SUM(n) AS n FROM daily_counts WHERE source = 'market_visits' AND target = ?", String(booking)) === 4);
check('a new advertiser starts from zero: buying an ad space clears its kept totals too', (() => {
  const bob = account('bob');
  core.buySlot(db, { id: bob, username: 'bob' }, slot.id, { advertiser: 'Bob Co', headline: 'Bob', tagline: '', url: 'https://b.test', color: '#3b82f6' });
  return core.getAdSlot(db, slot.id).views === 0 && n("SELECT COUNT(*) AS n FROM daily_counts WHERE source = 'ad_events' AND target = ?", slot.id) === 0;
})());

// ---- arrivals: the country list, 30 days
const arr = db.prepare('INSERT INTO arrivals (visitor, country, at) VALUES (?,?,?)');
for (let i = 0; i < 5; i++) arr.run(`v${i}`, 'FR', ago(RETENTION.arrivalDays + 2));
for (let i = 0; i < 3; i++) arr.run(`w${i}`, 'DE', ago(1));
const cityBefore = stats.overview(db, { now }).activity.find((a) => a.label === 'City visits');
const arrivals = R.pruneEvents(db, now).arrivals;
const cityAfter = stats.overview(db, { now }).activity.find((a) => a.label === 'City visits');
check('arrivals older than 30 days are deleted, the recent ones kept', arrivals === 5 && n('SELECT COUNT(*) AS n FROM arrivals') === 3 && !db.prepare("SELECT 1 FROM arrivals WHERE country = 'FR'").get());
check('...and the stats panel\'s city visits (yesterday, 7 days, total) do not change', JSON.stringify(cityAfter) === JSON.stringify(cityBefore) && cityAfter.total === 8, JSON.stringify(cityAfter));

// ---- coupon claims: the visitor number goes after 13 months, the claim stays
const claim = db.prepare('INSERT INTO coupon_claims (plot_id, visitor, code, at) VALUES (?,?,?,?)');
claim.run(plot.id, 'a42', 'CODE', ago(RETENTION.couponClaimDays + 1));
claim.run(plot.id, 'x-recent', 'CODE', ago(3));
check('old coupon claims lose their visitor number, keep counting against the stock', R.pruneCouponClaims(db, now) === 1 && n('SELECT COUNT(*) AS n FROM coupon_claims WHERE plot_id = ?', plot.id) === 2 && !db.prepare("SELECT 1 FROM coupon_claims WHERE visitor = 'a42'").get() && Boolean(db.prepare("SELECT 1 FROM coupon_claims WHERE visitor = 'x-recent'").get()));
check('...once only', R.pruneCouponClaims(db, now) === 0);

// ---- newsletter sign-ups
const lead = db.prepare('INSERT INTO leads (target_kind, target_id, email, status, token, created_at, confirmed_at, unsubscribed_at) VALUES (?,?,?,?,?,?,?,?)');
lead.run('world', 'world', 'stale@x.test', 'pending', 't1', ago(RETENTION.leadPendingDays + 1), null, null);
lead.run('world', 'world', 'new@x.test', 'pending', 't2', ago(2), null, null);
lead.run('world', 'world', 'reader@x.test', 'confirmed', 't3', ago(400), ago(400), null);
lead.run('world', 'world', 'left@x.test', 'unsubscribed', 't4', ago(400), ago(400), ago(RETENTION.leadUnsubscribedDays + 1));
lead.run('world', 'world', 'justleft@x.test', 'unsubscribed', 't5', ago(400), ago(400), ago(3));
lead.run('world', 'world', 'leftlongago@x.test', 'unsubscribed', 't6', ago(400), ago(400), null); // from before the date was kept
const leads = R.pruneLeads(db, now);
const emails = db.prepare('SELECT email FROM leads ORDER BY id').all().map((r) => r.email);
check('a sign-up never confirmed is deleted after 30 days; a new one is kept', !emails.includes('stale@x.test') && emails.includes('new@x.test') && leads.pending === 1);
check('one that unsubscribed is deleted 30 days after; a confirmed one is kept', !emails.includes('left@x.test') && emails.includes('justleft@x.test') && emails.includes('reader@x.test') && leads.unsubscribed === 1);
check('an unsubscribe from before its date was kept starts its 30 days now', emails.includes('leftlongago@x.test') && db.prepare("SELECT unsubscribed_at AS t FROM leads WHERE email = 'leftlongago@x.test'").get().t === now && R.pruneLeads(db, now + (RETENTION.leadUnsubscribedDays + 1) * DAY).unsubscribed === 2);

// ---- welcome posts on X
const post = db.prepare("INSERT INTO social_posts (kind, target_kind, target_id, account_id, text, status, created_at, decided_at, post_id) VALUES ('welcome', 'business', ?, ?, ?, ?, ?, ?, ?)");
post.run('1', amy, 'Welcome Amy @amy', 'rejected', ago(200), ago(RETENTION.socialUnpostedDays + 1), null);
post.run('2', amy, 'Welcome Amy2 @amy', 'posted', ago(200), ago(200), '123');
post.run('3', amy, 'Welcome Amy3 @amy', 'skipped', ago(RETENTION.socialUnpostedDays + 1), null, null);
post.run('4', amy, 'Welcome Amy4 @amy', 'rejected', ago(10), ago(10), null);
post.run('5', amy, 'Welcome Amy5 @amy', 'review', ago(200), null, null);
const texts = () => Object.fromEntries(db.prepare('SELECT target_id, text FROM social_posts').all().map((r) => [r.target_id, r.text]));
check('a welcome post never made: its text (with the handle) is wiped after 90 days', R.pruneSocialPosts(db, now) === 2 && texts()['1'] === R.POST_WIPED && texts()['3'] === R.POST_WIPED);
check('a post that was made, a recent refusal and one waiting for review are kept', texts()['2'] === 'Welcome Amy2 @amy' && texts()['4'] === 'Welcome Amy4 @amy' && texts()['5'] === 'Welcome Amy5 @amy' && n('SELECT COUNT(*) AS n FROM social_posts') === 5);

// ---- all of them, again: nothing more to do
const again = R.pruneAll(db, now);
check('running every job again changes nothing', JSON.stringify(again) === JSON.stringify({ sessions: 0, outbox: { wiped: 0, deleted: 0 }, events: { events: 0, ad_events: 0, business_events: 0, market_visits: 0, arrivals: 0 }, couponClaims: 0, leads: { pending: 0, unsubscribed: 0 }, socialPosts: 0 }), JSON.stringify(again));
let caught = null;
const broken = { prepare: () => { throw new Error('boom'); } };
R.pruneAll(broken, now, { onError: (job) => (caught ??= job) });
check('a job that fails does not stop the others (its error is reported)', caught === 'sessions');

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('ALL OK');
