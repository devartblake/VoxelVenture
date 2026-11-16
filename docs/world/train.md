# The train: Harbor Causeway

Written for: players (what they can do) and developers (how it works). Built 2026-11-16, at the owner's request; the Kenney Train Kit (CC0).

A shuttle train runs between a station on the mainland and one on Harbor Isle, on a rail laid beside the road on the **first causeway** (Harbor Causeway, 456 units). It exists with the baked world (`?world=baked`, and the dev page `/world/stream`).

## For a player

- Walk to either station (a platform with a roof, at each end of the causeway). While the train stands there the prompt says **Board the train from Mainland Station** (or Harbor Isle Station); otherwise it says how many seconds until the next one.
- Once aboard you stand in the train and the camera follows. The doors open only in a station: the prompt says **Next stop: ...** on the way, and **Get off at ...** (or X, or the Get off button) when it has stopped. There is no fare and no Gold.
- The train stands 16 seconds in each station, and you can board until the last 3 seconds. A run takes 75 seconds (it speeds up and slows down); a whole cycle there and back is about three minutes.
- Other players see you standing in the train, moving along the causeway.

## How it works

- **A pure timetable** (`lib/world/train.js`): the line (the causeway's centre line, 2.5 units to one side: the deck is 8 wide and the road keeps the rest), the stations (18 units in from each end, on land), `trainState(line, time)` (where the train is, which way, how fast, and which station it is in), the four cars' places and the rails' tiles. Everything is a function of the wall clock, so every player sees the train in the same place with no server and no messages (the ads rotate the same way).
- **The bridge:** the deck arches 9 units over the water; the rail follows it (`railY`, the same function that places the deck: `deckHeight`) and the cars pitch with the slope. On the shore the rail lies on the ground the baked terrain gives, once its chunks are loaded.
- **Drawn by** `apps/web/components/world/Train.jsx`: the rail as one instanced mesh, the four cars (two noses, two middle cars of the electric bullet train, so the same train runs both ways), and two stations in primitives. Models: `railroad-straight`, `train-electric-bullet-a` and `-b` from the Train Kit (`apps/web/public/models/kenney/train/`).
- **Riding** (`lib/state/fleetStore.js`): `boardTrain(station)` and `leaveTrain()` make the rider a vehicle of kind `train`; `apps/web/components/city/Vehicles.jsx` moves it with the train every frame and sets the prompt and the panel. The doors rule is `canBoard` and `canLeave` in `train.js`.
- **Presence:** the rider is sent to the presence server as a vehicle of kind `train`, which the server keeps (`cleanVeh`) and checks as a **car** (`modeOf` in `lib/world/movement.js`; the cruise speed, 6, is under a car's 7). Other players draw the rider as a person standing in the train, not as a car. `tests/train-ride.test.mjs` runs a whole ride through the movement check.
- **Tests:** `tests/train.test.mjs` (the line, the timetable, the cars, the stations, the rail) and `tests/train-ride.test.mjs` (boarding, the doors, the movement check).
- **Look at it:** `/world/stream?look=1240,268,25,14,40&trainat=5` (the station with the train in it); `trainat` holds the clock at that second of the cycle.

## Not done

- **A second line** on the North Causeway, or an island loop; and a rail on the road's side of the other causeways.
- **Sound, a headlight and lit windows at night** (the glow system the lamps use).
- **Cars crossing the rail:** the road and the rail share the deck without a barrier: the rail is on its own side, but a car can drive through the train (the road is not blocked: the train is only drawn).
- **The tunnel:** whether a rail or road tunnel could cross between the two big islands under the sea is the owner's next question, to be looked at after the roadmap's tasks 17 (real terrain) and 18 (player flight). It is a different thing from a bridge: it needs a cut through the seabed or the hills, a portal at each end, a lit tube to ride through, and a decision whether the ground model can hold a level below the sea.
