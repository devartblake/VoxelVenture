// The API's request limits (services/api/server.mjs) are per visitor. Behind Caddy (TRUST_PROXY=1) every connection comes from 127.0.0.1,
// so the visitor is the first X-Forwarded-For entry; before this was read there, the whole site shared one budget (240 requests and 20
// sign-ins a minute for everyone). Without a trusted proxy the header is ignored, so a forged one cannot buy a fresh budget.
import { createApi } from '../services/api/server.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const start = async (env) => {
  const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, rate: { perMinute: 5, authPerMinute: 2 }, env });
  await new Promise((r) => api.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${api.server.address().port}`;
  const get = async (p, from) => (await fetch(base + p, { headers: from ? { 'X-Forwarded-For': from } : {} })).status;
  const signin = async (from) => (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': from }, body: JSON.stringify({ username: 'nobody', password: 'wrong-password' }) })).status;
  return { api, get, signin };
};
const times = async (n, f) => { const out = []; for (let i = 0; i < n; i++) out.push(await f()); return out; };

// behind a proxy
const proxied = await start({ TRUST_PROXY: '1' });
try {
  const a = await times(6, () => proxied.get('/health', '203.0.113.1'));
  check('one visitor is limited after their own budget', a.slice(0, 5).every((s) => s === 200) && a[5] === 429, a.join(' '));
  check('another visitor behind the same proxy is not', (await proxied.get('/health', '203.0.113.2')) === 200);
  check('the first entry is the visitor (Caddy puts the real address first)', (await proxied.get('/health', '203.0.113.3, 203.0.113.1')) === 200);
  const s = await times(3, () => proxied.signin('198.51.100.7'));
  check('sign-in attempts have their own, smaller budget per visitor', s[2] === 429 && s.slice(0, 2).every((x) => x !== 429), s.join(' '));
  check('and one visitor\'s sign-in attempts do not lock out another\'s', (await proxied.signin('198.51.100.8')) !== 429);
} finally {
  proxied.api.server.close();
}

// no proxy: the header is not trusted
const direct = await start({});
try {
  const forged = await times(6, () => direct.get('/health', `192.0.2.${Math.floor(Math.random() * 250) + 1}`));
  check('without TRUST_PROXY a forged X-Forwarded-For does not buy a fresh budget', forged[5] === 429, forged.join(' '));
} finally {
  direct.api.server.close();
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall rate limit checks passed');
process.exit(fails ? 1 : 0);
