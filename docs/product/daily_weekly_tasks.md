# Daily and weekly tasks

[All documentation](../README.md) · 2026-11-14 · design data only: nothing in the game reads any of this yet

Two things here: what players can already do each day and week in the city, and a catalogue of **2061 tasks** (1424 daily and 637 weekly) that can be handed out on a schedule. The catalogue is made by a script from the city's own places, roads, businesses, fish and wardrobe, so it cannot name something that is not there. **The server holds every balance and verifies every task** (section 4): nobody can create value by editing their own browser.

## 1. What is in the world today

The game has no task or quest list yet. It has a handful of daily and weekly activities, each with its own reward, checked in the code:

| Activity | How often | Pays | Where it lives |
| :--- | :--- | :--- | :--- |
| **Mystery chest** on a pavement | daily | 10 to 50 Gold | `dailyChest` in [lib/game/daily.js](../../lib/game/daily.js) |
| **Plot of the Day**: walk into the day's business | daily | 20 Gold | `POTD_VISIT_GOLD` in [lib/game/daily.js](../../lib/game/daily.js) |
| **Scavenger hunt**: three gold stars at landmarks | daily | 15 Gold each, 40 more for all three, and an extra vote that week | `HUNT_GOLD`, `HUNT_BONUS` in [lib/game/daily.js](../../lib/game/daily.js) |
| **Fishing**: from a boat, rare fish | any time | 2 to 40 Gold a fish (a golden koi is 40), 120 Gold a day at most | `FISH`, `FISH_DAILY_CAP` in [lib/sim/vehicles.js](../../lib/sim/vehicles.js) |
| **Building of the Week vote** | weekly (Monday to Sunday, UTC) | one vote, a second for winning a day's hunt; each to a different building, never your own | [lib/game/buildingOfWeek.js](../../lib/game/buildingOfWeek.js) |
| **Visit rewards** in a storefront, and look-at-the-ad quests on billboards | once each | Gold from the business's own budget | `brandQuests`, `completedQuests` in [lib/state/store.js](../../lib/state/store.js) |
| **Sponsored raffle** | any time | costs 15 Gold, pays back less on average (a Gold sink) | `RAFFLE_COST` in [lib/game/cosmetics.js](../../lib/game/cosmetics.js) |
| **Weekly check-in** (owners in the pilot) | weekly | none | [docs/monetization/pilot.md](../monetization/pilot.md) |

That is four daily activities, one weekly one, and what players spend Gold on (the wardrobe). Together the daily ones can already pay about 275 Gold a day, which is why the new tasks below pay little.

If you meant the project's development roadmap instead, that is [docs/roadmap/tasks.md](../roadmap/tasks.md).

## 2. The catalogue: 2061 tasks, 1424 daily and 637 weekly

[task_catalogue.json](task_catalogue.json) is the full list with a machine-readable goal for each (the game and the server load the copy at [lib/game/taskCatalogue.json](../../lib/game/taskCatalogue.json)); [task_catalogue.csv](task_catalogue.csv) is the same for a spreadsheet. `node scripts/tasks/build-task-catalogue.mjs` rebuilds all three.

**No duplicates.** Every id is made from what the task is (its cadence, family and goal), so a catalogue can grow, or a task can be reworded, without any id changing: what a player has collected keeps pointing at the same task. No two tasks share a goal within a cadence, a title or a text; `tests/task-catalogue.test.mjs` fails if they do.

