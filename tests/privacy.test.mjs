// Privacy rights (services/api/privacy.mjs, docs/architecture/backend.md#privacy): every table is classified (a new table fails here until it is),
// the export carries every table it says it does, it is rate limited and holds no secrets; deleting an account needs the password and the
// name typed, does what TABLES says to each table (and leaves the person's name, email and words nowhere but the action log), cancels Pro in
// Stripe, waits for the messaging service when it holds messages; an owner deletes a business page; and the admin's privacy requests.
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { openDb } from '../services/api/db.mjs';
import { TABLES } from '../services/api/privacy.mjs';
import { hashOf } from '../services/api/economy.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const DAY = 86400000;

// ---- every table is classified ------------------------------------------------------------------------------------------------
// A table is "about people" when a column points at accounts or is named like one that holds a person (an account, a visitor, an email...).
const PERSONAL = /account|owner|sender|reporter|blocker|blocked|created_by|referred_by|actor|visitor|email|admin_id|author|who/;
const tablesOf = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((t) => t.name);
const aboutPeople = (db, t) => db.prepare(`PRAGMA foreign_key_list(${t})`).all().some((f) => f.table === 'accounts') || db.prepare(`PRAGMA table_info(${t})`).all().some((c) => PERSONAL.test(c.name));
const problemsOf = (db) => {
  const out = [];
  for (const t of tablesOf(db)) {
    const c = TABLES[t];
    if (!c) out.push(`${t}: not in privacy.mjs TABLES${aboutPeople(db, t) ? ' (it has a column about people)' : ''}`);
    else if (!c.deletion) out.push(`${t}: says nothing about deletion`);
    else if (!c.export && !c.excluded) out.push(`${t}: neither exported nor excluded with a reason`);
  }
  return out;
};
{
  const db = openDb(':memory:');
  const problems = problemsOf(db);
  check('every table of the database is classified: exported (where) or excluded (why), and what deletion does', problems.length === 0, problems.join('; '));
  check('and TABLES names no table that does not exist', Object.keys(TABLES).every((t) => tablesOf(db).includes(t)), Object.keys(TABLES).filter((t) => !tablesOf(db).includes(t)).join());
  check('a table about people that is excluded says why', Object.entries(TABLES).filter(([t, c]) => !c.export && aboutPeople(db, t)).every(([, c]) => c.excluded.length > 20));
  db.exec('CREATE TABLE loyalty_cards (id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id), points INTEGER)');
  check('a new table with an account_id column fails the check until it is classified', problemsOf(db).some((p) => p.startsWith('loyalty_cards') && /about people/.test(p)));
  db.close();
}

// ---- a stand-in Stripe and a stand-in messaging service ------------------------------------------------------------------------
const S = { calls: [], refunds: [], failSubs: false };
const stripeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    S.calls.push({ method: req.method, path: req.url, auth: req.headers.authorization });
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    if (req.url.startsWith('/v1/subscriptions/')) return S.failSubs ? reply(500, { error: { message: 'down' } }) : reply(200, { id: req.url.split('/').pop(), status: 'canceled' });
    if (/\/v1\/checkout\/sessions\/.+\/expire/.test(req.url)) return reply(200, { status: 'expired' });
    if (req.url.startsWith('/v1/invoices')) return reply(200, { data: [{ payment_intent: `pi_inv_${new URL(req.url, 'http://x').searchParams.get('subscription')}` }] });
    if (req.url === '/v1/refunds') return S.failSubs ? reply(500, { error: { message: 'down' } }) : (S.refunds.push({ ...Object.fromEntries(new URLSearchParams(body)), key: req.headers['idempotency-key'] }), reply(200, { id: `re_${S.refunds.length}` }));
    return reply(404, { error: { message: 'unknown' } });
  });
});
await new Promise((r) => stripeServer.listen(0, r));
const M = { calls: [], down: false };
const messagingServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    M.calls.push({ path: req.url, secret: req.headers['x-internal-secret'], body: body ? JSON.parse(body) : null });
    const reply = (status, data) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(data)));
    if (M.down) return reply(503, { error: 'down' });
    if (req.url === '/internal/privacy/export') return reply(200, { requests: true, blocks: [], conversations: [{ id: 'svc-conv', kind: 'direct', with: ['someone'], messages: [{ mine: true, from: 'x', text: 'from the service', state: 'ok', at: 1 }] }], nearby: [] });
    if (req.url === '/internal/privacy/erase') return reply(200, { messages: 1 });
    return reply(404, { error: 'unknown' });
  });
});
await new Promise((r) => messagingServer.listen(0, r));

const env = { ADMIN_TOKEN: 'admin', HUMAN_MIN_AGE_MS: '0', STRIPE_SECRET_KEY: 'sk_test_priv', STRIPE_API_URL: `http://localhost:${stripeServer.address().port}`, MP_NOTIFY_SECRET: 'mp-secret' };
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env, rate: { perMinute: 100000, authPerMinute: 100000 } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const db = api.db;
const call = async (method, p, { token, body, headers = {} } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 privacy test', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body == null ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
const signup = async (username, email) => (await call('POST', '/auth/signup', { body: { username, password: 'longenough1', ...(email ? { email } : {}) } })).data;
const ins = (table, row) => Number(db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row)).lastInsertRowid);
const cid = () => `cid-${Math.random().toString(36).slice(2, 12)}`;
const now = Date.now();

