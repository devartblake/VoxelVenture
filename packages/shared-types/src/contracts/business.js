// Contracts of the business pages and the owner's dashboard (server/api/business.mjs, server/api/conversions.mjs; docs/monetization/conversions.md).
// Each is { id, version, schema }; see docs/architecture/adr/0001-shared-package-boundaries.md for how versions change.
import { OUTCOME_FAMILIES, PROFILE_EVENT_KINDS, TRAFFIC_SOURCES } from '../enums.js';

const CLICK_ID = '^[A-Za-z0-9]{10,32}$';
const CAMPAIGN = '^[a-z0-9_-]{1,40}$';
const cents = { type: 'integer', minimum: 0 };
const centsOrNull = { type: ['integer', 'null'], minimum: 0 };

// POST /businesses/<slug>/events: what a page reports about a visitor (the server verifies it; anything else in the body is ignored).
export const PROFILE_EVENT = {
  id: 'business.profile-event',
  version: 1,
  schema: {
    type: 'object',
    required: ['kind', 'visitor'],
    properties: {
      kind: { type: 'string', enum: PROFILE_EVENT_KINDS },
      visitor: { type: 'string', pattern: '^[A-Za-z0-9_-]{4,40}$' },
      source: { type: 'string', enum: TRAFFIC_SOURCES },
      campaign: { type: 'string', pattern: CAMPAIGN },
      clickId: { type: 'string', pattern: CLICK_ID },
      ref: { type: 'string' },
    },
  },
};
export const PROFILE_EVENT_RESULT = {
  id: 'business.profile-event.result',
  version: 1,
  schema: { type: 'object', required: ['counted'], properties: { counted: { type: 'boolean' }, verified: { type: 'boolean' } } },
};

// POST /conversions from the business's server. The key goes in the Authorization header, never here (a body with `key` is refused).
export const PURCHASE_REPORT = {
  id: 'business.purchase-report',
  version: 1,
  schema: {
    type: 'object',
    required: ['business'],
    additionalProperties: false,
    properties: {
      business: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$' },
      click: { type: 'string', pattern: CLICK_ID },
      value: { type: 'integer', minimum: 0, maximum: 100000000 },
      order: { type: 'string', pattern: '^[A-Za-z0-9_.:#-]{1,64}$' },
    },
  },
};
export const PURCHASE_REPORT_RESULT = {
  id: 'business.purchase-report.result',
  version: 1,
  schema: { type: 'object', required: ['recorded'], properties: { recorded: { type: 'boolean' }, attributed: { type: 'boolean' }, duplicate: { type: 'boolean' }, reconciled: { type: 'boolean' } } },
};

// The owner's figures for one profile (GET /me/businesses -> profiles[].stats), the parts other code relies on.
export const OWNER_FIGURES = {
  id: 'business.owner-figures',
  version: 1,
  schema: {
    type: 'object',
    required: ['verified', 'impressions', 'views', 'qualified', 'storeEntries', 'ctaClicks', 'outcomes', 'revenue', 'spendCents', 'returnOnSpend'],
    properties: {
      verified: { type: 'boolean', enum: [true] },
      impressions: cents,
      views: cents,
      qualified: cents,
      storeEntries: cents,
      ctaClicks: cents,
      outcomes: {
        type: 'array',
        minItems: OUTCOME_FAMILIES.length,
        maxItems: OUTCOME_FAMILIES.length,
        items: { type: 'object', required: ['id', 'count', 'costCents'], additionalProperties: false, properties: { id: { type: 'string', enum: OUTCOME_FAMILIES }, count: cents, costCents: centsOrNull } },
      },
      revenue: {
        type: 'object',
        required: ['verifiedCents', 'unattributedCents', 'browserCents', 'browserReports'],
        properties: { verifiedCents: cents, unattributedCents: cents, browserCents: cents, browserReports: cents },
      },
      spendCents: cents,
      returnOnSpend: { type: ['number', 'null'], minimum: 0 },
      // Pro only (absent on the free plan)
      sources: { type: 'array', items: { type: 'object', required: ['id', 'views', 'ctaClicks', 'leads', 'purchases'], properties: { id: { type: 'string', enum: TRAFFIC_SOURCES } } } },
      campaigns: { type: 'array', items: { type: 'object', required: ['id', 'views', 'ctaClicks', 'leads', 'purchases'] } },
    },
  },
};

// POST /businesses/<slug>/inquiries: a meeting or quote request from a profile's form (server/api/conversions.mjs createInquiry). `website`
// is the hidden field only a robot fills in (the server thanks it and keeps nothing).
export const INQUIRY = {
  id: 'business.inquiry',
  version: 1,
  schema: {
    type: 'object',
    required: ['kind', 'name', 'email'],
    properties: {
      kind: { type: 'string', enum: ['meeting', 'quote'] },
      name: { type: 'string', minLength: 1, maxLength: 60 },
      email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', maxLength: 200 },
      phone: { type: 'string', pattern: '^[0-9 +().-]{5,30}$' },
      message: { type: 'string', maxLength: 1000 },
      preferred: { type: 'string', maxLength: 120 },
      visitor: { type: 'string', pattern: '^[A-Za-z0-9_-]{4,40}$' },
      website: { type: 'string', maxLength: 0 },
    },
  },
};
export const INQUIRY_RESULT = {
  id: 'business.inquiry.result',
  version: 1,
  schema: { type: 'object', required: ['sent'], properties: { sent: { type: 'boolean', enum: [true] }, id: { type: 'integer', minimum: 1 } } },
};
