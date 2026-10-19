// Contracts of a plot's outside (services/api/core.mjs updateBusiness and upgradeExterior; the prices are lib/game/claimPrice.js exteriorChangeQuote and
// lib/content/exteriorPrices.js; docs/monetization/pricing_analysis.md). The basic outside is free; a more elaborate one is paid for the rest of the lease.
const money = { type: 'number', minimum: 0 };
const line = { type: 'object', required: ['label', 'amount'], additionalProperties: false, properties: { label: { type: 'string', minLength: 1 }, amount: money } };

// The outside a building would have: floors, shape, colour style, wall colour, roof feature and what stands behind it. The server cleans it against the
// plot's own limits (lib/game/exterior.js cleanExterior), so only its shape is fixed here.
const exterior = {
  type: 'object',
  properties: {
    floors: { type: 'integer', minimum: 1, maximum: 20 },
    model: { type: ['string', 'null'] },
    palette: { type: 'string' },
    wallColor: { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$' },
    crown: { enum: ['none', 'beacon', 'dish', 'garden', 'dome', 'spire'] },
    crownColor: { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$' },
    back: { type: 'string' },
  },
};

// What changing the outside costs: its price a year before and after, the difference (added to the plot's value) and what to pay now for the rest of
// the lease (0 for a free change, else at least $0.50), with the priced parts of the new outside. The 402 'exterior_payment_required' answer to
// PATCH /plots/:id carries it as `quote`.
export const PLOT_EXTERIOR_QUOTE = {
  id: 'plot.exterior-quote',
  version: 1,
  schema: {
    type: 'object',
    required: ['before', 'after', 'diff', 'charge', 'lines'],
    additionalProperties: false,
    properties: { before: money, after: money, diff: { type: 'number' }, charge: money, lines: { type: 'array', items: line } },
  },
};

// POST /plots/:id/exterior: the owner pays for a more elaborate outside.
export const PLOT_EXTERIOR_UPGRADE = {
  id: 'plot.exterior-upgrade',
  version: 1,
  schema: { type: 'object', required: ['exterior'], additionalProperties: false, properties: { exterior } },
};

// Its answer: the plot with its new outside and what was paid (no payments set up), or Stripe's page to pay on (payments on: the outside is built once
// the payment arrives).
export const PLOT_EXTERIOR_UPGRADE_RESULT = {
  id: 'plot.exterior-upgrade.result',
  version: 1,
  schema: {
    anyOf: [
      { type: 'object', required: ['plot', 'paid'], additionalProperties: false, properties: { plot: { type: 'object', required: ['id', 'value', 'exterior'], properties: { id: { type: 'integer', minimum: 1 }, value: money, exterior: exterior } }, paid: money } },
      { type: 'object', required: ['checkout'], additionalProperties: false, properties: { checkout: { type: 'object', required: ['orderId', 'url', 'cents'], properties: { orderId: { type: 'integer', minimum: 1 }, url: { type: 'string' }, cents: { type: 'integer', minimum: 50 } } } } },
    ],
  },
};
