// Checks a deployment is serving authoritative data (docs/architecture/authoritative_data.md). Read-only: it signs nobody up and changes nothing.
//   npm run verify:live -- --api https://api.example.com --site https://example.com [--admin-token <ADMIN_TOKEN>]
// Run it after every deploy. It exits 1 if anything is wrong; each line says what was checked.
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : process.env[`VERIFY_${name.toUpperCase().replace(/-/g, '_')}`];
};
const api = (opt('api') ?? '').replace(/\/+$/, '');
const site = (opt('site') ?? '').replace(/\/+$/, '');
const adminToken = opt('admin-token');
if (!api) {
  console.error('usage: npm run verify:live -- --api <API address> [--site <site address>] [--admin-token <token>]');
  process.exit(2);
}

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
};
const get = async (url, headers = {}) => {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000), redirect: 'manual' });
    const body = await res.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* not JSON */
    }
    return { status: res.status, headers: res.headers, body, json };
  } catch (e) {
    return { status: 0, error: e.message, headers: new Headers(), body: '', json: null };
  }
};

// ---- the API
const health = await get(`${api}/health`);
check('the API answers /health', health.status === 200 && health.json?.ok === true, health.error ?? `status ${health.status}`);
check('the world is seeded', (health.json?.plots ?? 0) > 0 && (health.json?.adSlots ?? 0) > 0, `${health.json?.plots ?? 0} plots, ${health.json?.adSlots ?? 0} ad spaces`);
if (site) {
  const cors = await get(`${api}/health`, { Origin: site });
  const allowed = cors.headers.get('access-control-allow-origin');
  check('CORS allows only the site, not everyone', allowed === site, `allows "${allowed}"`);
}
const state = await get(`${api}/plots/state`);
const plots = state.json?.plots ?? [];
check('the world state is served', state.status === 200 && plots.length > 0);
const built = plots.filter((p) => p.owner && p.buildingType && p.buildingType !== 'house');
const sample = built[0];
if (sample) {
  const stats = await get(`${api}/plots/${sample.id}/stats`);
  check('building statistics are real, verified figures (never simulated)', stats.json?.simulated === false && stats.json?.verified === true, `plot ${sample.id}`);
  const one = await get(`${api}/plots/${sample.id}`);
  const verifiedViews = stats.json?.views ?? 0;
  check("a building's visit count is not padded with generated figures", typeof one.json?.visits === 'number' && one.json.visits >= verifiedViews && one.json.visits < verifiedViews + 100000, `${one.json?.visits} visits`);
  const hist = await get(`${api}/plots/${sample.id}/history`);
  check('building history comes from the ledger', hist.json?.simulated === false && Array.isArray(hist.json?.events));
}
const ads = await get(`${api}/ads`);
check('ad spaces are served with counts', Array.isArray(ads.json?.slots) && ads.json.slots.every((s) => Number.isInteger(s.views) && Number.isInteger(s.clicks)));
const profiles = await get(`${api}/businesses?limit=5`);
check('business profiles are served', profiles.status === 200 && Array.isArray(profiles.json?.profiles), `${profiles.json?.total ?? '?'} profiles`);
check('the audit trail is closed to the public', (await get(`${api}/admin/audit`)).status === 403);
check('the moderation queue is closed to the public', (await get(`${api}/admin/reports`)).status === 403);
if (adminToken) {
  const chain = await get(`${api}/admin/audit/verify`, { Authorization: `Bearer ${adminToken}` });
  check('the audit trail is intact (hash chain verified)', chain.json?.ok === true, chain.json ? `${chain.json.rows} records${chain.json.brokenAt ? `, broken at ${chain.json.brokenAt}` : ''}` : `status ${chain.status}`);
}

// ---- the site
if (site) {
  const discover = await get(`${site}/discover`);
  check('the site serves /discover', discover.status === 200, `status ${discover.status}`);
  check('the site is not in demo mode (it reads the API)', discover.status === 200 && !/Demo: these are the sample businesses/.test(discover.body));
  const newPage = await get(`${site}/business/new`);
  check('the site was built with the API address (owner pages are live)', newPage.status === 200 && !/Profiles need the API server/.test(newPage.body));
  const robots = await get(`${site}/robots.txt`);
  check('robots.txt points at the sitemap on this site', robots.status === 200 && robots.body.includes(`${site}/sitemap.xml`));
  const sitemap = await get(`${site}/sitemap.xml`);
  check('the sitemap is served', sitemap.status === 200 && sitemap.body.includes('<urlset'));
  const first = profiles.json?.profiles?.[0];
  if (first) {
    const page = await get(`${site}/business/${first.slug}`);
    check('a profile page is served with its canonical address on this site', page.status === 200 && page.body.includes(`href="${site}/business/${first.slug}"`), first.slug);
  }
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
