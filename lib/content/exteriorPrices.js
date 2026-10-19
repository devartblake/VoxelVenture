// What the outside of a building costs, on top of the land. Each price is a SHARE of the plot's own land price for a year (lib/game/landPrice.js), so the
// outside is part of what the plot is worth and scales with it: a spire on a $5.90 corner shop is $1.48 a year, on a $420 luxury estate $105.
// lib/game/claimPrice.js outsideCost multiplies each share by the plot's land price (to the cent); the claim form, the owner's outside editor and the
// server all use that one function, so what a player sees is what they pay.
//
//   Free (the basic outside):
//     the plot's usual number of floors (or fewer), every colour style, your own wall colour, any building shape, what stands behind the building,
//     and a beacon or a dish on the roof
//   Priced (the elaborate outside), each a share of the land price a year:
//     perFloor            each floor above the usual number for a plot of that kind: 10%
//     perSkyscraperFloor  on top of that, each floor from the tenth up (a skyscraper): another 15%
//     crown               a roof garden 10%, a glass dome 20%, a spire 25%
//
//   model         a share for choosing a particular building shape, by its id (a shape you do not list is free; none is listed)
//   palette       a share for a colour style, by its id (see PALETTES in lib/game/exterior.js; none is listed)
//   ownWallColor  a share for picking the walls' colour yourself instead of a style's (free)
export const EXTERIOR_PRICES = {
  currency: '$',
  perFloor: 0.1,
  perSkyscraperFloor: 0.15,
  model: {},
  palette: {},
  crown: { beacon: 0, dish: 0, garden: 0.1, dome: 0.2, spire: 0.25 },
  ownWallColor: 0,
};
