// The values that cross a boundary (browser, Node API, presence server, Python messaging service) and must mean the same thing everywhere.
// tests/contracts.test.mjs checks the server's own lists against these.

// Where a visitor to a business page came from (server/api/business.mjs SOURCES). x: a link in VoxelVenture's own X posts.
export const TRAFFIC_SOURCES = ['direct', 'search', 'social', 'referral', 'city', 'x'];

// What a browser may report about a business page (POST /businesses/<slug>/events; server/api/business.mjs EVENT_KINDS).
export const PROFILE_EVENT_KINDS = ['view', 'engaged', 'store', 'cta'];

// The outcome families the owner's figures report, never added together (packages/analytics OUTCOMES).
export const OUTCOME_FAMILIES = ['leads', 'claims', 'redemptions', 'purchases'];

// Where a reported purchase came from: the business's server (with its key) or the pixel (unverified).
export const PURCHASE_REPORTS = ['server', 'browser'];
