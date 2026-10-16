// What customising the outside of a building costs, on top of the land. Every price starts at 0, so nothing changes until you set them (the same idea as the
// fixture price list, lib/content/fixturePrices.js). A basic plot costs the land price alone; each choice below adds its price.
//
//   perFloor          each floor above the number a plot of that kind starts with (a taller building costs more)
//   perSkyscraperFloor  extra, for each floor from the tenth up (a skyscraper)
//   model             a price for choosing a particular building shape, by its id (a shape you do not list is free)
//   palette           a price for a colour style, by its id (see PALETTES in lib/game/exterior.js; "brand" is the plain one)
//   crown             a price for each rooftop feature
//   ownWallColor      for picking the walls' colour yourself instead of a style's
export const EXTERIOR_PRICES = {
  currency: '$',
  perFloor: 0,
  perSkyscraperFloor: 0,
  model: {},
  palette: {},
  crown: { beacon: 0, dish: 0, garden: 0, dome: 0, spire: 0 },
  ownWallColor: 0,
};
