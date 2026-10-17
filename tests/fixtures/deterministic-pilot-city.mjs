// The pilot journeys' scenarios (Track A of docs/architecture/external_voxel_repositories_adoption_plan.md): fixed data in the shape of the
// `test.scenario` contract (packages/shared-types/src/contracts/test-scenario.js), run by tests/agents/scenario.mjs. The same seed gives the
// same city (the API's API_SEED), the same names and the same visitors, so two runs of a journey are the same journey.
// No credentials and no real customer data: accounts are names, the agents derive test passwords from the seed, links use example.com.

export const PILOT_SEED = 20260101; // the default city

export const SCENARIOS = {
  visitorDiscovery: {
    id: 'visitor-discovery-to-storefront',
    schemaVersion: 1,
    title: 'A visitor finds a business on Discover, becomes a qualified visit, presses its button and walks into its 3D storefront',
    seed: PILOT_SEED,
    device: { profile: 'desktop', width: 1300, height: 950 },
    participants: [{ role: 'merchant', ref: 'baker' }, { role: 'visitor', ref: 'shopper' }],
    accounts: [{ ref: 'baker', username: 'JourneyBaker' }],
    businesses: [
      {
        ref: 'bakery',
        owner: 'baker',
        name: 'Journey Bakery',
        category: 'food',
        district: 'bazaar',
        description: 'Sourdough, rye and cinnamon buns, baked every morning for the pilot journeys.',
        website: 'https://bakery.example.com',
        cta: { kind: 'order', url: 'https://bakery.example.com/order' },
        building: true,
      },
    ],
    milestones: [
      { id: 'discover-lists-business', title: 'Discover lists the business (an impression is counted)' },
      { id: 'category-filter', title: 'Filtering by its category still lists it' },
      { id: 'profile-visit', title: 'Opening its profile counts a verified visit' },
      { id: 'qualified-visit', title: 'Staying on the profile makes it a qualified visit' },
      { id: 'cta-press', title: 'Pressing the call to action counts one press, and its link carries a click id' },
      { id: 'deep-link-to-city', title: 'Step inside the 3D storefront opens the city' },
      { id: 'plot-focused', title: 'The city focuses the business\'s own building' },
      { id: 'storefront-entered', title: 'Stepping inside counts a store entry for the profile' },
      { id: 'attribution-once', title: 'Nothing was counted twice' },
    ],
    timeoutMs: 600000,
    allowedExternalLinks: ['bakery.example.com'],
    budgets: { consoleErrors: 0, milestoneMs: 90000, firstRenderMs: 90000 },
  },

  merchantOnboarding: {
    id: 'merchant-onboarding',
    schemaVersion: 1,
    title: 'A merchant lists a business, links a building, sets an offer and a coupon, sees the figures and answers the pilot check-in',
    seed: PILOT_SEED,
    device: { profile: 'desktop', width: 1300, height: 1100 },
    participants: [{ role: 'merchant', ref: 'florist' }, { role: 'admin', ref: 'operator' }],
    accounts: [{ ref: 'florist', username: 'JourneyFlorist' }],
    businesses: [
      {
        ref: 'flowers',
        owner: 'florist',
        name: 'Journey Flowers',
        category: 'retail',
        district: 'creator',
        description: 'Seasonal bouquets and plants, delivered across the city for the pilot journeys.',
        website: 'https://flowers.example.com',
        cta: { kind: 'website', url: 'https://flowers.example.com' },
        building: true,
        coupon: { text: '10% off a bouquet', code: 'BLOOM-10', total: 20 },
      },
    ],
    milestones: [
      { id: 'sign-up', title: 'The merchant creates an account' },
      { id: 'create-profile', title: 'A free business profile is created and public' },
      { id: 'claim-building', title: 'A lot is claimed for it in the city' },
      { id: 'link-building', title: 'The building is linked to the profile' },
      { id: 'set-cta', title: 'The call to action is changed and published' },
      { id: 'set-offer-and-coupon', title: 'A coupon is set in the storefront; an offer on the free plan asks for Pro' },
      { id: 'dashboard-figures', title: 'The dashboard shows the profile, its set-up steps and its figures' },
      { id: 'join-pilot', title: 'The operator adds the business to the pilot' },
      { id: 'pilot-check-in', title: 'The merchant sends the weekly check-in from the dashboard' },
      { id: 'check-in-recorded', title: 'The pilot dashboard has the check-in' },
    ],
    timeoutMs: 600000,
    allowedExternalLinks: ['flowers.example.com'],
    budgets: { consoleErrors: 0, milestoneMs: 90000, firstRenderMs: 90000 },
  },

  reconnectRecovery: {
    id: 'reconnect-and-recovery',
    schemaVersion: 1,
    title: 'Two signed-in players meet, talk, lose their connection and come back; and the presence server holds against malformed, stale and abusive clients',
    seed: PILOT_SEED,
    device: { profile: 'none' },
    participants: [{ role: 'presence', ref: 'ada' }, { role: 'presence', ref: 'ben' }],
    accounts: [{ ref: 'ada', username: 'JourneyAda' }, { ref: 'ben', username: 'JourneyBen' }],
    milestones: [
      { id: 'both-connect', title: 'Both players connect to the same city and are welcomed' },
      { id: 'signed-in', title: 'Both sign in with one-use tickets and are verified' },
      { id: 'see-each-other', title: 'Each sees the other come into view, once' },
      { id: 'chat-heard-once', title: 'A nearby line is heard once, and its retry is answered, not said again' },
      { id: 'out-of-view', title: 'Walking out of view is seen as leaving, and back as coming in' },
      { id: 'forced-disconnect', title: 'A dropped connection is seen to leave' },
      { id: 'reconnect', title: 'Reconnecting signs in again and is seen once, not twice' },
      { id: 'retry-after-reconnect', title: 'A line retried after a reconnect is answered, not said twice' },
      { id: 'stale-protocol', title: 'A game speaking another protocol is told so and closed' },
      { id: 'spent-ticket', title: 'A ticket already used cannot sign in again' },
      { id: 'malformed-input', title: 'Malformed and out-of-range messages change nothing they should not' },
      { id: 'rate-limited', title: 'A flood of messages is cut, and the server stays up for everyone' },
      { id: 'slow-receiver', title: 'A client that stops reading is skipped, not waited for, and recovers' },
      { id: 'no-outcomes-from-presence', title: 'Presence messages cannot create visits, presses or purchases' },
      { id: 'every-message-in-contract', title: 'Every message the server sent fits the protocol\'s contracts' },
    ],
    timeoutMs: 300000,
    budgets: { milestoneMs: 30000 },
  },

  attributionDedup: {
    id: 'attribution-deduplication',
    schemaVersion: 1,
    title: 'One visitor\'s press and purchase are counted once, however many times the page, the pixel and the business\'s server report them',
    seed: PILOT_SEED,
    device: { profile: 'none' },
    participants: [{ role: 'merchant', ref: 'cyclist' }, { role: 'visitor', ref: 'buyer' }],
    accounts: [{ ref: 'cyclist', username: 'JourneyCycles' }],
    businesses: [
      {
        ref: 'cycles',
        owner: 'cyclist',
        name: 'Journey Cycles',
        category: 'retail',
        website: 'https://cycles.example.com',
        cta: { kind: 'order', url: 'https://cycles.example.com/shop' },
      },
    ],
    milestones: [
      { id: 'view-once', title: 'The same visitor viewing twice in an hour is one view' },
      { id: 'press-once', title: 'Pressing twice within a minute is one press, with one click id' },
      { id: 'pixel-reported', title: 'The thank-you page\'s pixel reports the purchase (unverified)' },
      { id: 'postback-reconciles', title: 'The business\'s server reports the same order: it replaces the pixel\'s, now verified' },
      { id: 'postback-repeat', title: 'The same order reported again is a duplicate' },
      { id: 'pixel-after-postback', title: 'The pixel firing again after the postback changes nothing' },
      { id: 'figures-once', title: 'The owner\'s figures count one press, one purchase and its revenue once' },
    ],
    timeoutMs: 120000,
    allowedExternalLinks: ['cycles.example.com'],
    budgets: { milestoneMs: 20000 },
  },
};

// A visitor id from the seed: the same run makes the same visitors (the API wants 4 to 40 of A-Z a-z 0-9 _ -).
export const visitorId = (seed, who) => `v${seed.toString(36)}-${who}`.slice(0, 40);
// A test password from the seed: never a real one, never stored in the scenario.
export const testPassword = (seed, who) => `journey-${seed}-${who}-pw`;
