// Contracts of the plot economy's data (services/api/economy.mjs, lib/game/economy.js; docs/monetization/plot_economy_data.md): the server's claim
// hold, the steps the game sends, foot traffic in the presence ping, watching a plot, and the admin's report.
const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
const AREA = '^-?\\d{1,3}:-?\\d{1,3}$';
const count = { type: 'integer', minimum: 0 };
const rate = { type: ['number', 'null'], minimum: 0 };
const cents = { type: ['integer', 'null'], minimum: 0 };
const setup = {
  leaseDays: { type: 'integer', minimum: 1, maximum: 3650 },
  buildingType: { type: 'string', enum: ['shop', 'restaurant', 'office'] },
  exterior: { type: ['object', 'null'] },
};

// POST /plots/:id/hold (signed in): the setup the claim form shows, so the server can quote it. Every field is optional.
export const PLOT_HOLD = {
  id: 'economy.plot-hold',
  version: 1,
  schema: { type: 'object', properties: setup },
};
// ...and its answer: until when it is held for this account, and the price the server quotes for the setup (cents, and the term it is for).
export const PLOT_HOLD_RESULT = {
  id: 'economy.plot-hold.result',
  version: 1,
  schema: {
    type: 'object',
    required: ['plotId', 'until', 'secondsLeft', 'quote'],
    properties: {
      plotId: { type: 'integer', minimum: 1 },
      until: count,
      secondsLeft: { type: 'integer', minimum: 0, maximum: 900 },
      quote: { type: 'object', required: ['priceCents', 'termDays'], properties: { priceCents: cents, termDays: { type: ['integer', 'null'], minimum: 1 } } },
    },
  },
};
// GET /plots/:id/hold: whether a plot is held and for how long; never by whom. A 409 'held' answer to a hold, claim or take-over carries `secondsLeft` too.
export const PLOT_HOLD_STATE = {
  id: 'economy.plot-hold.state',
  version: 1,
  schema: { type: 'object', required: ['held', 'mine', 'secondsLeft'], additionalProperties: false, properties: { held: { type: 'boolean' }, mine: { type: 'boolean' }, secondsLeft: count } },
};

// POST /plots/:id/intent: a step the game sends. A price is never sent: a quote is priced by the server from the setup.
export const PLOT_INTENT = {
  id: 'economy.plot-intent',
  version: 1,
  schema: {
    type: 'object',
    required: ['step'],
    properties: { step: { type: 'string', enum: ['card_open', 'open', 'hold', 'quote'] }, visitor: { type: 'string', pattern: '^[A-Za-z0-9_-]{4,40}$' }, ...setup },
  },
};
export const PLOT_INTENT_RESULT = {
  id: 'economy.plot-intent.result',
  version: 1,
  schema: { type: 'object', required: ['recorded'], properties: { recorded: { type: 'boolean' }, verified: { type: 'boolean' }, priceCents: cents, termDays: { type: ['integer', 'null'] } } },
};

// POST /presence/ping: the visitor, and (optional) the areas of the map the game passed through outdoors since its last ping.
export const PRESENCE_PING = {
  id: 'economy.presence-ping',
  version: 1,
  schema: { type: 'object', required: ['visitor'], properties: { visitor: { type: 'string', pattern: '^[A-Za-z0-9_-]{4,40}$' }, areas: { type: 'array', maxItems: 16, items: { type: 'string', pattern: AREA } } } },
};

// GET, POST and DELETE /plots/:id/watch (signed in).
export const PLOT_WATCH = {
  id: 'economy.plot-watch',
  version: 1,
  schema: { type: 'object', required: ['watching'], additionalProperties: false, properties: { watching: { type: 'boolean' } } },
};

// GET /admin/economy: per tier, per district and in all.
const steps = (names) => ({ type: 'object', required: names, properties: Object.fromEntries(names.map((n) => [n, count])) });
const CONVERSIONS = ['cardToHold', 'holdToQuote', 'quoteToCheckout', 'checkoutToClaim', 'quoteToClaim', 'cardToClaim'];
const GROUP = {
  type: 'object',
  required: ['id', 'label', 'plots', 'occupied', 'vacant', 'vacancyRate', 'meanDaysEmpty', 'vacantForDays', 'visits', 'storeEntries', 'traffic', 'claim', 'takeover', 'orders', 'renewals', 'lapses', 'watchers', 'watchedPlots'],
  properties: {
    id: { type: 'string', pattern: '^(all|tier:(ordinary|prime|luxury|grand)|district:.+)$' },
    label: { type: 'string' },
    plots: count,
    occupied: count,
    vacant: count,
    vacancyRate: rate,
    meanDaysEmpty: { type: 'number', minimum: 0 },
    vacantForDays: { type: 'number', minimum: 0 },
    visits: count,
    storeEntries: count,
    traffic: { type: 'object', required: ['areas', 'passes', 'players'], properties: { areas: count, passes: count, players: count } },
    claim: {
      type: 'object',
      required: ['steps', 'conversion', 'medianQuoteCents'],
      properties: {
        steps: steps(['card_open', 'hold', 'quote', 'checkout', 'claimed', 'failed', 'abandoned']),
        conversion: { type: 'object', required: CONVERSIONS, properties: Object.fromEntries(CONVERSIONS.map((k) => [k, rate])) },
        medianQuoteCents: cents,
      },
    },
    takeover: steps(['cardOpens', 'attempts', 'quotes', 'checkouts', 'completions', 'failed', 'abandoned']),
    orders: steps(['started', 'paid', 'expired', 'refunded']),
    renewals: count,
    lapses: count,
    watchers: count,
    watchedPlots: count,
  },
};
// every key of the answer is required
const REPORT = {
  from: { type: 'string', pattern: DAY },
  to: { type: 'string', pattern: DAY },
  at: count,
  areaSize: { type: 'integer', minimum: 1 },
  total: GROUP,
  tiers: { type: 'array', maxItems: 4, items: GROUP },
  districts: { type: 'array', items: GROUP },
  topWatched: { type: 'array', maxItems: 10, items: { type: 'object', required: ['plotId', 'title', 'watchers', 'lease'], properties: { plotId: { type: 'integer', minimum: 1 }, title: { type: 'string' }, watchers: { type: 'integer', minimum: 1 }, lease: { type: 'string', enum: ['none', 'active', 'renewal', 'grace', 'open'] } } } },
  topAreas: { type: 'array', maxItems: 10, items: { type: 'object', required: ['area', 'passes', 'players', 'plots'], properties: { area: { type: 'string', pattern: AREA }, passes: count, players: count, plots: count } } },
};
export const ECONOMY_REPORT = {
  id: 'economy.report',
  version: 1,
  schema: { type: 'object', required: Object.keys(REPORT), properties: REPORT },
};
