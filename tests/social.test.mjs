// Welcome posts on X (services/api/social.mjs) against a stand-in for the X API that checks the OAuth 1.0a signature, and the admin
// headquarters' live city panel (GET /world/live).
import crypto from 'node:crypto';
import http from 'node:http';
import { createApi } from '../services/api/server.mjs';
import { oauthHeader, welcomeText, xLength } from '../services/api/social.mjs';
import { sleep } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const KEYS = { X_API_KEY: 'ck', X_API_SECRET: 'cs', X_ACCESS_TOKEN: 'at', X_ACCESS_SECRET: 'as' };

// ---- a stand-in X API: checks each request's signature the way X does, records the posts, and can be told to fail
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const x = { posts: [], badSignatures: 0, failNext: null };
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const params = Object.fromEntries([...String(req.headers.authorization ?? '').replace(/^OAuth /, '').matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], decodeURIComponent(m[2])]));
    const url = `http://localhost:${fake.address().port}${req.url}`;
    const { oauth_signature: sig, ...rest } = params;
    const base = ['POST', enc(url), enc(Object.entries(rest).map(([k, v]) => [enc(k), enc(v)]).sort().map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
    const want = crypto.createHmac('sha1', `${enc(KEYS.X_API_SECRET)}&${enc(KEYS.X_ACCESS_SECRET)}`).update(base).digest('base64');
    if (sig !== want || rest.oauth_consumer_key !== 'ck' || rest.oauth_token !== 'at') {
      x.badSignatures++;
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ title: 'Unauthorized' }));
    }
    if (x.failNext) {
      const f = x.failNext;
      x.failNext = null;
      res.writeHead(f.status, { 'Content-Type': 'application/json', ...(f.headers ?? {}) });
      return res.end(JSON.stringify({ title: f.title ?? 'error', detail: f.detail ?? 'failed' }));
    }
    const text = JSON.parse(body).text;
    x.posts.push(text);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { id: String(1000 + x.posts.length), text } }));
  });
});
await new Promise((r) => fake.listen(0, r));
const X_API_URL = `http://localhost:${fake.address().port}`;

async function start(env) {
  const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, env: { ADMIN_TOKEN: 'admin', PUBLIC_SITE_URL: 'https://voxel.test', X_API_URL, ...KEYS, ...env } });
  await new Promise((r) => api.server.listen(0, r));
  const base = `http://localhost:${api.server.address().port}`;
  const call = async (method, p, { token, body } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const signup = async (u) => (await call('POST', '/auth/signup', { body: { username: u, password: 'longenough1' } })).data;
  return { api, call, signup };
}
const settle = () => sleep(150); // the post is sent on the next turn after it is queued

