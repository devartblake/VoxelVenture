// The price list for furniture and fixtures. Every price starts at 0, so nothing here changes a business's worth until you set prices.
//
// How to fill it in:
//   1. `node scripts/fixture-price-sheet.mjs`   writes fixture-prices.csv: one row per item, with its group and the kinds of business it suits
//   2. fill in the `price` column in a spreadsheet (a blank means "use the group's default price")
//   3. `node scripts/import-fixture-prices.mjs fixture-prices.csv`   rewrites this file
// or edit it by hand: an item's own price (by its catalogue id) wins over its group's default, which wins over 0.
//
//   currency      the symbol shown next to prices
//   worthFactor   how much of the fixtures' price counts towards the business's worth (1 = all of it, 0.5 = half, 0 = none)
//   defaults      a price for every item in a furniture group: { seating: 40, tables: 90, ... } (group ids are in furnitureGroups.js)
//   items         a price for one item, by catalogue id: { 'office-chair': 120, ... }
export const FIXTURE_PRICES = {
  currency: '$',
  worthFactor: 1,
  defaults: {},
  items: {},
};
