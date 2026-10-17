// A merchant in a journey (tests/agents/scenario.mjs): the steps a business owner takes, through the API, the way the dashboard takes them.
// Each failure says which business step failed and what the API answered. Deterministic: the lot it claims is picked from the scenario's
// city (the same seed as the API's) in a fixed order; on a remote stack, names get a run suffix so a rerun does not collide with the last.
import { imp } from '../helpers.mjs';
import { testPassword } from '../fixtures/deterministic-pilot-city.mjs';
import { ProductFailure } from './scenario.mjs';

const RUN = Date.now().toString(36).slice(-4);

// The API, as an account (or anonymously). Returns { status, data }.
export function apiClient(j, token = null) {
  return async (method, path, body, headers = {}) => {
    let res;
    try {
      res = await fetch(`${j.stack.apiUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 journey', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body == null ? undefined : JSON.stringify(body) });
    } catch (err) {
      throw new ProductFailure(`the API could not be reached for ${method} ${path}: ${err.message}`);
    }
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, data: type.includes('json') ? await res.json().catch(() => null) : await res.text() };
  };
}
// An answer that must be a success, or the milestone fails with what the API said.
const ok = (r, what) => {
  if (r.status >= 300) throw new ProductFailure(`${what}: the API answered ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`);
  return r.data;
};

export async function merchantAgent(j, ref) {
  const account = j.scenario.accounts.find((a) => a.ref === ref);
  if (!account) throw new ProductFailure(`journey bug: no account "${ref}" in the scenario`);
  const username = j.stack.remote ? `${account.username.slice(0, 15)}${RUN}` : account.username;
  const password = testPassword(j.scenario.seed, ref);
  const m = { username, token: null, account: null, slug: null, plotId: null };
  let call = apiClient(j);

  m.signUp = async () => {
    const out = ok(await call('POST', '/auth/signup', { username, password }), 'signing up');
    m.token = out.token;
    m.account = out.account;
    call = apiClient(j, m.token);
    return out;
  };
  m.call = (...a) => call(...a);
  // a free business profile from the scenario's business
  m.createProfile = async (bizRef) => {
    const b = j.scenario.businesses.find((x) => x.ref === bizRef);
    const out = ok(await call('POST', '/businesses', { name: b.name, category: b.category, district: b.district, description: b.description, website: b.website, cta: b.cta }), 'creating the business profile');
    m.slug = out.slug ?? out.profile?.slug;
    return out;
  };
  // claims a lot in the city: the first free one, in the city's own order, from a fixed offset (the seed)
  m.claimLot = async (title) => {
    const { generateCity } = await imp('city/cityGenerator.js');
    const lots = generateCity(j.scenario.seed).plots.filter((p) => !p.owner && p.districtId !== 'suburb' && !p.prime && !p.luxury && !p.grand).sort((a, b) => a.id - b.id);
    const start = j.scenario.seed % Math.max(1, lots.length);
    for (let i = 0; i < Math.min(lots.length, 40); i++) {
      const lot = lots[(start + i) % lots.length];
      const r = await call('POST', `/plots/${lot.id}/claim`, { title, buildingType: 'shop', website: 'https://shop.example.com', logo: { kind: 'generated' } });
      if (r.status < 300) {
        m.plotId = lot.id;
        return lot.id;
      }
      if (![409].includes(r.status)) ok(r, 'claiming a lot');
    }
    throw new ProductFailure('no lot could be claimed in 40 tries');
  };
  m.linkBuilding = async () => ok(await call('PUT', `/businesses/${m.slug}/plot`, { plotId: m.plotId }), 'linking the building to the profile');
  m.update = async (fields) => ok(await call('PATCH', `/businesses/${m.slug}`, fields), 'updating the profile');
  m.setOffer = async (text) => ok(await call('PUT', `/businesses/${m.slug}/offer`, { text }), 'setting the offer');
  m.setCoupon = async ({ text, code, total }) => ok(await call('PUT', `/plots/${m.plotId}/storefront`, { couponText: text, couponCode: code, couponTotal: total }), 'setting the coupon');
  m.conversionKey = async () => ok(await call('POST', `/businesses/${m.slug}/tracking/key`), 'making a conversion key').key;
  // the owner's figures for the profile (GET /me/businesses)
  m.figures = async () => ok(await call('GET', '/me/businesses'), 'reading the dashboard').profiles.find((x) => x.profile.slug === m.slug);
  m.public = async () => ok(await apiClient(j)('GET', `/businesses/${m.slug}`), 'reading the public profile');
  return m;
}

// The operator: admin steps with the stack's admin token (none on a remote stack unless JOURNEY_ADMIN_TOKEN is set).
export function operatorAgent(j) {
  const token = j.stack.adminToken;
  const call = apiClient(j, token);
  return {
    available: Boolean(token),
    addToPilot: async (slug) => ok(await call('POST', '/admin/pilot/members', { slug, note: `journey ${j.scenario.id}` }), 'adding the business to the pilot'),
    pilot: async () => ok(await call('GET', '/admin/pilot'), 'reading the pilot dashboard'),
  };
}
