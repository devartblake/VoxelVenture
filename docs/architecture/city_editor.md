# City editor (`/editor`, development only)

Written for: you, laying out roads, streets and plots by hand instead of relying on the generator.

The editor starts from `generateCity(seed)` and keeps your changes as a list of operations (`road+`, `road-`, `road~`, `plot+/-/~`, `park+/-/~`) replayed on top of it (`applyEdits` in `lib/city/cityEdit.js`). Roads get junctions and pavement gaps exactly as the generator makes them, and lots use the generator's own rules (3 wide, 3.4 pitch, 2.9 row offset).

## Tools
| Key | Tool | Use |
| :-: | :-- | :-- |
| S | Select | Click a road, lot or park; drag to move (roads move sideways, ends resize); edit in the properties panel |
| R | Road | Click start and end; snaps to road centre lines. Option to fill the frontage with lots (keeps a margin clear of junctions) |
| L | Plot | Click to place a lot (turns to face the nearest road) |
| F | Fill | Click a road to lay lots along it |
| P | Park | Drag a rectangle |
| E | Erase | Click to remove |

Undo/redo group an action (a road with its lots is one step). The **Issues** list shows errors (short road, loose end, overlapping roads) and warnings (lot on a road or park, overlapping lots, close junctions).

## Saving
- **Save** stores the edits in localStorage (`voxelventure-city-edits`: one set of edits, with the seed it belongs to; the game ignores it for another seed).
- **Open in the game** clears the game save and loads the city with your edits (`generateWorld` in `lib/city/editedWorld.js`; development only).
- **Export / Import** a JSON document; **Revert all** goes back to the generator's city.

Tests: `tests/city-edit.test.mjs`.

## Re-fitting lots after road changes
**Re-fit lots** (header button) finds lots that stand on a road or a park, on each other, or face no road, and moves each to the nearest free place beside a road within 30 units (same size and tier, turned to face the road, not across a junction). It is one undo step. Lots that find no room stay where they are and are listed in the status line: move or remove them. Engine: `refitLots` in `lib/city/cityEdit.js`, tests `tests/refit.test.mjs`. Moving a road with the Road properties does not clear its lots unless asked; run Re-fit afterwards.
