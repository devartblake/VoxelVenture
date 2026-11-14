// Security headers and CSP reporting (docs/operations/voxelventure_security_action_plan.md, V1 and V2): every public address in the Caddyfiles
// gets the security headers, the game gets a report-only Content-Security-Policy, and the API takes the violation reports.
import fs from 'node:fs';
import path from 'node:path';
import { createApi } from '../services/api/server.mjs';
import { root } from './helpers.mjs';

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
  check(`${file}: nosniff, no framing, a referrer policy and a permissions policy`, /X-Content-Type-Options\s+"nosniff"/.test(sec) && /X-Frame-Options\s+"DENY"/.test(sec) && /Referrer-Policy\s+"/.test(sec) && /Permissions-Policy\s+"/.test(sec));
  for (const site of [game, api, play]) check(`${file}: ${site} imports the security headers`, /^\s*import security_headers\s*$/m.test(b[site] ?? ''));
  const csp = snippet(text, 'csp_report_only');
  check(`${file}: the game's CSP is report-only for now (V2: enforce after a clean session)`, /Content-Security-Policy-Report-Only/.test(csp) && !/[^-]Content-Security-Policy\s/.test(csp));
  check(`${file}: it forbids framing, plugins and a changed base`, /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp));
  check(`${file}: it keeps wasm, blob workers and the props bucket for the 3D loaders`, /'wasm-unsafe-eval'/.test(csp) && /worker-src 'self' blob:/.test(csp) && /img-src[^;]*blob:/.test(csp) && /connect-src[^;]*\{args\[0\]\}/.test(csp));
  check(`${file}: the game imports it with the API and presence addresses`, /import csp_report_only (\S+) (\S+) (\S+)/.exec(b[game] ?? '')?.slice(2).join(' ') === `https://${api} wss://${play}`);
}

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