| Code | What the tasks are | Daily | Weekly | Examples |
| :--- | :--- | ---: | ---: | :--- |
| BIZ | the city's named businesses, one task each; by category, building colour, plot value, tallest and smallest in a district, the word its name ends in, the letter it starts with, two kinds in a week | 559 | 140 | Pay Cloud Emporium a visit; Find a teal building; Visit the tallest building in The Bazaar |
| RDS | walk or drive each of the 42 roads, at dusk or at night, or on 3 days | 168 | 42 | Walk Pixel Ln at night |
| TIM | a business or a district at dawn, in daylight, at dusk or at night; a kind of business after dark | 169 | 10 | Visit a Services business at dusk |
| WRD | the wardrobe: wear an item, all 96 hat outfits, wear one in a park, play an emote | 20 | 145 | Party hat, purple tee and black pants |
| PLC | the 19 named places (2 parks, 2 lakes, 5 bridges, 2 airports, 2 malls, the fun park, 4 piers, the river): reach, loop, at each time of day, on 3 days | 114 | 38 | Cross the North County bridge |
| EXP | explore the 10 districts: walk through, step inside, a shop, restaurant or office, trips between districts | 96 | 32 | Step inside 2 businesses in Creator Commons |
| FSH | fishing and boats: each fish, on each lake and pier, at dusk or night | 73 | 27 | Catch a pike on Mirror Lake |
| CHL | hard daily challenges: combinations of places, roads, districts and fish | 81 | 0 | Catch a trout and an eel |
| STR | streaks, task counts, and finishing so many tasks of one kind | 0 | 58 | Finish 6 fishing tasks |
| VOT | the weekly vote, by category, type or colour; the leaderboard; Discover | 0 | 55 | Vote for a Retail business |
| COL | collections over a week, pairs of districts | 0 | 47 | Do business in Lakeside and The Bazaar |
| SND | the 11 sound zones, at dusk and at night | 44 | 2 | Hear Cafe jazz at night |
| DST | distance on foot, by car and by boat, and inside a district | 39 | 6 | Walk 800 m inside Arcade Alley |
| HNT | the daily finds that exist today: chest, stars (by kind of spot), Plot of the Day | 12 | 13 | Find the star at a bridge |
| EST | prime sites, luxury and grand estates, by district | 21 | 2 | Visit a grand estate in Meadow Quarter |
| SOC | other players | 15 | 3 | Meet 4 other players |
| OWN | for people with a listing | 0 | 15 | Read your 30-day figures |
| AIR | the airports and flying (needs a plane the player flies: [player_flight.md](../world/player_flight.md), roadmap task 18) | 7 | 1 | Land at Voxel International |
| FUN | the fun park's rides and the malls | 6 | 1 | Walk up to the ferris wheel |

**Difficulty.** Easy, medium and hard, from the effort: one business visit is easy, a road's length or a loop is medium, a combination or a rare catch is hard.

| | easy | medium | hard |
| :--- | ---: | ---: | ---: |
| daily | 763 | 537 | 124 |
| weekly | 99 | 428 | 110 |

**What can be verified.** Each task says what it needs, and so who can check it:

| Signal | Tasks | Meaning |
| :--- | ---: | :--- |
| `tracked-today` | 1277 | the server can check it from its own records: a visit (and what the visited business is), a star, the chest, the Plot of the Day, a vote, a fish, an owned or worn item, the time of day from the shared world clock, and how many tasks you have collected |
| `needs-position` | 571 | needs to know where the avatar is (reach a place, walk a road, be somewhere at dusk). Only offered once the server has a position it observed itself (section 4) |
| `needs-new-event` | 213 | needs something the game does not record yet: an emote, a chat message, minutes in a car or boat or plane, an owner action. Not offered until it is recorded |

**Who can be given a task.** `requires` marks 167 wardrobe tasks that need an owned item, 52 that need a sign-in and 15 for someone with a listing. The schedule skips a task the player cannot do.

**Tied to one city.** 921 tasks name something that exists only in city seed 20260101 (a business, a bridge, a road). They carry `seedBound`: if the seed changes, rebuild the catalogue. Ids stay put, so earlier collections are kept; a task whose target no longer exists simply stops being offered.

## 3. How they are handed out

[scripts/tasks/schedule.mjs](../../scripts/tasks/schedule.mjs), the same idea as the chest and the stars: the same tasks for everyone in the same city, with no server.

- **A day gets 3 tasks**: one easy, one medium, one hard. **A week gets 5**: two easy, two medium, one hard. A week is Monday to Sunday UTC, as Building of the Week's is.
- Each pool is shuffled once per cycle and the days walk down it, so **each task comes round exactly once per cycle**, and never again within a third of one (a hard daily task is not repeated within 41 days). A cycle is 763 days for easy daily tasks, 537 for medium and 124 for hard; 49, 214 and 110 weeks for the weekly ones.
- `eligible(task)` drops what the player cannot do, and the walk goes on over the rest.
- Two tasks of one category on the same day are uncommon, not impossible (checked: under 25% of days).

A sample for a signed-in newcomer, with no items and no listing (Gold in brackets):

| Day | Easy | Medium | Hard |
| :--- | :--- | :--- | :--- |
| Mon 16 Nov | Fish on Mirror Lake (5) | Hear Countryside at dusk (10) | Visit a grand estate (20) |
| Tue 17 | Pay Meadow Diner a visit in Countryside (plot 784) (5) | Walk the length of East Ring (10) | Visit a grand estate in Countryside (20) |
| Wed 18 | Pay Hazel Outlet a visit in Meadow Quarter (plot 496) (5) | Walk from Old Town to Countryside (10) | Catch a perch and an eel (20) |
| Thu 19 | Visit a shop in Lakeside (5) | Walk 800 m inside The Bazaar (10) | Cross the Creator Commons avenue bridge and the South County bridge (20) |
| Fri 20 | Pay Creek Shop a visit in Countryside (plot 764) (5) | Visit a luxury estate in The Bazaar (10) | Catch 8 fish (20) |
| Sat 21 | Say hello in Countryside (5) | Listen to Park for a minute (10) | Visit Mirror Lake and Voxel International (20) |
| Sun 22 | Pay Meadow Kitchen a visit in Outskirts (5) | Drive along Delamere Crescent (10) | Visit the most valuable business in Arcade Alley (20) |

