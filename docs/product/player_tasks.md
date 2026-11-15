# Player tasks: how they work

[All documentation](../README.md) · 2026-11-15 · the catalogue and its schedule are in [daily_weekly_tasks.md](daily_weekly_tasks.md); this page is what is built

The rule that governs all of it, from the owner: **the server holds every balance and verifies every task**, so nobody creates their own value. A page never says a task is done and never says how much it pays.

## What a player sees

- **Tasks** in the toolbar opens a panel with three tabs: **Today** (three tasks: one easy, one medium, one hard), **This week** (five: two easy, two medium, one hard) and **Collected**. Each task shows its progress bar (from the server), its tier and its Gold, and a **Collect** button that is enabled when the server says it is done.
- A **toast** appears when a task becomes ready, and again when it is collected.
- In the **profile** (the Account view) a "Tasks collected" section shows the totals (collected, Gold earned, best streak), the current streak, counts by category, and the latest collected tasks.
- **Guests** see the tasks but cannot collect ("Sign in to collect"): a guest earns nothing. Without a game server (the static demo) the panel says tasks need one.

## What the server does ([services/api/tasks.mjs](../../services/api/tasks.mjs))

| Step | How |
| :--- | :--- |
| **What is on offer** | the shared schedule ([lib/game/taskSchedule.js](../../lib/game/taskSchedule.js)) over the tasks the server can verify, for the account's own facts: a task needing a listing is offered only to someone with one, a "wear" task only to someone who owns the items. Showing a task to an account is recorded (`task_offers`) |
| **Progress** | never stored and never sent by a page: worked out again each time from the server's own records, inside the period ([lib/game/taskRules.js](../../lib/game/taskRules.js)) |
| **Collecting** | `POST /tasks/<id>/claim`: the server checks the task is one of this account's for this period, re-evaluates the goal, and pays the tier's Gold through the Gold wallet (ledger reason `task`). The unique key `(account, task, period)` means once. The request has no body that matters |
| **The profile** | `GET /me/tasks`: what was collected, newest first, paged, with totals, streaks and counts by category and cadence |
| **The admin** | `GET /admin/tasks`: per task, how many accounts were shown it, how many collected it, and who; the latest claims; how many tasks are dormant |

A period is a UTC day, or a Monday-to-Sunday UTC week (as Building of the Week's).

### What the server reads, per goal

| Records | Goals |
| :--- | :--- |
| its events table: the account's own visits, only those verified as a human's (a presence older than a few seconds, not a bot, not the owner, within the per-network daily cap) | visit a business, businesses of a district / kind / category / colour / value / name / flag, at a time of day by the city's clock, the tallest or most valuable of a district, districts, one of every kind |
| the Gold ledger, which the server writes when it pays | the chest, stars (and their kind), the Plot of the Day, fish and the Gold fishing paid |
| `hunt_wins`, written when the server pays the third star | winning the hunt on N days |
| the votes table, and the vote leaderboard | voting (for a district / kind / category / colour), visiting this week's winner or a place on the leaderboard |
| the wardrobe the server holds | wearing items (a wear task of only free items is never offered: everyone already wears them) |
| the account's earlier task claims | "finish N daily tasks", "this week's other tasks", streaks, "earn N Gold from tasks" |

## What is held back (dormant), and why

**770 of the 2,061 tasks are not offered today**, because the server cannot verify them from its own records and will not take a page's word:

| Count | Needs | Examples |
| ---: | :--- | :--- |
| 571 | **the avatar's position**: the server cannot see where an avatar is, only what a page reports | walk a road, reach a park, be in a district at dusk, a distance |
| 198 | **an event nobody records**: an emote, a chat message, time in a car, a boat or a plane, an owner's action, fishing on a particular lake | wave at someone, say hello in Nearby chat, land at an airport |
| 1 | a task done from nothing | "Blue tee with navy pants": the free default outfit |

So **1,291 tasks (823 daily, 468 weekly) are on offer today.** Each daily tier has its own pool (593 easy, 168 medium, 62 hard), so each hard daily task comes round once every 62 days; weekly: 74, 333 and 61.

**The way to unlock the 571:** the presence server (`services/multiplayer`) already sees every signed-in avatar's position. The API can ask it over the internal channel for the last observed position and for a short history, and verify "be here now" and walked-the-road tasks from that. That is phase 2 of [the currency work](../architecture/backend.md#currency-servicesapigoldmjs), and until it exists those tasks stay off.

## Limits to know about

- **Visits are verified, not proved.** A visit counts if the server's own checks pass (a human's presence, a per-network cap). A determined person with many networks can still inflate their own count; the Gold at stake is small (a task pays 5 to 120) and bounded per period.
- **Wear tasks** are checked at the moment you collect: you must own the items and be wearing them then.
- **What a task is** can change when the catalogue is regrown: ids are stable content hashes, so what was collected keeps its meaning, and a task that is retired shows in the history as "no longer offered".
- **The schedule is per account**, because what is eligible differs (a listing, an item): two players can be given different tasks on the same day.

## Files

| File | What it is |
| :--- | :--- |
| [lib/game/taskRules.js](../../lib/game/taskRules.js) | what a goal means, `supports(goal)`, `progressOf(goal, facts)` (pure; shared by the server and the pages) |
| [lib/game/taskSchedule.js](../../lib/game/taskSchedule.js) | `tasksForDay`, `tasksForWeek` (moved from `scripts/tasks/schedule.mjs`, which re-exports it) |
| [services/api/tasks.mjs](../../services/api/tasks.mjs) | the server: availability, facts, claims, history, the admin report |
| `task_claims`, `task_offers` | the tables (additive; see [currency_migration.md](../operations/currency_migration.md)) |
| [lib/data/tasks.js](../../lib/data/tasks.js), [lib/state/taskStore.js](../../lib/state/taskStore.js), [TasksView.jsx](../../apps/web/components/ui/panel/TasksView.jsx) | the page: reads and shows what the server says, asks the server to collect |
| `tests/player-tasks.test.mjs`, `player-tasks-rules.test.mjs`, `player-tasks-client.test.mjs` | the server, the rules (every goal shape) and the page |
