// @voxelventure/shared-types: the shapes and values that cross a boundary, as versioned contracts (docs/architecture/adr/0001-shared-package-boundaries.md).
// Depends on nothing.
import { INQUIRY, INQUIRY_RESULT, OWNER_FIGURES, PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT } from './contracts/business.js';
import { PILOT_FEEDBACK, PILOT_SUMMARY } from './contracts/pilot.js';
import { WEEKLY_VOTE } from './contracts/community.js';

export * from './enums.js';
export { check, validate } from './schema.js';
export { INQUIRY, INQUIRY_RESULT, OWNER_FIGURES, PILOT_FEEDBACK, PILOT_SUMMARY, PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT, WEEKLY_VOTE };

// Every contract by id, for tools and tests.
export const CONTRACTS = Object.fromEntries([PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT, OWNER_FIGURES, INQUIRY, INQUIRY_RESULT, WEEKLY_VOTE, PILOT_FEEDBACK, PILOT_SUMMARY].map((c) => [c.id, c]));