Weeks: 16 Nov, *Vote for a restaurant* (30), *Vote for a purple building* (30), *Visit 5 businesses in Arcade Alley* (60), *Walk Chapel St on 3 days* (60), *Keep a 14-day streak* (120). 23 Nov, *Vote for a Gaming business* (30), *Vote for a business in Riverside* (30), *Visit 3 restaurants in Meadow Quarter* (60), *Visit a Creators and a Farm & Food business* (60), *Visit every Dev Tools business* (120).

## 4. Rewards, and who holds the value: the server

**The rule (decided 2026-11-14): the server has authoritative control over currency of every kind, so nobody creates their own value.**

- **Balances live only on the server**, for Gold and for Credits. The browser shows what the server says. Gold used to be a number in the browser; it moves to the account on the server, and an old local balance is not carried over (that would be the way to mint it).
- **No request carries an amount.** The server works out every amount itself (the tier's Gold, a cosmetic's price, a fish's value, the chest and the stars) and the player only says what happened.
- **Each reward is collected once.** A task can be collected once per account per day or week, enforced by the database, not by the game. Spending is checked against the balance on the server, and fishing and the raffle are rolled by the server.
- **The server verifies the task.** It checks the goal against its own records of what the player did, or, for "be here" tasks, a position the presence server itself observed. A task the server cannot verify is simply not offered. So at first only the `tracked-today` tasks are live; the rest wait for a verified signal.
- **Who collected what is recorded** per account (task, day or week, Gold, time), shown in the player's profile and totalled for an admin.
- **Guests earn nothing** while there is a server. Without a server (the static demo) the game keeps its local, clearly-labelled demo behaviour.

**Gold by tier:** 5 / 10 / 20 a day and 30 / 60 / 120 a week. A full day of tasks pays at most 35 Gold and a full week at most 300, on top of the chest, the stars, the Plot of the Day and fishing (about 275 a day). The numbers are one table, `GOLD`, in the generator. For scale: a top hat is 100 Gold and a crown 250. Credits are not paid for tasks: they are the quest wallet.

**Build status:** the currency and the tasks are built in pull requests, not in this document. See [docs/roadmap/tasks.md](../roadmap/tasks.md) for where they stand.

## 5. What the catalogue deliberately leaves out

Owners see **verified** figures: views, visits and qualified actions that are counted only when they are real. A task that pays for a coupon claim, a newsletter sign-up, a purchase, a button press, a review, a share or an invite would pad those figures, so there are none (`tests/task-catalogue.test.mjs` checks the wording). Walking into a business is allowed: it is what a visit is.

- **The weekly check-in pays nothing**, so the answers cannot be bought.
- **Chat, wave and "meet players" tasks** should pay at most once a day and count distinct players, or they invite spam. Nothing records them today, so they are not offered.
- **Referrals** have their own programme ([lib/business/referral.js](../../lib/business/referral.js)).

## 6. Still to do

- **Position-based tasks** (571): they need the presence server to say where the player is. They are not offered until that check exists.
- **New events** (213): an emote, minutes in a vehicle, a chat message and the owner actions each need recording.
- **Town 2.** A second town is being generated further out (see [docs/world](../world/)); its places, roads and businesses will get their own tasks when it is in the world.

## Files

| File | What it is |
| :--- | :--- |
| [task_catalogue.json](task_catalogue.json), [task_catalogue.csv](task_catalogue.csv), [lib/game/taskCatalogue.json](../../lib/game/taskCatalogue.json) | the 2061 tasks (generated) |
| [scripts/tasks/build-task-catalogue.mjs](../../scripts/tasks/build-task-catalogue.mjs) | the generator: `node scripts/tasks/build-task-catalogue.mjs [--seed N]` |
| [scripts/tasks/schedule.mjs](../../scripts/tasks/schedule.mjs) | `tasksForDay`, `tasksForWeek` |
| [tests/task-catalogue.test.mjs](../../tests/task-catalogue.test.mjs) | the checks: the count, unique titles, real names, Gold, nothing that pads figures, no repeats, the files match |
