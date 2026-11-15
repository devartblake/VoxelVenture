# A plane the player flies, and flights to Harbor Isle

[All documentation](../README.md) · 2026-11-15 · **an idea on the roadmap (task 18), not built.** Written at the user's request, to be worked out together before anything is made.

## Why

- **The island.** Harbor Isle is about 990 units east of the mainland, across 380 units of open water ([world_recipe.md](world_recipe.md)). A boat crosses it in about 100 seconds (3.6 units a second). A plane is the fast way, and a good reason to go.
- **The air tasks.** The catalogue has air tasks (take off from an airport, land at one, fly for two minutes) that cannot be done today, because the player cannot fly. See [daily_weekly_tasks.md](../product/daily_weekly_tasks.md).

## What exists today

- Two **banner planes** that fly closed circuits between the two airports, Voxel International and Pixel Heights ([lib/sim/flight.js](../../lib/sim/flight.js)). A plane's position is a pure function of time, so the server can say where each one is at any moment. This is scenery, not something the player drives.
- Two airports, parked airliners, a runway frame for each, and plane models that are still primitives until three CC BY models are added and recorded ([kenney_assets.md](kenney_assets.md)).
- The player can drive any car and sail a boat (`VEHICLES` in [lib/sim/vehicles.js](../../lib/sim/vehicles.js)).

## What would be new

| Piece | Notes |
| :--- | :--- |
| A third vehicle kind, `plane` | its speed, turn rate, climb and stall in `VEHICLES`; an arcade model first (like the car and the boat), not a simulator |
| Take-off and landing | from an airport's runway frame; a landing is a plane that touches down on a runway slowly enough; anywhere else is a crash and a reset at the airport |
| Collision | with buildings, hills and the ground, using the collision code the cars already use, plus a ceiling |
| Multiplayer | the vehicle kind and the height in the state message, and in the presence server's movement checks (a plane's speed and height limits) |
| Controls and camera | keyboard and touch; a chase camera; the player's seat, as for cars and boats |
| The island | an airstrip or harbour landing on Harbor Isle, and the streaming runtime (roadmap task 11), without which nothing of the island exists in the game |
| Verification | the presence position tracker (vehicle kind, height, speed, where) says whether a take-off, a landing, a flight time or a flight to the island really happened |

## Tasks it unlocks

Take off from, or land at, a named airport; fly for N minutes; fly over a district; fly to Harbor Isle. Separately, and much cheaper, the banner planes give **watch tasks** ("be at the runway when a plane takes off") once the presence tracker exists, with no flying at all.

## Order and size

1. The presence position tracker (in progress), then watch-a-plane tasks from the banner planes' timetable.
2. Roadmap tasks 11 and 14 (streaming runtime, coast and sea) before the island can be reached by anything.
3. The plane itself: about 8 to 10 working days, plus models and their licence records.

## Open questions

- Arcade or something closer to a real flight model.
- One plane or several (a small plane, and the airliner for tours?).
- Whether the plane may land on the island at all at first, or only fly over it.
- Fuel, or any cost to fly: none is proposed, and nothing here touches the Gold or Credits wallets.
