// The guided demo tours (lib/tour/, docs/product/pilot_tour.md): each fits the `demo.tour` contract, every stop's target and action is in the city
// its seed makes and is what its caption says, the pilot walk-through covers what a pilot business needs to see in two to three minutes, the camera
// math points where it should, the previews are priced like the server prices and are the same every run, and the tab is read-only while a tour runs.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from './helpers.mjs';
import { DEMO_TOUR, OWNER_FIGURES, check as fits } from '@voxelventure/shared-types';
import { CART, PRO_PLOT_DISCOUNT, priceOf, profileFromPlot } from '@voxelventure/business-core';

const { generateCity } = await imp('city/cityGenerator.js');
const { TOURS, PILOT_TOUR, PILOT_SEED, TOUR_BUSINESS, TOUR_LOT, tourById } = await imp('tour/tours.js');
const plan = await imp('tour/plan.js');
const previews = await imp('tour/previews.js');
const { PRESETS } = await imp('state/viewStore.js');
const { PILOT_SEED: FIXTURE_SEED } = await import('./fixtures/deterministic-pilot-city.mjs');

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// ---- the contract
for (const t of Object.values(TOURS)) {
  const r = fits(DEMO_TOUR, t);
  check(`tour "${t.id}" fits demo.tour v${DEMO_TOUR.version}`, r.ok, r.errors.join('; '));
  check(`tour "${t.id}": stop ids are unique`, new Set(t.stops.map((s) => s.id)).size === t.stops.length);
}
const base = PILOT_TOUR;
const stop0 = base.stops[0];
check('a page action cannot name an outside link', !fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, action: { kind: 'page', path: 'https://evil.example.com' } }] }).ok && !fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, action: { kind: 'page', path: '//evil.test/x' } }] }).ok);
check('a page action can name the public pages', ['/discover', '/discover#sponsored', '/business/combo-cafe-83', '/category/food', '/district/arcade'].every((p) => fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, action: { kind: 'page', path: p } }] }).ok));
check('a page action cannot open the admin, the cart or the owner\'s pages', ['/admin/pilot', '/cart', '/business/manage', '/business/new', '/business/manage#x', '/business/manage/x', '/', '/discover?x=1', '/discover#"><b>'].every((p) => !fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, action: { kind: 'page', path: p } }] }).ok));
check('there is no action that buys or saves', !fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, action: { kind: 'checkout', plot: 1 } }] }).ok);
check('a stop cannot carry code or selectors', !fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, script: 'alert(1)' }] }).ok && !fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, action: { kind: 'card', plot: 1, selector: '#x' } }] }).ok);
check('a camera view must be one that follows a point', !fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, camera: { view: 'iso' } }] }).ok && !fits(DEMO_TOUR, { ...base, stops: [{ ...stop0, camera: { view: 'first' } }] }).ok);
check('the contract\'s views are the view store\'s follow presets', DEMO_TOUR.schema.properties.stops.items.properties.camera.properties.view.enum.every((v) => PRESETS[v] && !PRESETS[v].iso && !PRESETS[v].fp));
check('captions stay short', PILOT_TOUR.stops.every((s) => s.title.length <= 60 && s.text.length <= 240 && s.text.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length <= 3));
check('the tour uses the journeys\' seed', PILOT_SEED === FIXTURE_SEED && PILOT_TOUR.seed === FIXTURE_SEED);
check('tourById finds it, and nothing else', tourById('pilot') === PILOT_TOUR && tourById('nope') === null);

