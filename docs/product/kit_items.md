# Kit items: food, produce and storage in the furniture menu

Written for: owners (what they get) and developers (how it is made). Added 2026-11-15.

An owner who claims a building and presses **Redesign inside** now finds 67 more items in the furniture editor, from Kenney's **Food Kit** (61) and **City Kit (Industrial)** (6), all CC0. They are sorted by the kind of business, like the rest of the menu (see [interiors_fixtures.md](interiors_fixtures.md)).

| Group (menu heading) | What is in it | Shown first for |
| :--- | :--- | :--- |
| **Food, drink & dishes** | burger, pizza, taco, sushi, donut, cake, sundae, drinks, a dinner plate, bowls, a frying pan, a stew pot, shakers ... (40) | restaurants, and cafes (after tables) |
| **Market produce** | banana, pineapple, coconut, tomato, pumpkin, watermelon, fish, baguette and other bread ... (18) | market stalls; shops list it after seating |
| **Storage & industry** | shipping containers (3), storage tanks (2), solar panels, barrels, cartons and bags (9) | shops and offices list it near the end |

A restaurant's "Essentials" now include a dinner plate, a burger, a soda can and a coffee cup. Everything is still reachable under "Show all furniture", and search finds every item.

## How big things are

Kenney draws its food at no one scale (a burger and a ketchup bottle are both about a unit across), so each item is scaled to its real size in metres (a burger 13 cm, a pizza 32 cm, a container 6.1 m). Items follow the catalogue's own rule for placement: `dimensions` = the model's box x scale, `offset` puts the lowest point on the floor and the middle on the origin. Small items sit on tables and counters, as the other small items do (the editor snaps them to a surface).

## How it is made

- `scripts/models/build-kit-items.mjs --food <Food Kit folder> --industrial <City Kit (Industrial) folder>` copies only the listed models (never a whole kit), each kit's colour map and a 256 px WebP thumbnail made from the kit's own preview into `apps/web/public/`, measures each model and writes `lib/content/kitItems.js`. To add or resize an item, edit its list and run it again.
- `lib/content/catalogCuration.js` adds the items to Pascal's catalogue (`KIT_CATALOG_ITEMS`) and to `KIT_PROPS` (the site serves them), so the editor, the API's list of accepted ids (`scripts/interior-asset-ids.mjs` rewrote `lib/content/interiorAssetIds.js`) and the admission check all see them. A saved interior that uses one validates like any other.
- `lib/content/furnitureGroups.js` has the three groups (a kit item is in the group its entry names), `lib/content/businessFixtures.js` the order for each business.
- Tests: `tests/kit-items.test.mjs` (real sizes, files, groups, menus, no clash with Pascal's ids), `asset-admission`, `furniture-groups`, `business-fixtures`, `interior-api`.

## Prices and Gold

Like all fixtures they start at price 0 (`lib/content/fixturePrices.js`), and nothing about a business's worth changes until prices are set. `node scripts/fixture-price-sheet.mjs` lists the new items too.

## Not done

- (Done 2026-11-16: the kit pages and `License.txt` of the Food, Industrial, Building and Train kits are saved in `docs/licences/kenney/`.)
- Other kits' items (the Building Kit's modular pieces, the Nature Kit's plants and rocks) are the next steps: see [yard_items.md](yard_items.md) and [building_designer.md](building_designer.md) when they exist.
