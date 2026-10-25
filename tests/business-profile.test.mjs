// The rules of free business profiles (@voxelventure/business-core): slugs, validation, calls to action, onboarding steps, upgrade prompts
// (never from simulated figures), referral link shapes, structured data, traffic sources and the demo city's profiles.
import { imp } from './helpers.mjs';
import * as P from '@voxelventure/business-core';
const { DISTRICTS, generateCity } = await imp('city/cityGenerator.js');
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', n, extra); };

// ---- slugs
check('a name becomes a readable slug', P.slugify("Joe's Café & Bar!") === 'joes-cafe-bar' && P.slugify('  ÜBER  Labs ') === 'uber-labs', P.slugify("Joe's Café & Bar!"));
check('an empty or symbol-only name still gets a slug', P.slugify('!!!') === 'business' && P.slugify('') === 'business');
check('a reserved word is never a slug', P.slugify('New') === 'new-business' && !P.isSlug('manage') && !P.isSlug('sitemap'));
check('slugs are at most 48 characters and end cleanly', P.slugify('a'.repeat(30) + ' ' + 'b'.repeat(40)).length <= 48 && !P.slugify('a'.repeat(47) + ' b').endsWith('-'));
const taken = new Set(['joes', 'joes-2']);
check('the next free slug is numbered', P.uniqueSlug('Joes', (s) => taken.has(s)) === 'joes-3' && P.uniqueSlug('Fresh', (s) => taken.has(s)) === 'fresh');
check('isSlug refuses capitals, spaces and path tricks', !P.isSlug('Joes') && !P.isSlug('a b') && !P.isSlug('../x') && !P.isSlug('-a') && P.isSlug('a') && P.isSlug('joes-cafe-2'));

// ---- validation
const ok = P.cleanProfile({ name: '  Joe\u0007s   Cafe ', category: 'food', district: 'creator', website: 'https://joe.test', cta: { kind: 'website' } });
check('a good profile is cleaned (control characters and extra spaces go)', ok.ok && ok.value.name === 'Joes Cafe' && ok.value.cta.url === 'https://joe.test' && ok.value.cta.label === 'Visit website', JSON.stringify(ok));
const bad = P.cleanProfile({ name: 'J', category: 'casino', district: 'mars', website: 'javascript:alert(1)', cta: { kind: 'booking', url: 'ftp://x' } });
check('every bad field is named', !bad.ok && ['name', 'category', 'district', 'website', 'cta'].every((k) => bad.errors[k]), JSON.stringify(bad.errors));
check('a newsletter call to action needs no link', P.cleanProfile({ name: 'Zine', category: 'creators', cta: { kind: 'newsletter' } }).value?.cta.url === null);
check('a website call to action with no website is refused', !P.cleanProfile({ name: 'Zine', category: 'creators', cta: { kind: 'website' } }).ok);
check('a custom button label is kept, but short', P.cleanProfile({ name: 'Zine', category: 'creators', cta: { kind: 'newsletter', label: 'Get the zine every Friday, forever and ever' } }).value.cta.label.length === P.LIMITS.ctaLabel);
check('a partial edit checks only what it changes', P.cleanProfile({ tagline: 'New line' }, { partial: true }).ok && !P.cleanProfile({ category: 'x' }, { partial: true }).ok);
const cta = (kind, url) => P.cleanProfile({ name: 'Zine', category: 'creators', cta: { kind, url } });
check('a call button keeps the number as a tel: link', cta('call', '+1 (555) 010-2030').value?.cta.url === 'tel:+15550102030' && cta('call', 'call me').errors?.cta);
check('an email button is a mailto: link of a real address', cta('email', 'hello@zine.test').value?.cta.url === 'mailto:hello@zine.test' && cta('email', 'x@y').errors?.cta && cta('email', 'a@b.co?bcc=evil@x.co').errors?.cta);
check('a directions button is a map link to the address', cta('directions', '12 Main St, Springfield').value?.cta.url === 'https://www.google.com/maps/dir/?api=1&destination=12%20Main%20St%2C%20Springfield' && cta('directions', 'abc').errors?.cta && cta('directions', '<script>x</script> road').errors?.cta);
check('saving again keeps the same link, and the form gets back what was typed', ['call', 'email', 'directions'].every((k) => { const first = cta(k, { call: '+44 20 7946 0000', email: 'hi@zine.test', directions: '1 High Street, London' }[k]).value.cta; return cta(k, first.url).value?.cta.url === first.url && P.ctaLink(P.ctaKindOf(k).field, P.ctaInputOf(first)) === first.url; }));
check('no district is fine', P.cleanProfile({ name: 'Zine', category: 'creators', district: '', cta: { kind: 'newsletter' } }).value.district === null);

