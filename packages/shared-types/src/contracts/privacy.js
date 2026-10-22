// Contracts of the privacy fixes before the legal review (docs/monetization/policy_review.md section 3, gaps 2 and 8).

// No account numbers in public data (gap 8): a key naming one is refused wherever these shapes are used.
const noAccountNumbers = { pattern: '^(?!(ownerAccount|accountId|account_id|owner_account)$)' };

// A plot as the public sees it: an entry of GET /plots/state's `plots`, and GET /plots/:id (which has more of the generated facts). The owner's
// public name stays; their account number is never sent. `playerOwned`: a player leases it (not the city), so they can be messaged; `mine`: it is
// the signed-in caller's own (false for everyone else and when signed out), worked out by the server.
export const PLOT_PUBLIC = {
  id: 'plot.public',
  version: 1,
  schema: {
    type: 'object',
    required: ['id', 'owner', 'playerOwned', 'mine', 'title', 'value', 'visits'],
    propertyNames: noAccountNumbers,
    properties: {
      id: { type: 'integer', minimum: 1 },
      owner: { type: ['string', 'null'] },
      playerOwned: { type: 'boolean' },
      mine: { type: 'boolean' },
      title: { type: 'string' },
      value: { type: 'number', minimum: 0 },
      visits: { type: 'integer', minimum: 0 },
    },
  },
};

// An ad space as the public sees it: GET /ads's `slots`, GET /ads/:id, and /plots/state's `ads`. `mine` as for a plot; no account number.
export const AD_PUBLIC = {
  id: 'ad.public',
  version: 1,
  schema: {
    type: 'object',
    required: ['id', 'kind', 'mine', 'views', 'clicks', 'open'],
    propertyNames: noAccountNumbers,
    properties: { id: { type: 'string', minLength: 1 }, kind: { enum: ['billboard', 'banner'] }, mine: { type: 'boolean' }, views: { type: 'integer', minimum: 0 }, clicks: { type: 'integer', minimum: 0 }, open: { type: 'boolean' } },
  },
};

// PATCH /me: the account's email and its two email choices (gap 2). `notify`: the service notices (take-overs, leases, watched plots, stalls,
// requests). `newsletter`: the Plot of the Day, opt-in (false for every account until it is ticked), a separate consent. Any of the three.
export const ACCOUNT_SETTINGS = {
  id: 'account.settings',
  version: 1,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { email: { type: ['string', 'null'], maxLength: 120 }, notify: { type: 'boolean' }, newsletter: { type: 'boolean' } },
  },
};

// POST /newsletter/unsubscribe?token=<signed token> (the List-Unsubscribe-Post one-click, RFC 8058; no sign-in) and POST /leads/unsubscribe?token=
// (a public sign-up's): the answer; `already`: it was unsubscribed before (a second press is harmless). A token that is not valid is a 400 `bad_token`.
// GET on the same addresses changes nothing: it shows a page asking to confirm, whose button POSTs (with Accept: text/html it is answered with a page).
export const NEWSLETTER_UNSUBSCRIBE_RESULT = {
  id: 'newsletter.unsubscribe.result',
  version: 1,
  schema: { type: 'object', required: ['ok', 'unsubscribed', 'already'], additionalProperties: false, properties: { ok: { enum: [true] }, unsubscribed: { enum: [true] }, already: { type: 'boolean' } } },
};
