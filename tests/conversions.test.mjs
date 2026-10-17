// Conversion measurement (server/api/conversions.mjs, business.mjs, docs/monetization/conversions.md): impressions in lists, qualified visits, store
// entries, meeting and quote requests, purchases credited by click id (postback and pixel), coupon tickets and redemptions, spend and cost
// per result, the renewal rate, and what the free plan sees. Every figure is verified like a view.
import { createApi } from '../server/api/server.mjs';
import { imp } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const ADMIN = 'admin';
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1)';
const env = { ADMIN_TOKEN: ADMIN, REFERRAL_SECRET: 'conv-secret', PROFILE_VIEW_CAP: '100', PROFILE_CTA_CAP: '100', INQUIRY_LIMIT: '5' };
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const call = async (method, p, { token, body, ua } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(ua ? { 'User-Agent': ua } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, type, data: type.includes('json') ? await res.json() : await res.arrayBuffer() };
};
const signup = async (u) => (await call('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
const ev = (slug, body, opts = {}) => call('POST', `/businesses/${slug}/events`, { body, ...opts });
const statsOf = async (token, slug) => (await call('GET', '/me/businesses', { token })).data.profiles.find((x) => x.profile.slug === slug).stats;
const outbox = (kind) => api.db.prepare('SELECT * FROM outbox WHERE kind = ? ORDER BY id').all(kind);

try {
  const { withClickId, CLICK_PARAM, costPer, outcomesOf, returnOnSpend } = await imp('business/conversions.js');
  check('the click id is added to an https link and nothing else', withClickId('https://bob.test/shop?x=1', 'abcdefghij12') === `https://bob.test/shop?x=1&${CLICK_PARAM}=abcdefghij12` && withClickId('http://bob.test', 'abcdefghij12') === 'http://bob.test' && withClickId('https://bob.test', 'bad id') === 'https://bob.test');
  check('a cost needs both spend and a count', costPer(1900, 3) === 633 && costPer(0, 3) === null && costPer(1900, 0) === null);
  const fam = Object.fromEntries(outcomesOf({ newsletterSignups: 1, meetingRequests: 2, quoteRequests: 1, couponClaims: 3, couponRedemptions: 1, purchases: 2 }, 1200).map((o) => [o.id, o]));
  check('outcomes come in separate families, each with its own cost, never one total', fam.leads.count === 4 && fam.leads.costCents === 300 && fam.claims.count === 3 && fam.redemptions.count === 1 && fam.purchases.count === 2 && fam.purchases.costCents === 600 && Object.keys(fam).join() === 'leads,claims,redemptions,purchases');
  check('return on spend counts verified revenue only, and needs spend', returnOnSpend(5000, 2000) === 2.5 && returnOnSpend(5000, 0) === null);

  const amy = await signup('Amy');
  const bob = await signup('Bob');
  const carl = await signup('Carl');
  api.db.prepare("UPDATE accounts SET email = 'amy@cafe.test', email_verified = 1 WHERE id = ?").run(amy.account.id); // so notices reach her
  await call('POST', '/businesses', { token: amy.token, body: { name: 'Amy Cafe', category: 'food', website: 'https://amy.test', cta: { kind: 'quote' } } });
  await call('POST', '/businesses', { token: bob.token, body: { name: 'Bob Builds', category: 'services', website: 'https://bob.test/shop?x=1', cta: { kind: 'order', url: 'https://bob.test/shop?x=1' } } });
  await call('POST', '/businesses', { token: carl.token, body: { name: 'Carl Coaching', category: 'services', cta: { kind: 'meeting' } } });
  check('meeting and quote are calls to action of their own, without a link', (await call('GET', '/businesses/amy-cafe')).data.cta.kind === 'quote' && (await call('GET', '/businesses/carl-coaching')).data.cta.url === null);

  // ---- impressions
  const imp1 = await call('POST', '/businesses/impressions', { body: { slugs: ['amy-cafe', 'bob-builds', 'no-such-place', 'amy-cafe'], visitor: 'visitor-one' } });
  check('cards seen in a list are counted once each', imp1.data.counted === 2);
  check('again within the hour, not counted', (await call('POST', '/businesses/impressions', { body: { slugs: ['amy-cafe'], visitor: 'visitor-one' } })).data.counted === 0);
  check('a bot\'s impressions are not counted', (await call('POST', '/businesses/impressions', { body: { slugs: ['amy-cafe'], visitor: 'crawler-1' }, ua: BOT })).data.counted === 0);
  check('the owner seeing their own card is not counted', (await call('POST', '/businesses/impressions', { token: amy.token, body: { slugs: ['amy-cafe'] } })).data.counted === 0);

  // ---- qualified visits and store entries
  check('a qualified visit without a view first is not verified', (await ev('amy-cafe', { kind: 'engaged', visitor: 'visitor-two' })).data.verified === false);
  await ev('amy-cafe', { kind: 'view', visitor: 'visitor-one', campaign: 'Spring' });
  check('after a view it is', (await ev('amy-cafe', { kind: 'engaged', visitor: 'visitor-one' })).data.verified === true);
  check('walking into the 3D storefront is a store entry', (await ev('amy-cafe', { kind: 'store', visitor: 'walker-1' })).data.verified === true);
  check('an unknown kind is refused', (await ev('amy-cafe', { kind: 'purchase', visitor: 'visitor-one' })).status === 400);

  // ---- a press of the website link in the 3D city (a building linked to the profile)
  check('a press in the city without walking in or viewing first is kept, not counted', (await ev('amy-cafe', { kind: 'cta', visitor: 'walker-2', source: 'city', clickId: 'CityClick0001' })).data.verified === false);
  check('after walking into the storefront it counts, from the city, with its click id', (await ev('amy-cafe', { kind: 'cta', visitor: 'walker-1', source: 'city', clickId: 'CityClick0002' })).data.verified === true && api.db.prepare("SELECT source, click_id FROM business_events WHERE kind = 'cta' ORDER BY id DESC").get().source === 'city');
  check('a qualified visit still needs a profile view, not a store entry', (await ev('amy-cafe', { kind: 'engaged', visitor: 'walker-1' })).data.verified === false);

  // ---- quote and meeting requests
  const quote = { kind: 'quote', name: 'Dee', email: 'dee@example.test', message: 'Coffee for 40 people on Friday', visitor: 'visitor-one' };
  check('a profile only takes the kind of request it offers', (await call('POST', '/businesses/amy-cafe/inquiries', { body: { ...quote, kind: 'meeting' } })).data.code === 'not_offered');
  const missing = await call('POST', '/businesses/amy-cafe/inquiries', { body: { ...quote, message: '', email: 'nope' } });
  check('a quote needs a message and a real email, each field named', missing.status === 400 && missing.data.errors?.message && missing.data.errors?.email);
  const trap = await call('POST', '/businesses/amy-cafe/inquiries', { body: { ...quote, website: 'http://spam.test' } });
  check('a robot that fills the hidden field is thanked and nothing is kept', trap.data.sent && api.db.prepare('SELECT COUNT(*) AS n FROM business_inquiries').get().n === 0);
  const sent = await call('POST', '/businesses/amy-cafe/inquiries', { body: quote });
  check('a request from a visitor who viewed the profile is kept and verified', sent.data.sent && api.db.prepare('SELECT verified FROM business_inquiries WHERE id = ?').get(sent.data.id).verified === 1);
  const mail = outbox('inquiry').at(-1);
  check('the owner is emailed the request, with who to reply to', mail?.to_email === 'amy@cafe.test' && /Dee <dee@example\.test>/.test(mail.body) && /Coffee for 40/.test(mail.body) && /quote request from Dee/.test(mail.subject));
  await call('POST', '/businesses/amy-cafe/inquiries', { body: { ...quote, name: 'Stranger', visitor: 'never-viewed' } });
  check('one from a visitor who never viewed it is kept but not counted', (await statsOf(amy.token, 'amy-cafe')).quoteRequests === 1);
  check('a link in a request is refused (spam)', (await call('POST', '/businesses/amy-cafe/inquiries', { body: { ...quote, message: 'cheap pills at https://spam.test' } })).status === 422);
  const list = await call('GET', '/businesses/amy-cafe/inquiries', { token: amy.token });
  check('the owner lists their requests, newest first; nobody else can', list.data.inquiries.length === 2 && list.data.inquiries[0].name === 'Stranger' && list.data.open === 2 && (await call('GET', '/businesses/amy-cafe/inquiries', { token: bob.token })).status === 403);
  const handled = await call('PATCH', `/businesses/amy-cafe/inquiries/${sent.data.id}`, { token: amy.token, body: { status: 'handled' } });
  check('marking one answered keeps it as a result', handled.data.status === 'handled' && (await statsOf(amy.token, 'amy-cafe')).quoteRequests === 1);
  await ev('carl-coaching', { kind: 'view', visitor: 'visitor-one' });
  const meet = await call('POST', '/businesses/carl-coaching/inquiries', { body: { kind: 'meeting', name: 'Eve', email: 'eve@example.test', preferred: 'Tuesday afternoon', visitor: 'visitor-one' } });
  check('a meeting request needs no message', meet.data.sent && (await statsOf(carl.token, 'carl-coaching')).meetingRequests === 1);
  const spam = await call('PATCH', `/businesses/carl-coaching/inquiries/${meet.data.id}`, { token: carl.token, body: { status: 'spam' } });
  check('marking one spam stops it counting', spam.data.verified === false && (await statsOf(carl.token, 'carl-coaching')).meetingRequests === 0);
  await call('POST', '/businesses/amy-cafe/inquiries', { body: { ...quote, name: 'Five' } });
  await call('POST', '/businesses/amy-cafe/inquiries', { body: { ...quote, name: 'Six' } });
  check('one network can send only so many requests a day', (await call('POST', '/businesses/amy-cafe/inquiries', { body: { ...quote, name: 'Seven' } })).status === 429);
  check('and the per-profile cap keeps the count honest', (await statsOf(amy.token, 'amy-cafe')).quoteRequests === 3);

  // ---- purchases credited by click id
  await ev('bob-builds', { kind: 'view', visitor: 'buyer-1', campaign: 'launch' });
  check('a press of a link button carries its click id', (await ev('bob-builds', { kind: 'cta', visitor: 'buyer-1', clickId: 'ClickOne12345' })).data.verified === true && api.db.prepare("SELECT click_id FROM business_events WHERE kind = 'cta' ORDER BY id DESC").get().click_id === 'ClickOne12345');
  check('only the owner sees the tracking set-up or makes a key', (await call('GET', '/businesses/bob-builds/tracking', { token: amy.token })).status === 403 && (await call('POST', '/businesses/bob-builds/tracking/key', { token: amy.token })).status === 403);
  let tracking = (await call('GET', '/businesses/bob-builds/tracking', { token: bob.token })).data;
  check('the set-up shows no key and puts none in any address', tracking.hasKey === false && tracking.key === undefined && tracking.postback.endsWith('/conversions') && tracking.pixel.includes('business=bob-builds') && !/key=/.test(tracking.pixel));
  const sale = { business: 'bob-builds', click: 'ClickOne12345', value: 4500, order: 'A-1001' };
  check('no sale counts before the business has a key', (await call('POST', '/conversions', { body: sale, token: 'vvck_anything' })).data.code === 'no_key');
  const first = (await call('POST', '/businesses/bob-builds/tracking/key', { token: bob.token })).data;
  check('the owner makes a random key of their own, shown once', /^vvck_[A-Za-z0-9_-]{32}$/.test(first.key) && (await call('GET', '/businesses/bob-builds/tracking', { token: bob.token })).data.key === undefined);
  check('only its hash is stored, and it is not made from the referral secret', api.db.prepare("SELECT conv_key_hash FROM businesses WHERE slug = 'bob-builds'").get().conv_key_hash.length === 64 && !api.db.prepare("SELECT conv_key_hash FROM businesses WHERE slug = 'bob-builds'").get().conv_key_hash.includes(first.key));
  check('making a key is in the audit trail', api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'conversion_key.rotate'").get().n === 1);
  const key = (await call('POST', '/businesses/bob-builds/tracking/key', { token: bob.token })).data.key;
  check('a new key replaces the old one at once', key !== first.key && (await call('POST', '/conversions', { body: sale, token: first.key })).data.code === 'bad_key');
  check('a key in the body (the old way) is refused with how to send it', (await call('POST', '/conversions', { body: { ...sale, key } })).data.code === 'key_in_body');
  check('a wrong key is refused', (await call('POST', '/conversions', { body: sale, token: 'vvck_' + 'x'.repeat(32) })).status === 403);
  check('a sale from the server with the click id of a verified press is verified', (await call('POST', '/conversions', { body: sale, token: key })).data.attributed === true);
  check('the same order reported twice counts once', (await call('POST', '/conversions', { body: sale, token: key })).data.duplicate === true);
  check('a sale with an unknown click is kept, as unattributed', (await call('POST', '/conversions', { body: { ...sale, click: 'NotAClick99999', order: 'A-1002', value: 800 }, token: key })).data.attributed === false);
  // the pixel: no key in the address, never verified, and the server's report of the same order replaces it
  const pixel = await call('GET', '/conversions/pixel.gif?business=bob-builds&click=ClickOne12345&value=1200&order=A-1003');
  const junk = await call('GET', '/conversions/pixel.gif?business=no-such-business&order=A-1004');
  check('the pixel always answers with an image, and counts a sale as browser-reported only', pixel.status === 200 && pixel.type === 'image/gif' && junk.type === 'image/gif' && api.db.prepare("SELECT report, verified FROM business_events WHERE kind = 'purchase' AND order_ref = 'A-1003'").get()?.report === 'browser' && api.db.prepare("SELECT verified FROM business_events WHERE order_ref = 'A-1003'").get().verified === 0);
  let bobStats = await statsOf(bob.token, 'bob-builds');
  check('revenue is split: verified, unattributed and browser-reported; only verified sales are purchases', bobStats.purchases === 1 && bobStats.revenue.verifiedCents === 4500 && bobStats.revenue.unattributedCents === 800 && bobStats.revenue.browserCents === 1200, JSON.stringify({ p: bobStats.purchases, r: bobStats.revenue }));
  await call('GET', '/conversions/pixel.gif?business=bob-builds&order=A-1005&value=999');
  const reconciled = (await call('POST', '/conversions', { body: { business: 'bob-builds', click: 'ClickOne12345', order: 'A-1005', value: 2000 }, token: key })).data;
  check('the server reporting an order the pixel saw first replaces it (counted once)', reconciled.reconciled === true && api.db.prepare("SELECT COUNT(*) AS n FROM business_events WHERE order_ref = 'A-1005'").get().n === 1 && api.db.prepare("SELECT report, value_cents FROM business_events WHERE order_ref = 'A-1005'").get().value_cents === 2000);
  bobStats = await statsOf(bob.token, 'bob-builds');
  check('...and it moves from browser-reported to verified', bobStats.purchases === 2 && bobStats.revenue.verifiedCents === 6500 && bobStats.revenue.browserCents === 1200, JSON.stringify(bobStats.revenue));

  // ---- coupons: a ticket per claim, redeemed by the owner
  const { generateCity } = await imp('city/cityGenerator.js');
  const lot = generateCity(20260101).plots.find((p) => !p.owner && p.districtId !== 'suburb');
  await call('POST', `/plots/${lot.id}/claim`, { token: bob.token, body: { title: 'Bob Builds', buildingType: 'shop', website: 'https://bob.test', logo: { kind: 'generated' } } });
  await call('PUT', '/businesses/bob-builds/plot', { token: bob.token, body: { plotId: lot.id } });
  check('the building says which business page it has (a browser without 3D is sent there)', (await call('GET', `/plots/${lot.id}`)).data.profileSlug === 'bob-builds');
  await call('PUT', `/plots/${lot.id}/storefront`, { token: bob.token, body: { couponText: '10% off', couponCode: 'BOB-10', couponTotal: 5 } });
  const claimed = await call('POST', `/plots/${lot.id}/coupon`, { body: { visitor: 'buyer-1' } });
  check('a claimed coupon comes with its own ticket', claimed.data.code === 'BOB-10' && /^[0-9A-F]{6}$/.test(claimed.data.ticket));
  check('the visitor sees their ticket when they come back', (await call('GET', `/plots/${lot.id}/storefront?visitor=buyer-1`)).data.myTicket === claimed.data.ticket);
  check('only the owner redeems, with a real ticket', (await call('POST', `/plots/${lot.id}/coupon/redeem`, { token: amy.token, body: { ticket: claimed.data.ticket } })).status === 403 && (await call('POST', `/plots/${lot.id}/coupon/redeem`, { token: bob.token, body: { ticket: 'ZZZZZZ' } })).status === 404 && (await call('POST', `/plots/${lot.id}/coupon/redeem`, { token: bob.token, body: { ticket: 'no!' } })).status === 400);
  const redeemed = await call('POST', `/plots/${lot.id}/coupon/redeem`, { token: bob.token, body: { ticket: `#${claimed.data.ticket.toLowerCase()}` } });
  check('the owner marks it used (any case, with or without #), once', redeemed.data.redeemed && (await call('POST', `/plots/${lot.id}/coupon/redeem`, { token: bob.token, body: { ticket: claimed.data.ticket } })).data.code === 'already_redeemed');
  check('the redemption is in the audit trail', api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'coupon.redeem'").get().n === 1);

  // ---- spend and cost per result
  api.db.prepare("INSERT INTO orders (account_id, business_id, product, cents, status, created_at, paid_at) VALUES (?, (SELECT id FROM businesses WHERE slug = 'bob-builds'), 'pro', 1900, 'paid', ?, ?)").run(bob.account.id, Date.now(), Date.now());
  bobStats = await statsOf(bob.token, 'bob-builds');
  const fams = Object.fromEntries(bobStats.outcomes.map((o) => [o.id, o]));
  check('each outcome family is counted on its own: claims, redemptions, purchases', fams.claims.count === 1 && fams.redemptions.count === 1 && fams.purchases.count === 2 && bobStats.conversions === undefined && bobStats.costPerResultCents === undefined, JSON.stringify(bobStats.outcomes));
  check('what was spent, each family\'s cost, and the return on verified revenue', bobStats.spendCents === 1900 && fams.purchases.costCents === 950 && fams.claims.costCents === 1900 && fams.leads.costCents === null && bobStats.returnOnSpend === Math.round((6500 / 1900) * 100) / 100);
  const amyStats = await statsOf(amy.token, 'amy-cafe');
  check('the funnel: impressions, views, qualified visits, store entries, presses', amyStats.impressions === 1 && amyStats.views === 1 && amyStats.qualified === 1 && amyStats.storeEntries === 1 && amyStats.ctaClicks === 1, JSON.stringify({ i: amyStats.impressions, v: amyStats.views, q: amyStats.qualified, s: amyStats.storeEntries }));
  check('the free plan sees the funnel and the outcomes, not sources or campaigns', amyStats.outcomes.find((o) => o.id === 'leads').count === 3 && amyStats.sources === undefined && amyStats.campaigns === undefined);
  await call('POST', '/admin/billing/grant/amy-cafe', { token: ADMIN, body: { product: 'pro' } });
  const pro = await statsOf(amy.token, 'amy-cafe');
  check('with Pro, a campaign shows its leads and purchases apart', pro.campaigns.find((c) => c.id === 'spring')?.leads === 3 && pro.campaigns.find((c) => c.id === 'spring')?.purchases === 0 && pro.sources.find((s) => s.id === 'city').views === 0);
  const csv = await fetch(`${base}/businesses/amy-cafe/export.csv`, { headers: { Authorization: `Bearer ${amy.token}` } }).then((r) => r.text());
  check('the CSV export has the funnel, each outcome family with its cost, and revenue by trust', /"Qualified visits","1"/.test(csv) && /"Leads \(newsletter, meeting and quote requests\)","3"/.test(csv) && /"Browser-reported \(pixel, unverified\)"/.test(csv) && !/Cost per result/.test(csv), csv.slice(0, 200));

  // ---- retention: a request's contact details are wiped after INQUIRY_DAYS, the count stays
  const { pruneInquiries } = await import('../server/api/conversions.mjs');
  const before = (await statsOf(amy.token, 'amy-cafe')).quoteRequests;
  check('nothing recent is wiped', pruneInquiries(api.db, 180).wiped === 0);
  const later = Date.now() + 181 * 86400000;
  const wiped = pruneInquiries(api.db, 180, later);
  const row = api.db.prepare('SELECT * FROM business_inquiries WHERE id = ?').get(sent.data.id);
  check('after 180 days the name, email, phone and message are wiped, with the email to the owner', wiped.wiped >= 3 && wiped.mails >= 1 && row.email === '' && row.name === '(removed)' && row.message === null && row.ip_hash === null && outbox('inquiry').length === 0);
  check('the record stays, so the figures do not change', row.verified === 1 && row.kind === 'quote' && (await statsOf(amy.token, 'amy-cafe')).quoteRequests === before && pruneInquiries(api.db, 180, later).wiped === 0);

  // ---- renewals (admin)
  api.db.prepare("UPDATE orders SET renewals = 2 WHERE product = 'pro' AND cents > 0").run();
  api.db.prepare("INSERT INTO orders (account_id, business_id, product, cents, status, created_at, paid_at) VALUES (?, (SELECT id FROM businesses WHERE slug = 'carl-coaching'), 'pro', 1900, 'paid', ?, ?)").run(carl.account.id, Date.now(), Date.now());
  const ren = await call('GET', '/admin/metrics/renewals', { token: ADMIN });
  check('the renewal rate counts paid Pro plans that renewed', ren.data.pro.plans === 2 && ren.data.pro.renewed === 1 && ren.data.pro.rate === 0.5 && (await call('GET', '/admin/metrics/renewals', { token: bob.token })).status === 403);
} catch (e) {
  fails++;
  console.log('FAIL', e.stack);
} finally {
  api.close?.();
  api.server.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
