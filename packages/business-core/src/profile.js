import { PRODUCTS, priceLabel } from './plans.js';

// Free business profiles: the business-first funnel (phase 2 of docs/competitive-research/claimavenue_competitive_alignment_review.md, see docs/product/business_funnel.md).
//
// A profile is a business's public page (/business/<slug>): a name, a category, a district, a description, a website and ONE call to action.
// It is free and needs no plot; a 3D building can be linked to it later as an optional destination. The rules here are pure and shared by the
// API server (validation), the public pages and the owner's page, so they cannot disagree. Tested in tests/business-profile.test.mjs.

// The categories a business can list under (each has a public page, /category/<id>).
export const CATEGORIES = [
  { id: 'food', label: 'Food & drink', schema: 'FoodEstablishment' },
  { id: 'retail', label: 'Shops & retail', schema: 'Store' },
  { id: 'software', label: 'Software & SaaS', schema: 'Organization' },
  { id: 'gaming', label: 'Games & play', schema: 'Organization' },
  { id: 'creators', label: 'Creators & studios', schema: 'Organization' },
  { id: 'ecommerce', label: 'Online stores', schema: 'OnlineStore' },
  { id: 'services', label: 'Local services', schema: 'LocalBusiness' },
  { id: 'other', label: 'Something else', schema: 'Organization' },
];
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) ?? null;

// The city's themed districts a profile can belong to (the same ids, names and colours as DISTRICTS in lib/city/cityGenerator.js; a test checks
// they agree). Kept here so a public page does not have to load the city generator. Each has a public page, /district/<id>.
export const BUSINESS_DISTRICTS = [
  { id: 'saas', name: 'SaaS Silicon Strip', color: '#3b82f6' },
  { id: 'arcade', name: 'Arcade Alley', color: '#ec4899' },
  { id: 'creator', name: 'Creator Commons', color: '#a855f7' },
  { id: 'bazaar', name: 'The Bazaar', color: '#f97316' },
];
export const districtOf = (id) => BUSINESS_DISTRICTS.find((d) => d.id === id) ?? null;

// The one thing a profile asks a visitor to do. `url` kinds open the owner's link; `newsletter` signs the visitor up (double opt-in) here;
// `meeting` and `quote` take the visitor's details here and email them to the owner.
export const CTA_KINDS = [
  { id: 'website', label: 'Visit website', needsUrl: true },
  { id: 'newsletter', label: 'Join the newsletter', needsUrl: false },
  { id: 'booking', label: 'Book a meeting', needsUrl: true },
  { id: 'order', label: 'Order online', needsUrl: true },
  { id: 'demo', label: 'Request a demo', needsUrl: true },
  // answered on the profile itself: the visitor leaves their details, the owner gets an email (phase 5, docs/monetization/conversions.md)
  { id: 'meeting', label: 'Request a meeting', needsUrl: false },
  { id: 'quote', label: 'Request a quote', needsUrl: false },
];
export const ctaKindOf = (id) => CTA_KINDS.find((k) => k.id === id) ?? null;

// Paths under /business that are pages of their own, so no business can be given them as a slug.
export const RESERVED_SLUGS = ['new', 'manage', 'edit', 'admin', 'api', 'search', 'sitemap', 'featured', 'impressions'];
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
export const isSlug = (s) => SLUG.test(String(s ?? '')) && !RESERVED_SLUGS.includes(String(s));

