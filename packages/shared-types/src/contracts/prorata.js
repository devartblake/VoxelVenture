// Refunds of unused time, pro rata (services/api/prorata.mjs, the rule in @voxelventure/business-core refunds.js,
// docs/monetization/billing.md#refunds-of-unused-time).
//
//   GET  /me/prorata                       what deleting the account would give back now (the confirmation screen's estimate)
//   GET  /businesses/:slug/prorata         what deleting that page would give back (its owner; the page's own orders: Pro, sponsored weeks)
//   GET  /admin/accounts/:id/prorata       the same for any account (?rules=1: as if closed for breaking the rules: nothing)
//   GET  /admin/billing/orders/:id/prorata one order's lines (a cart: each line; a running lease: with its later renewals)
//   POST /admin/accounts/:id/prorata       { reason }: refund every line's unused time, and end what was refunded
//   POST /admin/billing/orders/:id/prorata { reason }: the same for one order
const id = { type: 'integer', minimum: 1 };
const cents = { type: 'integer', minimum: 0 };
const days = { type: ['integer', 'null'], minimum: 0 };

export const PRORATA_LINE = {
  type: 'object',
  required: ['orderId', 'product', 'kind', 'label', 'paidCents', 'unusedDays', 'termDays', 'notStarted', 'cents', 'refund', 'why'],
  properties: {
    orderId: id,
    parentId: { type: ['integer', 'null'] },
    product: { type: 'string' },
    kind: { enum: ['lease', 'renewal', 'exterior', 'ad', 'sponsored', 'pro', 'market', 'launch', 'other'] },
    label: { type: 'string' },
    paidCents: cents, // what is left paid of the line (Pro: of the period paid now)
    unusedDays: days, // null: a stall not opened yet (all of it)
    termDays: days,
    notStarted: { type: 'boolean' },
    cents, // what goes back
    refund: { type: 'boolean' },
    why: { type: ['string', 'null'] }, // why nothing goes back
  },
};

export const PRORATA_PREVIEW = {
  id: 'prorata.preview',
  version: 1,
  schema: {
    type: 'object',
    required: ['totalCents', 'count', 'lines', 'minCents', 'at'],
    properties: { totalCents: cents, count: cents, lines: { type: 'array', items: PRORATA_LINE }, minCents: cents, at: { type: 'integer', minimum: 0 }, closedForRules: { type: 'boolean' } },
  },
};

export const PRORATA_REFUND = {
  id: 'prorata.refund',
  version: 1,
  schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 3, maxLength: 200 } } },
};

export const PRORATA_RESULT = {
  id: 'prorata.result',
  version: 1,
  schema: {
    type: 'object',
    required: ['totalCents', 'refunded', 'ended', 'warnings'],
    properties: {
      totalCents: cents,
      refunded: { type: 'array', items: { type: 'object', required: ['orderId', 'cents', 'unusedDays'], properties: { orderId: id, cents: { type: 'integer', minimum: 1 }, unusedDays: days, stripeRefund: { type: ['string', 'null'] } } } },
      ended: { type: 'array', items: { type: 'object', required: ['orderId', 'what'], properties: { orderId: id, what: { type: 'string' } } } },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  },
};
