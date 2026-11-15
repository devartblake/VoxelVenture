# A plane the player flies, and flights to Harbor Isle

[All documentation](../README.md) · 2026-11-15 · **an idea on the roadmap (task 18), not built.** Written at the user's request, to be worked out together before anything is made.

## Why

- **The island.** Harbor Isle is about 990 units east of the mainland, across 380 units of open water ([world_recipe.md](world_recipe.md)). A boat crosses it in about 100 seconds (3.6 units a second). A plane is the fast way, and a good reason to go.
- **The air tasks.** The catalogue has air tasks (take off from an airport, land at one, fly for two minutes) that cannot be done today, because the player cannot fly. See [daily_weekly_tasks.md](../product/daily_weekly_tasks.md).

## What exists today

- Two **banner planes** that fly closed circuits between the two airports, Voxel International and Pixel Heights ([lib/sim/flight.js](../../lib/sim/flight.js)). A plane's position is a pure function of time, so the server can say where each one is at any moment. This is scenery, not something the player drives.
- Two airports, parked airliners, a runway frame for each, and plane models that are still primitives until three CC BY models are added and recorded ([kenney_assets.md](kenney_assets.md)).
- The player can drive any car and sail a boat (`VEHICLES` in [lib/sim/vehicles.js](../../lib/sim/vehicles.js)).

## First step: passenger flights (decided 2026-11-15)

Before the player can pilot anything, the airports can take players to the island as **passengers**. You board at an airport and take a scripted flight along a fixed route, like a banner plane's circuit, and land at another airport. It gets players to Harbor Isle much sooner and much more cheaply than a flight model, and nothing in it is wasted: the airports, the island's airstrip and the position verification are all needed for a plane the player flies later.

- **Where it goes.** Between the mainland's two airports and **Harbor Isle Airstrip**, which the world recipe now gives the island ([world_recipe.md](world_recipe.md), "Features": a 92-unit runway with an apron, on the east side, generated with the island).
- **The flight.** A fixed route (take off, cross the water, land), flown by the same pure time-to-position code the banner planes use (`flightState`), with the player as a passenger: a camera on the plane, and a skip button. There is no flight model and no collision: the plane follows its route.
- **The fare.** A fare in Gold, held and checked by the server like every other balance ([backend.md, "Currency"](../architecture/backend.md#currency-servicesapigoldmjs)): the page says "board the flight to Harbor Isle", the server works out the fare and takes it, and a refused fare means no flight. A free first flight, or a daily free one, are choices for later.
- **The arrival.** The server says the player is now in the other town: their presence room changes and the position tracker accepts the new place. This is the part that needs the streaming runtime (roadmap task 11), because the island has to exist in the game for anyone to land on it. Until then, a flight can be designed and its fare and verification tested, but not played.
- **What it unlocks.** The air tasks that need a flight as a passenger: take a flight, fly to the island, fly between the two airports. "Watch a plane take off" tasks need no flight at all (the banner planes' timetable and the position tracker).
- **Cost.** About 3 to 4 working days once the streaming runtime and the island's airstrip exist, against 8 to 10 for a plane the player flies.

## What would be new for a plane the player flies

| Piece | Notes |
| :--- | :--- |
| A third vehicle kind, `plane` | its speed, turn rate, climb and stall in `VEHICLES`; an arcade model first (like the car and the boat), not a simulator |
| Take-off and landing | from an airport's runway frame; a landing is a plane that touches down on a runway slowly enough; anywhere else is a crash and a reset at the airport |
| Collision | with buildings, hills and the ground, using the collision code the cars already use, plus a ceiling |
| Multiplayer | the vehicle kind and the height in the state message, and in the presence server's movement checks (a plane's speed and height limits) |
| Controls and camera | keyboard and touch; a chase camera; the player's seat, as for cars and boats |
| The island | the island's airstrip is in the world recipe now (a 92-unit runway on the east side, with the same runway frame the city's airports use); drawing it, and the streaming runtime (roadmap task 11), without which nothing of the island exists in the game, are still to do |
| Verification | the presence position tracker (vehicle kind, height, speed, where) says whether a take-off, a landing, a flight time or a flight to the island really happened |

## Tasks it unlocks

Take off from, or land at, a named airport; fly for N minutes; fly over a district; fly to Harbor Isle. Separately, and much cheaper, the banner planes give **watch tasks** ("be at the runway when a plane takes off") once the presence tracker exists, with no flying at all.

## Order and size

1. The presence position tracker (in progress), then watch-a-plane tasks from the banner planes' timetable.
2. Roadmap tasks 10, 11 and 14 (the baked world format, the streaming runtime, coast and sea) before the island can be reached by anything.
3. **Passenger flights** to Harbor Isle Airstrip (3 to 4 working days).
4. Later, the plane the player flies: about 8 to 10 working days, plus models and their licence records.

## Open questions

- Arcade or something closer to a real flight model.
- One plane or several (a small plane, and the airliner for tours?).
- Whether the plane may land on the island at all at first, or only fly over it.
- The fare for a passenger flight, and whether the first one is free. It is Gold, held by the server; it never touches Credits.
- Fuel or any other cost for a plane the player flies: none is proposed.
