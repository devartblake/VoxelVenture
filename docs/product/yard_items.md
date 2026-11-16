# Yards made of models

Written for: owners (what they can pick) and developers (how it is drawn). Added 2026-11-15.

In the plot card's **Behind the building** row (and in the builder when claiming), five yards made of real models join the car park, garden, patio, storage and pool. The ones that suit the owner's kind of business come first and carry a star.

| Yard | What is in it | Suits |
| :--- | :--- | :--- |
| **Tropical garden** | palm trees, flowers, a stone path | homes, restaurants, shops |
| **Fenced garden** | a low fence with a gate round a lawn, flowers, a planter, a sign | homes, shops, offices |
| **Market yard** | a food stall and a drinks stall, pumpkins, melons, carrots | shops (markets), restaurants |
| **Depot yard** | three shipping containers, a tank, a chimney, solar panels | offices, shops |
| **Campfire grill** | a fire pit, logs, a tent, stump seats | restaurants |

The models are Kenney's Nature Kit (palms, flowers, fences, logs, crops, a campfire, a tent), City Kit (Industrial) (containers, tank, chimney, solar panels) and Coaster Kit (the stalls), all CC0. The yard's ground is a flat lawn, sand or gravel slab in the yard's colour.

## Rules (the same as every back)

- It is part of the building's exterior settings (`exterior.back`), saved with the plot, validated by `lib/game/exterior.js`, and free for now (no price).
- It is fitted to the free ground behind the lot (`backRoom`, at most 1.6 units, less a margin): with less than 0.3 there is no yard, a small lot shrinks the models, and nothing stands on a neighbour's lot (`tests/yard-models.test.mjs` checks 200 lots of the real city for each yard).
- Models are low (nothing to collide with) and instanced: one draw call for each model however many lots have a yard, loaded only when some lot has chosen a yard that uses them (`apps/web/components/city/Crowns.jsx`, `PropInstances`).

## How it is made

- `lib/content/yardModels.js` holds the yards: each a ground colour, who it suits and a list of models placed as fractions of the lot's width and of the room behind it (`at: [x, z]`, a fence as a `row`), each at a height in world units (`h`; a floor is 1.2, a car about 0.25).
- `lib/content/backyards.js` adds them to `BACKS`, orders them for a business (`backsFor(type)`) and places them (`backModelItems`).
- The models are in the prop catalogue (`lib/content/propCatalog.js`, class `yard`), written by `scripts/models/import-props.mjs` (`--only nature,industrial`) from the Nature Kit (30 models of its 329) and City Kit (Industrial) (7 of 37); nothing else of the kits is shipped.
- A development gallery shows every back on a mock lot: `/dev/yards` (or `?back=tropical`).

## Not done

- The Nature Kit has no bare dead trees, ferns or twisted trees (see the kit check in the session notes); a "dead tree" or "fern" yard would need another CC0 source.
- No price, and no choice of colours for the models.
- A front yard: lots face the street with no room in front.
