# Server-held Gold: migration and staging rehearsal

[All documentation](../README.md) · 2026-11-15 · the design is in [backend.md, "Currency"](../architecture/backend.md#currency-servicesapigoldmjs)

The server now holds every balance (Gold and Credits). This page is what changes in the database, how to rehearse it, and what happens to players.

## What changes in the database

Additive only, made when the API starts (`services/api/db.mjs`, the same upgrade-in-place the other columns use). Nothing is renamed or dropped, and it is safe to run twice:

| Change | Why |
| :--- | :--- |
| `accounts.game_gold INTEGER NOT NULL DEFAULT 0` | the Gold balance. Every existing account starts at 0 |
| `game_gold_ledger` (unique `(account_id, key)`) | every Gold movement; the key is what makes a claim happen once |
| `game_inventory`, `game_profile` | what an account owns and wears |
| `game_timers` | when an ad quest was started (the server keeps the clock) |

`accounts.gold` and `gold_ledger` stay as they are: they are the **Credits** wallet (the name is from before there were two).

## The task tables (player tasks)

The same additive upgrade also creates `task_claims` (what an account collected: unique `(account_id, task_id, period_key)`, so a task is collected once per period) and `task_offers` (which tasks were shown to which account, for the admin's offered-versus-collected view). Nothing existing changes. Tasks pay through the same Gold ledger (`reason = 'task'`), so `npm run audit:currency` covers them; after the staging play also try: collect a task twice (the second is refused), and `GET /admin/tasks` as the admin.

## What happens to players

- Gold used to be saved only in each player's browser. **It is not imported**: a balance sent by a browser is exactly what would let someone print Gold. Every signed-in account starts with 0 Gold and earns it from the server. Say so in the release note: "Your Gold is now kept safely on the server, so it follows your account. Gold saved in your browser before this update is not carried over."
- What was bought (hats, shirts) lived in the browser too and starts again: the shop is open and prices are unchanged.
- Guests can look around but earn nothing; the game tells them to sign in.
- The day for the chest, the stars and the Plot of the Day is now the server's (UTC) day, so for players east or west of UTC the daily content changes at a different hour than before.

## Rehearse it on staging first

1. **Copy production's database to staging** (the restore rehearsal in [STAGING.md](../../deploy/STAGING.md) section 6: `staging.sh restore <backup>`), so the upgrade runs on real data.
2. **Before** deploying: `npm run audit:currency /srv/voxelventure-staging/data/voxelventure.db` (on the server, as `voxel`). The Credits wallets must already equal their ledgers (it prints `every wallet equals its ledger`). If it does not, stop and look: the new audit is checking something that was already wrong.
3. **Deploy to staging** (`deploy/push.ps1 staging -Deploy`). The API starts, the migration runs once. `journalctl -u voxelventure-staging-api` should show a normal start.
4. **Check the upgrade:** `sqlite3 /srv/voxelventure-staging/data/voxelventure.db ".schema accounts"` shows `game_gold`; `SELECT COUNT(*) FROM accounts WHERE game_gold <> 0` is 0.
5. **Run the audit again** (step 2's command): still clean.
6. **Play it** (staging has its own accounts): sign in, open the chest, collect a star, catch a fish, buy a hat, buy a raffle ticket; each moves the balance in the page and writes a row (`SELECT * FROM game_gold_ledger ORDER BY id DESC LIMIT 10`). Sign out: the Gold goes to nothing and the page says to sign in. Try the chest twice: the second is refused.
7. **Run the journeys** (STAGING.md section 4) and `npm run verify:live`.
8. **Run the audit once more** after the play: clean.

## Production

The same, in this order: backup (the deploy does it), deploy (`production.sh deploy`), `npm run audit:currency`, then the check in step 6 with your own account. To go back: `production.sh rollback` switches the release; the new tables are harmless to the old code (it ignores them), and the old pages' browser-held Gold is back too, which is why the rollback is a last resort.

## Keeping it honest

Run `npm run audit:currency` after every deploy and from a daily job. A mismatch means a balance changed without a ledger row (a bug or a hand edit in the database) and is the thing to investigate before anything else. The admin route `GET /admin/currency/audit` gives the same answer.
