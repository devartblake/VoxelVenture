// Contracts of the cart (services/api/cart.mjs, docs/monetization/billing.md#the-cart): several purchases in one payment. A browser never sends a
// price: every line is priced on the server, when it is added and again at checkout.
const cents = { type: 'integer', minimum: 0 };
const id = { type: 'integer', minimum: 1 };
export const CART_KINDS = ['claim', 'takeover', 'renew', 'exterior', 'launch', 'pro', 'sponsored', 'stall'];

// POST /cart/items: a line to add. A plot line names the plot (and its setup in `input`, as the plot's own route takes it); a business product names
// the profile (`business`, its slug) and, for a sponsored week, the placement; a stall's booking is in `input`, as POST /market/book takes it.
export const CART_ITEM = {
  id: 'cart.item',
  version: 1,
  schema: {
    type: 'object',
    required: ['kind'],
    additionalProperties: false,
    properties: {
      kind: { type: 'string', enum: CART_KINDS },
      plotId: id,
      business: { type: 'string', pattern: '^[a-z0-9-]{1,48}$' },
      placement: { type: 'string', pattern: '^(discover|category:[a-z0-9-]{1,40}|district:[a-z0-9-]{1,40})$' },
      input: { type: 'object' },
    },
  },
};

const line = {
  type: 'object',
  required: ['id', 'kind', 'label', 'cents', 'discountCents', 'previousCents', 'plotId', 'business', 'placement'],
  additionalProperties: false,
  properties: {
    id,
    kind: { type: 'string', enum: CART_KINDS },
    label: { type: 'string', minLength: 1 },
    cents, // what the line costs, the Pro discount already taken off
    discountCents: cents, // the Pro plot discount on this line
    previousCents: { type: ['integer', 'null'], minimum: 0 }, // the price before checkout found it changed
    plotId: { type: ['integer', 'null'], minimum: 1 },
    business: { anyOf: [{ type: 'null' }, { type: 'object', required: ['slug', 'name'], properties: { slug: { type: 'string' }, name: { type: 'string' } } }] },
    placement: { type: ['string', 'null'] },
  },
};

// GET /cart (and the answer to DELETE /cart, DELETE /cart/items/:id, and inside the other answers as `cart`): the lines, the subtotal before the
// Pro discount, the discount, the total, and what the minimum still needs (`missingCents`; `ready` when it can be checked out).
export const CART_VIEW = {
  id: 'cart.view',
  version: 1,
  schema: {
    type: 'object',
    required: ['items', 'count', 'plots', 'maxPlots', 'maxLines', 'subtotalCents', 'discountCents', 'totalCents', 'minimumCents', 'missingCents', 'ready', 'feeSavedCents', 'payments', 'pending'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: line },
      count: cents,
      plots: cents,
      maxPlots: id,
      maxLines: id,
      subtotalCents: cents,
      discountCents: cents,
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
const withCart = (properties, required) => ({ type: 'object', required: [...required, 'cart'], properties: { ...properties, cart: { type: 'object' } } });

// The answer to POST /cart/items: the new line's id and the cart.
export const CART_ADD_RESULT = { id: 'cart.add.result', version: 1, schema: withCart({ added: id }, ['added']) };

// The answer to POST /cart/checkout: Stripe's page for the whole cart (payments on; `mode` is 'subscription' with Pro in the cart, else 'payment'),
// or, without payments, the lines done at once.
export const CART_CHECKOUT_RESULT = {
  id: 'cart.checkout.result',
  version: 1,
  schema: {
    anyOf: [
      { type: 'object', required: ['checkout'], additionalProperties: false, properties: { checkout: { type: 'object', required: ['orderId', 'url', 'cents', 'mode'], additionalProperties: false, properties: { orderId: id, url: { type: 'string' }, cents: { type: 'integer', minimum: 50 }, mode: { enum: ['payment', 'subscription'] } } } } },
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