try {
  // ---- the text
  const t = welcomeText({ name: 'Maya #Bakery @everyone', district: 'creator', handle: 'mayabakes', url: 'https://voxel.test/business/maya?utm_source=x' });
  check('the post welcomes the business, names its district, tags its handle and links its page', t === "Welcome Maya Bakery everyone to VoxelVenture's Creator Commons! @mayabakes Step inside: https://voxel.test/business/maya?utm_source=x", t);
  check('a business name cannot tag or hashtag anyone', !/[#]|@everyone/.test(t));
  const long = welcomeText({ name: 'A'.repeat(400), district: 'saas', handle: 'h', url: `https://voxel.test/${'x'.repeat(200)}` });
  check('a long name is shortened to fit 280 (a link counts as 23)', xLength(long) <= 280 && long.includes('…'), `${xLength(long)}`);
  const h = oauthHeader('POST', 'https://api.x.com/2/tweets', { key: 'k', secret: 's', token: 't', tokenSecret: 'ts' }, { nonce: 'n', timestamp: 1 });
  check('the OAuth header carries every signed field', ['oauth_consumer_key="k"', 'oauth_nonce="n"', 'oauth_signature_method="HMAC-SHA1"', 'oauth_timestamp="1"', 'oauth_token="t"', 'oauth_version="1.0"', 'oauth_signature="'].every((f) => h.includes(f)));

  // ---- off (the default): nothing is queued
  {
    const { api, call, signup } = await start({ SOCIAL_POSTS: undefined });
    const a = await signup('offowner');
    await call('POST', '/businesses', { token: a.token, body: { name: 'Quiet Shop', category: 'retail', website: 'https://q.test', xHandle: 'quiet', announce: true } });
    await settle();
    check('with posting off nothing is queued or posted', api.db.prepare('SELECT COUNT(*) AS n FROM social_posts').get().n === 0 && x.posts.length === 0);
    await api.close();
  }

  // ---- review: an admin approves each post
  {
    const { api, call, signup } = await start({ SOCIAL_POSTS: 'review' });
    const maya = await signup('maya');
    check('a handle must look like one', (await call('POST', '/businesses', { token: maya.token, body: { name: 'Bad', category: 'food', website: 'https://m.test', xHandle: 'not a handle!' } })).data?.errors?.xHandle);
    // the consent needs a handle on the server too, as on the form (policy_review.md gap 9)
    const noHandle = await call('POST', '/businesses', { token: maya.token, body: { name: 'No Handle', category: 'food', website: 'https://m.test', announce: true } });
    check('the welcome-post consent is refused without a handle', noHandle.status === 400 && Boolean(noHandle.data?.errors?.announce) && (await call('GET', '/me/businesses', { token: maya.token })).data.profiles.length === 0, JSON.stringify(noHandle.data));
    const made = (await call('POST', '/businesses', { token: maya.token, body: { name: 'Maya Bakery', category: 'food', district: 'creator', website: 'https://m.test', xHandle: '@mayabakes', announce: true } })).data;
    check('the handle is stored without the @ and shown on the public profile', made.xHandle === 'mayabakes' && made.announce === true && (await call('GET', `/businesses/${made.slug}`)).data.xHandle === 'mayabakes' && (await call('GET', `/businesses/${made.slug}`)).data.announce === undefined);
    const noConsent = await signup('noconsent');
    await call('POST', '/businesses', { token: noConsent.token, body: { name: 'Shy Studio', category: 'creators', website: 'https://s.test', xHandle: 'shystudio' } });
    await settle();
    const queue = (await call('GET', '/admin/social', { token: 'admin' })).data;
    check('only the owner who opted in is queued, for review, and nothing is posted yet', queue.posts.length === 1 && queue.posts[0].text.includes('@mayabakes') && queue.posts[0].text.includes('/business/maya-bakery?utm_source=x&utm_medium=social&utm_campaign=welcome') && x.posts.length === 0, JSON.stringify(queue.posts.map((p) => p.text)));
    check('the review queue is admin-only', (await call('GET', '/admin/social', { token: maya.token })).status === 403);
    check('the owner sees it is waiting', (await call('GET', '/me/businesses', { token: maya.token })).data.profiles[0].welcomePost.status === 'review');
    const approved = await call('POST', `/admin/social/${queue.posts[0].id}/approve`, { token: 'admin' });
    await settle();
    check('approved, it is posted with a valid signature', approved.status === 200 && x.posts.length === 1 && x.badSignatures === 0 && x.posts[0] === queue.posts[0].text);
    const mine = (await call('GET', '/me/businesses', { token: maya.token })).data.profiles[0].welcomePost;
    check("the owner sees it was posted, with a link to the post", mine.status === 'posted' && mine.url === 'https://x.com/i/status/1001');
    // an owner who opts in after creating their profile is welcomed then, once
    await call('PATCH', '/businesses/shy-studio', { token: noConsent.token, body: { announce: true } });
    await call('PATCH', '/businesses/shy-studio', { token: noConsent.token, body: { tagline: 'Still shy' } });
    check('opting in later queues the welcome then, and only once', (await call('GET', '/admin/social', { token: 'admin' })).data.posts.filter((p) => p.text.includes('@shystudio')).length === 1);
    check('an edit that clears the handle but keeps the box ticked is refused', (await call('PATCH', '/businesses/shy-studio', { token: noConsent.token, body: { xHandle: '', announce: true } })).data?.errors?.announce);
    const cleared = await call('PATCH', '/businesses/shy-studio', { token: noConsent.token, body: { xHandle: '' } });
    check('removing the handle withdraws the consent with it', cleared.status === 200 && cleared.data.xHandle === null && cleared.data.announce === false, JSON.stringify(cleared.data));
    check('a decision cannot be made twice', (await call('POST', `/admin/social/${queue.posts[0].id}/reject`, { token: 'admin' })).status === 409);
    check('the approval is in the audit trail', (await call('GET', '/admin/audit?action=social.approve', { token: 'admin' })).data.entries.length === 1);
    // a claimed building is welcomed too, for an owner who opted in, tagging the same handle
    const lot = (await call('GET', '/plots/state')).data.plots.find((p) => !p.owner && api.db.prepare('SELECT claimable FROM plots WHERE id = ?').get(p.id).claimable);
    await call('POST', `/plots/${lot.id}/claim`, { token: maya.token, body: { title: 'Maya Bakery Flagship', buildingType: 'restaurant', website: 'https://m.test', logo: { kind: 'generated' } } });
    const plotPost = (await call('GET', '/admin/social', { token: 'admin' })).data.posts.find((p) => p.target.kind === 'plot');
    check('a claimed building is queued with the handle and a /b/ link', plotPost && plotPost.text.includes('@mayabakes') && plotPost.text.includes(`/b/${lot.id}?utm_source=x`));
    await call('POST', `/admin/social/${plotPost.id}/reject`, { token: 'admin' });
    await settle();
    check('a rejected post is never sent', x.posts.length === 1);
    // the post's visits are counted as their own source (a Pro figure: the profile gets complimentary Pro to see it)
    await call('POST', `/admin/billing/grant/${made.slug}`, { token: 'admin', body: { product: 'pro', reason: 'test' } });
    const ping = await call('POST', `/businesses/${made.slug}/events`, { body: { kind: 'view', visitor: 'from-x-post', source: 'x' } });
    check('a visit from the post counts as "x" in the owner\'s figures', ping.data.verified && (await call('GET', '/me/businesses', { token: maya.token })).data.profiles[0].stats.sources.find((s) => s.id === 'x').views === 1);
    await api.close();
  }

  // ---- auto: posted as they come, within the daily cap, retried on errors, skipped if taken down
  {
    x.posts.length = 0;
    const { api, call, signup } = await start({ SOCIAL_POSTS: 'auto', SOCIAL_MAX_PER_DAY: '2' });
    const owners = [];
    for (let i = 0; i < 3; i++) owners.push(await signup(`auto${i}`));
    x.failNext = { status: 503, title: 'Service Unavailable' };
    await call('POST', '/businesses', { token: owners[0].token, body: { name: 'First Shop', category: 'retail', website: 'https://a.test', xHandle: 'first', announce: true } });
    await settle();
    const first = api.db.prepare("SELECT * FROM social_posts WHERE text LIKE '%First Shop%'").get();
    check('a failed post stays queued with the error and a wait before the next try', first.status === 'queued' && first.attempts === 1 && first.next_at > Date.now() && /Service Unavailable|failed/.test(first.error), first.error);
    api.db.prepare('UPDATE social_posts SET next_at = 0 WHERE id = ?').run(first.id);
    await api.postSocial();
    check('it is retried and posted', api.db.prepare('SELECT status FROM social_posts WHERE id = ?').get(first.id).status === 'posted' && x.posts.length === 1);
    await call('POST', '/businesses', { token: owners[1].token, body: { name: 'Second Shop', category: 'retail', website: 'https://b.test', xHandle: 'second', announce: true } });
    await settle();
    await call('POST', '/businesses', { token: owners[2].token, body: { name: 'Third Shop', category: 'retail', website: 'https://c.test', xHandle: 'third', announce: true } });
    await settle();
    check('the daily cap holds the third back', x.posts.length === 2 && api.db.prepare("SELECT status FROM social_posts WHERE text LIKE '%Third Shop%'").get().status === 'queued');
    // the third business is taken down by moderation before its turn
    api.db.prepare("UPDATE businesses SET status = 'removed' WHERE name = 'Third Shop'").run();
    api.db.prepare("UPDATE social_posts SET posted_at = 0 WHERE status = 'posted'").run(); // a day later
    await api.postSocial();
    check('a business taken down before its turn is skipped, not posted', x.posts.length === 2 && api.db.prepare("SELECT status FROM social_posts WHERE text LIKE '%Third Shop%'").get().status === 'skipped');
    const again = await signup('auto3');
    x.failNext = { status: 403, title: 'Forbidden', detail: 'You are not permitted to perform this action.' };
    await call('POST', '/businesses', { token: again.token, body: { name: 'Fourth Shop', category: 'retail', website: 'https://d.test', xHandle: 'fourth', announce: true } });
    await settle();
    check('a refusal from X (403) is given up at once, with its reason', api.db.prepare("SELECT status, error FROM social_posts WHERE text LIKE '%Fourth Shop%'").get().status === 'failed');
    check('no request ever had a bad signature', x.badSignatures === 0);

    // ---- the admin headquarters' live panel
    const live = (await call('GET', '/world/live')).data;
    check('the live city figures are real totals (the removed profile is not counted)', live.profiles === 3 && live.newProfiles7d === 3 && live.accounts === 4 && live.online === 0 && live.buildingViews7d === 0 && typeof live.at === 'number', JSON.stringify(live));
    await call('POST', '/presence/ping', { token: owners[0].token, body: { visitor: 'auto0-device' } });
    check('a player arriving shows at once', (await call('GET', '/world/live')).data.online === 1 && (await call('GET', '/world/live')).data.visitors24h === 1);
    await api.close();
  }
} catch (e) {
  fails++;
  console.log('FAIL threw', e);
} finally {
  fake.close();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
