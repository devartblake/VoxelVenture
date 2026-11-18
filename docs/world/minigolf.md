# Harbor Mini-Golf

Written for: the owner and developers. Started 2026-11-18, after the owner asked for the mini-golf course next. **The course, its place in the world and the ball's physics were built first; putting and scoring in the game were added the same day (below).**

![The course from above.](gallery/minigolf_course_top.webp)

## What is built

- **The course** (`lib/world/minigolf.js`): nine holes on a grid, made from a seed (`COURSE`, `KINDS`): straight, dogleg, blocks (two 2 x 2 blocks in the lane, on alternate sides), zigzag and a lane that doubles back. A hole is **a set of cells** (0.8 units each; a lane is 3 cells, 2.4 units, wide): the felt is the cells, the walls are the edges between the felt and the rest merged into runs (`boundaryRuns`), the blocks are cells left out. Par is 2 to 4 (28 for the course). The tee is two cells in from the start (a red mat), the cup (0.42 radius, a black quad) two cells in from the end, with a pole and a red pennant.
- **Its place** (`recipe.courses`, `buildCourses`): `harbor-minigolf` on Harbor Isle at (2360, 345), 150 x 96 units, in the flat land south of the east spur road, east of the town and clear of the lagoon. Like the racing track, the recipe is refused if the site is not flat land, within 40 of the coast, 14 of a highway, 40 of a river or touches a town.
- **Baked** (`lib/world/bake.js`): the felt, mats and cups are painted quads in the chunks' `surface` (the circuit's palette, which gained `felt`, `felt-light` and `mat` at the end: the circuit's indices are unchanged), the walls and flags boxes in the chunks' `structures` (drawn with the bridges' boxes). The manifest's `courses` carries each hole's par, tee, cup, bounds and **walls** (`[ax, az, bx, bz, nx, nz]`) for the game to play. 318 quads, 86 boxes, about 4,200 triangles.
- **The ball** (`lib/world/golfPhysics.js`): pure and deterministic. A putt (`putt(ball, angle, power)`) up to 14 units a second; friction 2.4 plus a little drag slow it; it bounces off the walls (62 per cent of the speed) and is pushed out of them; the cup takes it when it is over it slower than 6 units a second (faster it skips over; it may rebound off the end wall and drop in); it stops below 0.12. Four physics steps of 1/240 s to a frame, so a fast ball cannot pass through a wall. A hole not finished counts par + 4.
- **Tests** (`tests/minigolf.test.mjs`): the same seed gives the same course; every hole's lane is one piece from tee to cup and every edge of it has a wall; holes do not touch; the quads face up; a soft putt rolls and stops, the same putt always rolls the same, some power along the lane sinks, the cup refuses a fast ball and takes a slow one, a putt at a side wall stays in the lane, **2,250 random putts never leave their hole**; and the baked course is in the manifest and the chunks, on flat ground, clear of the town.

## Playing it (2026-11-18)

- **Starting.** Walk to a tee mat (within 3.2 units): the interaction prompt says "Play hole N of Harbor Mini-Golf (par P)" (E, or tap it, like boarding the train). Refused in a vehicle. You stand a step behind the ball, facing along the lane; the panel appears (`components/ui/GolfHud.jsx`). `?golf=0` leaves the whole thing out.
- **Aiming and putting.** **A and D or the arrows** turn the aim (1.6 radians a second); **hold Space** to charge the power (a second from nothing to full) and **let go** to putt; the aim arrow in the world grows and turns from green to red with the power. On a phone or with a mouse the panel has an aim-left and aim-right button and a **Hold to putt** button. **Esc**, or "Put the club away", ends it. While you play A and D do not walk the avatar (`Avatar.jsx`), and the avatar is kept at the ball (`hold`) so a click on the ground does not walk you off.
- **The ball** (`MiniGolf.jsx`): the Kenney Minigolf Kit's red ball (`kenney/minigolf/ball-red.glb`), scaled to the physics ball, a plain sphere until it loads. Every frame the store steps the physics (`golfStore.tick`); when the ball stops short you aim again from where it lies, looking at the cup; when it drops, or after **8 strokes** it is picked up, the hole is done.
- **Scoring** (`lib/world/golfScore.js`): the hole's score is its strokes (a pick-up counts at least par + 4); its name against par (Hole in one!, Albatross, Eagle, Birdie, Par, Bogey, Double bogey...); the card is nine holes with the total against par. At the end of the ninth hole the **card** is shown and the round is kept as **this device's best** (`localStorage`, `voxelventure-golf-best`, for the course) if it beats the last: nothing is sent to the server, and **no Gold or income is given** (the owner has not asked for any). "Play again" starts at hole 1.
- **Tests** (`tests/golf-play.test.mjs`): the scoring words and totals, the best kept only when beaten, a tee found within its range, no golf from a car, the player behind the ball, aiming at a speed, power charging over a second and stopping at full, no putt without charging, no second putt while it rolls, a ball putted to the cup in some strokes with the card kept, a ball picked up at the limit, and a nine-hole round to the card and the best.

## The Kenney Minigolf Kit

Downloaded on 2026-11-18 from kenney.nl/assets/minigolf-kit (3.1, CC0, 125 files) through the page's own "Continue without donating" button (driven in a real browser: a plain script is refused). **In the repository so far**: three balls, three clubs, three flags and the colour map in `apps/web/public/models/kenney/minigolf/`, registered in `lib/content/assetSources.js`, credited in `CREDITS.md` and `apps/web/public/models/CREDITS.md`, with the licence in `docs/licences/kenney/License-minigolf-kit.txt`. The other 117 pieces (straights, corners, ramps, windmill, tunnels, gates, castle, hills, supports) are not committed: they are what the course will be dressed with next (below).

## What is not built

1. **The kit's pieces on the course.** The walls and flags are still plain boxes; the kit's straights, corners, ends and obstacles could replace them on the same cell layout (its pieces are 1 unit, the cells 0.8: scale them), with the boxes kept for a phone, as the ports' boxes were. The windmill, ramps and hills would also make holes the cell grid cannot (a moving obstacle needs the physics to know a moving wall).
2. **Two players, or a score others can see**: the round is one person's and this device's; a shared scoreboard is a server feature and a policy question.
3. **Aiming by dragging** on the ball (a mouse or a finger): the buttons and keys do it now.
4. **More courses, and the course's setting**: a car park, a clubhouse, a path from the east spur road, signs with the hole numbers (`Label3D`).

## Why a grid of cells

A set of cells makes a hole of any shape without geometry code: the felt, the walls and the ball's faces all come from the same edges, so they cannot disagree; a block is a cell left out; and a new kind of hole is a new list of legs. The cost: walls are axis-aligned (no curves), which the kit's pieces also are mostly.
