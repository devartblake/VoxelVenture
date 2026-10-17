// A journey scenario (Track A of docs/architecture/external_voxel_repositories_adoption_plan.md; tests/agents/scenario.mjs runs them): who takes
// part, what exists before the journey starts, the business milestones it must reach in order, and its budgets. Repeatable: the same seed
// gives the same city, names and data. It holds no credentials and no real customer data: accounts are names only (the agents derive test
// passwords from the seed), and only the example domains are allowed for links.

const ref = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,30}$' }; // how the scenario names an account or a business
const EXAMPLE_HOST = '^([a-z0-9-]+\\.)*(example\\.(com|org|net)|[a-z0-9-]+\\.test)$'; // RFC 2606 names only: never a real business's site

export const TEST_SCENARIO = {
  id: 'test.scenario',
  version: 1,
  schema: {
    type: 'object',
    required: ['id', 'schemaVersion', 'seed', 'device', 'participants', 'milestones', 'timeoutMs'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', pattern: '^[a-z][a-z0-9-]{2,60}$' },
      schemaVersion: { type: 'integer', enum: [1] },
      title: { type: 'string', maxLength: 200 },
      // the city's seed (the API's API_SEED and the game's layout), and the seed of everything the journey makes up
      seed: { type: 'integer', minimum: 1 },
      device: {
        type: 'object',
        required: ['profile'],
        additionalProperties: false,
        properties: { profile: { type: 'string', enum: ['desktop', 'phone', 'none'] }, width: { type: 'integer', minimum: 320 }, height: { type: 'integer', minimum: 480 } },
      },
      participants: {
        type: 'array',
        minItems: 1,
        items: { type: 'object', required: ['role', 'ref'], additionalProperties: false, properties: { role: { type: 'string', enum: ['visitor', 'merchant', 'presence', 'admin'] }, ref } },
      },
      // what exists when the journey starts (made by the merchant agent through the API)
      accounts: { type: 'array', items: { type: 'object', required: ['ref', 'username'], additionalProperties: false, properties: { ref, username: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{2,19}$' } } } },
      businesses: {
        type: 'array',
        items: {
          type: 'object',
          required: ['ref', 'owner', 'name', 'category', 'cta'],
          additionalProperties: false,
          properties: {
            ref,
            owner: ref,
            name: { type: 'string', minLength: 2, maxLength: 60 },
            category: { type: 'string' },
            district: { type: 'string' },
            description: { type: 'string', maxLength: 600 },
            website: { type: 'string', pattern: '^https://([a-z0-9-]+\\.)*(example\\.(com|org|net)|[a-z0-9-]+\\.test)(/.*)?$' },
            cta: { type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { type: 'string' }, url: { type: 'string', pattern: '^https://([a-z0-9-]+\\.)*(example\\.(com|org|net)|[a-z0-9-]+\\.test)(/.*)?$' } } },
            building: { type: 'boolean' }, // claim a lot for it and link the 3D storefront
            coupon: { type: 'object', required: ['text', 'code', 'total'], additionalProperties: false, properties: { text: { type: 'string', maxLength: 60 }, code: { type: 'string', pattern: '^[A-Z0-9-]{3,16}$' }, total: { type: 'integer', minimum: 1, maximum: 1000 } } },
          },
        },
      },
      // the business milestones, in order: a failure names the milestone, not a CSS selector
      milestones: {
        type: 'array',
        minItems: 1,
        items: { type: 'object', required: ['id', 'title'], additionalProperties: false, properties: { id: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,60}$' }, title: { type: 'string', minLength: 3, maxLength: 160 } } },
      },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 1800000 },
      allowedExternalLinks: { type: 'array', items: { type: 'string', pattern: EXAMPLE_HOST } },
      budgets: {
        type: 'object',
        additionalProperties: false,
        properties: {
          consoleErrors: { type: 'integer', minimum: 0 }, // console errors allowed on the pages (0: none)
          milestoneMs: { type: 'integer', minimum: 100 }, // the longest one milestone may take
          firstRenderMs: { type: 'integer', minimum: 100 }, // from opening the city to its first frame
        },
      },
    },
  },
};
