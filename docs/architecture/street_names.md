# Street names from OpenStreetMap

Written for: you, filling the game's streets with real names. The script is the offline job from [hosting_stack_payments.md](../operations/hosting_stack_payments.md): run it on your machine, the game never calls the OpenStreetMap server.

```
python scripts/streets/road_generator.py "San Francisco" "Amsterdam" --limit 60
python scripts/streets/road_generator.py --districts
```

- Needs Python 3 and `requests`. Writes `data/street-names/<city>.json` (`city`, `attribution`, `names`).
- Keeps residential, tertiary, secondary, primary, unclassified, living and pedestrian streets; drops names with route numbers, under 3 or over 22 characters.
- `DISTRICT_SOURCES` in the script maps game districts to cities (Silicon Strip - San Francisco, Bazaar Market - Marrakech, Creative Quarter - Berlin, Arcade Alley - Tokyo).
- The public Overpass server sometimes answers 502/504; the script retries three times. Do not bulk-run it.
- **Licence:** names are (c) OpenStreetMap contributors, ODbL. Each file carries the attribution (and `lib/content/streetNames.js` has it as `STREET_NAME_ATTRIBUTION`). OpenStreetMap is credited in the in-game Credits panel and in the root `CREDITS.md` (both from `lib/content/credits.js`); the credit matters only when the names are turned on with `NEXT_PUBLIC_STREET_NAMES`.
- Sample run: `data/street-names/amsterdam.json` (40 names).

## Using the names
1. `node scripts/streets/build-names.mjs` packs `data/street-names/*.json` into `lib/content/streetNames.js` (run it after each fetch; Amsterdam is packed now).
2. **Generator:** `generateCity(seed, { streetNames: 'amsterdam' })` (or a list of names), or build the game with `NEXT_PUBLIC_STREET_NAMES=amsterdam`. Off by default, so the default city keeps its built-in names. The names come from a stream of their own: nothing else in the city moves (`tests/street-names.test.mjs`). Only the main grid streets take them for now.
3. **Editor:** the road Name field offers every packed name as you type, and *Suggest a real street name* picks one no road uses yet.

## District street names

Each district has a list of real street names from one place with the same character. The lists are in `data/street-names/districts.json`, packed into `lib/content/streetNames.js` as `DISTRICT_STREET_NAMES` by `node scripts/streets/build-names.mjs`. They were reviewed on 2026-10-17.

| District | Theme | Names from |
| --- | --- | --- |
| SaaS Silicon Strip | Tech & financial district | San Francisco |
| Creator Commons | Arts & creative quarter | Brooklyn |
| The Bazaar | Market district | City of London |
| Arcade Alley | Entertainment district | Las Vegas |
| Old Town | Historic old town | Charleston |
| Riverside | Waterfront & harbour | Annapolis |
| Lakeside | Lakeside | Madison |
| Meadow Quarter | Garden suburb | Harrogate |
| Outskirts | Industrial & warehouse district | Pittsburgh |
| Countryside | Countryside & villages | Cotswold |

Each list has 20 names, picked at random (seeded) from the place's streets.

**Filters:** the picker drops:

- names with digits, and names ending in Avenue (that word belongs to the city's avenues);
- highways, ramps and abbreviations;
- names over 18 characters, and names already used in the city.

A name must end in a street word (Street, Lane, Close, Grove…). For the market district and the villages, a single old name such as Cornhill or Leysbourne also counts.

**What uses the lists:**

- **The generator:** the infill streets take the Meadow Quarter's names, because every lot on them is in the Meadow Quarter (for example Rutland Drive and Chestnut Grove in the default city, which used to be Meadow Lane and Clover Way). The names come from a stream of their own, so nothing else in the city moves. When a list runs out (a very big map), the rest keep their built-in names. They are on by default. `generateCity(seed, { districtStreetNames: false })` or `NEXT_PUBLIC_DISTRICT_STREET_NAMES=0` turns them off.
- **Unchanged on purpose:** the eight avenue names, the seven cross streets (they run through several districts) and the game's pun names (Pixel Ln, Byte St, Render Rd).
- **The editor:** the button reads *Suggest a <theme> street name*. It picks a free name from the list of the district the selected road runs through (the nearest lot's district), and any list after that. This is how the urban districts' lists are used: those districts have no local streets of their own yet.
- **Tests:** `tests/street-names.test.mjs` checks that the lists match their source file and carry the OpenStreetMap credit. It also checks, on three seeds:
  - the infill streets take Meadow Quarter names, with no two the same;
  - every other road keeps its name;
  - nothing else in the city moves;
  - the switch turns the names off.

To change a list, edit `data/street-names/districts.json` (or run the picker again with other places), then run `node scripts/streets/build-names.mjs`.