// "Joe's Café & Bar!" -> "joes-cafe-bar". Accents are dropped, anything else becomes a dash; never empty and never reserved.
export function slugify(name) {
  const base = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  if (!base) return 'business';
  return RESERVED_SLUGS.includes(base) ? `${base}-business` : base;
}
// The first free slug: "joes-cafe", then "joes-cafe-2", "joes-cafe-3"... `taken(slug)` says whether one is in use.
export function uniqueSlug(name, taken) {
  const base = slugify(name);
  if (!taken(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const s = `${base.slice(0, 44).replace(/-+$/, '')}-${n}`;
    if (!taken(s)) return s;
  }
  return `${base.slice(0, 36)}-${Date.now().toString(36)}`;
}

const clean = (v, max) => [...String(v ?? '')].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('').replace(/\s+/g, ' ').trim().slice(0, max);
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const HTTP_URL = /^https?:\/\/[^\s<>"']+\.[^\s<>"']+$/i;
export const isHttpUrl = (v) => HTTP_URL.test(String(v ?? '')) && String(v).length <= 300;

export const LIMITS = { name: 60, tagline: 90, description: 600, website: 300, ctaLabel: 30 };

// Checks what an owner typed. Returns { ok: true, value } or { ok: false, errors: { field: message } }.
// `partial` (an edit) only checks the fields that are present.
export function cleanProfile(input = {}, { partial = false } = {}) {
  const errors = {};
  const value = {};
  const has = (k) => !partial || input[k] !== undefined;
  if (has('name')) {
    value.name = clean(input.name, LIMITS.name);
    if (value.name.length < 2) errors.name = 'Give the business a name.';
  }
  if (has('category')) {
    value.category = categoryOf(input.category)?.id;
    if (!value.category) errors.category = 'Choose a category.';
  }
  if (has('district')) {
    value.district = input.district ? districtOf(input.district)?.id : null;
    if (input.district && !value.district) errors.district = 'Choose one of the districts.';
  }
  if (has('tagline')) value.tagline = clean(input.tagline, LIMITS.tagline) || null;
  if (has('description')) value.description = clean(input.description, LIMITS.description) || null;
  if (has('website')) {
    value.website = clean(input.website, LIMITS.website) || null;
    if (value.website && !isHttpUrl(value.website)) errors.website = 'The website must start with http:// or https://';
  }
  // the owner's X handle (optional) and whether VoxelVenture's X account may welcome them and tag it (server/api/social.mjs)
  if (has('xHandle')) {
    const h = clean(input.xHandle, 20).replace(/^@/, '');
    value.xHandle = h || null;
    if (h && !X_HANDLE.test(h)) errors.xHandle = 'An X handle is 1 to 15 letters, numbers or underscores.';
  }
  if (has('announce')) value.announce = input.announce === true;
  if (has('cta')) {
    const c = input.cta ?? { kind: 'website' };
    const kind = ctaKindOf(c.kind);
    if (!kind) errors.cta = 'Choose what visitors should do.';
    else {
      const url = kind.needsUrl ? clean(c.url, LIMITS.website) || (kind.id === 'website' ? value.website ?? clean(input.website, LIMITS.website) : '') : null;
      if (kind.needsUrl && !isHttpUrl(url)) errors.cta = `${kind.label} needs a link that starts with https://`;
      value.cta = { kind: kind.id, url: kind.needsUrl ? url : null, label: clean(c.label, LIMITS.ctaLabel) || kind.label };
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

// ---- onboarding ---------------------------------------------------------------------------------------------------------------
// What an owner does to get value from a free profile, in order. `optional` steps do not count towards "ready".
// `activity`: { views, ctaClicks, referralVisits } (verified, last 30 days) or null.
export function onboardingSteps(profile, activity = null) {
  const p = profile ?? {};
  return [
    { id: 'basics', label: 'Name and category', hint: 'They decide which category and search pages list you.', done: Boolean(p.name && p.category) },
    { id: 'district', label: 'Choose a district', hint: 'Your district page lists you beside related businesses.', done: Boolean(p.district) },
    { id: 'description', label: 'Describe what you do', hint: 'At least two sentences (40 characters): it is what search engines show under your name.', done: (p.description ?? '').length >= 40 },
    { id: 'cta', label: 'Pick one call to action', hint: 'Book a meeting, join a newsletter, order or visit your site: one clear button gets more clicks than many.', done: Boolean(p.cta?.kind) && (p.cta.kind !== 'website' || Boolean(p.cta.url || p.website)) },
    { id: 'share', label: 'Share your link', hint: 'Post your profile link: visits through it are credited to you.', done: (activity?.referralVisits ?? 0) > 0 || (activity?.views ?? 0) > 0 },
    { id: 'building', label: 'Link a 3D storefront (optional)', hint: 'Owners of a building in the city can link it so visitors can step inside.', done: p.plotId != null, optional: true },
  ];
}
export const profileReady = (steps) => steps.filter((s) => !s.optional).every((s) => s.done);

// ---- upgrade prompts --------------------------------------------------------------------------------------------------------------
// The paid offers, from the one catalogue (lib/business/plans.js): a prompt offers checkout when billing is set up, and records interest
// when it is not.
export const PLANS = Object.fromEntries(['launch', 'pro', 'sponsored'].map((id) => [id, { id, name: PRODUCTS[id].name, price: priceLabel(id), pitch: PRODUCTS[id].pitch }]));

// Which upgrades to suggest, and why, from what the profile has measurably done. Only verified figures count: with simulated or missing
// statistics nothing is suggested, so a prompt is never based on numbers that are not real. Returns [{ plan, reason }], most relevant first.
export function upgradePrompts(profile, stats) {
  if (!profile || !stats || stats.simulated || stats.verified === false) return [];
  const views = stats.views ?? 0;
  const cta = stats.ctaClicks ?? 0;
  const out = [];
  if (cta >= 5 || views >= 100) out.push({ plan: PLANS.pro, reason: `${cta} people pressed "${profile.cta?.label ?? 'your button'}" and ${views} viewed your profile in 30 days. Pro shows where they came from.` });
  if (views >= 300) out.push({ plan: PLANS.sponsored, reason: `Your profile is drawing ${views} verified views a month; a sponsored placement puts it in front of more of the city.` });
  if (profileReady(onboardingSteps(profile, stats)) && views < 50) out.push({ plan: PLANS.launch, reason: 'Your profile is complete. The Launch Pack gives it a week at the top of Discover to get its first visitors.' });
  return out;
}

// ---- referral links ---------------------------------------------------------------------------------------------------------------
// A referral code is "<account id in base 36>.<10 hex characters of a signature>" made by the server (server/api/business.mjs); the shape is
// checked here and the signature there. Share links carry it as ?ref=.
const REF = /^[0-9a-z]{1,10}\.[0-9a-f]{10}$/;
export const isRefCode = (v) => REF.test(String(v ?? ''));
export function profilePath(slug, ref) {
  return `/business/${encodeURIComponent(slug)}${isRefCode(ref) ? `?ref=${ref}` : ''}`;
}
export const profileUrl = (origin, slug, ref) => `${String(origin ?? '').replace(/\/+$/, '')}${profilePath(slug, ref)}`;

// ---- structured data -------------------------------------------------------------------------------------------------------------
// The schema.org description of a profile for search engines, as a string safe to put inside a <script> tag.
export function profileJsonLd(profile, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': categoryOf(profile.category)?.schema ?? 'Organization',
    name: profile.name,
    url,
    ...(profile.description || profile.tagline ? { description: profile.description || profile.tagline } : {}),
    ...(profile.website ? { sameAs: [profile.website] } : {}),
    ...(profile.district ? { areaServed: districtOf(profile.district)?.name } : {}),
    // a Pro offer running now (business.mjs liveOffer)
    ...(profile.offer?.text ? { makesOffer: { '@type': 'Offer', description: profile.offer.text, ...(profile.offer.until ? { validThrough: new Date(profile.offer.until).toISOString() } : {}) } } : {}),
  };
  return safeJson(data);
}
// JSON for a <script type="application/ld+json">: nothing in it can close the tag or start an entity.
const safeJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

// The trail back to Discover (search engines show it under the result): [{ name, url }, ...].
export const breadcrumbJsonLd = (crumbs) =>
  safeJson({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) });

// A list page (Discover, a category, a district): what it is and the businesses on it, in order.
export const listJsonLd = ({ name, description, url }, profiles, base) =>
  safeJson({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    ...(description ? { description } : {}),
    url,
    mainEntity: { '@type': 'ItemList', numberOfItems: profiles.length, itemListElement: profiles.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/business/${p.slug}`, name: p.name })) },
  });

// ---- the demo city ---------------------------------------------------------------------------------------------------------------
// Without an API server the public pages list the generated city's own businesses as a demo (marked as such and kept out of search engines).
const TYPE_CATEGORY = { restaurant: 'food', shop: 'retail', office: 'software' };
const DISTRICT_CATEGORY = { arcade: 'gaming', creator: 'creators', bazaar: 'ecommerce' };
export function profileFromPlot(plot) {
  const district = districtOf(plot.districtId)?.id ?? null;
  const category = (plot.buildingType === 'office' && DISTRICT_CATEGORY[district]) || TYPE_CATEGORY[plot.buildingType] || 'other';
  const website = isHttpUrl(plot.website) && !/\/\/(www\.)?example\.com\b/i.test(plot.website) ? plot.website : null; // the generator's placeholders are not real sites
  return {
    slug: `${slugify(plot.title)}-${plot.id}`,
    name: plot.title,
    category,
    district,
    tagline: null,
    description: plot.description ?? `${plot.title} is a ${plot.buildingType ?? 'business'} in ${plot.district ?? 'the city'}.`,
    website,
    cta: { kind: 'website', url: website, label: 'Visit website' },
    plotId: plot.id,
    demo: true,
  };
}

// ---- where a visitor came from ---------------------------------------------------------------------------------------------------
// The source of a profile view from the page's referrer: a search engine, a social site, the 3D city (this site), or direct (anything else,
// including no referrer). A referral link overrides this on the server. `host` is this site's own host name. A link from VoxelVenture's own
// X posts carries utm_source=x (server/api/social.mjs) and counts as 'x' whatever the referrer, so an owner sees what the welcome post brought.
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave|startpage|kagi)\./i;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t|x|twitter|linkedin|lnkd|reddit|pinterest|tiktok|youtube|threads|mastodon|bsky|discord|whatsapp)\.(com|co|net|app|social|gg|in)$/i;
export function sourceOf(referrer, host, search = '') {
  if (new URLSearchParams(search ?? '').get('utm_source') === 'x') return 'x';
  let ref;
  try {
    ref = new URL(referrer).hostname;
  } catch {
    return 'direct';
  }
  if (host && ref === host) return 'city';
  if (SEARCH.test(ref)) return 'search';
  if (SOCIAL.test(ref)) return 'social';
  return 'direct';
}
