// The plot economy's data (docs/monetization/plot_economy_data.md): what the game and the server agree on (the browser, the API and the tests
// share it).
//
// Areas. Foot traffic is counted per AREA: a square of the city map AREA_SIZE units on a side (24: about a block, 7 plots in the middle of town),
// numbered by its column and row ('-2:3'). A plot belongs to the area its centre is in. The grid needs no street data, so it never changes when the
// street plan does, and the game, the API and the report all work it out the same way from a position.
export const AREA_SIZE = 24;
export const AREA_LIMIT = 100; // columns and rows from -100 to 100: well beyond the city
export const areaOf = (x, z) => `${Math.floor(Number(x) / AREA_SIZE)}:${Math.floor(Number(z) / AREA_SIZE)}`;
export function isAreaId(id) {
  const m = /^(-?\d{1,3}):(-?\d{1,3})$/.exec(String(id ?? ''));
  return Boolean(m) && Math.abs(Number(m[1])) <= AREA_LIMIT && Math.abs(Number(m[2])) <= AREA_LIMIT && !/^-0/.test(m[1]) && !/^-0/.test(m[2]);
}
// The game samples the player's position every SAMPLE_MS while they are outdoors, and sends the areas passed since the last presence ping with
// it (at most MAX_AREAS_PER_PING; a car crosses a few areas in 15 seconds).
export const SAMPLE_MS = 2000;
export const MAX_AREAS_PER_PING = 16;

// Claim intent. Each step a player takes towards a plot is one row of plot_intents. `kind` is 'claim' (an empty plot) or 'takeover' (a business
// open to a buyout).
//   card_open   the plot's card was opened (sent by the game, signed in or not)
//   open        the take-over form was opened (sent by the game; signed in only)
//   hold        the player started setting the plot up (the server hold: with a game server a player signs in before setting a plot up)
//   quote       the price the claim form showed, with its term (priced by the server from the setup, never sent as a number)
//   checkout    a payment was started (with payments on)
//   claimed / taken_over   it happened
//   failed      the claim or take-over was refused (somebody else was first, the price changed, the lease protects it)
//   abandoned   a server hold ended without a claim (it ran out, was let go, or the player held another plot)
export const INTENT_STEPS = ['card_open', 'open', 'hold', 'quote', 'checkout', 'claimed', 'taken_over', 'failed', 'abandoned'];
// the steps the game sends itself (POST /plots/:id/intent); every other step is recorded by the server where it happens. Setting a plot up
// needs an account, so only `card_open` is taken from a visitor who is not signed in.
export const CLIENT_STEPS = ['card_open', 'open'];
export const SIGNED_IN_STEPS = ['open'];
// the funnel of a claim, in order, and of a take-over
export const CLAIM_FUNNEL = ['card_open', 'hold', 'quote', 'checkout', 'claimed'];
export const TAKEOVER_FUNNEL = ['card_open', 'open', 'quote', 'checkout', 'taken_over'];

// The server's claim hold: three minutes (lib/game/claimHold.js) from the last time the player touched the setup, never more than
// HOLD_MAX_SECONDS from its start (so a plot cannot be sat on by refreshing it).
export { HOLD_SECONDS } from './claimHold';
export const HOLD_MAX_SECONDS = 15 * 60;

// "Watch this plot": at most this many plots per account.
export const MAX_WATCHES = 20;
