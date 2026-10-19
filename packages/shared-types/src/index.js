// @voxelventure/shared-types: the shapes and values that cross a boundary, as versioned contracts (docs/architecture/adr/0001-shared-package-boundaries.md).
// Depends on nothing.
import { COUPON_CLAIM, COUPON_CLAIM_RESULT, COUPON_REDEEM, COUPON_REDEEM_RESULT, INQUIRY, INQUIRY_RESULT, OWNER_FIGURES, PURCHASE_PIXEL, PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT } from './contracts/business.js';
import { PILOT_FEEDBACK, PILOT_SUMMARY } from './contracts/pilot.js';
import { WEEKLY_VOTE } from './contracts/community.js';
import { INTERIOR_DESIGN, INTERIOR_SAVE, INTERIOR_STATE } from './contracts/interior.js';
import { PLOT_EXTERIOR_QUOTE, PLOT_EXTERIOR_UPGRADE, PLOT_EXTERIOR_UPGRADE_RESULT } from './contracts/plots.js';
import { PRESENCE_CLIENT, PRESENCE_PROTOCOL } from './contracts/multiplayer-client-v2.js';
import { PRESENCE_SERVER } from './contracts/multiplayer-server-v2.js';
import { TEST_SCENARIO } from './contracts/test-scenario.js';

export * from './enums.js';
export { check, validate } from './schema.js';
export { COUPON_CLAIM, COUPON_CLAIM_RESULT, COUPON_REDEEM, COUPON_REDEEM_RESULT, INQUIRY, INQUIRY_RESULT, OWNER_FIGURES, PURCHASE_PIXEL, PILOT_FEEDBACK, PILOT_SUMMARY, PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT, WEEKLY_VOTE };
export { INTERIOR_DESIGN, INTERIOR_SAVE, INTERIOR_STATE };
export { PLOT_EXTERIOR_QUOTE, PLOT_EXTERIOR_UPGRADE, PLOT_EXTERIOR_UPGRADE_RESULT };
export { PRESENCE_CLIENT, PRESENCE_PROTOCOL, PRESENCE_SERVER, TEST_SCENARIO };

// The contracts of the HTTP API and the pages (one per request or answer).
export const API_CONTRACTS = [PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT, OWNER_FIGURES, INQUIRY, INQUIRY_RESULT, COUPON_CLAIM, COUPON_CLAIM_RESULT, COUPON_REDEEM, COUPON_REDEEM_RESULT, PURCHASE_PIXEL, WEEKLY_VOTE, PILOT_FEEDBACK, PILOT_SUMMARY, INTERIOR_DESIGN, INTERIOR_SAVE, INTERIOR_STATE, PLOT_EXTERIOR_QUOTE, PLOT_EXTERIOR_UPGRADE, PLOT_EXTERIOR_UPGRADE_RESULT];

// Every contract by id, for tools and tests: the API's, the presence protocol's (presence.client.<type>, presence.server.<type>) and the
// journeys' scenario (test.scenario, Track A).
export const CONTRACTS = Object.fromEntries([...API_CONTRACTS, ...Object.values(PRESENCE_CLIENT), ...Object.values(PRESENCE_SERVER), TEST_SCENARIO].map((c) => [c.id, c]));

// The contract of a presence message, by who sent it ('client' or 'server') and its `type`; null when the type is not in the protocol.
export const presenceContract = (from, msg) => (from === 'client' ? PRESENCE_CLIENT : PRESENCE_SERVER)[msg?.type] ?? null;
