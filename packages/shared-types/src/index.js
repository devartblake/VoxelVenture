// @voxelventure/shared-types: the shapes and values that cross a boundary, as versioned contracts (docs/architecture/adr/0001-shared-package-boundaries.md).
// Depends on nothing.
import { OWNER_FIGURES, PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT } from './contracts/business.js';
import { WEEKLY_VOTE } from './contracts/community.js';

export * from './enums.js';
export { check, validate } from './schema.js';
export { OWNER_FIGURES, PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT, WEEKLY_VOTE };

// Every contract by id, for tools and tests.
export const CONTRACTS = Object.fromEntries([PROFILE_EVENT, PROFILE_EVENT_RESULT, PURCHASE_REPORT, PURCHASE_REPORT_RESULT, OWNER_FIGURES, WEEKLY_VOTE].map((c) => [c.id, c]));
