// Contracts of the game's Gold, held by the server (services/api/gold.mjs; docs/architecture/backend.md, "Currency"). A request says what happened and never how much: there is no
// amount in any request below. Every answer carries the account's Gold after the change, which is the number the page shows.
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const count = { type: 'integer', minimum: 0 };
const position = { x: { type: 'number' }, z: { type: 'number' } };
const flags = { type: 'object', additionalProperties: { type: 'boolean' } };
const appearance = { type: 'object', properties: { shirt: { type: 'string' }, pants: { type: 'string' }, hat: { type: 'string' } } };

// POST /game/chest and POST /game/potd (with plotId): where the avatar says it is. The server works out where the chest or the plot is.
export const GAME_REACH = {
  id: 'game.reach',
  version: 1,
  schema: { type: 'object', required: ['x', 'z'], properties: { ...position, plotId: { type: 'integer', minimum: 1 } } },
};
// POST /game/star: which of the day's stars, and where the avatar says it is.
export const GAME_STAR = {
  id: 'game.star',
  version: 1,
  schema: { type: 'object', required: ['index', 'x', 'z'], properties: { index: { type: 'integer', minimum: 0, maximum: 2 }, ...position } },
};
// POST /game/fish: a cast id the page made (a cast counts once). The server rolls the fish.
export const GAME_FISH = { id: 'game.fish', version: 1, schema: { type: 'object', required: ['castId'], properties: { castId: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,64}$' } } } };
// POST /game/billboard/start and /complete, and POST /game/shop/buy (itemId).
export const GAME_BILLBOARD = { id: 'game.billboard', version: 1, schema: { type: 'object', required: ['billboardId'], properties: { billboardId: { type: 'string' } } } };
export const GAME_BUY = { id: 'game.buy', version: 1, schema: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string' } } } };

// The answer to a payment: what it paid and the balance after. `found` and `all` come with a star, `fish` and `capped` with a fish, `prize` with a raffle ticket.
export const GAME_PAID = {
  id: 'game.paid',
  version: 1,
  schema: {
    type: 'object',
    required: ['gold'],
    properties: {
      gold: count, paid: count, day, found: { type: 'array', items: count }, all: { type: 'boolean' },
      fish: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } } }, capped: { type: 'boolean' }, goldToday: count,
      prize: count, cost: count, owned: flags, appearance,
    },
  },
};

// GET /game/state: the server's whole view of one account's Gold and its daily progress. A guest gets { signedIn: false, day }.
export const GAME_STATE = {
  id: 'game.state',
  version: 1,
  schema: {
    type: 'object',
    required: ['signedIn', 'day'],
    properties: {
      signedIn: { type: 'boolean' }, day, gold: count, credits: count, owned: flags, appearance,
      daily: { type: 'object', properties: { chestDay: { type: ['string', 'null'] }, potdDay: { type: ['string', 'null'] }, huntDay: { type: ['string', 'null'] }, huntFound: { type: 'array', items: count } } },
      fishing: { type: 'object', properties: { day, goldToday: count, caught: { type: 'object', additionalProperties: count } } },
      completedQuests: flags,
    },
  },
};

// GET /game/ledger: the newest Gold movements, newest first.
export const GAME_LEDGER = {
  id: 'game.ledger',
  version: 1,
  schema: { type: 'object', required: ['ledger'], properties: { ledger: { type: 'array', items: { type: 'object', required: ['delta', 'reason', 'at'], properties: { delta: { type: 'integer' }, reason: { type: 'string' }, ref: { type: ['string', 'null'] }, at: count } } } } },
};

// GET /admin/currency/audit: every wallet against its ledger.
export const ADMIN_CURRENCY_AUDIT = {
  id: 'admin.currency-audit',
  version: 1,
  schema: {
    type: 'object',
    required: ['ok', 'accounts', 'mismatches'],
    properties: { ok: { type: 'boolean' }, accounts: count, mismatches: { type: 'array', items: { type: 'object', required: ['account', 'wallet', 'balance', 'ledger'], properties: { account: { type: 'string' }, wallet: { type: 'string', enum: ['gold', 'credits'] }, balance: { type: 'integer' }, ledger: {} } } } },
  },
};
