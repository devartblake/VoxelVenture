// Contracts of the cart (services/api/cart.mjs, docs/monetization/billing.md#the-cart): several purchases in one payment. A browser never sends a
// price: every line is priced on the server, when it is added and again at checkout.
const cents = { type: 'integer', minimum: 0 };
const id = { type: 'integer', minimum: 1 };
export const CART_KINDS = ['claim', 'takeover', 'renew', 'exterior', 'launch', 'pro', 'sponsored', 'stall', 'ad']; // 'ad' (an ad space) since 0.16.0

// POST /cart/items: a line to add. A plot line names the plot (and its setup in `input`, as the plot's own route takes it); a business product names
// the profile (`business`, its slug) and, for a sponsored week, the placement; a stall's booking is in `input`, as POST /market/book takes it. v2: an ad
// space (`kind: 'ad'`) names the billboard or banner (`slotId`), and its ad is in `input`, as POST /ads/:id/buy takes it.
export const CART_ITEM = {
  id: 'cart.item',
  version: 2,
  schema: {
    type: 'object',
    required: ['kind'],
    additionalProperties: false,
    properties: {
      kind: { type: 'string', enum: CART_KINDS },
      plotId: id,
      business: { type: 'string', pattern: '^[a-z0-9-]{1,48}$' },
      placement: { type: 'string', pattern: '^(discover|category:[a-z0-9-]{1,40}|district:[a-z0-9-]{1,40})$' },
      slotId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,60}$' },
      input: { type: 'object' },
    },
  },
};

const line = {
  type: 'object',
  required: ['id', 'kind', 'label', 'cents', 'discountCents', 'promoCents', 'previousCents', 'plotId', 'business', 'placement'],
  additionalProperties: false,
  properties: {
    id,
    kind: { type: 'string', enum: CART_KINDS },
    label: { type: 'string', minLength: 1 },
    cents, // what the line costs, the Pro discount already taken off
    discountCents: cents, // the Pro discount on this line (a plot lease or, v3, an ad space)
    promoCents: cents, // this line's share of the cart's promo code (v2)
    previousCents: { type: ['integer', 'null'], minimum: 0 }, // the price before checkout found it changed
    plotId: { type: ['integer', 'null'], minimum: 1 },
    business: { anyOf: [{ type: 'null' }, { type: 'object', required: ['slug', 'name'], properties: { slug: { type: 'string' }, name: { type: 'string' } } }] },
    placement: { type: ['string', 'null'] },
  },
};

// GET /cart (and the answer to DELETE /cart, DELETE /cart/items/:id, POST and DELETE /cart/promo, and inside the other answers as `cart`): the lines,
// the subtotal before the Pro discount, the discount, the promo code (v2: `promo`, null without one; `error` when it cannot be used on the cart now),
// the total (after the code), and what the minimum still needs (`missingCents`, on the total before the code; `ready` when it can be checked out).
// v3: a line can be an ad space (kind 'ad').
export const CART_VIEW = {
  id: 'cart.view',
  version: 3,
  schema: {
    type: 'object',
    required: ['items', 'count', 'plots', 'maxPlots', 'maxLines', 'subtotalCents', 'discountCents', 'promo', 'totalCents', 'minimumCents', 'missingCents', 'ready', 'feeSavedCents', 'payments', 'pending'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: line },
      count: cents,
      plots: cents,
      maxPlots: id,
      maxLines: id,
      subtotalCents: cents,
      discountCents: cents,
      promo: { anyOf: [{ type: 'null' }, { type: 'object', required: ['code', 'label', 'cents', 'error'], additionalProperties: false, properties: { code: { type: 'string' }, label: { type: ['string', 'null'] }, cents, error: { type: ['string', 'null'] } } }] },
      totalCents: cents,
      minimumCents: cents,
      missingCents: cents,
      ready: { type: 'boolean' },
      feeSavedCents: cents, // Stripe's fixed fee saved by paying once instead of once per line
      payments: { type: 'boolean' },
      pending: { anyOf: [{ type: 'null' }, { type: 'object', required: ['orderId', 'until'], properties: { orderId: id, until: cents } }] },
    },
  },
};
const promo = { type: 'object', required: ['code', 'cents'], additionalProperties: false, properties: { code: { type: 'string' }, cents } };
const withCart = (properties, required) => ({ type: 'object', required: [...required, 'cart'], properties: { ...properties, cart: { type: 'object' } } });

// The answer to POST /cart/items: the new line's id and the cart.
export const CART_ADD_RESULT = { id: 'cart.add.result', version: 1, schema: withCart({ added: id }, ['added']) };

// The answer to POST /cart/checkout: Stripe's page for the whole cart (payments on; `mode` is 'subscription' with Pro in the cart, else 'payment'),
// or, without payments, the lines done at once. v2: `promo` ({ code, cents }) when a promo code took something off; and `mode: 'free'` (cents 0,
// `free: true`, `url` the cart's paid page) when the code took everything off a cart without Pro: no Stripe session, every line done at once.
// v3: a line done can be an ad space (kind 'ad').
export const CART_CHECKOUT_RESULT = {
  id: 'cart.checkout.result',
  version: 3,
  schema: {
    anyOf: [
      {
        type: 'object',
        required: ['checkout'],
        additionalProperties: false,
        properties: {
          checkout: {
            anyOf: [
              { type: 'object', required: ['orderId', 'url', 'cents', 'mode'], additionalProperties: false, properties: { orderId: id, url: { type: 'string' }, cents: { type: 'integer', minimum: 50 }, mode: { enum: ['payment', 'subscription'] }, promo } },
              { type: 'object', required: ['orderId', 'url', 'cents', 'mode', 'free'], additionalProperties: false, properties: { orderId: id, url: { type: 'string' }, cents: { enum: [0] }, mode: { enum: ['free', 'subscription'] }, free: { enum: [true] }, promo } },
            ],
          },
        },
      },
      { type: 'object', required: ['done', 'cart'], additionalProperties: false, properties: { done: { type: 'array', items: { type: 'object', required: ['id', 'kind', 'label', 'cents'], properties: { id, kind: { enum: CART_KINDS }, label: { type: 'string' }, cents } } }, cart: { type: 'object' } } },
    ],
  },
};

// A checkout refused (409), nothing held: `cart_unavailable` with `problems` (which lines and why), `price_changed` with `changed` (the cart now shows the
// new prices; check out again to pay them), or `below_minimum` with `missingCents`. Each carries the cart as it is now.
export const CART_CHECKOUT_REFUSED = {
  id: 'cart.checkout.refused',
  version: 1,
  schema: {
    type: 'object',
    required: ['error', 'code', 'cart'],
    properties: {
      error: { type: 'string' },
      code: { enum: ['cart_unavailable', 'price_changed', 'below_minimum'] },
      problems: { type: 'array', items: { type: 'object', required: ['id', 'label', 'code', 'error'], additionalProperties: false, properties: { id, label: { type: 'string' }, code: { type: 'string' }, error: { type: 'string' } } } },
      changed: { type: 'array', items: { type: 'object', required: ['id', 'label', 'previousCents', 'cents'], additionalProperties: false, properties: { id, label: { type: 'string' }, previousCents: cents, cents } } },
      missingCents: id,
      cart: { type: 'object' },
    },
  },
};
