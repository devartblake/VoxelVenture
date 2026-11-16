# World

[All documentation](../README.md) | [Path map](../architecture/documentation_path_map.md)

The 3D city's systems: how the roads, lots and land are laid out, the street names, the day and night with its sound, the models, the city editor, and the study of how big the world can grow. New world features are frozen until the pilot meets its criteria ([world_freeze.md](../roadmap/world_freeze.md)); these documents describe what is built.

These moved here from `architecture/` on 2026-10-18, which now holds the system architecture alone.

| Document | Read it for |
| :--- | :--- |
| [road_design_reference.md](road_design_reference.md) | Road-network research (New York, San Francisco, Washington DC) behind the diagonal avenue and the circles |
| [infill_and_land.md](infill_and_land.md) | Free land, new streets, the amusement park, how many lots and what it costs |
| [street_names.md](street_names.md) | The offline OpenStreetMap street-name script, the city name sets, and each district's own list |
| [day_night_sound.md](day_night_sound.md) | The shared day and night, street and window lights, the sound of the places round you, and the music director |
| [kenney_assets.md](kenney_assets.md) | The Kenney (CC0) boats, pier decks and amusement-park pieces: what is used and what is still built in code |
| [city_editor.md](city_editor.md) | The `/editor` page: roads, streets, lots and parks; validate, save and open in the game |
| [study_world_streaming.md](study_world_streaming.md) | Feasibility study: how big the map can get, streaming several cities, an island with an ocean and a shipping yard |
| [world_recipe.md](world_recipe.md) | The world recipe: the landmasses (a Jamaica mainland, Harbor Isle as Grand Cayman, the Lesser Caymans), the real mountains, the coastal roads, spurs and causeways, global plot ids |
| [world_bake.md](world_bake.md) | The baked world (`npm run bake:world`), how to grow it safely, the vacant Harbor Town and `WORLD_OPEN` |
| [streaming_runtime.md](streaming_runtime.md) | The chunk manager, merged chunk geometry and the React layer (`/world/stream`, `?world=baked`) |
| [racing_track.md](racing_track.md) | The racing track: Voxel Speedway, a closed circuit on the mainland from the shape of the real Dover Raceway (OpenStreetMap) and the Kenney Racing Kit, how it is placed, built and drawn |
| [player_flight.md](player_flight.md) | A plane the player flies, and flights to Harbor Isle (roadmap task 18) |

The world features players see (boats and piers, the world map, what can go behind a building, interiors) are in [product/](../product/README.md).
- [train.md](train.md): the rideable train between the mainland and Harbor Isle (the first causeway).
