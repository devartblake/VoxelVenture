// Contracts of the privacy routes (services/api/privacy.mjs; docs/architecture/backend.md#privacy): an account's data export, deleting the account,
// an owner deleting a business page, and the admin's privacy requests.
const id = { type: 'integer', minimum: 1 };
const time = { type: 'integer', minimum: 0 };
const list = { type: 'array' };
const obj = { type: 'object' };

// GET /me/export (signed in; 3 a day, then 429 rate_limited) and GET /admin/accounts/:id/export (admin): everything the database holds about the
// account. The sections below are always there (an empty list when there is nothing); `notIncluded` names each table left out and why, and
// `summary` is the same in plain words, line by line. Never a password hash, a token, a network hash or card details.
export const PRIVACY_EXPORT = {
  id: 'privacy.export',
  version: 1,
  schema: {
    type: 'object',
    required: ['format', 'version', 'generatedAt', 'account', 'sessions', 'businesses', 'plots', 'plotHistory', 'orders', 'promoUses', 'cart', 'marketStalls', 'couponClaims', 'credits', 'feedbackPosted', 'newsletters', 'requestsSent', 'reportsMade', 'buildingOfTheWeek', 'watches', 'plotSteps', 'messaging', 'activity', 'emails', 'actionLog', 'notIncluded', 'summary'],
    properties: {
      format: { enum: ['voxelventure.account-export'] },
      version: { enum: [1] },
      generatedAt: time,
      account: {
        type: 'object',
        required: ['id', 'username', 'createdAt', 'email', 'emailVerified', 'notices', 'messageRequests', 'credits'],
        properties: { id, username: { type: 'string' }, createdAt: time, email: { type: ['string', 'null'] }, emailVerified: { type: 'boolean' }, notices: { type: 'boolean' }, messageRequests: { type: 'boolean' }, credits: { type: 'integer' }, deletedAt: { type: ['integer', 'null'] } },
      },
      sessions: { type: 'array', items: { type: 'object', required: ['startedAt', 'expiresAt', 'active'], additionalProperties: false, properties: { startedAt: { type: 'integer' }, expiresAt: time, active: { type: 'boolean' } } } },
      businesses: list,
      plots: list,
      plotHistory: list,
      orders: { type: 'array', items: { type: 'object', required: ['id', 'product', 'cents', 'status', 'createdAt'], properties: { id, product: { type: 'string' }, cents: { type: 'integer', minimum: 0 }, status: { type: 'string' }, createdAt: time } } },
      promoUses: list,
      cart: { type: ['object', 'null'] },
      marketStalls: list,
      couponClaims: list,
      credits: { type: 'object', required: ['balance', 'ledger'], properties: { balance: { type: 'integer' }, ledger: list } },
      feedbackPosted: list,
      newsletters: obj,
      requestsSent: list,
      reportsMade: list,
      buildingOfTheWeek: obj,
      watches: list,
      plotSteps: list,
      messaging: { type: 'object', required: ['requests', 'blocks', 'conversations', 'nearby'], properties: { requests: { type: 'boolean' }, blocks: list, conversations: list, nearby: list } },
      activity: obj,
      emails: list,
      actionLog: list,
      notIncluded: { type: 'array', items: { type: 'object', required: ['table', 'why'], properties: { table: { type: 'string' }, why: { type: 'string', minLength: 1 } } } },
      summary: { type: 'array', items: { type: 'string' } },
    },
  },
};

// POST /me/delete: the account's password again and its name typed (any case). 401 bad_password, 400 confirm_name, 429 after 5 wrong tries
// in 15 minutes, 502 when Stripe cannot refund unused time or cancel Pro and 503 when the messaging service is down (nothing is deleted then;
// a refund Stripe already made is kept and recorded, and is not made again).
export const PRIVACY_DELETE = {
  id: 'privacy.delete',
  version: 1,
  schema: { type: 'object', required: ['password', 'confirm'], properties: { password: { type: 'string', minLength: 1, maxLength: 100 }, confirm: { type: 'string', maxLength: 40 } } },
};

// POST /admin/accounts/:id/delete (admin, for a request by email): the account's name typed, and why. Version 2: `rules` true closes an account
// for breaking the rules, and then nothing is refunded for unused time.
export const PRIVACY_ADMIN_DELETE = {
  id: 'privacy.admin-delete',
  version: 2,
  schema: { type: 'object', required: ['confirm'], properties: { confirm: { type: 'string', maxLength: 40 }, reason: { type: 'string', maxLength: 200 }, rules: { type: 'boolean' } } },
};

const STATEMENT = { type: 'object', required: ['what', 'why'], properties: { what: { type: 'string' }, why: { type: 'string' } } };
// The answer to both: the account's new name (deleted-<id>), the plots released, and what was kept (and why) and removed. Version 2: `refunds`,
// the unused time refunded before the deletion (prorata.mjs): in all, and each line.
export const PRIVACY_DELETE_RESULT = {
  id: 'privacy.delete.result',
  version: 2,
  schema: {
    type: 'object',
    required: ['deleted', 'username', 'plotsReleased', 'businessesDeleted', 'proCancelled', 'refunds', 'kept', 'removed'],
    properties: {
      deleted: { enum: [true] },
      username: { type: 'string', pattern: '^deleted-\\d+' },
      plotsReleased: { type: 'array', items: id },
      businessesDeleted: { type: 'integer', minimum: 0 },
      proCancelled: { type: 'integer', minimum: 0 },
      refunds: { type: 'object', required: ['totalCents', 'lines'], properties: { totalCents: { type: 'integer', minimum: 0 }, lines: { type: 'array', items: { type: 'object', required: ['orderId', 'cents'], properties: { orderId: id, cents: { type: 'integer', minimum: 1 }, unusedDays: { type: ['integer', 'null'] } } } }, closedForRules: { type: 'boolean' } } },
      kept: { type: 'array', items: STATEMENT },
      removed: { type: 'array', items: { type: 'string' } },
    },
  },
};

// DELETE /businesses/:slug (the owner): the page is gone from its address, Discover and the sitemap, its plot unlinked, its Pro cancelled in Stripe.
export const BUSINESS_DELETE_RESULT = {
  id: 'business.delete.result',
  version: 1,
  schema: { type: 'object', required: ['deleted', 'slug', 'proCancelled', 'plotUnlinked'], properties: { deleted: { enum: [true] }, slug: { type: 'string' }, proCancelled: { type: 'boolean' }, plotUnlinked: { type: ['integer', 'null'] } } },
};

// GET /admin/privacy/accounts?q= (admin): accounts by number, name or email (exact, any case), for a privacy request by email.
export const PRIVACY_ACCOUNTS = {
  id: 'privacy.accounts',
  version: 1,
  schema: {
    type: 'object',
    required: ['accounts'],
    properties: {
      accounts: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'username', 'email', 'emailVerified', 'createdAt', 'deletedAt', 'businesses', 'plots', 'paidOrders'],
          properties: { id, username: { type: 'string' }, email: { type: ['string', 'null'] }, emailVerified: { type: 'boolean' }, createdAt: time, deletedAt: { type: ['integer', 'null'] }, businesses: { type: 'integer', minimum: 0 }, plots: { type: 'integer', minimum: 0 }, paidOrders: { type: 'integer', minimum: 0 } },
        },
      },
    },
  },
};
