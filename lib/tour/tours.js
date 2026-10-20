// The guided demo tours (docs/product/pilot_tour.md), in the shape of the `demo.tour` contract (packages/shared-types/src/contracts/demo-tour.js).
// `?tour=pilot` in the game runs one; scripts/tour-record.mjs records it. Every stop names a plot of the default city (seed 20260101), so the
// tour is the same on every machine, with or without the API: tests/tour.test.mjs checks that each plot is still what the caption says.
//
// To add a stop: append it to `stops` (ids are kebab-case and unique), keep the caption short and in the owner's words, and run
// `node tests/run.mjs tour` to check it. To add a tour: add it to TOURS with its own id.

export const PILOT_SEED = 20260101;
// The business the tour shows: Combo Cafe, a diner on Arcade Alley, one of the city's own businesses (two rooms and a visit reward inside).
export const TOUR_BUSINESS = { plot: 83, name: 'Combo Cafe', slug: 'combo-cafe-83' };
// The empty lot next door, for the claim form and the cart
export const TOUR_LOT = { plot: 84 };
// A sample business has no real website, so on a tour its page shows this call to action instead (an example.com address: never a real site).
export const sampleCta = (slug) => ({ kind: 'order', url: `https://${slug}.example.com/order`, label: 'Order online' });

export const PILOT_TOUR = {
  id: 'pilot',
  schemaVersion: 1,
  title: 'Pilot walk-through',
  description: 'Two and a half minutes for a business owner: the city, a storefront and its card, the room inside, the business page, the verified figures, claiming a lot, the cart and Discover.',
  seed: PILOT_SEED,
  stops: [
    {
      id: 'city',
      title: 'A city of real businesses',
      text: 'Voxel Venture is a 3D city that people explore like a game. Every building is a business, and every visit is counted for its owner.',
      target: { place: 'center' },
      camera: { view: 'overview', distance: 140, pitch: 1.05, heading: 20 },
      durationMs: 15000,
    },
    {
      id: 'storefront',
      title: 'Your storefront on Arcade Alley',
      text: 'This is Combo Cafe, a diner near the middle of the city. Your business stands on a street like this, with your name, colours and logo.',
      target: { plot: TOUR_BUSINESS.plot },
      camera: { view: 'diablo', distance: 22, pitch: 0.75, heading: 35 },
      durationMs: 14000,
    },
    {
      id: 'card',
      title: 'Your building card',
      text: 'Click a building and its card opens: what you do, a link to your site, and how many people have visited.',
      target: { plot: TOUR_BUSINESS.plot },
      camera: { view: 'diablo', distance: 20, pitch: 0.8, heading: 'front' },
      action: { kind: 'card', plot: TOUR_BUSINESS.plot },
      durationMs: 14000,
    },
    {
      id: 'inside',
      title: 'Visitors walk in',
      text: 'Visitors step inside your 3D storefront, look around and press your button. A coupon or a visit reward gives them a reason to come in.',
      target: { plot: TOUR_BUSINESS.plot },
      camera: { view: 'third', distance: 13, pitch: 0.5, heading: 'front' },
      action: { kind: 'interior', plot: TOUR_BUSINESS.plot },
      durationMs: 15000,
    },
    {
      id: 'profile',
      title: 'Your business page',
      text: 'You also get a plain, fast page for search and social links. It has one call to action: order, book or visit your website.',
      target: { plot: TOUR_BUSINESS.plot },
      camera: { view: 'tactical', distance: 60, pitch: 1.0, heading: 'front' },
      action: { kind: 'page', path: `/business/${TOUR_BUSINESS.slug}` },
      durationMs: 15000,
    },
    {
      id: 'figures',
      title: 'Your verified figures',
      text: 'Your dashboard shows what the city brought you: visits, store entries, button presses and sales. Only verified visitors count: no bots and none of your own visits.',
      target: { plot: TOUR_BUSINESS.plot },
      camera: { view: 'tactical', distance: 60, pitch: 1.0, heading: 'front' },
      action: { kind: 'dashboard', plot: TOUR_BUSINESS.plot },
      durationMs: 16000,
    },
    {
      id: 'claim',
      title: 'Claim a lot of your own',
      text: 'The lot next door is free. Lease it for 7, 14 or 30 days and set up your building as you like. Pro members pay 15% less.',
      target: { plot: TOUR_LOT.plot },
      camera: { view: 'diablo', distance: 22, pitch: 0.85, heading: 'front' },
      action: { kind: 'claim', plot: TOUR_LOT.plot },
      durationMs: 16000,
    },
    {
      id: 'cart',
      title: 'Grow with Pro',
      text: 'Put the lease, Pro and a sponsored week in one cart and pay once. Pro adds where your visitors came from, campaign results and 15% off leases.',
      target: { plot: TOUR_LOT.plot },
      camera: { view: 'tactical', distance: 50, pitch: 0.95, heading: 'front' },
      action: { kind: 'cart', plot: TOUR_BUSINESS.plot, claimPlot: TOUR_LOT.plot },
      durationMs: 15000,
    },
    {
      id: 'discover',
      title: 'Be found on Discover',
      text: 'Discover lists every business by category and district. A sponsored week puts yours at the top, clearly labelled.',
      target: { district: 'arcade' },
      camera: { view: 'tactical', distance: 80, pitch: 1.05, heading: 0 },
      action: { kind: 'page', path: '/discover#sponsored' },
      durationMs: 15000,
    },
    {
      id: 'pilot',
      title: 'Join the pilot',
      text: 'The pilot runs for four weeks with a small group of businesses. Your page is free; each week you see your verified figures and tell us what is missing.',
      target: { place: 'center' },
      camera: { view: 'overview', distance: 120, pitch: 1.1, heading: 340 },
      durationMs: 14000,
    },
  ],
};

export const TOURS = { [PILOT_TOUR.id]: PILOT_TOUR };
export const tourById = (id) => TOURS[id] ?? null;
