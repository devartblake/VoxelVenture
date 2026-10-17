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
