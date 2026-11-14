// Security headers and CSP reporting (docs/operations/voxelventure_security_action_plan.md, V1 and V2): every public address in the Caddyfiles
// gets the security headers, the game gets a report-only Content-Security-Policy, and the API takes the violation reports.
import fs from 'node:fs';
import path from 'node:path';
import { createApi } from '../services/api/server.mjs';
import { root, imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// the site blocks of a Caddyfile: name -> the text of its block (top-level braces only)
const blocks = (text) => {
  const out = {};
  const re = /^([^\s#(][^\n{]*)\{\n([\s\S]*?)^\}/gm;
  for (let m; (m = re.exec(text)); ) out[m[1].trim()] = m[2];
  return out;
};
const snippet = (text, name) => {
  const start = text.indexOf(`(${name}) {`);
  if (start < 0) return '';
  const end = text.indexOf('\n}', start);
  return text.slice(start, end < 0 ? undefined : end);
};

for (const [file, game, api, play] of [
  ['deploy/Caddyfile', 'voxelventure.app', 'api.voxelventure.app', 'play.voxelventure.app'],
  ['deploy/Caddyfile.staging', 'staging.voxelventure.app', 'api.staging.voxelventure.app', 'play.staging.voxelventure.app'],
]) {
  const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const b = blocks(text);
  const sec = snippet(text, 'security_headers');
  check(`${file}: HSTS for a year with subdomains`, /Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"/.test(sec));
  check(`${file}: nosniff, framing by the site only, a referrer policy and a permissions policy`, /X-Content-Type-Options\s+"nosniff"/.test(sec) && /X-Frame-Options\s+"SAMEORIGIN"/.test(sec) && /Referrer-Policy\s+"/.test(sec) && /Permissions-Policy\s+"/.test(sec));
  for (const site of [game, api, play]) check(`${file}: ${site} imports the security headers`, /^\s*import security_headers\s*$/m.test(b[site] ?? ''));
  check(`${file}: the CSP is not set here (the web app owns it, it needs a nonce)`, !/Content-Security-Policy/.test(text.replace(/^\s*#.*$/gm, '')));
}

// ---- the policy the web app builds (lib/security/csp.js, applied by apps/web/proxy.js)
const { buildCsp, cspHeaderName, cspSources } = await imp('security/csp.js');
const env = { NEXT_PUBLIC_LIVE_API_URL: 'https://api.test', NEXT_PUBLIC_MP_URL: 'wss://play.test/', NEXT_PUBLIC_MP_URLS: 'wss://p1.test, wss://p2.test', NEXT_PUBLIC_PROPS_BASE_URL: 'https://bucket.test/base' };
const csp = buildCsp({ nonce: 'N0NCE', env });
const dir = (name) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
check('scripts need the nonce and strict-dynamic, and nothing inline or eval', dir('script-src').includes("'nonce-N0NCE'") && dir('script-src').includes("'strict-dynamic'") && !/'unsafe-inline'|'unsafe-eval'/.test(dir('script-src')));
check('wasm and blob workers stay (Draco, KTX2, GLTF)', dir('script-src').includes("'wasm-unsafe-eval'") && dir('worker-src') === "worker-src 'self' blob:");
check('style elements need the nonce; style attributes are allowed', dir('style-src').includes("'nonce-N0NCE'") && !dir('style-src').includes('unsafe-inline') && dir('style-src-attr') === "style-src-attr 'unsafe-inline'");
check('it can reach only the API, every presence server and the props bucket', dir('connect-src') === "connect-src 'self' blob: data: https://api.test wss://play.test wss://p1.test wss://p2.test https://bucket.test");
check('images and media come from the site and the bucket', dir('img-src').includes('https://bucket.test') && dir('media-src').includes('https://bucket.test') && !dir('img-src').includes('https://api.test'));
check('framed by the site only (the pilot tour), no plugins, no changed base, forms only to the site', dir('frame-ancestors') === "frame-ancestors 'self'" && dir('object-src') === "object-src 'none'" && dir('base-uri') === "base-uri 'self'" && dir('form-action') === "form-action 'self'");
check('violations go to the API', dir('report-uri') === 'report-uri https://api.test/csp-report');
check('a missing or broken address is left out, never "undefined"', !/undefined|null/.test(buildCsp({ nonce: 'x', env: { NEXT_PUBLIC_LIVE_API_URL: 'not a url' } })) && !buildCsp({ nonce: 'x', env: {} }).includes('report-uri'));
check('each request gets its own nonce in its own policy', buildCsp({ nonce: 'A', env }) !== buildCsp({ nonce: 'B', env }));
check('development alone may use eval', buildCsp({ nonce: 'x', env, dev: true }).includes("'unsafe-eval'") && !csp.includes("'unsafe-eval'"));
check('report-only unless CSP_ENFORCE=1', cspHeaderName({}) === 'Content-Security-Policy-Report-Only' && cspHeaderName({ CSP_ENFORCE: '0' }) === 'Content-Security-Policy-Report-Only' && cspHeaderName({ CSP_ENFORCE: '1' }) === 'Content-Security-Policy');
check('the sources are read from the settings', cspSources(env).mp.length === 3);

// the proxy sends the nonce to the page and the policy to the browser, on pages only
const proxySrc = fs.readFileSync(path.join(root, 'apps/web/proxy.js'), 'utf8');
check('the proxy sets x-nonce and the policy on the request and the response', /set\('x-nonce'/.test(proxySrc) && /requestHeaders\.set\(name, csp\)/.test(proxySrc) && /response\.headers\.set\(name, csp\)/.test(proxySrc));
check('the proxy skips the API, static files and prefetches', /_next\/static/.test(proxySrc) && /next-router-prefetch/.test(proxySrc));
check('the layout renders per request (a nonce cannot be in a page built ahead of time)', /await connection\(\)/.test(fs.readFileSync(path.join(root, 'apps/web/app/layout.jsx'), 'utf8')));

// the API takes a violation report from a browser (it sends application/csp-report, with no Origin), logs one line and stores nothing
const printed = [];
const warn = console.warn.bind(console);
console.warn = (...a) => (printed.push(a.map(String).join(' ')), warn(...a));
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, origin: 'https://site.test', env: { ADMIN_TOKEN: 'tok', IP_SALT: 'salt' } });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const report = { 'csp-report': { 'document-uri': 'https://site.test/city', 'violated-directive': 'script-src-elem', 'blocked-uri': 'https://evil.test/x.js' } };
const res = await fetch(`${base}/csp-report`, { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: JSON.stringify(report) });
check('a CSP report is accepted', res.status === 200);
check('and logged as one short line', printed.some((l) => l.startsWith('csp: ') && l.includes('script-src-elem') && l.includes('evil.test') && l.length < 500));
const big = await fetch(`${base}/csp-report`, { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: JSON.stringify({ x: 'a'.repeat(20000) }) }).then((r) => r.status, () => 'closed');
check('a huge report is refused (413, or the connection is closed)', big === 413 || big === 'closed', String(big));
const bad = await fetch(`${base}/csp-report`, { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: 'not json' });
check('and a broken one (400)', bad.status === 400);
const get = await fetch(`${base}/csp-report`);
check('only POST is the collector', get.status === 404);
api.server.close();
console.warn = warn;
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
