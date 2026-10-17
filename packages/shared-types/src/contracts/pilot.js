// Contracts of the pilot (services/api/pilot.mjs; docs/monetization/pilot.md): the merchant's weekly check-in, and the admin's dashboard.
const WEEK = '^\\d{4}-\\d{2}-\\d{2}$';
const count = { type: 'integer', minimum: 0 };

// POST /businesses/<slug>/pilot-feedback from the owner of a pilot business.
export const PILOT_FEEDBACK = {
  id: 'pilot.feedback',
  version: 1,
  schema: {
    type: 'object',
    required: ['rating', 'wouldPay'],
    properties: {
      rating: { type: 'integer', minimum: 1, maximum: 5 },
      wouldPay: { type: 'string', enum: ['yes', 'maybe', 'no'] },
      result: { type: 'string', maxLength: 500 },
      missing: { type: 'string', maxLength: 500 },
    },
  },
};

// GET /admin/pilot: the parts the admin page and the command line rely on.
const FIGURES = ['views', 'qualified', 'storeEntries', 'ctaClicks', 'leads', 'claims', 'redemptions', 'purchases', 'verifiedRevenueCents'];
const figures = Object.fromEntries(FIGURES.map((k) => [k, count]));
export const PILOT_SUMMARY = {
  id: 'pilot.summary',
  version: 1,
  schema: {
    type: 'object',
    required: ['weeks', 'currentWeek', 'totals', 'verdict', 'businesses'],
    properties: {
      weeks: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', pattern: WEEK } },
      currentWeek: { type: 'string', pattern: WEEK },
      totals: { type: 'object', required: ['activated', 'paidCents', ...FIGURES], properties: { activated: count, paidCents: count, ...figures } },
      verdict: {
        type: 'object',
        required: ['businesses', 'criteria', 'met', 'lifts'],
        properties: {
          businesses: count,
          met: count,
          lifts: { type: 'boolean' },
          criteria: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'object', required: ['id', 'kind', 'target', 'actual', 'met'], properties: { id: { type: 'string', enum: ['returning', 'interaction', 'paying', 'renewing', 'verifiedOnly'] }, kind: { type: 'string', enum: ['share', 'count', 'flag'] }, met: { type: 'boolean' } } } },
        },
      },
      businesses: {
        type: 'array',
        items: {
          type: 'object',
          required: ['slug', 'name', 'activated', 'weekly', 'totals', 'retention', 'returnedWeekly', 'interaction', 'paid', 'paidCents', 'renewed', 'feedback'],
          properties: {
            slug: { type: 'string' },
            activated: { type: 'boolean' },
            weekly: { type: 'array', items: { type: 'object', required: ['week', 'member', 'ownerActive', ...FIGURES], properties: { week: { type: 'string', pattern: WEEK }, member: { type: 'boolean' }, ownerActive: { type: 'boolean' }, ...figures } } },
            totals: { type: 'object', required: FIGURES, properties: figures },
            retention: { type: 'object', required: ['activeWeeks', 'completedWeeks'], properties: { activeWeeks: count, completedWeeks: count } },
            paidCents: count,
            feedback: { type: 'array', items: { type: 'object', required: ['week', 'rating', 'wouldPay'], properties: { week: { type: 'string', pattern: WEEK }, rating: { type: 'integer', minimum: 1, maximum: 5 }, wouldPay: { type: 'string', enum: ['yes', 'maybe', 'no'] } } } },
          },
        },
      },
    },
  },
};