// ---- the pilot walk-through
const city = generateCity(PILOT_TOUR.seed);
const world = { plots: city.plots, layout: city.layout };
const n = PILOT_TOUR.stops.length;
const ms = plan.totalMs(PILOT_TOUR);
check('8 to 10 stops', n >= 8 && n <= 10, String(n));
check('two to three minutes', ms >= 120000 && ms <= 180000, `${ms / 1000}s`);
check('every stop\'s target and action is in the seeded city', plan.missingTargets(PILOT_TOUR, world).length === 0, plan.missingTargets(PILOT_TOUR, world).join(', '));
const kinds = PILOT_TOUR.stops.map((s) => s.action?.kind ?? null);
const order = ['card', 'interior', 'page', 'dashboard', 'claim', 'cart', 'page'];
let at = -1;
check('it opens the card, the room, the business page, the figures, the claim form, the cart and Discover, in that order', order.every((k) => (at = kinds.indexOf(k, at + 1)) >= 0), kinds.join(' → '));
check('it starts and ends over the city', !PILOT_TOUR.stops[0].action && !PILOT_TOUR.stops[n - 1].action && ['overview', 'tactical'].includes(PILOT_TOUR.stops[0].camera.view));
const biz = city.plots.find((p) => p.id === TOUR_BUSINESS.plot);
check('the tour\'s business is one of the city\'s businesses, with the name the captions use', biz && biz.owner && biz.title === TOUR_BUSINESS.name && PILOT_TOUR.stops.some((s) => s.text.includes(biz.title)));
check('it has a room to step into and an offer inside (a coupon or a visit reward)', biz.interiorData?.rooms >= 1 && Boolean(biz.brand?.coupon || biz.brand?.quest));
check('its business page is the seeded city\'s sample profile', profileFromPlot(biz).slug === TOUR_BUSINESS.slug && PILOT_TOUR.stops.some((s) => s.action?.path === `/business/${TOUR_BUSINESS.slug}`));
check('the profile is one the demo pages list (a business, not a house, with a building)', biz.buildingType !== 'house' && biz.height > 0.2);
const lot = city.plots.find((p) => p.id === TOUR_LOT.plot);
check('the lot to claim is empty, not in Old Town, and next door', lot && !lot.owner && lot.districtId !== 'suburb' && Math.hypot(lot.x - biz.x, lot.z - biz.z) < 6);
const claimStop = PILOT_TOUR.stops.find((s) => s.action?.kind === 'claim');
check('the claim stop\'s caption names 7, 14 and 30 days and the Pro discount', /7, 14 or 30 days/.test(claimStop.text) && claimStop.text.includes(`${Math.round(PRO_PLOT_DISCOUNT * 100)}%`));
check('captions use the owner\'s words: "your" on most stops', PILOT_TOUR.stops.filter((s) => /\byour\b/i.test(`${s.title} ${s.text}`)).length >= n - 2);

// ---- the camera
const cam = plan.cameraFor(PILOT_TOUR.stops.find((s) => s.target.plot === biz.id && s.camera.heading === 'front'), world);
check('a plot stop looks at the plot', Math.abs(cam.x - biz.x) < 1e-9 && Math.abs(cam.z - biz.z) < 1e-9);
// the follow camera stands at target + (sin az, cos az) * distance: in front of the door is the facing side
const front = { x: Math.sin(cam.azimuth), z: Math.cos(cam.azimuth) };
const door = { x: Math.sin(biz.yaw ?? 0) * (biz.facing ?? 1), z: Math.cos(biz.yaw ?? 0) * (biz.facing ?? 1) };
check('"front" stands the camera on the door side', front.x * door.x + front.z * door.z > 0.99);
check('a heading is where the camera looks (the compass\'s degrees)', [0, 90, 180, 270, 20].every((h) => Math.abs(plan.headingOfAzimuth(plan.azimuthOfHeading(h)) - h) < 1e-9) && Math.abs(Math.sin(plan.azimuthOfHeading(90)) + 1) < 1e-9);
check('the centre is the city\'s centre', (() => { const c = plan.resolveTarget({ place: 'center' }, world); return c.x === city.layout.center.x && c.z === city.layout.center.z; })());
check('a district is the middle of its plots', (() => { const d = plan.resolveTarget({ district: 'arcade' }, world); const own = city.plots.filter((p) => p.districtId === 'arcade'); return own.length > 0 && Math.abs(d.x - own.reduce((a, p) => a + p.x, 0) / own.length) < 1e-9; })());
check('a mall is a place', plan.resolveTarget({ place: city.layout.malls[0].id }, world)?.x === city.layout.malls[0].x);
check('a target the city lacks is null', plan.resolveTarget({ plot: 999999 }, world) === null && plan.resolveTarget({ district: 'atlantis' }, world) === null && plan.cameraFor({ ...stop0, target: { place: 'nowhere' } }, world) === null);
check('the short way round', Math.abs(plan.angleDelta(0.1, 2 * Math.PI - 0.1) + 0.2) < 1e-9 && Math.abs(plan.angleDelta(3, -3) - (2 * Math.PI - 6)) < 1e-9);
check('the glide starts and ends still', plan.ease(0) === 0 && plan.ease(1) === 1 && plan.ease(0.5) === 0.5);
const p1 = plan.tourParams('?tour=pilot&tourSpeed=8&tourStop=3');
const p2 = plan.tourParams('?tourSpeed=abc&tourStop=-2');
check('?tour=, ?tourSpeed= and ?tourStop= are read safely', p1.id === 'pilot' && p1.speed === 8 && p1.start === 2 && p2.id === null && p2.speed === 1 && p2.start === 0 && plan.tourParams('?tourSpeed=500').speed === 20);