try {
  // ---- Amy has something in every table the export covers -------------------------------------------------------------------
  const amy = await signup('AmyPriv', 'amy.priv@example.test');
  const bob = await signup('BobPriv', 'bob.priv@example.test');
  const cat = await signup('CatPriv');
  const A = amy.account.id;
  db.prepare('UPDATE accounts SET email_verified = 1 WHERE id IN (?, ?)').run(A, bob.account.id);
  await call('POST', '/businesses', { token: amy.token, body: { name: 'Amy Meetings', category: 'services', website: 'https://amy.test', cta: { kind: 'meeting' } } });
  await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Quotes', category: 'services', cta: { kind: 'quote' } } });
  const amyBiz = db.prepare("SELECT id FROM businesses WHERE slug = 'amy-meetings'").get().id;
  const bobBiz = db.prepare("SELECT id FROM businesses WHERE slug = 'bob-quotes'").get().id;
  const lots = db.prepare('SELECT id FROM plots WHERE owner_name IS NULL AND claimable = 1 ORDER BY id LIMIT 3').all().map((p) => p.id);
  const claim = await call('POST', `/plots/${lots[0]}/claim`, { token: amy.token, body: { title: 'Amy Shop', buildingType: 'shop', website: 'https://amy.test', logo: { kind: 'generated' }, leaseDays: 30 } });
  check('(setup) Amy claims a plot', claim.status === 200, JSON.stringify(claim.data).slice(0, 200));
  await call('PUT', '/businesses/amy-meetings/plot', { token: amy.token, body: { plotId: lots[0] } });
  const city = db.prepare('SELECT id FROM plots WHERE owner_name IS NOT NULL AND owner_account IS NULL AND building_type IS NOT NULL AND claimable = 1 LIMIT 1').get().id;
  ins('plot_interiors', { plot_id: lots[0], account_id: A, design: '{"nodes":{}}', revision: 1, updated_at: now });
  // Bob asks Amy's page for a meeting; Amy sends Bob's page a quote request with her real name
  await call('POST', '/businesses/amy-meetings/events', { token: bob.token, body: { kind: 'view', visitor: 'bob-visitor-1' } });
  const ask = await call('POST', '/businesses/amy-meetings/inquiries', { token: bob.token, body: { kind: 'meeting', name: 'Bob Realname', email: 'bob.priv@example.test', message: 'Can we meet on Friday?', visitor: 'bob-visitor-1' } });
  check('(setup) Bob sends Amy\'s page a request', ask.status === 200, JSON.stringify(ask.data));
  await call('POST', '/businesses/bob-quotes/events', { token: amy.token, body: { kind: 'view', visitor: 'amy-visitor-1' } });
  const sent = await call('POST', '/businesses/bob-quotes/inquiries', { token: amy.token, body: { kind: 'quote', name: 'Amy Realname', email: 'amy.priv@example.test', phone: '555 0100', message: 'Forty cakes please, Amy Secretwords', visitor: 'amy-visitor-1' } });
  check('(setup) Amy sends Bob\'s page a request', sent.status === 200, JSON.stringify(sent.data));
  // messages: Amy writes to Bob, Bob replies; Amy blocks Cat
  const conv = (await call('POST', '/conversations', { token: amy.token, body: { accountId: bob.account.id, text: 'Hello Bob, Amy Secretwords here', clientMessageId: cid() } })).data.conversation?.id;
  await call('POST', `/conversations/${conv}/messages`, { token: bob.token, body: { text: 'Hi Amy, Bob here', clientMessageId: cid() } });
  await call('POST', '/messaging/blocks', { token: amy.token, body: { accountId: cat.account.id } });
  ins('nearby_messages', { sender: A, room: 'city', body: 'Amy Secretwords nearby', recipients: JSON.stringify([bob.account.id]), at: now });
  const ticket = (await call('POST', '/messaging/ticket', { token: amy.token })).data.ticket;
  ins('messaging_outbox', { account_id: A, event: JSON.stringify({ type: 'inbox.changed', conversationId: conv }), next_at: now, created_at: now });
  // the storefront, quests, feedback, reports, coupons, leads
  await call('POST', `/plots/${city}/feedback`, { token: amy.token, body: { message: 'Lovely place, Amy Secretwords' } });
  const fb = db.prepare('SELECT id FROM feedback WHERE account_id = ?').get(A).id;
  const rep = await call('POST', '/reports', { token: amy.token, body: { kind: 'plot', id: city, reason: 'spam', note: 'my own note Amy Secretwords' } });
  check('(setup) Amy reports a building', rep.status === 200, JSON.stringify(rep.data));
  ins('coupon_claims', { plot_id: city, visitor: `a${A}`, code: 'SAVE-10', at: now, ticket: 'ABC123' });
  ins('quest_sessions', { plot_id: city, account_id: A, started_at: now });
  ins('quest_claims', { plot_id: lots[2], account_id: A, gold: 5, at: now });
  ins('leads', { target_kind: 'world', target_id: 'world', email: 'amy.priv@example.test', status: 'confirmed', token: 'tok-amy-world', created_at: now, confirmed_at: now });
  ins('leads', { target_kind: 'plot', target_id: String(lots[0]), email: 'fan.of.amy@example.test', status: 'confirmed', token: 'tok-fan', created_at: now, confirmed_at: now });
  ins('leads', { target_kind: 'business', target_id: String(amyBiz), email: 'fan2.of.amy@example.test', status: 'confirmed', token: 'tok-fan2', created_at: now, confirmed_at: now });
  // ads
  const slot = db.prepare('SELECT id FROM ad_slots WHERE owner_account IS NULL LIMIT 1').get().id;
  db.prepare('UPDATE ad_slots SET owner_account = ?, ad = ? WHERE id = ?').run(A, JSON.stringify({ advertiser: 'Amy Realname Ads', headline: 'Amy Secretwords sale', tagline: 't', url: 'https://amy.test', color: 'cyan' }), slot);
  ins('ad_ledger', { slot_id: slot, account_id: A, advertiser: 'Amy Realname Ads', headline: 'Amy Secretwords sale', price: 10, at: now });
  ins('ad_events', { slot_id: slot, kind: 'view', visitor: `a${A}`, at: now });
  ins('events', { plot_id: city, kind: 'visit', source: 'street', visitor: `a${A}`, at: now });
  // market, presence, votes
  const booking = ins('market_bookings', { site_code: 'SD-0001', week_start: '2026-10-19', stall_id: 's1', account_id: A, account_name: 'AmyPriv', brand: 'Amy Realname Stall', product: 'cakes', start_at: now + DAY, end_at: now + 2 * DAY, hours: 24, cents: 500, status: 'booked', created_at: now });
  const pastBooking = ins('market_bookings', { site_code: 'SD-0001', week_start: '2026-10-12', stall_id: 's2', account_id: A, account_name: 'AmyPriv', brand: 'Amy Realname Stall', product: 'cakes', start_at: now - 3 * DAY, end_at: now - 2 * DAY, hours: 24, cents: 500, status: 'booked', created_at: now - 4 * DAY });
  ins('market_visits', { booking_id: pastBooking, visitor: `a${A}`, hour: 1, at: now });
  ins('presence', { visitor: `a${A}`, country: 'GB', account_id: A, first_at: now, last_at: now });
  ins('arrivals', { visitor: `a${A}`, country: 'GB', at: now });
  ins('hunt_wins', { account_id: A, day: '2026-10-20', at: now });
  ins('votes', { week: '2026-10-19', account_id: A, plot_id: city, at: now });
  // business data: interest, a welcome post, the pilot, Pro
  await call('POST', '/businesses/amy-meetings/interest', { token: amy.token, body: { plan: 'launch' } });
  ins('social_posts', { kind: 'welcome', target_kind: 'business', target_id: String(amyBiz), account_id: A, text: 'Welcome Amy Realname @amyx', status: 'review', created_at: now });
  ins('pilot_members', { business_id: amyBiz, joined_at: now });
  ins('owner_activity', { business_id: amyBiz, week: '2026-10-19', first_at: now });
  ins('pilot_feedback', { business_id: amyBiz, account_id: A, week: '2026-10-19', rating: 4, result: 'Amy Secretwords got a client', missing: 'more', would_pay: 'yes', created_at: now });
  const proOrder = ins('orders', { account_id: A, business_id: amyBiz, product: 'pro', label: 'Pro', cents: 1900, status: 'paid', stripe_subscription: 'sub_amy', created_at: now, paid_at: now });
  ins('entitlements', { business_id: amyBiz, order_id: proOrder, kind: 'pro', starts_at: now, ends_at: now + 30 * DAY });
  const pending = ins('orders', { account_id: A, product: 'lease', target: `plot:${lots[1]}`, label: 'Lease', cents: 700, status: 'pending', stripe_session: 'cs_amy_open', hold_until: now + 1800000, created_at: now });
  const promoId = ins('promo_codes', { code: 'AMYTEST', kind: 'percent', value: 10, applies_to: '["all"]', created_by: `account:${A}`, created_at: now, updated_at: now });
  ins('promo_redemptions', { promo_id: promoId, code: 'AMYTEST', account_id: A, order_id: proOrder, cents_off: 190, status: 'redeemed', created_at: now, updated_at: now });
  // a paid ad booking, refunded in part, whose payment was disputed and won (billing.mjs)
  const slot2 = db.prepare('SELECT id FROM ad_slots WHERE owner_account IS NULL AND id != ? LIMIT 1').get(slot).id;
  const adOrder = ins('orders', { account_id: A, product: 'ad', target: `ad:${slot2}`, label: 'Ad space', cents: 1200, refunded_cents: 100, status: 'paid', stripe_payment_intent: 'pi_amy_ad', created_at: now, paid_at: now });
  ins('ad_terms', { slot_id: slot2, order_id: adOrder, account_id: A, ad: JSON.stringify({ advertiser: 'Amy Realname Ads', headline: 'Amy Secretwords week', tagline: '', url: '', color: '#00ffff' }), starts_at: now, ends_at: now + 7 * DAY, status: 'active' });
  ins('order_refunds', { order_id: adOrder, cents: 100, full: 0, source: 'admin', note: 'goodwill', at: now });
  ins('disputes', { stripe_dispute: 'dp_amy', order_id: adOrder, cents: 1200, reason: 'fraudulent', status: 'won', created_at: now, closed_at: now });
  ins('carts', { account_id: A, created_at: now, updated_at: now });
  ins('cart_items', { account_id: A, kind: 'launch', target: `business:${amyBiz}`, business_id: amyBiz, label: 'Launch Pack', cents: 900, created_at: now });
  // the plot economy
  ins('plot_holds', { plot_id: lots[2], account_id: A, started_at: now, hold_until: now + 180000 });
  ins('plot_intents', { plot_id: lots[2], kind: 'claim', step: 'card_open', account_id: A, at: now });
  ins('plot_watches', { plot_id: city, account_id: A, created_at: now });
  ins('traffic_seen', { day: '2026-10-21', area_id: '1:1', who: hashOf(undefined, `a${A}`), hours: 1 });
  // Bob is referred by Amy
  db.prepare('UPDATE accounts SET referred_by = ? WHERE id = ?').run(A, bob.account.id);

  // ---- the export ----------------------------------------------------------------------------------------------------------
  check('the export needs a sign-in', (await call('GET', '/me/export')).status === 401);
  const ex = await call('GET', '/me/export', { token: amy.token });
  const x = ex.data;
  check('the export is JSON with a format, a version and a readable summary', ex.status === 200 && x.format === 'voxelventure.account-export' && x.version === 1 && Array.isArray(x.summary) && x.summary.some((l) => /AmyPriv/.test(l)), JSON.stringify(x).slice(0, 200));
  // what each exported table looks like in it: a new exported table needs a line here
  const IN_EXPORT = {
    accounts: () => x.account.username === 'AmyPriv' && x.account.email === 'amy.priv@example.test' && x.account.emailVerified,
    sessions: () => x.sessions.length >= 1 && x.sessions.every((s) => s.expiresAt && !('token' in s) && !('tokenHash' in s)),
    plots: () => x.plots.some((p) => p.id === lots[0] && p.title === 'Amy Shop'),
    plot_interiors: () => x.plots.some((p) => p.interior?.revision === 1),
    ledger: () => x.plotHistory.some((l) => l.plotId === lots[0] && l.kind === 'claim'),
    events: () => x.activity.visits.some((v) => v.plotId === city),
    ad_slots: () => x.adSpaces.some((s) => s.id === slot && s.ad.advertiser === 'Amy Realname Ads'),
    ad_ledger: () => x.adHistory.length === 1,
    ad_terms: () => x.adBookings.some((b) => b.orderId === adOrder && b.ad.advertiser === 'Amy Realname Ads'),
    order_refunds: () => x.orders.find((o) => o.id === adOrder).refunds.some((r) => r.cents === 100) && x.orders.find((o) => o.id === adOrder).refundedCents === 100,
    disputes: () => x.disputes.some((d) => d.orderId === adOrder && d.reason === 'fraudulent' && d.status === 'won'),
    ad_events: () => x.activity.adViews.length === 1,
    coupon_claims: () => x.couponClaims.some((c) => c.code === 'SAVE-10'),
    leads: () => x.newsletters.mine.some((l) => l.kind === 'world') && x.plots[0].newsletterSignups.confirmed.some((l) => l.email === 'fan.of.amy@example.test') && x.businesses[0].newsletterSignups.confirmed.length === 1,
    feedback: () => x.feedbackPosted.some((f) => /Lovely place/.test(f.message)),
    quest_sessions: () => x.quests.started.length === 1,
    quest_claims: () => x.quests.earned.length === 1,
    gold_ledger: () => x.credits.ledger.some((l) => l.reason === 'starter'),
    outbox: () => x.emails.some((e) => e.kind === 'verify') && x.emails.every((e) => !('body' in e)),
    reports: () => x.reportsMade.some((r) => r.kind === 'plot' && /my own note/.test(r.note)),
    market_bookings: () => x.marketStalls.length === 2,
    market_visits: () => x.activity.stallVisits.length === 1,
    presence: () => x.activity.online.length === 1,
    arrivals: () => x.activity.arrivals.length >= 1,
    hunt_wins: () => x.buildingOfTheWeek.huntWins.length === 1,
    votes: () => x.buildingOfTheWeek.votes.length === 1,
    nearby_messages: () => x.messaging.nearby.some((n) => /nearby/.test(n.text)),
    conversations: () => x.messaging.conversations.some((c) => c.id === conv && c.with.includes('BobPriv')),
    conversation_members: () => x.messaging.conversations.some((c) => c.myStatus === 'accepted'),
    messages: () => { const c = x.messaging.conversations.find((q) => q.id === conv); return c.messages.some((m) => m.mine && /Hello Bob/.test(m.text)) && c.messages.some((m) => !m.mine && m.from === 'BobPriv' && /Hi Amy/.test(m.text)); },
    account_blocks: () => x.messaging.blocks.some((b) => b.username === 'CatPriv'),
    businesses: () => x.businesses.length === 1 && x.businesses[0].slug === 'amy-meetings',
    business_events: () => x.activity.profileVisits.some((v) => v.business === 'bob-quotes') && typeof x.businesses[0].figures.views === 'number',
    business_inquiries: () => x.businesses[0].requests.some((q) => q.name === 'Bob Realname' && q.email === 'bob.priv@example.test') && x.requestsSent.some((q) => q.name === 'Amy Realname'),
    upgrade_interest: () => x.businesses[0].upgradeInterest.some((u) => u.plan === 'launch'),
    audit_log: () => x.actionLog.some((l) => l.action === 'account.create') && x.actionLog.some((l) => l.action === 'plot.claim'),
    social_posts: () => x.welcomePosts.length === 1,
    orders: () => x.orders.some((o) => o.id === proOrder && o.cents === 1900) && x.orders.every((o) => !('stripeSubscription' in o) && !('stripe_session' in o)),
    carts: () => x.cart && x.cart.items.length === 1,
    cart_items: () => x.cart.items[0].label === 'Launch Pack',
    promo_codes: () => x.promoCodesMade.length === 1,
    promo_redemptions: () => x.promoUses.some((p) => p.code === 'AMYTEST'),
    entitlements: () => x.businesses[0].plans.some((p) => p.kind === 'pro'),
    pilot_members: () => x.businesses[0].pilot?.joinedAt > 0,
    owner_activity: () => x.businesses[0].activeWeeks.includes('2026-10-19'),
    pilot_feedback: () => x.businesses[0].pilotFeedback.some((f) => f.rating === 4),
    plot_holds: () => x.plotHolds.some((h) => h.plotId === lots[2]),
    plot_intents: () => x.plotSteps.some((s) => s.step === 'card_open'),
    plot_watches: () => x.watches.some((w) => w.plotId === city),
  };
  const exported = Object.entries(TABLES).filter(([, c]) => c.export).map(([t]) => t);
  check('every exported table has a check here', exported.every((t) => IN_EXPORT[t]), exported.filter((t) => !IN_EXPORT[t]).join());
  for (const t of exported) {
    let ok = false;
    try { ok = Boolean(IN_EXPORT[t]?.()); } catch { ok = false; }
    check(`the export carries ${t} (${TABLES[t].export.split(' ')[0]})`, ok);
  }
  check('every excluded table is listed in the export with its reason', Object.entries(TABLES).filter(([, c]) => !c.export).every(([t, c]) => x.notIncluded.some((n) => n.table === t && n.why === c.excluded)));
  const flat = JSON.stringify(x);
  check('the export holds no password hash, salt, token, network hash or card detail', !/pass_hash|pass_salt|token_hash|ip_hash|stripe_subscription|sub_amy|cs_amy_open/.test(flat) && !flat.includes(amy.token) && !flat.includes(String(ticket)));
  check('nor another person\'s account number in the messages', !x.messaging.conversations.some((c) => JSON.stringify(c).includes(`"id":${bob.account.id}`)));
  check('the export is in the action log, without its contents', (await call('GET', `/admin/audit?action=account.export&target_kind=account&target_id=${A}`, { token: 'admin' })).data.entries.length === 1);

  // rate limit: 3 a day
  for (let i = 0; i < 2; i++) await call('GET', '/me/export', { token: amy.token });
  const fourth = await call('GET', '/me/export', { token: amy.token });
  check('the export is limited to three a day per account', fourth.status === 429 && fourth.data.code === 'rate_limited');
  check('(another account is not limited by it)', (await call('GET', '/me/export', { token: cat.token })).status === 200);

  // ---- deleting a business page (the owner) ---------------------------------------------------------------------------------
  const cBiz = await call('POST', '/businesses', { token: cat.token, body: { name: 'Cat Corner', category: 'food', website: 'https://cat.test' } });
  const catBiz = db.prepare("SELECT id FROM businesses WHERE slug = 'cat-corner'").get().id;
  await call('POST', '/businesses/cat-corner/events', { token: bob.token, body: { kind: 'view', visitor: 'bob-visitor-1' } });
  const catPlot = lots[1];
  db.prepare('UPDATE plots SET owner_account = ?, owner_name = ?, title = ? WHERE id = ?').run(cat.account.id, 'CatPriv', 'Cat Shop', catPlot);
  await call('PUT', '/businesses/cat-corner/plot', { token: cat.token, body: { plotId: catPlot } });
  const catPro = ins('orders', { account_id: cat.account.id, business_id: catBiz, product: 'pro', cents: 1900, status: 'paid', stripe_subscription: 'sub_cat', created_at: now, paid_at: now });
  ins('entitlements', { business_id: catBiz, order_id: catPro, kind: 'pro', starts_at: now, ends_at: now + 30 * DAY });
  check('(setup) Cat has a page linked to a plot', cBiz.status === 200 && (await call('GET', `/plots/${catPlot}`)).data.profileSlug === 'cat-corner');
  check('deleting a page needs its owner', (await call('DELETE', '/businesses/cat-corner')).status === 401 && (await call('DELETE', '/businesses/cat-corner', { token: bob.token })).status === 403);
  S.calls.length = 0;
  const gone = await call('DELETE', '/businesses/cat-corner', { token: cat.token });
  check('the page\'s Pro month is refunded first, for its unused time (prorata.mjs)', gone.data.refunds?.totalCents > 0 && S.refunds.some((x) => x.key === `vv-prorata-${catPro}` && Number(x.amount) === gone.data.refunds.totalCents), JSON.stringify(gone.data.refunds));
  check('the owner deletes the page, and its Pro is cancelled in Stripe at once', gone.status === 200 && gone.data.deleted && gone.data.proCancelled && S.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/subscriptions/sub_cat' && c.auth === 'Bearer sk_test_priv'), JSON.stringify(gone.data));
  check('the page is gone: no public page, not in Discover or the sitemap', (await call('GET', '/businesses/cat-corner')).status === 404 && !(await call('GET', '/businesses')).data.profiles.some((p) => p.name === 'Cat Corner') && !(await call('GET', '/businesses/sitemap')).data.entries.some((e) => e.slug === 'cat-corner'));
  check('its plot is unlinked', (await call('GET', `/plots/${catPlot}`)).data.profileSlug === null);
  const catRow = db.prepare('SELECT * FROM businesses WHERE id = ?').get(catBiz);
  check('its figures are kept in total only: the events are deleted', catRow.status === 'deleted' && JSON.parse(catRow.final_stats).views === 1 && db.prepare('SELECT COUNT(*) AS n FROM business_events WHERE business_id = ?').get(catBiz).n === 0 && catRow.name === 'Deleted business' && catRow.website === null);
  check('the order stays, Pro has ended', db.prepare('SELECT status FROM orders WHERE id = ?').get(catPro).status === 'paid' && db.prepare("SELECT status FROM entitlements WHERE order_id = ?").get(catPro).status === 'revoked');
  check('the name can be used again for a new page', (await call('POST', '/businesses', { token: cat.token, body: { name: 'Cat Corner', category: 'food' } })).data.slug === 'cat-corner');
  check('the deletion is in the action log', (await call('GET', '/admin/audit?action=business.delete', { token: 'admin' })).data.entries.length === 1);

  // ---- deleting the account: re-authentication ------------------------------------------------------------------------------
  check('deleting needs a sign-in', (await call('POST', '/me/delete', { body: { password: 'longenough1', confirm: 'AmyPriv' } })).status === 401);
  check('a wrong password is refused', (await call('POST', '/me/delete', { token: amy.token, body: { password: 'not-it-at-all', confirm: 'AmyPriv' } })).status === 401);
  check('without the name typed it is refused', (await call('POST', '/me/delete', { token: amy.token, body: { password: 'longenough1', confirm: 'Amy' } })).data.code === 'confirm_name');
  check('a form from another site cannot do it (JSON only)', (await fetch(`${base}/me/delete`, { method: 'POST', headers: { Authorization: `Bearer ${amy.token}`, 'Content-Type': 'text/plain' }, body: '{}' })).status === 403);
  check('nothing changed so far', db.prepare('SELECT deleted_at FROM accounts WHERE id = ?').get(A).deleted_at === null);
  // Stripe is down: nothing happens, she can try again
  S.failSubs = true;
  const down = await call('POST', '/me/delete', { token: amy.token, body: { password: 'longenough1', confirm: 'AmyPriv' } });
  check('if Stripe cannot cancel Pro, nothing is deleted', down.status === 502 && db.prepare('SELECT username FROM accounts WHERE id = ?').get(A).username === 'AmyPriv' && (await call('GET', '/me', { token: amy.token })).status === 200, JSON.stringify(down.data));
  S.failSubs = false;
  S.calls.length = 0;
  const del = await call('POST', '/me/delete', { token: amy.token, body: { password: 'longenough1', confirm: 'amypriv' } });
  const tomb = `deleted-${A}`;
  check('the right password and name delete the account', del.status === 200 && del.data.deleted === true && del.data.username === tomb, JSON.stringify(del.data).slice(0, 300));
  check('the answer says what was kept and why, and what was removed', del.data.kept.some((k) => /accounting/.test(k.why)) && del.data.removed.length >= 4);
  check('the unused time is refunded first (prorata.mjs): Pro\'s month and the ad week (less what was refunded of it), and the answer says so', S.refunds.some((r) => r.key === `vv-prorata-${proOrder}` && r.payment_intent === 'pi_inv_sub_amy') && S.refunds.some((r) => r.key === `vv-prorata-${adOrder}` && r.payment_intent === 'pi_amy_ad' && Number(r.amount) === Math.floor((1100 * 6) / 7)) && del.data.refunds.totalCents === S.refunds.filter((r) => [`vv-prorata-${proOrder}`, `vv-prorata-${adOrder}`].includes(r.key)).reduce((a, r) => a + Number(r.amount), 0) && del.data.refunds.lines.length === 2, JSON.stringify([S.refunds, del.data.refunds]));
  check('Pro is cancelled in Stripe at once, and open checkouts are closed', S.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/subscriptions/sub_amy') && (await new Promise((r) => setTimeout(r, 200)), S.calls.some((c) => c.path === '/v1/checkout/sessions/cs_amy_open/expire')));

  // ---- what happened to each table ----------------------------------------------------------------------------------------
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const acct = one('SELECT * FROM accounts WHERE id = ?', A);
  const AFTER = {
    accounts: () => acct.username === tomb && acct.email === null && acct.email_token === null && acct.notify === 0 && acct.gold === 0 && acct.deleted_at > 0 && acct.banned === 1 && n('SELECT COUNT(*) AS n FROM accounts WHERE referred_by = ?', A) === 0,
    sessions: () => n('SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?', A) === 0,
    plots: () => { const p = one('SELECT * FROM plots WHERE id = ?', lots[0]); return p.owner_account === null && p.owner_name === null && p.lease_end === null && n('SELECT COUNT(*) AS n FROM plots WHERE owner_account = ?', A) === 0; },
    plot_interiors: () => n('SELECT COUNT(*) AS n FROM plot_interiors WHERE account_id = ? OR plot_id = ?', A, lots[0]) === 0,
    ledger: () => n('SELECT COUNT(*) AS n FROM ledger WHERE account_id = ? AND owner_name = ?', A, tomb) >= 1 && one("SELECT kind FROM ledger WHERE plot_id = ? ORDER BY id DESC LIMIT 1", lots[0]).kind === 'open',
    events: () => n('SELECT COUNT(*) AS n FROM events WHERE visitor = ?', `a${A}`) === 0 && n("SELECT COUNT(*) AS n FROM events WHERE plot_id = ? AND visitor LIKE 'z%'", city) === 1,
    ad_slots: () => one('SELECT * FROM ad_slots WHERE id = ?', slot).ad === null && one('SELECT * FROM ad_slots WHERE id = ?', slot).owner_account === null,
    ad_ledger: () => one('SELECT * FROM ad_ledger WHERE account_id = ?', A).advertiser === '(removed)' && one('SELECT * FROM ad_ledger WHERE account_id = ?', A).price === 10,
    ad_terms: () => one('SELECT * FROM ad_terms WHERE order_id = ?', adOrder).status === 'removed' && one('SELECT * FROM ad_terms WHERE order_id = ?', adOrder).ad === '{}' && !/Amy/.test(one('SELECT * FROM ad_slots WHERE id = ?', slot2).ad ?? ''),
    order_refunds: () => n('SELECT COUNT(*) AS n FROM order_refunds WHERE order_id = ?', adOrder) >= 1,
    disputes: () => n('SELECT COUNT(*) AS n FROM disputes WHERE order_id = ?', adOrder) === 1,
    ad_events: () => n('SELECT COUNT(*) AS n FROM ad_events WHERE visitor = ?', `a${A}`) === 0 && n('SELECT COUNT(*) AS n FROM ad_events WHERE slot_id = ?', slot) === 1,
    coupon_claims: () => n('SELECT COUNT(*) AS n FROM coupon_claims WHERE visitor = ?', `a${A}`) === 0 && n('SELECT COUNT(*) AS n FROM coupon_claims WHERE plot_id = ?', city) === 1,
    leads: () => n("SELECT COUNT(*) AS n FROM leads WHERE email LIKE '%amy%'") === 0,
    feedback: () => { const f = one('SELECT * FROM feedback WHERE id = ?', fb); return f.author === tomb && f.message === '' && f.hidden === 2; },
    quest_sessions: () => n('SELECT COUNT(*) AS n FROM quest_sessions WHERE account_id = ?', A) === 0,
    quest_claims: () => n('SELECT COUNT(*) AS n FROM quest_claims WHERE account_id = ?', A) === 1,
    gold_ledger: () => n('SELECT COUNT(*) AS n FROM gold_ledger WHERE account_id = ?', A) >= 1,
    outbox: () => n("SELECT COUNT(*) AS n FROM outbox WHERE to_email = 'amy.priv@example.test'") === 0,
    reports: () => one('SELECT * FROM reports WHERE reporter = ?', A).note === null,
    market_layouts: () => true,
    market_bookings: () => one('SELECT * FROM market_bookings WHERE id = ?', booking).status === 'cancelled' && one('SELECT * FROM market_bookings WHERE id = ?', pastBooking).status === 'booked' && n('SELECT COUNT(*) AS n FROM market_bookings WHERE account_id = ? AND (account_name != ? OR brand IS NOT NULL)', A, tomb) === 0,
    market_visits: () => n('SELECT COUNT(*) AS n FROM market_visits WHERE visitor = ?', `a${A}`) === 0 && n('SELECT COUNT(*) AS n FROM market_visits WHERE booking_id = ?', pastBooking) === 1,
    presence: () => n('SELECT COUNT(*) AS n FROM presence WHERE account_id = ? OR visitor = ?', A, `a${A}`) === 0,
    arrivals: () => n('SELECT COUNT(*) AS n FROM arrivals WHERE visitor = ?', `a${A}`) === 0 && n("SELECT COUNT(*) AS n FROM arrivals WHERE visitor LIKE 'z%'") >= 1,
    hunt_wins: () => n('SELECT COUNT(*) AS n FROM hunt_wins WHERE account_id = ?', A) === 0,
    votes: () => n('SELECT COUNT(*) AS n FROM votes WHERE account_id = ?', A) === 1,
    messaging_tickets: () => n('SELECT COUNT(*) AS n FROM messaging_tickets WHERE account_id = ?', A) === 0,
    nearby_messages: () => one('SELECT * FROM nearby_messages WHERE sender = ?', A).body === null,
    conversations: () => n('SELECT COUNT(*) AS n FROM conversations WHERE id = ?', conv) === 1,
    conversation_members: () => one('SELECT status FROM conversation_members WHERE conversation_id = ? AND account_id = ?', conv, A).status === 'declined',
    messages: () => n('SELECT COUNT(*) AS n FROM messages WHERE sender = ? AND body IS NOT NULL', A) === 0 && n('SELECT COUNT(*) AS n FROM messages WHERE sender = ? AND body IS NOT NULL', bob.account.id) === 1,
    account_blocks: () => n('SELECT COUNT(*) AS n FROM account_blocks WHERE blocker = ? OR blocked = ?', A, A) === 0,
    messaging_outbox: () => n('SELECT COUNT(*) AS n FROM messaging_outbox WHERE account_id = ?', A) === 0,
    businesses: () => { const b = one('SELECT * FROM businesses WHERE id = ?', amyBiz); return b.status === 'deleted' && b.name === 'Deleted business' && b.plot_id === null && JSON.parse(b.final_stats).requests >= 0; },
    business_events: () => n('SELECT COUNT(*) AS n FROM business_events WHERE business_id = ?', amyBiz) === 0 && n('SELECT COUNT(*) AS n FROM business_events WHERE visitor = ?', `a${A}`) === 0 && n("SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND visitor LIKE 'z%'", bobBiz) === 1,
    business_inquiries: () => n('SELECT COUNT(*) AS n FROM business_inquiries WHERE business_id = ?', amyBiz) === 0 && one('SELECT * FROM business_inquiries WHERE business_id = ?', bobBiz).email === '' && one('SELECT * FROM business_inquiries WHERE business_id = ?', bobBiz).message === null,
    upgrade_interest: () => n('SELECT COUNT(*) AS n FROM upgrade_interest WHERE account_id = ?', A) === 0,
    audit_log: () => n("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'account.delete' AND target_id = ?", String(A)) === 1,
    social_posts: () => { const s = one('SELECT * FROM social_posts WHERE account_id = ?', A); return s.status === 'rejected' && s.text === ''; },
    orders: () => one('SELECT * FROM orders WHERE id = ?', proOrder).status === 'paid' && one('SELECT * FROM orders WHERE id = ?', proOrder).account_id === A && one('SELECT * FROM orders WHERE id = ?', pending).status === 'expired',
    carts: () => n('SELECT COUNT(*) AS n FROM carts WHERE account_id = ?', A) === 0,
    cart_items: () => n('SELECT COUNT(*) AS n FROM cart_items WHERE account_id = ?', A) === 0,
    promo_codes: () => n('SELECT COUNT(*) AS n FROM promo_codes WHERE id = ?', promoId) === 1,
    promo_redemptions: () => one('SELECT status FROM promo_redemptions WHERE promo_id = ?', promoId).status === 'redeemed',
    stripe_events: () => true,
    entitlements: () => one('SELECT status FROM entitlements WHERE order_id = ?', proOrder).status === 'revoked',
    pilot_members: () => one('SELECT left_at FROM pilot_members WHERE business_id = ?', amyBiz).left_at > 0,
    owner_activity: () => n('SELECT COUNT(*) AS n FROM owner_activity WHERE business_id = ?', amyBiz) === 1,
    pilot_feedback: () => { const f = one('SELECT * FROM pilot_feedback WHERE business_id = ?', amyBiz); return f.rating === 4 && f.result === null && f.missing === null; },
    plot_holds: () => n('SELECT COUNT(*) AS n FROM plot_holds WHERE account_id = ?', A) === 0,
    plot_intents: () => n('SELECT COUNT(*) AS n FROM plot_intents WHERE account_id = ?', A) === 0 && n("SELECT COUNT(*) AS n FROM plot_intents WHERE plot_id = ? AND step = 'card_open'", lots[2]) === 1,
    street_traffic: () => true,
    traffic_seen: () => n('SELECT COUNT(*) AS n FROM traffic_seen WHERE who = ?', hashOf(undefined, `a${A}`)) === 0,
    plot_watches: () => n('SELECT COUNT(*) AS n FROM plot_watches WHERE account_id = ?', A) === 0,
    admin_accounts: () => true,
    admin_sessions: () => true,
    admin_tokens: () => true,
  };
  check('every table has a deletion check here', Object.keys(TABLES).every((t) => AFTER[t]), Object.keys(TABLES).filter((t) => !AFTER[t]).join());
  for (const t of Object.keys(TABLES)) {
    let ok = false;
    try { ok = Boolean(AFTER[t]?.()); } catch { ok = false; }
    check(`after deletion, ${t}: ${TABLES[t].deletion.slice(0, 90)}`, ok);
  }
  // her name, email and words are nowhere but the action log (which cannot change, and says only what it said then)
  const needles = ['AmyPriv', 'amy.priv@example.test', 'Amy Realname', 'Amy Secretwords', '555 0100'];
  const found = [];
  for (const t of Object.keys(TABLES).filter((t) => t !== 'audit_log')) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    for (const row of db.prepare(`SELECT * FROM ${t}`).all()) for (const c of cols) if (typeof row[c] === 'string' && needles.some((s) => row[c].toLowerCase().includes(s.toLowerCase()))) found.push(`${t}.${c}`);
  }
  check('her name, email, real name, words and phone are left in no table but the action log', found.length === 0, [...new Set(found)].join(', '));
  check('the action log is still whole', (await call('GET', '/admin/audit/verify', { token: 'admin' })).data.ok === true);
  check('her sign-in no longer works, nor her password', (await call('GET', '/me', { token: amy.token })).status === 401 && (await call('POST', '/auth/login', { body: { username: 'AmyPriv', password: 'longenough1' } })).status === 401 && (await call('POST', '/auth/login', { body: { username: tomb, password: 'longenough1' } })).status === 401);
  check('chat no longer knows her: her ticket is gone', (await call('POST', '/internal/messaging/redeem', { body: { ticket }, headers: { 'X-Internal-Secret': 'mp-secret' } })).status === 401);
  const bobConv = (await call('GET', `/conversations/${conv}/messages`, { token: bob.token })).data;
  check('Bob keeps the conversation: his message, hers wiped, under her new name', bobConv.messages.some((m) => m.text === 'Hi Amy, Bob here') && bobConv.messages.filter((m) => m.sender.username === tomb).every((m) => m.text === null));
  check('her plot is open again and her page is gone', (await call('GET', `/plots/${lots[0]}`)).data.owner === null && (await call('GET', '/businesses/amy-meetings')).status === 404);
  check('the name deleted-<n> cannot be signed up for', (await call('POST', '/auth/signup', { body: { username: 'deleted-999', password: 'longenough1' } })).status === 409);
  check('an account cannot be deleted twice', (await call('POST', `/admin/accounts/${A}/delete`, { token: 'admin', body: { confirm: tomb } })).data.code === 'already_deleted');

  // ---- the admin's privacy requests ------------------------------------------------------------------------------------------
  const dee = await signup('DeePriv', 'dee.priv@example.test');
  check('admin: finding an account needs an admin', (await call('GET', '/admin/privacy/accounts?q=DeePriv', { token: dee.token })).status === 403);
  const found2 = (await call('GET', '/admin/privacy/accounts?q=DEE.PRIV@example.test', { token: 'admin' })).data;
  check('admin: an account is found by its email (any case), name or number', found2.accounts.length === 1 && found2.accounts[0].username === 'DeePriv' && (await call('GET', `/admin/privacy/accounts?q=${dee.account.id}`, { token: 'admin' })).data.accounts[0].id === dee.account.id);
  check('admin: the export for a person who wrote in', (await call('GET', `/admin/accounts/${dee.account.id}/export`, { token: 'admin' })).data.account?.username === 'DeePriv' && (await call('GET', `/admin/accounts/${dee.account.id}/export`, { token: dee.token })).status === 403);
  check('admin: deleting needs the name typed', (await call('POST', `/admin/accounts/${dee.account.id}/delete`, { token: 'admin', body: { confirm: 'nope' } })).data.code === 'confirm_name');
  const adminDel = await call('POST', `/admin/accounts/${dee.account.id}/delete`, { token: 'admin', body: { confirm: 'DeePriv', reason: 'asked by email' } });
  const entry = (await call('GET', `/admin/audit?action=account.delete&target_id=${dee.account.id}`, { token: 'admin' })).data.entries[0];
  check('admin: deleting for an email request, recorded as the admin\'s with the reason', adminDel.status === 200 && entry.actor.kind === 'admin' && entry.detail.reason === 'asked by email' && entry.detail.by === 'admin');
} catch (e) {
  fails++;
  console.log('FAIL threw', e);
} finally {
  await api.close();
}

// ---- with the Python messaging service holding messages: its part is asked of it, and a deletion waits for it ---------------------
const svcEnv = { ADMIN_TOKEN: 'admin', MESSAGING_SERVICE_URL: `http://localhost:${messagingServer.address().port}`, INTERNAL_SECRET: 'inside-secret' };
const api2 = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: svcEnv });
await new Promise((r) => api2.server.listen(0, r));
try {
  const b2 = `http://localhost:${api2.server.address().port}`;
  const c2 = async (method, p, { token, body } = {}) => {
    const res = await fetch(b2 + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const eve = (await c2('POST', '/auth/signup', { body: { username: 'EvePriv', password: 'longenough1' } })).data;
  const ex2 = await c2('GET', '/me/export', { token: eve.token });
  check('with the messaging service, the export\'s messages come from it (with the shared secret)', ex2.data.messaging.conversations[0]?.id === 'svc-conv' && M.calls.some((c) => c.path === '/internal/privacy/export' && c.secret === 'inside-secret' && c.body.accountId === eve.account.id));
  M.down = true;
  const refused = await c2('POST', '/me/delete', { token: eve.token, body: { password: 'longenough1', confirm: 'EvePriv' } });
  check('if the messaging service is down, the deletion waits (nothing deleted)', refused.status === 503 && api2.db.prepare('SELECT deleted_at FROM accounts WHERE id = ?').get(eve.account.id).deleted_at === null);
  M.down = false;
  const ok2 = await c2('POST', '/me/delete', { token: eve.token, body: { password: 'longenough1', confirm: 'EvePriv' } });
  check('when it is up, it is told to erase, with the new name', ok2.status === 200 && M.calls.some((c) => c.path === '/internal/privacy/erase' && c.body.accountId === eve.account.id && c.body.username === `deleted-${eve.account.id}`));
} catch (e) {
  fails++;
  console.log('FAIL threw', e);
} finally {
  await api2.close();
  stripeServer.close();
  messagingServer.close();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
