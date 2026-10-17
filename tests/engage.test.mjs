// Storefront offers, coupons, quests with budgets, the feedback board, email sign-ups (double opt-in), email notices, the newsletter,
// instant push and spatial chat. Starts the API, the presence server and a mail receiver. (Takes about 20 seconds: a visit quest needs 10.)
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import WebSocket from 'ws';
import { root, sleep, imp } from './helpers.mjs';

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const [apiPort, mpPort, mailPort] = [await free(), await free(), await free()];
const mails = [];
const receiver = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => { mails.push({ ...JSON.parse(b), auth: req.headers.authorization }); res.writeHead(200); res.end('ok'); });
}).listen(mailPort);
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-mp-'));
const common = { ...process.env, MP_NOTIFY_SECRET: 'shh' };
const mp = spawn(process.execPath, [path.join(root, 'server', 'multiplayer.mjs')], { cwd: root, env: { ...common, MP_PORT: String(mpPort), MP_LOG_DIR: logDir }, stdio: 'ignore' });
const api = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'server', 'api', 'server.mjs')], {
  cwd: root,
  env: { ...common, API_PORT: String(apiPort), API_DB: ':memory:', PUBLIC_API_URL: `http://localhost:${apiPort}`, MAIL_WEBHOOK_URL: `http://localhost:${mailPort}/mail`, MAIL_WEBHOOK_TOKEN: 'mailkey', MAIL_FROM: 'VoxelVenture <hi@x.test>', MP_NOTIFY_URL: `http://localhost:${mpPort}/notify`, ADMIN_TOKEN: 'admin-secret' },
  stdio: 'ignore',
});
const base = `http://localhost:${apiPort}`;
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const call = async (method, p, { token, body } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : await res.text() };
};
const signup = async (username, email) => (await call('POST', '/auth/signup', { body: { username, password: 'longenough1', ...(email ? { email } : {}) } })).data;
const waitMail = async (pred, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const m = mails.find(pred); if (m) return m; await sleep(200); } return null; };
const tokenIn = (m) => m?.text.match(/token=([a-f0-9]+)/)?.[1];
// the id of the first report on something, read from the admin queue's database (the queue itself groups them)
const reportIdFor = async (kind, id) => (await call('GET', `/admin/reports/ids?kind=${kind}&id=${id}`, { token: 'admin-secret' })).data.id;

