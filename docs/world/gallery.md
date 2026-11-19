# The world gallery

Written for: the owner and developers. The screenshots and diagrams kept while the world was built, 181 pictures on 26 pages, one page for each feature (the pictures are WebP, 1400 pixels wide at most). This index is generated: `node scripts/world/gallery-index.mjs`.

These are working pictures, taken on the development page (`/world/stream`) and in the game with `?world=baked` while each feature was built: many show an earlier stage, and the caption says so where it is known. For what each feature is now, follow the link under its heading on its page.

**Adding pictures:** put the WebP files in `docs/world/gallery/`, then add them to a page there (a new page for a new feature: `# Title`, a line `<!-- order: N -->`, a short description, then each picture with its caption) and run the index script. Other pages are not touched, so two pull requests do not conflict; if the index itself conflicts, run the script again.

| Page | Pictures | What it shows |
| :--- | ---: | :--- |
| [The shape of the world](gallery/the-shape-of-the-world.md) | 11 | The first sketches of the land: the Jamaica-like mainland, Harbor Isle and the smaller islands, and the game's own world-map page ([world_recipe.md](world_recipe.md)). |
| [Roads](gallery/roads.md) | 7 | The coastal rings, the spurs that bend round mountains and the link roads ([world_recipe.md](world_recipe.md)). |
| [The streamed world](gallery/the-streamed-world.md) | 11 | The baked world drawn by the streaming runtime on the development page `/world/stream`, and in the game with `?world=baked` ([streaming_runtime.md](streaming_runtime.md)). |
| [The ground texture](gallery/the-ground-texture.md) | 4 | ambientCG grass and dirt laid over the vertex colours of the baked ground as detail ([streaming_runtime.md](streaming_runtime.md), "Ground texture"). |
| [The voxel speedway](gallery/the-voxel-speedway.md) | 18 | The racing circuit on the mainland, built from the shape of the real Dover Raceway ([racing_track.md](racing_track.md)). |
| [Bridges](gallery/bridges.md) | 22 | The City Kit bridge, then the two styled bridges ([suspension_bridge.md](suspension_bridge.md), [arch_bridge.md](arch_bridge.md)). |
| [The train](gallery/the-train.md) | 4 | The rideable train on the first causeway ([train.md](train.md)). |
| [The undersea tunnel](gallery/the-undersea-tunnel.md) | 15 | The evaluation and the spike ([tunnel_evaluation.md](tunnel_evaluation.md)). |
| [The sea: depth shading](gallery/the-sea-depth-shading.md) | 9 | The sea coloured by its distance from the coast, with a foam line at the shore ([water.md](water.md)). |
| [The world datum](gallery/the-world-datum.md) | 8 | The named heights, the overlay and the town border ([datum.md](datum.md)). |
| [Owner tools: kit items, yards and the building designer](gallery/owner-tools-kit-items-yards-and-the-building-designer.md) | 20 | The furniture items from the Food and Industrial kits, the yards behind the buildings and the buildings assembled from kit pieces ([kit_items.md](../product/kit_items.md), [yard_items.md](../product/yard_items.md), [building_designer.md](.. |
| [The seabed and water column](gallery/the-seabed-and-water-column.md) | 3 | The sea with a floor to see through it, and a water column that goes from clear turquoise to deep blue ([water.md](water.md)). |
| [The mainland's river plan](gallery/the-mainlands-river-plan.md) | 1 | The planned rivers, ports and bridges on the mainland ([river_plan.md](river_plan.md)). |
| [The roads' asphalt and lines](gallery/the-roads-asphalt-and-lines.md) | 2 | The baked roads with ambientCG's asphalt grain, a dashed centre line and edge lines ([road_texture.md](road_texture.md)). |
| [The Rio Minho in the baked world](gallery/the-rio-minho-in-the-baked-world.md) | 2 | The first river cut into the baked ground as a second coast ([river_plan.md](river_plan.md)). |
| [The North Causeway's arch bridge: lights at night](gallery/the-north-causeways-arch-bridge-lights-at-night.md) | 4 | The arch bridge with its lamps and lights in line with the structure: a street lamp, a hanger and an upright at the same joints, and a light on the top chord at every joint ([arch_bridge.md](arch_bridge.md)). |
| [The town join, after the underlay](gallery/the-town-join-after-the-underlay.md) | 4 | The datum's step 5 ([datum.md](datum.md)): the ground under a joined chunk is lowered under the town's slab only, easing out over 24 units. |
| [The asphalt candidates](gallery/the-asphalt-candidates.md) | 3 | The three ambientCG asphalt colour maps tried for the roads ([road_texture.md](road_texture.md)): Asphalt031 was chosen (the most visible grain); Asphalt004 is very plain and Asphalt012 is dark. |
| [The town's river and the natural river edge](gallery/the-towns-river-and-the-natural-river-edge.md) | 2 | The town's river sunk into a trench at the sea's level and joined to the baked river, and the smoother waterline ([river_plan.md](river_plan.md)). |
| [The ring bridge over the Rio Minho](gallery/the-ring-bridge-over-the-rio-minho.md) | 2 | Where the coastal ring crosses the river: a deck that rises over the channel, with parapets, a girder and a pier in the water ([river_plan.md](river_plan.md)). |
| [The rivers' water and the Black River's morass](gallery/the-rivers-water-and-the-black-rivers-morass.md) | 3 | Each river has its own water ribbon; the delta rivers have islands, and the Black River's have mangroves ([river_plan.md](river_plan.md)). |
| [The ports and harbours](gallery/the-ports-and-harbours.md) | 3 | A shipping port on each large landmass, a boat harbour and a cruise port ([river_plan.md](river_plan.md)). |
| [Harbor Isle's water and Harbor Town](gallery/harbor-isle-water-and-harbor-town.md) | 6 | The lagoon, the canals and the mangroves of Harbor Isle ([isle_waters.md](isle_waters.md)), and Harbor Town's creek, bridges, ponds and its own streets ([harbor_town.md](harbor_town.md)). |
| [The ports with the Kenney models](gallery/the-ports-with-the-kenney-models.md) | 3 | The container yards' front rows, the tugs, the boats at their moorings, the buoys and the palms are Kenney models; a phone draws the boxes alone ([ports_models.md](ports_models.md)). |
| [The Harbor Tunnel, stage 1](gallery/the-harbor-tunnel-stage-1.md) | 2 | The train through the tube under the sea, and the station outside its portal ([tunnel.md](tunnel.md)). |
| [The mini-golf course](gallery/the-mini-golf-course.md) | 12 | Harbor Mini-Golf: nine holes on Harbor Isle's flat land, with felt lanes, wooden walls, red tee mats and cups with flags ([minigolf.md](minigolf.md)). |
