// The values that cross a boundary (browser, Node API, presence server, Python messaging service) and must mean the same thing everywhere.
// tests/contracts.test.mjs checks the server's own lists against these.

// Where a visitor to a business page came from (services/api/business.mjs SOURCES). x: a link in VoxelVenture's own X posts.
export const TRAFFIC_SOURCES = ['direct', 'search', 'social', 'referral', 'city', 'x'];

// What a browser may report about a business page (POST /businesses/<slug>/events; services/api/business.mjs EVENT_KINDS).
export const PROFILE_EVENT_KINDS = ['view', 'engaged', 'store', 'cta'];

// The screen a business event happened on (services/api/business.mjs SURFACES): the site's pages, then the 3D city's.
export const EVENT_SURFACES = ['discover', 'category', 'district', 'profile', 'card', 'directory', 'search', 'map', 'storefront'];

// The owner's funnel in the roadmap's event names (business.mjs funnelOf). qualified_action counts confirmed results only.
export const FUNNEL_EVENTS = ['business_impression', 'profile_open', 'business_cta_click', 'qualified_action'];

// The outcome families the owner's figures report, never added together (packages/analytics OUTCOMES).
export const OUTCOME_FAMILIES = ['leads', 'claims', 'redemptions', 'purchases'];

// Where a reported purchase came from: the business's server (with its key) or the pixel (unverified).
export const PURCHASE_REPORTS = ['server', 'browser'];

// How long a plot can be leased, in days: 7, 14 and 30 (lib/game/leases.js TERMS; a request's `leaseDays`).
export const LEASE_TERMS = [7, 14, 30];