// ---- the previews: the server's prices, the same every run
const terms = previews.claimTerms(lot);
check('the claim preview has the 7, 14 and 30-day terms', terms.map((t) => t.days).join() === '7,14,30');
check('a longer lease costs more, and Pro costs 15% less (never under the minimum)', terms[0].price < terms[1].price && terms[1].price < terms[2].price && terms.every((t) => t.proPrice <= t.price && (t.proPrice === 0.5 || Math.abs(t.proPrice - Math.round(t.price * (1 - PRO_PLOT_DISCOUNT) * 100) / 100) <= 0.011)));
const { leaseQuote } = await imp('game/claimPrice.js');
const { cleanExterior, defaultExterior } = await imp('game/exterior.js');
check('the 30-day price is the claim form\'s (leaseQuote with the basic outside of a shop)', terms[2].price === leaseQuote(lot, cleanExterior(defaultExterior(lot, 'shop'), lot, 'shop'), 'shop', 30, { pro: false }).total);
const cart = previews.sampleCart(lot, biz.title);
check('the cart preview: a lease, Pro and a sponsored week', cart.items.map((i) => i.kind).join() === 'claim,pro,sponsored');
check('the cart is priced as the server prices it', cart.items[1].cents === priceOf('pro') && cart.items[2].cents === priceOf('sponsored', 'discover') && cart.items[0].cents === Math.round(terms[2].proPrice * 100) && cart.items[0].discountCents === Math.round(terms[2].price * 100) - cart.items[0].cents);
check('its totals add up, it is over the minimum, and one payment saves the fees', cart.totalCents === cart.items.reduce((a, i) => a + i.cents, 0) && cart.subtotalCents === cart.totalCents + cart.discountCents && cart.ready && cart.totalCents >= CART.minimumCents && cart.feeSavedCents === 2 * CART.feeCents);
const figures = previews.sampleFigures(PILOT_TOUR.seed, biz.id);
const f = fits(OWNER_FIGURES, figures);
check('the sample figures fit business.owner-figures', f.ok, f.errors.join('; '));
check('the sample figures are the same every run', JSON.stringify(figures) === JSON.stringify(previews.sampleFigures(PILOT_TOUR.seed, biz.id)) && JSON.stringify(figures) !== JSON.stringify(previews.sampleFigures(PILOT_TOUR.seed + 1, biz.id)));
check('the funnel narrows', figures.impressions > figures.views && figures.views > figures.qualified && figures.qualified > figures.storeEntries && figures.storeEntries > figures.ctaClicks && figures.ctaClicks > 0);

// ---- read-only while a tour runs (lib/data/api.js refuses everything but GET; lib/tour/mode.js says when)
const store = new Map();
globalThis.window = { location: { search: '?tour=pilot', pathname: '/' }, sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
const mode = await imp('tour/mode.js');
const { request } = await imp('data/api.js');
const sent = [];
globalThis.fetch = async (url, init) => (sent.push(`${init?.method} ${url}`), { ok: true, json: async () => ({}) });
let refused = null;
try {
  await request('POST', '/plots/84/claim', {});
} catch (e) {
  refused = e;
}
await request('GET', '/plots');
check('during a tour a write is refused before it is sent', refused?.code === 'tour_read_only' && sent.length === 1 && sent[0].startsWith('GET'), sent.join(' | '));
check('?tour= in the address is a tour', mode.tourActive());
window.location.search = '';
check('without it, not a tour, until the tour marks the tab', !mode.tourActive() && (mode.markTour('pilot'), mode.tourActive()));
mode.forgetStaleTour();
check('a game page opened without ?tour= forgets a tour from before', !mode.tourActive());
mode.markTour('pilot');
let refusedInFrame = null;
try {
  await request('PATCH', '/me', {});
} catch (e) {
  refusedInFrame = e;
}
check('a page the tour opened (no ?tour= after a link) is still read-only', refusedInFrame?.code === 'tour_read_only');
delete globalThis.window;

// ---- wired in: the player is on the game page, the previews and the guard are where they should be
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
check('the game page mounts the tour player', /<TourPlayer \/>/.test(read('apps/web/app/page.jsx')));
check('the game page does not load or save the player\'s game during a tour, and sends no presence', /tourActive\(\)\) useCityStore\.persist\.setOptions\(\{ storage: \{ getItem: \(\) => null, setItem: \(\) => \{\}/.test(read('apps/web/app/page.jsx')) && /if \(!tourActive\(\)\) startPresence/.test(read('apps/web/app/page.jsx')));
check('the player opens the room without counting a visit', /activeInteriorPlot: plot \}\)/.test(read('apps/web/components/tour/TourPlayer.jsx')) && !/openInterior\(/.test(read('apps/web/components/tour/TourPlayer.jsx')));
check('the player never calls the API', !/lib\/data\/(api|sync|economy)|request\(/.test(read('apps/web/components/tour/TourPlayer.jsx') + read('apps/web/components/tour/Previews.jsx')));
check('the previews\' buttons are disabled', (read('apps/web/components/tour/Previews.jsx').match(/<button /g) ?? []).length === (read('apps/web/components/tour/Previews.jsx').match(/<button type="button" disabled/g) ?? []).length);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
