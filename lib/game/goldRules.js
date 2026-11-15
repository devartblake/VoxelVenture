// The rules of the game's Gold that the SERVER applies (services/api/gold.mjs) and the pages only show: nobody types an amount, the server works each one out from
// these and from the game's own tables (the cosmetics' prices, the fish, the chest and hunt formulas in daily.js). Pure, so it is tested in Node.
//
// Gold is the game's currency (chest, Plot of the Day, hunt stars, fishing, ad quests, tasks, the wardrobe, the raffle). Credits are the other wallet: the server's money for
// visit quests. Both balances live only on the server (docs/architecture/backend.md, "Currency").

export const BILLBOARD_QUEST_SECONDS = 10; // looking at an ad for this long pays once per billboard
export const BILLBOARD_QUEST_GOLD = 25;

// How near the avatar must be, in city units, for the server to accept that it reached a chest, a star or the Plot of the Day. The pages trigger these at about 1.1 to 1.2
// units, so this leaves room for lag. The position is REPORTED by the page ("reported" evidence); see the docs for what that does and does not prove.
export const CLAIM_RADIUS = 8;
export const PLOT_CLAIM_RADIUS = 16; // from the middle of a building (the door is about half its depth away)
// The fastest anything can move (a plane), in units a second: two claims further apart than this allows are refused.
export const MAX_SPEED = 60;
// The shortest time between two fish (the line takes at least FISHING.waitMin seconds to bite).
export const FISH_MIN_GAP_MS = 3000;
export const RAFFLE_MIN_GAP_MS = 1000;

/** The wallets a ledger reason moves: every Gold reason the server writes. */
export const GOLD_REASONS = ['chest', 'potd', 'star', 'hunt_bonus', 'fish', 'billboard', 'task', 'buy', 'raffle_ticket', 'raffle_prize'];

/** "2026-11-14" (UTC). The server's day is the only day: the page reads it from /game/state, so a clock set wrong cannot move the chest. */
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const dayStart = (day) => Date.parse(`${day}T00:00:00Z`);
