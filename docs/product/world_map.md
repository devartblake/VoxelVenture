# The world map (M)

A full-world map in a floating, rounded overlay, opened and closed with **M** (Esc also closes it). It **never pauses anything**: traffic, planes, other players and the server's clock keep running behind it, so the clock cannot drift from the server's.

## Using it
| Do | What happens |
| :--- | :--- |
| Drag | Pan |
| Wheel, pinch, + / -, double-click | Zoom (anchored at the pointer) |
| Click the ground | Set a **waypoint**; the route follows the roads and shows its length and walking time |
| Click a building or a mall | A card to **Open** it (its building card, or the mall directory; from anywhere) or put a waypoint on it |
| Go there / Stop | The avatar walks the route (taking any control cancels it) |
| Right-click | Clear the waypoint |
| Shift-click a building | Close the map and open its card |
| C | Centre on you |
| Layer panel | Districts, road names, landmarks, building names, your plots, players, planes, fields and woods (remembered in `localStorage`, key `voxelventure-map`) |

The corner mini-map opens it too, and the City Map & Guide panel has an "Open the world map (M)" button instead of its own map. Hovering a building gives its name, owner and district.

## How it stays fast (the stable-frame-rate rule)
- **Only what is in view is drawn.** Plots come from a uniform grid (`lib/city/spatialGrid.js`, `queryGrid`); everything else is tested against the view rectangle.
- **A cached still layer.** The roads, plots, fields, hills and labels are drawn into an offscreen canvas about 30% wider than the screen on each side (`apps/web/components/ui/worldMap/drawStatic.js`). Panning only moves that image; it is redrawn when the view has moved past its margin, when the zoom has settled, or when a layer or plot changes. While zooming the cached image is scaled.
- **A light moving layer** (you, other players, planes, the route, the waypoint, the scale bar) is drawn on top about 30 times a second (every frame while dragging).
- **Detail by zoom:** footprints from 1.1 px per unit, fields 0.7, trees 2.2, road names 2.2, building names 6, billboards 3, centre lines 4; district names only when zoomed out. Labels avoid each other.
- Device pixel ratio is capped at 1.5. The numbers are in `window.__vvMap` (`staticMs`, `plotsInView`, `plotsTotal`, `redraws`, `frameMs`); in the default city the whole map redraws in about 4 ms and a close-up draws well under a third of the plots.
- The 3D scene is **not** streamed by area; it is already instanced (about 400 to 600 draw calls). Real 3D streaming is the larger task in [study_world_streaming.md](../world/study_world_streaming.md).

## Routes
`lib/city/routing.js`: a graph of the road junctions (`layout.intersections` along `layout.roads`, plus the diagonals), A* from the road point nearest you to the one nearest the waypoint, then straight legs off the road at each end. Walking speed is 3 units a second (`WALK_SPEED`). Across the 15 test cities the routes average 1.49 times the straight line (`tests/routing.test.mjs`). `apps/web/components/city/RouteFollower.jsx` draws the beam, ring and dashed line in the 3D city and drives the avatar when "Go there" is used.

## Files
`apps/web/components/ui/WorldMap.jsx` (the overlay, input, moving layer), `apps/web/components/ui/worldMap/mapData.js` (grid, labels, landmarks), `apps/web/components/ui/worldMap/drawStatic.js` (the still layer), `lib/state/mapStore.js` (open, view, layers, waypoint, route), `lib/city/routing.js`, `lib/city/spatialGrid.js`, `apps/web/components/city/RouteFollower.jsx`.

## Tests
`tests/routing.test.mjs` (routes and grid against brute force) and the browser test (M opens it, the whole city draws, zooming in culls to a fraction of the plots, a click sets a waypoint with a route, M closes it). `window.__vvMapStore` exists with `?diag=1`.

## Not done
The corner mini-map shows the waypoint and route, and a click on it opens the world map, but a waypoint cannot be set on the mini-map itself; no pathing for vehicles; the 3D scene is not streamed (see above).
