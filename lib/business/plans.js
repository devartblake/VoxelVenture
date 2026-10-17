// Moved to packages/business-core (docs/architecture/adr/0001-shared-package-boundaries.md). This adapter keeps every existing import
// working (`@/lib/business/plans`, the server's `imp('business/plans.js')`); there is one copy of the rules, the package's.
export * from '../../packages/business-core/src/plans.js';
