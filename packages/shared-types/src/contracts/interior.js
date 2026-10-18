// Contracts of redesigned interiors (services/api/interiors.mjs; the checks are lib/content/interiorDesign.js, which must agree with these:
// tests/interior-api.test.mjs compares the node types and the limits).
const ID = '^[A-Za-z0-9_-]{1,64}$';
const ids = { type: 'array', items: { type: 'string', pattern: ID } };
const vec3 = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } };
// The node types. The last is spelt with an escape: tests/packages.test.mjs looks for the browser's global object by that name.
const TYPES = ['building', 'level', 'slab', 'zone', 'wall', 'item', 'stair', 'door', '\u0077indow'];

// One node of the design: a Pascal scene node of a type the inside of a building uses. An item names its furniture by catalogue id only;
// the client fills in the rest of the asset (model, thumbnail, dimensions) from the catalogue when it loads the design.
const node = {
  type: 'object',
  required: ['object', 'id', 'type', 'parentId', 'visible'],
  properties: {
    object: { enum: ['node'] },
    id: { type: 'string', pattern: ID },
    type: { enum: TYPES },
    parentId: { type: ['string', 'null'], pattern: ID },
    visible: { type: 'boolean' },
    children: ids,
    position: vec3,
    scale: vec3,
    level: { type: 'integer', minimum: 0, maximum: 11 },
    asset: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
  },
};

// A design as the server stores and serves it: the scene graph of the building's inside, with one building at its root.
export const INTERIOR_DESIGN = {
  id: 'interior.design',
  version: 1,
  schema: {
    type: 'object',
    required: ['nodes', 'rootNodeIds'],
    additionalProperties: false,
    properties: {
      nodes: { type: 'object', maxProperties: 2000, propertyNames: { type: 'string', pattern: ID }, additionalProperties: node },
      rootNodeIds: { ...ids, minItems: 1, maxItems: 1 },
    },
  },
};

// GET /plots/:id/interior, and the answer to PUT and DELETE: the design every visitor sees, or null for the generated interior.
// `revision` is 0 before the owner ever saved one; `version` is the version of interior.design the design fits.
export const INTERIOR_STATE = {
  id: 'interior.state',
  version: 1,
  schema: {
    type: 'object',
    required: ['plotId', 'version', 'design', 'revision', 'updatedAt'],
    additionalProperties: false,
    properties: {
      plotId: { type: 'integer', minimum: 1 },
      version: { enum: [1] },
      design: { anyOf: [{ type: 'null' }, INTERIOR_DESIGN.schema] },
      revision: { type: 'integer', minimum: 0 },
      updatedAt: { type: ['integer', 'null'], minimum: 0 },
    },
  },
};

// PUT /plots/:id/interior: the owner publishes a design, based on the revision they loaded (0 when there was none). An older revision is
// refused with 409 (stale_revision).
export const INTERIOR_SAVE = {
  id: 'interior.save',
  version: 1,
  schema: {
    type: 'object',
    required: ['design', 'revision'],
    additionalProperties: false,
    properties: {
      design: INTERIOR_DESIGN.schema,
      revision: { type: 'integer', minimum: 0 },
    },
  },
};
