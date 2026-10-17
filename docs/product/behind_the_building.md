# Behind the building

Written for: owners (and you, checking how it plays). In the plot card's *Customize the outside* section (and the same builder when claiming a plot), below *Shape* and *Colours*, the new **Behind the building** row lets an owner put one of these behind their building: **Car park**, **Garden**, **Patio**, **Storage** or **Pool** (or nothing).

- It is part of the building's exterior settings (`exterior.back`, validated in `lib/game/exterior.js`), saved with the plot, and free for now (no price).
- The items are fitted to the free ground behind the lot (`backRoom` in `lib/content/backyards.js`): up to 1.6 units, less a small margin. On the new streets (1.5 between rows) there is room; on the old grid, where two rows back onto each other with 0.6 between, only a shallow strip fits, and if another building is right against the lot the row says so.
- Items are flat or low, not solid (nothing to collide with), and drawn with the rooftop features (`components/city/Crowns.jsx`), so they add no draw calls.
- Tests: `tests/backyards.test.mjs` (also checks that no item stands inside another lot in the default city).
