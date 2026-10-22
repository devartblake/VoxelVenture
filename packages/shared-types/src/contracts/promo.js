// Contracts of promo codes (services/api/promo.mjs, docs/monetization/billing.md#promo-codes): discount codes the owner makes in /admin/promos for
// VoxelVenture's own services. Not the merchants' coupons (contracts/business.js COUPON_*). A browser never sends an amount to charge: the server
// prices every code.
import { CART_KINDS } from './cart.js';

const cents = { type: 'integer', minimum: 0 };
const id = { type: 'integer', minimum: 1 };
const when = { type: ['integer', 'null'], minimum: 0 };
const codeText = { type: 'string', minLength: 1, maxLength: 64 };
// The product groups a code can cover (@voxelventure/business-core PROMO_GROUPS), and 'all'.
export const PROMO_GROUP_IDS = ['plots', 'outside', 'launch', 'pro', 'sponsored', 'market', 'ads']; // 'ads' (ad spaces) since 0.16.0: the contracts that list the groups or the kinds are v2
export const PROMO_KINDS = ['percent', 'amount'];
export const PROMO_STATUSES = ['active', 'inactive', 'expired', 'scheduled', 'used_up'];
export const PROMO_USE_STATUSES = ['reserved', 'redeemed', 'released', 'voided'];
// What a refused code says (every reason a guesser could learn from is the one generic promo_invalid).
export const PROMO_ERRORS = ['promo_invalid', 'promo_used', 'promo_not_applicable', 'promo_minimum', 'promo_rate_limited'];
const appliesTo = { type: 'array', minItems: 1, items: { enum: ['all', ...PROMO_GROUP_IDS] } };

// POST /promo/check: does this code work for a purchase of this kind (or, without `kind`, for anything)? `cents` (optional) is the price the page
// shows, only to check the minimum.
export const PROMO_CHECK = {
  id: 'promo.check',
  version: 2,
  schema: { type: 'object', required: ['code'], additionalProperties: false, properties: { code: codeText, kind: { enum: CART_KINDS }, cents: id } },
};

// Its answer, and what a code is to a player: what it takes off and what it covers (never its limits or who else used it).
const publicView = {
  type: 'object',
  required: ['code', 'kind', 'value', 'label', 'appliesTo', 'groups', 'minSubtotalCents', 'expiresAt'],
  additionalProperties: false,
  properties: {
    code: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9-]{2,31}$' },
    kind: { enum: PROMO_KINDS },
    value: id, // percent 1-100, or cents
    label: { type: 'string', minLength: 1 }, // "25% off", "$5 off"
    appliesTo,
    groups: { type: 'array', items: { enum: PROMO_GROUP_IDS } },
    minSubtotalCents: cents,
    expiresAt: when,
  },
};
export const PROMO_CHECK_RESULT = { id: 'promo.check.result', version: 2, schema: publicView };

// POST /cart/promo: a code for the cart (the answer is the cart, cart.view). Also `promoCode` on a single checkout's body.
export const PROMO_APPLY = { id: 'promo.apply', version: 1, schema: { type: 'object', required: ['code'], additionalProperties: false, properties: { code: codeText } } };

// A code refused (400, 409 promo_used, 429 promo_rate_limited with retryAfterMs); from the cart's routes with the cart as it is now.
export const PROMO_REFUSED = {
  id: 'promo.refused',
  version: 1,
  schema: { type: 'object', required: ['error', 'code'], properties: { error: { type: 'string' }, code: { enum: PROMO_ERRORS }, retryAfterMs: id, cart: { type: 'object' } } },
};

// POST /admin/promos (admin): one code (`code`, or generated) or `count` generated codes (a campaign). Defaults: percent, all products, one use per
// account, no total limit, no end.
export const PROMO_CREATE = {
  id: 'promo.create',
  version: 2,
  schema: {
    type: 'object',
    required: ['value'],
    additionalProperties: false,
    properties: {
      code: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9-]{2,31}$' },
      count: { type: 'integer', minimum: 1, maximum: 500 },
      prefix: { type: 'string', pattern: '^[A-Za-z0-9]{1,8}$' },
      kind: { enum: PROMO_KINDS },
      value: id,
      appliesTo,
      minSubtotalCents: cents,
      maxRedemptions: { type: ['integer', 'null'], minimum: 1 },
      perAccountLimit: id,
      startsAt: { type: ['integer', 'string', 'null'] },
      expiresAt: { type: ['integer', 'string', 'null'] },
      newCustomersOnly: { type: 'boolean' },
      campaign: { type: 'string', maxLength: 60 },
      note: { type: 'string', maxLength: 200 },
    },
  },
};

// PATCH /admin/promos/:id (admin): the limits, dates, minimum, new customers only, note and active. What a code takes off and covers cannot change.
export const PROMO_UPDATE = {
  id: 'promo.update',
  version: 1,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      active: { type: 'boolean' },
      maxRedemptions: { type: ['integer', 'null'], minimum: 1 },
      perAccountLimit: id,
      startsAt: { type: ['integer', 'string', 'null'] },
      expiresAt: { type: ['integer', 'string', 'null'] },
      minSubtotalCents: cents,
      newCustomersOnly: { type: 'boolean' },
      note: { type: ['string', 'null'], maxLength: 200 },
    },
  },
};

// A code as the admin sees it, with its usage: uses redeemed and reserved now, voided ones, what was taken off and what those orders brought in.
const adminView = {
  type: 'object',
  required: [...publicView.required, 'id', 'maxRedemptions', 'perAccountLimit', 'startsAt', 'newCustomersOnly', 'active', 'status', 'campaign', 'note', 'createdBy', 'createdAt', 'usage'],
  additionalProperties: false,
  properties: {
    ...publicView.properties,
    id,
    maxRedemptions: { type: ['integer', 'null'], minimum: 1 },
    perAccountLimit: id,
    startsAt: when,
    newCustomersOnly: { type: 'boolean' },
    active: { type: 'boolean' },
    status: { enum: PROMO_STATUSES },
    campaign: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    createdBy: { type: 'string' },
    createdAt: cents,
    usage: { type: 'object', required: ['redeemed', 'reserved', 'voided', 'discountedCents', 'revenueCents'], additionalProperties: false, properties: { redeemed: cents, reserved: cents, voided: cents, discountedCents: cents, revenueCents: cents } },
  },
};
export const PROMO_VIEW = { id: 'promo.view', version: 2, schema: adminView };
// GET /admin/promos and the answer to POST /admin/promos (`promos`); PATCH answers { promo }.
export const PROMO_LIST = { id: 'promo.list', version: 2, schema: { type: 'object', required: ['promos'], additionalProperties: false, properties: { promos: { type: 'array', items: adminView } } } };
// GET /admin/promos/:id: the code and every use of it.
export const PROMO_DETAIL = {
  id: 'promo.detail',
  version: 2,
  schema: {
    type: 'object',
    required: ['promo', 'redemptions'],
    additionalProperties: false,
    properties: {
      promo: adminView,
      redemptions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'accountId', 'username', 'orderId', 'product', 'label', 'orderCents', 'orderStatus', 'centsOff', 'status', 'at', 'updatedAt'],
          additionalProperties: false,
          properties: { id, accountId: id, username: { type: 'string' }, orderId: id, product: { type: 'string' }, label: { type: ['string', 'null'] }, orderCents: cents, orderStatus: { type: 'string' }, centsOff: cents, status: { enum: PROMO_USE_STATUSES }, at: cents, updatedAt: cents },
        },
      },
    },
  },
};
