// Contracts of paid ad spaces and of disputes and refunds (services/api/billing.mjs, docs/monetization/billing.md#ad-spaces and
// #disputes-and-partial-refunds). Since 0.16.0.
const cents = { type: 'integer', minimum: 0 };
const id = { type: 'integer', minimum: 1 };
const when = { type: ['integer', 'null'], minimum: 0 };
const text = { type: ['string', 'null'] };
const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };

// POST /ads/:id/buy: the ad for a billboard or banner. With payments on it books the space for its days through Stripe (the price is the server's:
// @voxelventure/business-core AD_SPACES, less the Pro discount); without, it is the free game's take-over (`expectedPrice`: the game price shown).
export const AD_BUY = {
  id: 'ad.buy',
  version: 1,
  schema: {
    type: 'object',
    required: ['advertiser', 'headline', 'color'],
    additionalProperties: false,
    properties: {
      advertiser: { type: 'string', minLength: 2, maxLength: 40 },
      headline: { type: 'string', minLength: 2, maxLength: 60 },
      tagline: { type: 'string', maxLength: 100 },
      url: { type: 'string', maxLength: 200 },
      color,
      expectedPrice: { type: 'number' },
      promoCode: { type: 'string', maxLength: 40 },
    },
  },
};

// What a slot says about booking it (inside each ad slot, `sale`): the price a booking of `days` costs, with Pro, and until when it is booked.
const sale = {
  type: 'object',
  required: ['cents', 'proCents', 'days', 'paidUntil', 'bookedUntil', 'bookedBy'],
  additionalProperties: false,
  properties: { cents: id, proCents: id, days: id, paidUntil: when, bookedUntil: when, bookedBy: { type: ['integer', 'null'] } },
};
const slot = { type: 'object', required: ['id', 'kind', 'label', 'ad', 'value', 'price', 'open', 'sale'], properties: { id: { type: 'string' }, kind: { enum: ['billboard', 'banner'] }, label: { type: 'string' }, ad: { type: ['object', 'null'] }, value: { type: 'number' }, price: { type: 'number' }, open: { type: 'boolean' }, sale } };

// Its answer: with payments on, Stripe's page (`checkout`; `free` when a promo code took everything off); without, the space taken over at once.
export const AD_BUY_RESULT = {
  id: 'ad.buy.result',
  version: 1,
  schema: {
    anyOf: [
      { type: 'object', required: ['checkout'], additionalProperties: false, properties: { checkout: { type: 'object', required: ['orderId', 'url', 'cents'], properties: { orderId: id, url: { type: 'string' }, cents, free: { enum: [true] }, promo: { type: 'object' } } } } },
      { type: 'object', required: ['slot', 'paidOut', 'previousAdvertiser'], properties: { slot, paidOut: { type: 'number' }, previousAdvertiser: text } },
    ],
  },
};

const STATUSES = ['pending', 'paid', 'expired', 'refunded', 'failed', 'charged_back'];
const order = {
  type: 'object',
  required: ['id', 'product', 'label', 'cents', 'status', 'refundedCents', 'disputeId', 'parentId'],
  properties: { id, product: { type: 'string' }, label: text, cents, status: { enum: STATUSES }, refundedCents: cents, disputeId: { type: ['integer', 'null'] }, parentId: { type: ['integer', 'null'] }, note: text },
};
const dispute = {
  type: 'object',
  required: ['id', 'stripeDispute', 'orderId', 'cents', 'reason', 'status', 'stripeStatus', 'paused', 'createdAt', 'closedAt'],
  additionalProperties: false,
  properties: {
    id,
    stripeDispute: { type: 'string' },
    orderId: { type: ['integer', 'null'] },
    label: text,
    accountId: { type: ['integer', 'null'] },
    cents,
    reason: text,
    status: { enum: ['open', 'won', 'lost'] },
    stripeStatus: text,
    // per line still paid when it opened: what was paused (`what`) and, once closed, what became of it (`after`)
    paused: { type: 'array', items: { type: 'object', required: ['order', 'product', 'what'], additionalProperties: false, properties: { order: id, product: { type: 'string' }, what: { type: 'string' }, after: { type: 'string' } } } },
    createdAt: cents,
    closedAt: when,
  },
};
const refund = {
  type: 'object',
  required: ['id', 'orderId', 'cents', 'full', 'source', 'at'],
  additionalProperties: false,
  properties: { id, orderId: id, parentId: { type: ['integer', 'null'] }, label: text, product: text, cents: id, full: { type: 'boolean' }, source: { enum: ['admin', 'system', 'stripe'] }, note: text, at: cents },
};

// GET /admin/billing/disputes: how many are open, every dispute (open first), and the refunds recorded (in full or in part, newest first).
export const BILLING_DISPUTES = {
  id: 'billing.disputes',
  version: 1,
  schema: { type: 'object', required: ['open', 'disputes', 'refunds'], additionalProperties: false, properties: { open: cents, disputes: { type: 'array', items: dispute }, refunds: { type: 'array', items: refund } } },
};

// GET /admin/billing/orders/:id: one order, the cart it is a line of (or null), its lines (a cart), its refunds and the disputes of its payment.
export const BILLING_ORDER = {
  id: 'billing.order',
  version: 1,
  schema: {
    type: 'object',
    required: ['order', 'cart', 'lines', 'refunds', 'disputes'],
    additionalProperties: false,
    properties: { order, cart: { anyOf: [{ type: 'null' }, order] }, lines: { type: 'array', items: order }, refunds: { type: 'array', items: refund }, disputes: { type: 'array', items: dispute } },
  },
};
