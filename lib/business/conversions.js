// Moved to packages/analytics (docs/architecture/adr/0001-shared-package-boundaries.md). This adapter keeps every existing import
// working (`@/lib/business/conversions`, the server's `imp('business/conversions.js')`); there is one copy of the rules, the package's.
export * from '../../packages/analytics/src/conversions.js';