// ---- districts agree with the city
check("the profile districts are the city's themed districts (ids, names, colours)", P.BUSINESS_DISTRICTS.length === DISTRICTS.length && P.BUSINESS_DISTRICTS.every((d) => DISTRICTS.some((x) => x.id === d.id && x.name === d.name && x.color === d.color)));

// ---- onboarding
const fresh = { name: 'Zine', category: 'creators', cta: { kind: 'newsletter' } };
const steps = P.onboardingSteps(fresh, null);
check('a new profile has its basics and call to action done, the rest to do', steps.find((s) => s.id === 'basics').done && steps.find((s) => s.id === 'cta').done && !steps.find((s) => s.id === 'description').done && !P.profileReady(steps));
const full = { ...fresh, district: 'creator', description: 'A weekly zine about indie games, with interviews and reviews.' };
check('the 3D building is optional: a profile is ready without it once shared', P.profileReady(P.onboardingSteps(full, { views: 1 })) && !P.profileReady(P.onboardingSteps(full, { views: 0 })));

// ---- upgrade prompts
const real = (o) => ({ simulated: false, verified: true, views: 0, ctaClicks: 0, ...o });
check('simulated or missing figures never produce a prompt', P.upgradePrompts(full, { simulated: true, views: 5000, ctaClicks: 900 }).length === 0 && P.upgradePrompts(full, null).length === 0 && P.upgradePrompts(full, { verified: false, views: 999 }).length === 0);
check('a complete, quiet profile is offered the Launch Pack', P.upgradePrompts(full, real({ views: 3 })).map((p) => p.plan.id).join() === 'launch');
check('an incomplete one is offered nothing yet', P.upgradePrompts(fresh, real({ views: 3 })).length === 0);
check('real presses suggest Pro, with the numbers in the reason', P.upgradePrompts(full, real({ views: 80, ctaClicks: 6 }))[0].plan.id === 'pro' && /6 people/.test(P.upgradePrompts(full, real({ views: 80, ctaClicks: 6 }))[0].reason));
check('a busy profile is offered a sponsored placement too', P.upgradePrompts(full, real({ views: 400, ctaClicks: 2 })).map((p) => p.plan.id).join() === 'pro,sponsored');

// ---- referral links
check('referral codes have one shape', P.isRefCode('2s.0123456789') && !P.isRefCode('2s.012345678') && !P.isRefCode('2S.0123456789') && !P.isRefCode('x') && !P.isRefCode(null));
check('a profile link carries a valid code and drops a bad one', P.profileUrl('https://vv.test/', 'joes', '2s.0123456789') === 'https://vv.test/business/joes?ref=2s.0123456789' && P.profilePath('joes', '<script>') === '/business/joes');

// ---- structured data
const ld = P.profileJsonLd({ name: 'Evil </script><script>alert(1)</script>', category: 'food', district: 'bazaar', description: 'x & y', website: 'https://e.test' }, 'https://vv.test/business/evil');
check('JSON-LD cannot close its script tag', !ld.includes('<') && !ld.includes('>') && JSON.parse(ld).name.includes('</script>'));
check('JSON-LD uses the category type and the district', JSON.parse(ld)['@type'] === 'FoodEstablishment' && JSON.parse(ld).areaServed === 'The Bazaar' && JSON.parse(ld).sameAs[0] === 'https://e.test');

// ---- sources
check("a link from VoxelVenture's own X posts counts as 'x' whatever the referrer", P.sourceOf('https://t.co/abc', 'vv.test', '?utm_source=x&utm_campaign=welcome') === 'x' && P.sourceOf('', 'vv.test', '?utm_source=newsletter') === 'direct');
check('search engines, social sites, the city and everything else', P.sourceOf('https://www.google.com/search?q=x', 'vv.test') === 'search' && P.sourceOf('https://t.co/abc', 'vv.test') === 'social' && P.sourceOf('https://www.linkedin.com/feed', 'vv.test') === 'social' && P.sourceOf('https://vv.test/?plot=3', 'vv.test') === 'city' && P.sourceOf('', 'vv.test') === 'direct' && P.sourceOf('https://someblog.test/', 'vv.test') === 'direct');

// ---- the demo city
const city = generateCity(20260101);
const built = city.plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2);
const demo = built.map(P.profileFromPlot);
check('every built plot becomes a valid, uniquely addressed demo profile', demo.every((d) => P.isSlug(d.slug) && d.demo && P.categoryOf(d.category)) && new Set(demo.map((d) => d.slug)).size === demo.length, `${demo.length}`);
check("the generator's placeholder websites are not shown as real links", demo.every((d) => !d.website || !/example\.com/.test(d.website)));
check('demo profiles in a themed district keep it; others have none', demo.every((d) => d.district === null || P.districtOf(d.district)));

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
