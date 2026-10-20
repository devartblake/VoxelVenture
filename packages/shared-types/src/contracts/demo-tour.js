// A guided demo of the city (the "Deterministic demos" row of docs/architecture/external_voxel_repositories_adoption_plan.md section 17): an ordered
// list of stops the game's tour player (apps/web/components/tour/) flies through and scripts/tour-record.mjs records. It sits next to the
// journeys' `test.scenario` and follows its rules: a seed makes it repeatable (the same city, the same businesses, the same figures), it holds no
// credentials and no real customer data, and it is declarative (what to show and say, never code or selectors). A tour only ever looks: its
// actions open cards, rooms, previews and the public pages, never a form that buys or changes anything (docs/product/pilot_tour.md).

const FOLLOW_VIEWS = ['diablo', 'third', 'tactical', 'overview', 'top']; // lib/state/viewStore.js PRESETS that follow a point (not the iso map or first person)
const plotId = { type: 'integer', minimum: 0 };
// a public page of the site, never an outside link: Discover, a business page, a category or a district, and optionally a section of it
// (#sponsored). Not the owner's pages (/business/manage, /business/new). The tour adds ?tour=<id> itself.
const PUBLIC_PATH = '^/(discover|business/(?!(manage|new)(#|$))[a-z0-9-]{1,80}|category/[a-z0-9-]{1,40}|district/[a-z0-9-]{1,40})(#[a-z][a-z0-9-]{0,40})?$';

export const DEMO_TOUR = {
  id: 'demo.tour',
  version: 1,
  schema: {
    type: 'object',
    required: ['id', 'schemaVersion', 'title', 'seed', 'stops'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,30}$' }, // what ?tour=<id> names
      schemaVersion: { type: 'integer', enum: [1] },
      title: { type: 'string', minLength: 3, maxLength: 80 },
      description: { type: 'string', maxLength: 400 },
      // the city's seed (as test.scenario's): the plots, businesses and figures the stops name are the ones this seed makes
      seed: { type: 'integer', minimum: 1 },
      stops: {
        type: 'array',
        minItems: 1,
        maxItems: 30,
        items: {
          type: 'object',
          required: ['id', 'title', 'text', 'target', 'camera', 'durationMs'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,40}$' },
            // the caption, in the business owner's words: a short title and one or two sentences
            title: { type: 'string', minLength: 3, maxLength: 60 },
            text: { type: 'string', minLength: 10, maxLength: 240 },
            // where the camera looks: a plot, a district (the middle of its plots), a named place ('center' or a mega mall's id) or a point
            target: {
              anyOf: [
                { type: 'object', required: ['plot'], additionalProperties: false, properties: { plot: plotId } },
                { type: 'object', required: ['district'], additionalProperties: false, properties: { district: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,30}$' } } },
                { type: 'object', required: ['place'], additionalProperties: false, properties: { place: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,30}$' } } },
                { type: 'object', required: ['x', 'z'], additionalProperties: false, properties: { x: { type: 'number' }, z: { type: 'number' } } },
              ],
            },
            // how it looks: a view preset, then its distance (world units), pitch (radians above the ground) and heading (degrees clockwise from
            // north the camera looks towards, or 'front': facing the target plot's door)
            camera: {
              type: 'object',
              required: ['view'],
              additionalProperties: false,
              properties: {
                view: { type: 'string', enum: FOLLOW_VIEWS },
                distance: { type: 'number', minimum: 6, maximum: 180 },
                pitch: { type: 'number', minimum: 0.25, maximum: 1.52 },
                heading: { anyOf: [{ type: 'number', minimum: 0, maximum: 360 }, { type: 'string', enum: ['front'] }] },
              },
            },
            // what opens when the camera arrives (optional): all of them only show
            action: {
              anyOf: [
                { type: 'object', required: ['kind', 'plot'], additionalProperties: false, properties: { kind: { type: 'string', enum: ['card', 'interior', 'claim'] }, plot: plotId } },
                { type: 'object', required: ['kind', 'path'], additionalProperties: false, properties: { kind: { type: 'string', enum: ['page'] }, path: { type: 'string', pattern: PUBLIC_PATH } } },
                { type: 'object', required: ['kind', 'plot'], additionalProperties: false, properties: { kind: { type: 'string', enum: ['dashboard', 'cart'] }, plot: plotId, claimPlot: plotId } },
              ],
            },
            durationMs: { type: 'integer', minimum: 3000, maximum: 60000 }, // how long the stop stays before the tour moves on by itself
          },
        },
      },
    },
  },
};
