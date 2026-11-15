# Daily and weekly tasks

[All documentation](../README.md) · 2026-11-14 · design data only: nothing in the game reads any of this yet

Two things here: what players can already do each day and week in the city, and a catalogue of **898 tasks** (693 daily and 205 weekly) that can be handed out on a schedule. The catalogue is made by a script from the city's own places, roads, businesses, fish and wardrobe, so it cannot name something that is not there.

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

## 2. The catalogue: 898 tasks, 693 daily and 205 weekly

[task_catalogue.json](task_catalogue.json) is the full list with a machine-readable goal for each; [task_catalogue.csv](task_catalogue.csv) is the same for a spreadsheet. `node scripts/tasks/build-task-catalogue.mjs` rebuilds both.

| Code | What the tasks are | Daily | Weekly | Examples |
| :--- | :--- | ---: | ---: | :--- |
| BIZ | pay a named business a visit (200 of the city's own) | 200 | 0 | Pay Cloud Emporium a visit in SaaS Silicon Strip |
| EXP | explore the 10 districts: walk through, step inside businesses, a shop, restaurant or office, trips between districts | 90 | 27 | Step inside 2 businesses in Creator Commons |
| PLC | the 19 named places (2 parks, 2 lakes, 5 bridges, 2 airports, 2 malls, the fun park, 4 piers, the river): reach, loop, at dusk, at night, on 3 days | 76 | 19 | Walk across the North County bridge |
| RDS | walk or drive the length of each of the 42 roads | 84 | 0 | Walk the length of Pixel Ln |
| CHL | hard daily challenges: combinations of places, roads, districts and fish | 81 | 0 | Cross two bridges in a day; Catch a trout and an eel |
| WRD | the wardrobe: wear an item, an outfit, play an emote | 20 | 55 | Party hat, purple tee and black pants |
| TIM | be in each district at dawn, in daylight, at dusk or at night | 40 | 0 | Be in Lakeside at dusk |
| FSH | fishing and boats: each kind of fish, piers, lakes, Gold from fishing | 25 | 15 | Catch 3 minnows |
| VOT | the weekly vote, the leaderboard, Discover categories | 0 | 25 | Visit number 3 on the leaderboard |
| SND | the 11 sound zones: walk in, stay a minute | 22 | 2 | Listen to Cafe jazz for a minute |
| SOC | other players: say hello, wave, meet N | 15 | 3 | Meet 4 other players |
| DST | distance on foot, by car and by boat | 9 | 6 | Walk 2 km |
| HNT | the daily finds that exist today: chest, stars, Plot of the Day | 7 | 8 | Find all three gold stars |
| OWN | for people with a listing (storefront, logo, figures) | 0 | 15 | Read your 30-day figures |
| STR | streaks and task counts | 0 | 15 | Keep a 7-day streak |
| EST | prime sites, luxury and grand estates | 11 | 2 | Visit a grand estate |
| COL | collections over a week | 0 | 11 | Cross all 5 bridges |
| AIR | the airports and flying | 7 | 1 | Land at Voxel International |
| FUN | the fun park's rides and the malls | 6 | 1 | Walk up to the ferris wheel |

**Difficulty.** Easy, medium and hard, from the effort: one business visit is easy, a road's length or a loop is medium, a combination or a rare catch is hard.

| | easy | medium | hard |
| :--- | ---: | ---: | ---: |
| daily | 369 | 231 | 93 |
| weekly | 68 | 111 | 26 |

**What the game records today.** Each task says what it needs:

| Signal | Tasks | Meaning |
| :--- | ---: | :--- |
| `tracked-today` | 430 | the game already keeps a count or flag: a visit, a star, the chest, the Plot of the Day, a vote, a fish, an owned or worn item |
| `needs-position` | 327 | needs a check of where the avatar is (reach a place, walk a road, be somewhere at dusk). New code, but no new mechanic |
| `needs-new-event` | 141 | needs something the game does not record yet: an emote, a chat message, minutes in a car or boat or plane, an owner action |

"Tracked today" means a state exists, not that a task engine reads it: none is wired.

**Who can be given a task.** `requires` marks 77 wardrobe tasks that need an owned item, 22 that need a sign-in and 15 for someone with a listing. The schedule skips a task the player cannot do.

**Tied to one city.** 465 tasks name something that exists only in city seed 20260101 (a business, a bridge, a road). They carry `seedBound`: if the seed changes, rebuild the catalogue.

## 3. How they are handed out

[scripts/tasks/schedule.mjs](../../scripts/tasks/schedule.mjs), the same idea as the chest and the stars: the same tasks for everyone in the same city, with no server.

- **A day gets 3 tasks**: one easy, one medium, one hard. **A week gets 5**: two easy, two medium, one hard. A week is Monday to Sunday UTC, as Building of the Week's is.
- Each pool is shuffled once per cycle and the days walk down it, so **each task comes round exactly once per cycle**, and never again within a third of one (a hard daily task is not repeated within 31 days). A cycle is 369 days for easy daily tasks, 231 for medium and 93 for hard; 34, 55 and 26 weeks for the weekly ones.
- `eligible(task)` drops what the player cannot do, and the walk goes on over the rest.
- Two tasks of one category on the same day are uncommon, not impossible (checked: under 25% of days).

A sample for a signed-in newcomer, with no items and no listing (Gold in brackets):

| Day | Easy | Medium | Hard |
| :--- | :--- | :--- | :--- |
| Mon 16 Nov | Walk into the Market sound zone (5) | Listen to Market for a minute (10) | Walk Voxel Lake Loop and Wayside Close (20) |
| Tue 17 | Pay Fern Diner a visit in Meadow Quarter (plot 459) (5) | Be in Old Town at night (10) | Step inside 4 businesses in The Bazaar (20) |
| Wed 18 | Pay Meadow Diner a visit in Meadow Quarter (plot 328) (5) | Be in Creator Commons at night (10) | Catch a pike and an eel (20) |
| Thu 19 | Visit a shop in Creator Commons (5) | Drive along Queen Parade (10) | Catch a perch and a pike (20) |
| Fri 20 | Pay Trade Labs a visit in The Bazaar (5) | Drive along Voxel International Rd (10) | Walk East County Rd and Harrison Grove (20) |
| Sat 21 | Pay Maple Shop a visit in Meadow Quarter (plot 303) (5) | Drive along The Bazaar (10) | Visit Mirror Lake and Westgate Mega Mall (20) |
| Sun 22 | Visit a prime-site business (5) | Walk from Meadow Quarter to Outskirts (10) | Walk Pixel Heights Airport Rd and Delamere Crescent (20) |

Weeks: 16 Nov, *Drive 5 km this week* (30), *Earn 100 Gold from tasks* (30), *Both parks and both lakes* (60), *Visit 3 offices in Creator Commons* (60), *Earn 400 Gold from tasks* (120). 23 Nov, *Vote for a business in Meadow Quarter* (30), *Vote for a business in Arcade Alley* (30), *Catch 3 eels* (60), *Keep a 7-day streak* (60), *Cross all 5 bridges* (120).

## 4. Rewards: a proposal

Gold only, fixed by tier: **5 / 10 / 20 a day** and **30 / 60 / 120 a week**. A full day of tasks pays at most 35 Gold and a full week at most 300, so they add to the chest, the stars, the Plot of the Day and fishing (about 275 a day) without replacing them. The numbers are yours to change: they are one table, `GOLD`, in the generator. Prices to compare: a top hat costs 100 Gold and a crown 250.

Never Credits. Those are the server's money.

## 5. What the catalogue deliberately leaves out

Owners see **verified** figures: views, visits and qualified actions that are counted only when they are real. A task that pays for a coupon claim, a newsletter sign-up, a purchase, a button press, a review, a share or an invite would pad those figures, so there are none (`tests/task-catalogue.test.mjs` checks the wording). Walking into a business is allowed: it is what a visit is.

- **The weekly check-in pays nothing**, so the answers cannot be bought.
- **Chat, wave and "meet players" tasks** should pay at most once a day and count distinct players, or they invite spam. The tracker has to enforce that: nothing records them today.
- **Referrals** have their own programme ([lib/business/referral.js](../../lib/business/referral.js)).

## 6. Before anything is built

- **The world freeze.** [world_freeze.md](../roadmap/world_freeze.md) freezes game-economy mechanics and virtual-currency features. Handing out Gold for tasks is one. This catalogue is design data (a document, a generator and a test, in `scripts/tasks/`, which is not a frozen folder), so it does not break the rule, but building the tracker and the rewards needs your decision, like the other scoped exceptions.
- **Order of work, if you go ahead:** a task state saved with the player's progress, then the position check (327 tasks need only that), then the UI, then the events for the 141 that need new ones.
- **Check the numbers on a real city** before the first schedule goes out: the position and distance tasks assume the walking and driving speeds in the game.

## Files

| File | What it is |
| :--- | :--- |
| [task_catalogue.json](task_catalogue.json), [task_catalogue.csv](task_catalogue.csv) | the 898 tasks (generated) |
| [scripts/tasks/build-task-catalogue.mjs](../../scripts/tasks/build-task-catalogue.mjs) | the generator: `node scripts/tasks/build-task-catalogue.mjs [--seed N]` |
| [scripts/tasks/schedule.mjs](../../scripts/tasks/schedule.mjs) | `tasksForDay`, `tasksForWeek` |
| [tests/task-catalogue.test.mjs](../../tests/task-catalogue.test.mjs) | the checks: the count, unique titles, real names, Gold, nothing that pads figures, no repeats, the files match |
