# Interiors: business type, brand colours and the fixture price list

How a building's inside follows from what kind of business it is. The code is in `lib/content/` (pure, tested in Node), the editor panel in `components/interior/editor/FurniturePanel.jsx`.

## The furniture menu knows the business
The owner says what the business is when claiming (shop, restaurant, office, house) and picks a layout (boutique, market, diner, cafe, open-plan, meeting rooms, cottage ...). When they press **Redesign inside**, the editor's furniture tab opens as **"Furniture for your <kind>"**:
- **Essentials for your <kind>** first: a short list (about 15 to 20 items) of what that business cannot do without.
- Then the furniture groups a business of that kind uses, in the order it would want them (`BUSINESS_KITS` in `lib/content/businessFixtures.js`): a restaurant leads with kitchen gear, tables and seating; a shop with display, counters and lighting; an office with desks, chairs and screens; a home with seating, beds and kitchen.
- A layout adjusts the order: a cafe leads with tables and kitchen, a diner with seating, a market stall with its outdoor items, a meeting-room office with tables and screens (`VARIANT_KITS`).
- **"Show all furniture"** (a checkbox under the heading) adds every other group, so nothing is out of reach. Search always looks through everything.
- With no business kind known, the panel keeps the usual grouped menu (heading "Furniture"). (`/editor` is now the city editor, see [city_editor.md](../architecture/city_editor.md); the furniture editor opens from a building's **Redesign inside**.)

To change what a kind of business gets, edit `BUSINESS_KITS` (the group ids and the `essentials` pattern); `tests/business-fixtures.test.mjs` checks that every business type and layout has a kit, a sensible essentials list, and that "show all" still reaches all 110 items.

## Prices, and what a business is worth
Prices are yours to set; **every price starts at 0**, so nothing about a business's worth changes until you fill them in. The worth of a business is the place (its plot or store value) plus the fixtures in it, scaled by a factor:

    worth = place value + (sum of fixture prices) x worthFactor

Setting prices:
1. `node scripts/fixture-price-sheet.mjs` writes `fixture-prices.csv`: one row per item (id, name, group, the kinds of business it suits, price, group default).
2. Fill in `price` in a spreadsheet (blank = use the group's default). To price a whole group at once, put a number in `group_default` on any row of that group.
3. `node scripts/import-fixture-prices.mjs fixture-prices.csv [--currency $] [--factor 1]` rewrites `lib/content/fixturePrices.js` (add `--dry` to check without writing). A bad value stops it and names the row. Rebuild the app.

Or edit `lib/content/fixturePrices.js` by hand (the format is described at the top of the file): an item's own price beats its group's default, which beats 0.

Once any price is above 0:
- the furniture tiles show their price;
- the editor shows "Fixtures: N items worth $X" under the list, and how much of it counts towards the worth;
- the **My businesses** dashboard shows each building's worth: the place plus its fixtures.

Not wired in yet (waiting on your prices and your decisions): charging Gold or money to place an item, the building card's Value and the 1.25x take-over price using the worth, and the server holding fixtures (a designed interior is saved in the browser; with the game server it would need to be stored there for worth to be authoritative).

## Brand colours inside
A building's inside takes its brand colour (the roof banner's logo colour, else the building's own colour): the room's walls a pale tint of it and the back wall the brand colour itself (`lib/content/brandPalette.js`, applied in `buildInteriorScene`). The text colour for anything painted on that wall is white or black by contrast (`accentText`). The floor keeps its wood texture: a flat colour looked dull.
One thing to remember when painting walls with Pascal materials: a wall material must have `side: 'double'`. With `'front'` the wall vanishes (the editor's Colours panel had this problem and now uses `'double'`).

## The viewer's look
The interior viewer draws with its post-processing effects off (they gave the walls a speckled look and stopped the view rendering on some graphics setups) and with a transparent background, so the room sits on the app's dark colour. A **Rich effects** switch in the viewer (or `?fx=1` on the address) turns the effects back on; if the graphics card then drops the view, they are switched off again by themselves and the choice is remembered. A "Blank or flickering?" button in the corner explains the usual fixes and reloads the 3D view; it opens by itself if the graphics card drops the view.

## Hotspots
The viewer's **Look at** list (whole room, entrance, back wall, left, right, and one for each offer) glides the camera to a place and lights up that part of the storefront panel: `lib/content/interiorHotspots.js`.

## Not done
Brand logo or sign painted on the back wall; brand-specific props; mini-games and hosted WASM demos; the pricing items in the last paragraph of the previous section.
