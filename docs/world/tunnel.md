# The Harbor Tunnel: a train you ride (stage 1) and a road you walk and drive (stage 2)

Written for: the owner and developers. Made 2026-11-17. [Stage 1](tunnel_evaluation.md) is a rail tunnel you ride through; **stage 2** (below, 2026-11-17) lets people walk and cars drive in it.

![Inside the tube: the rail, the lit roof strips and the train ahead, at the bottom of the tunnel under the sea.](gallery/tunnel_inside.webp)

## What is in the game

- **The tunnel is part of the world.** The recipe's `tunnels` (`harbor-tunnel`, beside Harbor Causeway) is built by `buildTunnels` (`lib/world/tunnel.js`) and baked into the manifest (`tunnels`: the route along the causeway's line, the portals, the links to the ring roads). The development spike's route code became the world's; the spike (`/world/stream?tunnel=1`) now only adds the approach roads and a light.
- **A second train line, on the rail side of the tube** (`tunnelTrainLine`): a station on the ground 40 units outside each portal (**Mainland Tunnel Station**, **Isle Tunnel Station**), the rail going down the 0.08 ramp, level at -5.5 under the sea, and up again. The same timetable code as the causeway train (a 131-second ride, 16 seconds in each station), the same cars. `lib/world/train.js` now takes a line with its own `lateral` and a `tunnel` ({ s0, s1 }): the rail lies on the tube's road between the portals and on the ground outside them, with the same lift, so there is no step at the portal.
- **Several lines.** `fleetRefs.trainLines` lists every line (`trainLine` is still the first causeway's); a rider's vehicle names its `lineId`; boarding, getting off, the rider's HUD ("Next stop: Isle Tunnel Station") and the platform prompts work per line (`fleetStore.js`, `Vehicles.jsx`, `Avatar.jsx`, `Train.jsx`).
- **The tube** (`apps/web/components/world/Tunnel.jsx`, mounted with the baked world and on the dev page; `?tunnel=0` leaves out the tube and its line): road, walls, a roof with two lamp strips and a slab under it, all double-sided so the sea never shows from inside, in 4-unit pieces (about 3 draw calls).
- **The portals are cut into the ground** (the bake): where the tube stands out of the ground (the first ~60 units of each ramp) the baked ground is cut down to the road inside it, 2.4 units beyond the tube's walls (`trenchAt` in `lib/world/tunnelSpec.js`): three chunks differ (`8_2`, `9_2`, `13_2`). The sea's plane is an infinite sheet at -0.3, so it would have shown as water inside the portal: its shader leaves out a patch over each trench (`portalHoles`, `uHole` in `lib/world/seaDepth.js`; `?seashade=0` turns the shading, and with it the holes, off).
- **The camera.** The follow camera ignored height (it looked at the ground at 0), which a rider on the causeway's deck or in the tube needs: for a rider of the train it now follows the rail's height, and **inside the tube it is pulled in** (2.4 behind, at most 1.2 over the head: `TUBE_CAMERA` in `FollowCamera.jsx`) so it stays under the roof and between the walls.
- **Presence.** A rider is checked as a car (6 units a second, under the car's 7); every position of the ride is accepted (tested). The tube lies inside the world's rectangle.

![The station outside the mainland portal: the train at the platform and the rail running into the tube.](gallery/tunnel_station_portal.webp)

## Tests

`tests/tunnel.test.mjs` (the route and profile, the manifest's tunnel, the trench, the holes in the sea, a bad recipe), `tests/tunnel-train.test.mjs` (the line, the rail's heights and grade, the timetable, presence, boarding and riding by line, the rider at the bottom of the tube). The tests that said "the ground is flat" or "nothing is lower than the seabed" (`harbor-datum`, `world-chunk-mesh`) leave the three cut chunks out, on purpose; `world-bake`'s "only the highways differ" leaves out the cut ground.

## Stage 2: walking and driving in the tube

The tube now has **two sides**: the rail (1.6 from the middle, on the side away from the causeway) and a **road lane** for people and cars (from a 0.2 kerb to the wall, 3.4 wide), with a kerb between (`TUNNEL.railOffset`, `laneFrom`). The train line moved over to the rail side.

- **Layers** (`lib/world/tunnelSpec.js`, `lib/world/terrain.js`): on land the road above the tube and the road in it share a ground position, so a mover has a **layer**, `'surface'` or `'tunnel'` (`avatarState.layer`, and a car's `v.layer`). It changes only by crossing a portal's **mouth** (the first 8 units of a ramp, open ground) into the tube's lane, or back out (`nextLayer`): never from the side or over the roof. `terrain.sample / canStand / standsWith / move / constrain / groundY` take the layer; on the tunnel layer the lane is `'tunnel'` at the road's height (the ramp's 0.08 grade, level under the sea), the rest of the tube is a `'wall'`, and no boat can be there. On the surface layer the tube's walls where it stands out of the ground are walls, the cut ground beyond a mouth is a **pit** nobody can step into from the side (so nobody is trapped in the trench), and the rail's side of the mouth is closed. The ground over the tube, and the sea over it, are unchanged.
- **Movers**: `Avatar.jsx` (walking) and `Vehicles.jsx` (cars) pass the layer to the terrain and keep it; the height they stand at is `avatarState.y`. The follow camera follows a person or a car in the tube as it does a rider (pulled in, under the roof), and a light goes with them there (`TubeLight` in `Tunnel.jsx`: the scene's lights do not reach down).
- **Approach roads**: each portal has a road from the ring road (the tunnel's `links`) that runs to 24 units out on the tube's own line and then straight in along the lane, so a car arrives square to the mouth (baked as `harbor-tunnel-link-0/1`, 6.4 wide).
- **Presence**: a person or a car is checked as before (x and z; the tube is inside the world's rectangle).
- **Tests**: `tests/tunnel-walk.test.mjs` walks and drives the real baked world through the tunnel both ways (no stop, one layer change in and one out, the height continuous within 0.2, the floor at -5.5 at the bottom), and checks the wall, the kerb, the rail side, no boat, the ground over the tube, crossing over it without dropping in, the pit and the open mouth.

## Not done

- **Other players do not see you in the tube at the right height**: the presence messages carry x and z, and the remote avatars are drawn at the town's height (they already are on a bridge's deck), so someone else sees you at the surface over the tube. A height in the state message is a protocol change.
- **No other cars or traffic** use the tunnel (the baked world's traffic does not exist yet), and the tube has no signs, ventilation or emergency props.
- **The portal is still a plain box with an open end** (no arch), and the cut ground is cell-sized (4 units).
- **Not tried by hand in the game** (the walking and driving are tested in Node on the real baked world; the camera and light inside the tube were not seen from the game, only the tube from the dev page's free camera).

(Stage 1's list, kept:)


- **Not seen on a phone**; the tube is about 3 draw calls and a few thousand triangles (not measured).
- The first causeway's train and this one share the train models; a second train on the clock is not yet staggered against the first.
