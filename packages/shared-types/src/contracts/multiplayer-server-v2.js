// What the presence server sends a game (services/multiplayer/server.mjs -> lib/net/multiplayer.js), protocol 2
// (docs/architecture/presence_scale.md; docs/architecture/adr/0004-presence-protocol-contracts.md). One contract per message `type`.
// tests/presence-contracts.test.mjs holds the server's real messages to these, so a change of shape fails CI.

const int = { type: 'integer' };
const finite = { type: 'number' };
const colour = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const appearance = { type: 'object', properties: { shirt: { type: 'string' }, pants: { type: 'string' }, hat: { type: 'string' } } };
const account = { type: 'object', required: ['id', 'username'], properties: { id: int, username: { type: 'string' } } };
const car = { type: 'object', required: ['x', 'z', 'yaw', 'color'], additionalProperties: false, properties: { x: finite, z: finite, yaw: finite, color: colour } };
const vehicle = {
  type: ['object', 'null'],
  required: ['kind', 'boatKind', 'color'],
  properties: { kind: { type: 'string', enum: ['car', 'boat'] }, boatKind: { type: 'string', enum: ['rowboat', 'sailboat', 'rowboat-large', 'fishing'] }, color: colour },
};
// a player as first seen (in `enter`) and in `profile`: `account` and `verified` come only from the API, never from what a client says
const player = {
  type: 'object',
  required: ['id', 'name', 'appearance', 'x', 'z', 'yaw', 'moving', 'emote', 'veh', 'parked', 'account', 'verified'],
  properties: {
    id: int,
    name: { type: 'string', minLength: 1, maxLength: 20 },
    appearance,
    x: finite,
    z: finite,
    yaw: finite,
    moving: { type: 'boolean' },
    emote: { type: ['string', 'null'], maxLength: 12 },
    veh: vehicle,
    parked: { type: 'array', maxItems: 3, items: car },
    account: { type: ['integer', 'null'] },
    verified: { type: 'boolean' },
  },
};
// what changed about a player, as a short array: [id, x, z, yaw, moving (0 or 1), emote (a name, or 0), vehicle ([kind, boatKind, colour], or 0)]
const moved = {
  type: 'array',
  minItems: 7,
  maxItems: 7,
  prefixItems: [
    int,
    finite,
    finite,
    finite,
    { type: 'integer', enum: [0, 1] },
    { anyOf: [{ type: 'string', minLength: 1, maxLength: 12 }, { type: 'integer', enum: [0] }] },
    { anyOf: [{ type: 'array', minItems: 3, maxItems: 3, prefixItems: [{ type: 'string', enum: ['car', 'boat'] }, { type: 'string' }, colour] }, { type: 'integer', enum: [0] }] },
  ],
};
const CHAT_REJECTED = ['bad_request', 'unavailable', 'empty', 'unauthenticated', 'rate_limited', 'content_rejected'];
const message = (type, schema) => ({
  id: `presence.server.${type}`,
  version: 1,
  schema: { type: 'object', required: ['type', ...(schema.required ?? [])], properties: { type: { type: 'string', enum: [type] }, ...schema.properties } },
});

export const PRESENCE_SERVER = {
  // the answer to hello: this connection's id, how many are in the city, how far players are sent, and what this server can do
  welcome: message('welcome', {
    required: ['protocol', 'id', 'online', 'view', 'features'],
    properties: {
      protocol: { type: 'integer', minimum: 1 },
      id: int,
      online: { type: 'integer', minimum: 1 },
      view: finite,
      features: {
        type: 'object',
        required: ['chat', 'accounts', 'guestChat', 'chatMax', 'chatRadius'],
        properties: { chat: { type: 'integer', enum: [0, 2] }, accounts: { type: 'boolean' }, guestChat: { type: 'boolean' }, chatMax: { type: 'integer', minimum: 1 }, chatRadius: finite },
      },
      account,
    },
  }),
  // ten times a second, only when something changed: who came into view (whole), who left (ids), what moved (short arrays)
  snapshot: message('snapshot', {
    required: ['players'],
    properties: { players: { type: 'array', items: moved }, enter: { type: 'array', minItems: 1, items: player }, exit: { type: 'array', minItems: 1, items: int } },
  }),
  // everyone in the city, roughly: how many, and a sample of dots for the map ([id, x, z])
  online: message('online', {
    required: ['n', 'dots'],
    properties: { n: { type: 'integer', minimum: 0 }, dots: { type: 'array', items: { type: 'array', minItems: 3, maxItems: 3, prefixItems: [int, finite, finite] } } },
  }),
  parked: message('parked', { required: ['id', 'cars'], properties: { id: int, cars: { type: 'array', maxItems: 3, items: car } } }),
  profile: message('profile', { required: ['player'], properties: { player } }),
  // something in the shared world changed (a claim, an ad): the game refreshes it
  world: message('world', { required: ['kind', 'ids'], properties: { kind: { type: 'string', minLength: 1, maxLength: 12 }, ids: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 40 } } } }),
  // a nearby line someone said
  chat: message('chat', {
    required: ['id', 'messageId', 'name', 'account', 'verified', 'text', 'x', 'z', 'at'],
    properties: { id: int, messageId: { type: 'string', minLength: 1 }, name: { type: 'string' }, account: { type: ['integer', 'null'] }, verified: { type: 'boolean' }, text: { type: 'string', minLength: 1 }, x: finite, z: finite, at: int },
  }),
  'chat.accepted': message('chat.accepted', { required: ['clientMessageId', 'messageId', 'at'], properties: { clientMessageId: { type: 'string' }, messageId: { type: 'string', minLength: 1 }, at: int } }),
  'chat.rejected': message('chat.rejected', {
    required: ['clientMessageId', 'code', 'message'],
    properties: { clientMessageId: { type: 'string' }, code: { type: 'string', enum: CHAT_REJECTED }, message: { type: 'string', minLength: 1 }, retryAfterMs: { type: 'integer', minimum: 1 } },
  }),
  // this account's inbox changed: the game fetches it from the API (nothing private goes through the presence server)
  'inbox.changed': message('inbox.changed', { required: ['eventId', 'conversationId'], properties: { eventId: { type: 'string' }, conversationId: { type: 'string' } } }),
  'auth.ok': message('auth.ok', { required: ['account'], properties: { account } }),
  'auth.failed': message('auth.failed', {
    required: ['code', 'message'],
    properties: { code: { type: 'string', enum: ['unavailable', 'rate_limited', 'unauthenticated', 'bad_request'] }, message: { type: 'string', minLength: 1 } },
  }),
  'auth.revoked': message('auth.revoked', { required: ['reason'], properties: { reason: { type: 'string', enum: ['signed_out', 'expired'] } } }),
  // a hello that does not fit its contract: what is wrong, and nothing else happens
  invalid: message('invalid', { required: ['of', 'errors'], properties: { of: { type: 'string' }, errors: { type: 'array', minItems: 1, items: { type: 'string' } } } }),
  // a hello in a protocol this server does not speak: the protocol it does speak; the connection is then closed (code 4002)
  'protocol.unsupported': message('protocol.unsupported', {
    required: ['protocol', 'supported', 'message'],
    properties: { protocol: { type: 'integer' }, supported: { type: 'array', minItems: 1, items: int }, message: { type: 'string', minLength: 1 } },
  }),
};