try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/health')).ok && (await fetch(`http://localhost:${mpPort}/health`)).ok) break; } catch { /* starting */ } await sleep(250); }
  const { generateCity } = await imp('city/cityGenerator.js');
  const city = generateCity(20260101);
  const empties = city.plots.filter((p) => !p.owner && p.districtId !== 'suburb');
  const built = city.plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2);
  const amy = await signup('Amy', 'amy@example.com');
  const bob = await signup('Bob');
  const cat = await signup('Cat');
  const biz = { title: 'Amy Cafe', buildingType: 'restaurant', website: 'https://amy.test', variant: 'cafe', logo: { kind: 'generated' } };
  const lot = empties[0];
  await call('POST', `/plots/${lot.id}/claim`, { token: amy.token, body: biz });

  // ---- wallet
  check('a new account starts with 100 Gold in its wallet', amy.account.gold === 100 && (await call('GET', '/me/wallet', { token: amy.token })).data.ledger[0].reason === 'starter');

  // ---- offers
  const seeded = built.filter((p) => p.brand?.coupon);
  const sf = (await call('GET', `/plots/${seeded[0].id}/storefront`)).data;
  check('the city\'s own businesses have the offers the generator gave them', sf.brand.coupon?.total === seeded[0].brand.coupon.total && sf.brand.coupon.code === undefined, JSON.stringify(sf.brand.coupon));
  check('a visitor cannot read the coupon code before claiming it', !JSON.stringify(sf).includes(seeded[0].brand.coupon.code));
  check('only the owner can set the storefront', (await call('PUT', `/plots/${lot.id}/storefront`, { token: bob.token, body: { couponText: 'x' } })).status === 403);
  const bad = await call('PUT', `/plots/${lot.id}/storefront`, { token: amy.token, body: { videoUrl: 'https://evil.test/v', couponText: 'Free cake', couponTotal: 0, questOn: true, questSeconds: 1, questGold: 99 } });
  check('a bad video, coupon or quest is refused with a message for each field', bad.status === 400 && bad.data.errors.videoUrl && bad.data.errors.couponTotal && bad.data.errors.questSeconds && bad.data.errors.questGold, JSON.stringify(bad.data.errors));
  const set = await call('PUT', `/plots/${lot.id}/storefront`, { token: amy.token, body: { videoUrl: 'https://youtu.be/dQw4w9WgXcQ', couponText: 'Free cake', couponCode: 'CAKE-1', couponTotal: 3, questOn: true, questSeconds: 10, questGold: 10 } });
  check('the owner sets a coupon, a video and a quest', set.status === 200 && set.data.brand.coupon.total === 3 && set.data.brand.video && set.data.brand.quest.gold === 10 && set.data.own && set.data.brand.coupon.code === 'CAKE-1');

  // ---- coupons: limited stock, one each, atomic
  const first = await call('POST', `/plots/${lot.id}/coupon`, { token: bob.token });
  check('a visitor claims the coupon and gets the code', first.status === 200 && first.data.code === 'CAKE-1' && first.data.left === 2);
  check('claiming again gives the same code, not another coupon', (await call('POST', `/plots/${lot.id}/coupon`, { token: bob.token })).data.already === true);
  check('the owner cannot claim their own coupon', (await call('POST', `/plots/${lot.id}/coupon`, { token: amy.token })).status === 409);
  const anons = await Promise.all(Array.from({ length: 8 }, (_, i) => call('POST', `/plots/${lot.id}/coupon`, { body: { visitor: `anon-${i}` } })));
  check('eight anonymous visitors race for the last two coupons: exactly two win', anons.filter((r) => r.status === 200).length === 2 && anons.filter((r) => r.status === 409).length === 6, anons.map((r) => r.status).join());
  check('and the storefront shows all gone, and that Bob has his code', (await call('GET', `/plots/${lot.id}/storefront`, { token: bob.token })).data.myCoupon === 'CAKE-1' && (await call('GET', `/plots/${lot.id}/storefront`)).data.brand.coupon.claimed === 3);

  // ---- quests: Gold comes out of the business's budget
  check('a quest cannot be funded by someone else, or with Gold you do not have', (await call('POST', `/plots/${lot.id}/quest/fund`, { token: bob.token, body: { gold: 5 } })).status === 403 && (await call('POST', `/plots/${lot.id}/quest/fund`, { token: amy.token, body: { gold: 500 } })).status === 409);
  const fund = await call('POST', `/plots/${lot.id}/quest/fund`, { token: amy.token, body: { gold: 20 } });
  check('funding moves Gold from the wallet to the quest budget', fund.data.budget === 20 && fund.data.wallet === 80);
  check('the owner cannot earn from their own quest', (await call('POST', `/plots/${lot.id}/quest/start`, { token: amy.token })).status === 409);
  check('completing before starting, or too early, is refused', (await call('POST', `/plots/${lot.id}/quest/complete`, { token: bob.token })).status === 409);
  for (const v of [bob, cat]) await call('POST', `/plots/${lot.id}/quest/start`, { token: v.token });
  const dan = await signup('Dan');
  await call('POST', `/plots/${lot.id}/quest/start`, { token: dan.token });
  check('finishing a visit early is refused', (await call('POST', `/plots/${lot.id}/quest/complete`, { token: bob.token })).data.code === 'too_early');
  await sleep(10500);
  const pay = [await call('POST', `/plots/${lot.id}/quest/complete`, { token: bob.token }), await call('POST', `/plots/${lot.id}/quest/complete`, { token: cat.token }), await call('POST', `/plots/${lot.id}/quest/complete`, { token: dan.token })];
  check('the first two visitors are paid 10 Gold each from the budget', pay[0].data.paid === 10 && pay[0].data.wallet === 110 && pay[1].data.paid === 10);
  check('when the budget is empty the next visitor is paid nothing', pay[2].data.paid === 0 && pay[2].data.reason === 'budget_empty');
  check('nobody is paid twice', (await call('POST', `/plots/${lot.id}/quest/complete`, { token: bob.token })).status === 409);
  check('the quest shows as stopped, with a budget of 0', (await call('GET', `/plots/${lot.id}/storefront`, { token: amy.token })).data.brand.quest.budget === 0 && (await call('GET', `/plots/${lot.id}/storefront`, { token: amy.token })).data.brand.quest.active === false);
  check('the wallet records it', (await call('GET', '/me/wallet', { token: bob.token })).data.ledger[0].reason === 'quest');

  // ---- the feedback board
  check('posting feedback needs an account and a few words', (await call('POST', `/plots/${lot.id}/feedback`, { body: { message: 'hello there' } })).status === 401 && (await call('POST', `/plots/${lot.id}/feedback`, { token: bob.token, body: { message: 'a' } })).status === 400);
  const post = await call('POST', `/plots/${lot.id}/feedback`, { token: bob.token, body: { message: 'Great cake, slow service.' } });
  check('a visitor posts to the board', post.status === 200 && post.data.feedback[0].author === 'Bob' && post.data.feedback[0].mine);
  check('posting again straight away is slowed down', (await call('POST', `/plots/${lot.id}/feedback`, { token: bob.token, body: { message: 'And another one' } })).status === 429);
  const catPost = await call('POST', `/plots/${lot.id}/feedback`, { token: cat.token, body: { message: 'Buy my stuff at spam.test' } });
  const spamId = catPost.data.feedback.find((f) => f.author === 'Cat').id;
  check('only the owner can hide a message', (await call('POST', `/plots/${lot.id}/feedback/${spamId}/hide`, { token: bob.token })).status === 403);
  await call('POST', `/plots/${lot.id}/feedback/${spamId}/hide`, { token: amy.token });
  const seen = (await call('GET', `/plots/${lot.id}/storefront`)).data.feedback;
  const ownerSees = (await call('GET', `/plots/${lot.id}/storefront`, { token: amy.token })).data.feedback;
  check('a hidden message disappears for visitors but the owner still sees it', seen.length === 1 && ownerSees.length === 2 && ownerSees.find((f) => f.id === spamId).hidden);

  // ---- email sign-ups: double opt-in
  check('a bad email is refused', (await call('POST', '/leads', { body: { targetKind: 'plot', targetId: lot.id, email: 'nope' } })).status === 400 && (await call('POST', '/leads', { body: { targetKind: 'ad', targetId: 'nothing', email: 'a@b.co' } })).status === 404);
  const lead = await call('POST', '/leads', { body: { targetKind: 'plot', targetId: lot.id, email: 'Fan@Example.com' } });
  check('signing up sends a confirmation and nothing else', lead.data.status === 'pending' && lead.data.sent === true);
  const confirmMail = await waitMail((m) => m.to === 'fan@example.com');
  check('the confirmation email went out through the mail service, with its key and sender', confirmMail && confirmMail.auth === 'Bearer mailkey' && confirmMail.from.includes('hi@x.test') && /Amy Cafe/.test(confirmMail.subject));
  check('until it is confirmed the owner sees no address', (await call('GET', `/plots/${lot.id}/leads`, { token: amy.token })).data.confirmed.length === 0 && (await call('GET', `/plots/${lot.id}/leads`, { token: amy.token })).data.pending === 1);
  check('asking again straight away does not send another email', (await call('POST', '/leads', { body: { targetKind: 'plot', targetId: lot.id, email: 'fan@example.com' } })).data.sent === false);
  const page = await call('GET', `/leads/confirm?token=${tokenIn(confirmMail)}`);
  check('the link in the email confirms the sign-up', page.status === 200 && /You are signed up/.test(page.data) && (await call('GET', '/leads/confirm?token=wrong')).data.includes('not valid'));
  const mine = (await call('GET', `/plots/${lot.id}/leads`, { token: amy.token })).data;
  check('now the owner sees the confirmed address, and nobody else can', mine.confirmed[0].email === 'fan@example.com' && (await call('GET', `/plots/${lot.id}/leads`, { token: bob.token })).status === 403);
  await call('GET', `/leads/unsubscribe?token=${tokenIn(confirmMail)}`);
  check('unsubscribing removes them from the list', (await call('GET', `/plots/${lot.id}/leads`, { token: amy.token })).data.confirmed.length === 0);
  const slot = (await call('GET', '/ads')).data.slots.find((s) => !s.open);
  check('an ad space takes sign-ups too', (await call('POST', '/leads', { body: { targetKind: 'ad', targetId: slot.id, email: 'reader@example.com' } })).data.status === 'pending');

  // ---- email notices
  const verify = await waitMail((m) => m.to === 'amy@example.com' && /Confirm your email/.test(m.subject));
  check('an email given at sign-up gets a verification message', Boolean(verify));
  const openLease = (id) => call('POST', `/admin/plots/${id}/lease`, { token: 'admin-secret', body: { state: 'open' } }); // a lease protects its tenant: end it so the plot can be taken over
  // Amy owns the lot; Bob takes it over: Amy is told only once she has verified her address
  await openLease(lot.id);
  await call('POST', `/plots/${lot.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Cafe' } });
  await sleep(1500);
  check('a take-over notice is NOT sent to an unverified address', !mails.some((m) => m.to === 'amy@example.com' && /took over/.test(m.subject)));
  await call('GET', `/me/verify?token=${tokenIn(verify)}`);
  check('verifying the address works', (await call('GET', '/me', { token: amy.token })).data.account.emailVerified === true);
  const lot2 = empties[1];
  await call('POST', `/plots/${lot2.id}/claim`, { token: amy.token, body: { ...biz, title: 'Amy Two' } });
  await call('POST', `/plots/${lot2.id}/quest/fund`, { token: amy.token, body: { gold: 30 } });
  await openLease(lot2.id);
  await call('POST', `/plots/${lot2.id}/takeover`, { token: cat.token, body: { ...biz, title: 'Cat Cafe' } });
  const notice = await waitMail((m) => m.to === 'amy@example.com' && /took over/.test(m.subject));
  check('a verified owner is emailed when their business is taken over, with the payout', notice && /Cat/.test(notice.subject) && /credited you [\d,]+ in game value/.test(notice.text), notice?.subject);
  check('the payout is called game value, never money (policy gap 3)', /no real money is paid/.test(notice?.text) && !/\$|paid out/.test(notice?.text), notice?.text);
  check('the take-over refunds what was left in the quest budget', (await call('GET', '/me', { token: amy.token })).data.account.gold === 80 + 0 || (await call('GET', '/me', { token: amy.token })).data.account.gold >= 80);
  check('and the new owner starts with no offers or budget', (await call('GET', `/plots/${lot2.id}/storefront`)).data.brand.coupon === null && (await call('GET', `/plots/${lot2.id}/storefront`)).data.brand.quest === null);
  await call('PATCH', '/me', { token: amy.token, body: { notify: false } });
  const lot3 = empties[2];
  await call('POST', `/plots/${lot3.id}/claim`, { token: amy.token, body: { ...biz, title: 'Amy Three' } });
  const before = mails.length;
  await openLease(lot3.id);
  await call('POST', `/plots/${lot3.id}/takeover`, { token: bob.token, body: { ...biz, title: 'Bob Three' } });
  await sleep(1500);
  check('with notices turned off, no email is sent', mails.length === before);
  const adBuyer = await signup('Eve', 'eve@example.com');
  const eve = adBuyer;
  await call('GET', `/me/verify?token=${tokenIn(await waitMail((m) => m.to === 'eve@example.com'))}`);
  const openSlot = (await call('GET', '/ads')).data.slots.find((s) => s.open);
  await call('POST', `/ads/${openSlot.id}/buy`, { token: adBuyer.token, body: { advertiser: 'Eve Co', headline: 'Eve', tagline: '', url: 'https://e.test', color: '#10b981' } });
  await call('POST', `/ads/${openSlot.id}/buy`, { token: bob.token, body: { advertiser: 'Bob Co', headline: 'Bob', tagline: '', url: 'https://b.test', color: '#3b82f6' } });
  check('an advertiser is emailed when their ad space is taken over', Boolean(await waitMail((m) => m.to === 'eve@example.com' && /took over your ad space/.test(m.subject))));

  // ---- the newsletter
  const sub = await call('POST', '/leads', { body: { targetKind: 'world', email: 'reader@example.com' } });
  await call('GET', `/leads/confirm?token=${tokenIn(await waitMail((m) => m.to === 'reader@example.com' && /newsletter/i.test(m.subject)))}`);
  check('only an admin can send the newsletter', (await call('POST', '/admin/newsletter')).status === 403 && (await call('POST', '/admin/newsletter', { token: 'wrong' })).status === 403);
  const news = await call('POST', '/admin/newsletter', { token: 'admin-secret' });
  const got = await waitMail((m) => m.to === 'reader@example.com' && /Plot of the Day/.test(m.subject));
  check('the Plot of the Day newsletter goes to confirmed readers, with an unsubscribe link', sub.status === 200 && news.data.queued >= 1 && got && /Unsubscribe: .*leads\/unsubscribe\?token=/.test(got.text) && /Walk in for a bonus/.test(got.text), JSON.stringify(news.data));
  check('with no verified visits this week it lists no "busiest" businesses (never the generated figures)', got && !/busiest/.test(got.text));
  check('and a second send the same day does nothing', (await call('POST', '/admin/newsletter', { token: 'admin-secret' })).data.already === true);
  check('nobody who unsubscribed or never confirmed gets it', !mails.some((m) => /Plot of the Day/.test(m.subject) && m.to === 'fan@example.com'));

  // ---- instant push and spatial chat on the presence server
  const ws = (name, x) => new Promise((resolve) => { const s = new WebSocket(`ws://localhost:${mpPort}`); const inbox = []; s.on('message', (r) => inbox.push(JSON.parse(r.toString()))); s.on('open', () => { s.send(JSON.stringify({ type: 'hello', name, room: '20260101', x, z: 0, appearance: {} })); setTimeout(() => resolve({ s, inbox }), 200); }); });
  const [a, b, far] = [await ws('A', 0), await ws('B', 10), await ws('Far', 500)];
  const lot4 = empties[3];
  await call('POST', `/plots/${lot4.id}/claim`, { token: dan.token, body: { ...biz, title: 'Dan Cafe' } });
  await sleep(500);
  check('a claim is pushed to every connected game at once', [a, b, far].every((c) => c.inbox.some((m) => m.type === 'world' && m.kind === 'plot' && m.ids.includes(String(lot4.id)))));
  check('the push endpoint refuses callers without the secret', (await fetch(`http://localhost:${mpPort}/notify`, { method: 'POST', body: '{}' })).status === 403);
  a.s.send(JSON.stringify({ type: 'chat', text: 'Anyone for coffee?' }));
  await sleep(400);
  check('chat is heard by players nearby, with the speaker\'s name', b.inbox.some((m) => m.type === 'chat' && m.text === 'Anyone for coffee?' && m.name === 'A') && a.inbox.some((m) => m.type === 'chat'));
  check('but not by a player far away', !far.inbox.some((m) => m.type === 'chat'));
  a.s.send(JSON.stringify({ type: 'chat', text: 'second' }));
  await sleep(300);
  check('chat is limited to one line a second', !b.inbox.some((m) => m.text === 'second'));
  // ---- moderation: the filter, reports, the admin queue and bans
  const reject = async (name, res) => check(name, res.status === 422 && res.data.code === 'content_rejected', `${res.status} ${res.data.error ?? ''}`);
  await reject('the word filter stops spam on the feedback board', await call('POST', `/plots/${lot4.id}/feedback`, { token: bob.token, body: { message: 'Buy cheap viagra now' } }));
  await reject('...even when it is disguised (v1agra, v.i.a.g.r.a)', await call('POST', `/plots/${lot4.id}/feedback`, { token: bob.token, body: { message: 'get v.1.a.g.r.a here' } }));
  await reject('a feedback message may carry one link, not several', await call('POST', `/plots/${lot4.id}/feedback`, { token: bob.token, body: { message: 'see http://a.test and http://b.test' } }));
  await reject('shouting in capitals is refused', await call('POST', `/plots/${lot4.id}/feedback`, { token: bob.token, body: { message: 'BUY MY THING RIGHT NOW EVERYONE' } }));
  await reject('a business name or description is filtered too', await call('POST', `/plots/${empties[6].id}/claim`, { token: bob.token, body: { ...biz, title: 'Free Crypto Giveaway' } }));
  await reject('and an ad headline', await call('POST', `/ads/${(await call('GET', '/ads')).data.slots.find((x) => x.open && x.id !== openSlot.id)?.id ?? 'x'}/buy`, { token: bob.token, body: { advertiser: 'Bob', headline: 'XXX videos', tagline: '', url: 'https://b.test', color: '#3b82f6' } }));
  check('a normal message still goes through', (await call('POST', `/plots/${lot4.id}/feedback`, { token: bob.token, body: { message: 'Nice place, see https://example.com for hours.' } })).status === 200);
  const rude = await call('POST', `/plots/${lot4.id}/feedback`, { token: cat.token, body: { message: 'Not great honestly' } });
  const rudeId = rude.data.feedback.find((f) => f.author === 'Cat').id;
  check('you cannot report your own message', (await call('POST', '/reports', { token: cat.token, body: { kind: 'feedback', id: rudeId, reason: 'spam' } })).status === 409);
  check('reporting needs an account and a real target', (await call('POST', '/reports', { body: { kind: 'feedback', id: rudeId } })).status === 401 && (await call('POST', '/reports', { token: bob.token, body: { kind: 'feedback', id: 99999 } })).status === 404);
  const r1 = await call('POST', '/reports', { token: bob.token, body: { kind: 'feedback', id: rudeId, reason: 'offensive' } });
  check('a report is recorded once per player', r1.data.reported && (await call('POST', '/reports', { token: bob.token, body: { kind: 'feedback', id: rudeId } })).data.already === true);
  check('one report does not hide a message', (await call('GET', `/plots/${lot4.id}/storefront`)).data.feedback.some((f) => f.id === rudeId));
  await call('POST', '/reports', { token: amy.token, body: { kind: 'feedback', id: rudeId, reason: 'spam' } });
  const r3 = await call('POST', '/reports', { token: dan.token, body: { kind: 'feedback', id: rudeId, reason: 'spam' } });
  check('three different players reporting a message hides it at once', r3.data.hidden === true && !(await call('GET', `/plots/${lot4.id}/storefront`)).data.feedback.some((f) => f.id === rudeId));
  await call('POST', `/plots/${lot4.id}/feedback/${rudeId}/show`, { token: dan.token });
  check('the business owner cannot bring back a message a moderator hid', !(await call('GET', `/plots/${lot4.id}/storefront`)).data.feedback.some((f) => f.id === rudeId) && !(await call('GET', `/plots/${lot4.id}/storefront`, { token: dan.token })).data.feedback.some((f) => f.id === rudeId));
  await call('POST', '/reports', { token: bob.token, body: { kind: 'plot', id: lot4.id, reason: 'misleading' } });
  const adSlot = (await call('GET', '/ads')).data.slots.find((x) => !x.open && x.ownerAccount);
  await call('POST', '/reports', { token: amy.token, body: { kind: 'ad', id: adSlot.id, reason: 'spam' } });
  check('only an admin can read the queue', (await call('GET', '/admin/reports')).status === 403 && (await call('GET', '/admin/reports', { token: 'nope' })).status === 403);
  const q = (await call('GET', '/admin/reports', { token: 'admin-secret' })).data.reports;
  const top = q[0];
  check('the queue lists what was reported, most reported first, with the text and author', q.length === 3 && top.kind === 'feedback' && top.reports === 3 && top.text === 'Not great honestly' && top.author === 'Cat' && q.some((x) => x.kind === 'plot') && q.some((x) => x.kind === 'ad'));
  const resolved = await call('POST', `/admin/reports/${await reportIdFor('feedback', rudeId)}/resolve`, { token: 'admin-secret', body: { action: 'ban' } });
  check('banning from the queue closes every report on it and bans the author', resolved.data.resolved === 3 && resolved.data.banned === true);
  check('a banned player is signed out everywhere', (await call('GET', '/me', { token: cat.token })).status === 401);
  check('...cannot sign in again', (await call('POST', '/auth/login', { body: { username: 'Cat', password: 'longenough1' } })).status === 403);
  check('...and their message stays hidden', !(await call('GET', `/plots/${lot4.id}/storefront`)).data.feedback.some((f) => f.id === rudeId));
  const dismissed = await call('POST', `/admin/reports/${await reportIdFor('plot', lot4.id)}/resolve`, { token: 'admin-secret', body: { action: 'dismiss' } });
  check('dismissing a report leaves the content alone', dismissed.data.action === 'dismiss' && (await call('GET', `/plots/${lot4.id}`)).data.title === 'Dan Cafe');
  const removed = await call('POST', `/admin/reports/${await reportIdFor('ad', adSlot.id)}/resolve`, { token: 'admin-secret', body: { action: 'remove' } });
  check('removing a reported ad empties the ad space for sale again', removed.data.action === 'remove' && (await call('GET', `/ads/${adSlot.id}`)).data.open === true);
  check('the queue is empty afterwards', (await call('GET', '/admin/reports', { token: 'admin-secret' })).data.reports.length === 0);

  // ---- the owner's sign-ups across everything they own
  await call('POST', '/leads', { body: { targetKind: 'plot', targetId: lot4.id, email: 'reader1@example.com' } });
  const lm = await waitMail((m) => m.to === 'reader1@example.com');
  await call('GET', `/leads/confirm?token=${tokenIn(lm)}`);
  await call('POST', '/leads', { body: { targetKind: 'plot', targetId: lot4.id, email: 'reader2@example.com' } });
  const mine2 = (await call('GET', '/me/leads', { token: dan.token })).data;
  const danLot = mine2.items.find((i) => i.kind === 'plot' && i.id === lot4.id);
  check('the owner sees every sign-up for everything they own in one list', danLot && danLot.title === 'Dan Cafe' && danLot.confirmed.length === 1 && danLot.confirmed[0].email === 'reader1@example.com' && danLot.pending === 1 && mine2.totals.confirmed === 1 && mine2.totals.pending === 1, JSON.stringify(mine2.totals));
  check('someone who owns nothing sees an empty list, and a visitor needs to sign in', (await call('GET', '/me/leads', { token: eve.token })).data.items.every((i) => i.confirmed.length === 0) && (await call('GET', '/me/leads')).status === 401);
  for (const c of [a, b, far]) c.s.close();
} catch (e) {
  fails++;
  console.log('FAIL the engagement test crashed:', e.stack);
} finally {
  api.kill();
  mp.kill();
  receiver.close();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
