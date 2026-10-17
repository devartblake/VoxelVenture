// What a game sends the presence server (services/multiplayer/server.mjs; the client is lib/net/multiplayer.js), protocol 2
// (docs/architecture/presence_scale.md; docs/architecture/adr/0004-presence-protocol-contracts.md). One contract per message `type`.
//
// How strictly the server holds a message to its contract (ADR 0004):
//   strict   hello and auth: checked against the contract when they arrive; one that does not fit is answered with `invalid`
//            (hello) or `auth.failed` / `bad_request` (auth) and goes no further
//   clamped  everything else, many times a second: the server keeps cleaning each field as it always has (types, ranges, lengths),
//            because a full check on every movement would cost more than it saves. The contracts still describe them, and the tests
//            hold the fixtures and the real traffic to them.
// Fields not listed are allowed and ignored (an older server must not refuse a newer client's extra field).

export const PRESENCE_PROTOCOL = 2; // the server's PROTOCOL; a `hello` with another major version is answered `protocol.unsupported`

const finite = { type: 'number' };
const colour = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const appearance = { type: 'object', properties: { shirt: { type: 'string', maxLength: 40 }, pants: { type: 'string', maxLength: 40 }, hat: { type: 'string', maxLength: 40 } } };
const vehicle = {
  type: ['object', 'null'],
  properties: { kind: { type: 'string', enum: ['car', 'boat'] }, boatKind: { type: ['string', 'null'] }, color: { type: ['string', 'null'] } },
};
const message = (type, schema, strict = false) => ({
  id: `presence.client.${type}`,
  version: 1,
  strict,
  schema: { type: 'object', required: ['type', ...(schema.required ?? [])], properties: { type: { type: 'string', enum: [type] }, ...schema.properties } },
});

export const PRESENCE_CLIENT = {
  // the first message, and again on moving to another city: who, where, which city, which device. `v` is the protocol the game speaks.
  hello: message('hello', {
    required: ['room'],
    properties: {
      v: { type: 'integer', minimum: 1, maximum: 99 },
      room: { type: 'string', minLength: 1, maxLength: 40 },
      name: { type: 'string' }, // any length: the server keeps the first 20 characters
      appearance,
      x: finite,
      z: finite,
      device: { type: 'object', properties: { ua: { type: 'string' }, screen: { type: 'string' }, touch: { type: 'boolean' }, url: { type: 'string' } } },
    },
  }, true),
  // a one-use sign-in ticket from the API (POST /messaging/ticket); `auth.clear` signs this connection out
  auth: message('auth', { required: ['ticket'], properties: { ticket: { type: 'string', minLength: 1, maxLength: 100 } } }, true),
  'auth.clear': message('auth.clear', { properties: {} }, true),
  // where the avatar is, several times a second
  state: message('state', {
    properties: { x: finite, z: finite, yaw: finite, moving: { type: 'boolean' }, emote: { type: ['string', 'null'], maxLength: 12 }, veh: vehicle },
  }),
  // the cars this player left parked (at most three)
  parked: message('parked', {
    required: ['cars'],
    properties: { cars: { type: 'array', maxItems: 3, items: { type: 'object', required: ['x', 'z'], properties: { x: finite, z: finite, yaw: finite, color: colour } } } },
  }),
  // a new name or outfit
  profile: message('profile', { properties: { name: { type: 'string' }, appearance } }),
  // a nearby line, with its own id so a retry is answered, not said twice (protocol 2)
  'chat.send': message('chat.send', {
    required: ['clientMessageId', 'text'],
    properties: { clientMessageId: { type: 'string', pattern: '^[\\w-]{8,64}$' }, channel: { type: 'string', enum: ['nearby'] }, text: { type: 'string' } },
  }),
  // the old form of a nearby line, with no answer (a game talking to an older server)
  chat: message('chat', { required: ['text'], properties: { text: { type: 'string' } } }),
  // the frame rate and what a frame costs, now and then
  perf: message('perf', { properties: { fps: finite, calls: finite, triangles: finite, geometries: finite, textures: finite } }),
  // an error the page caught (for the /admin monitor and the error log)
  error: message('error', {
    required: ['message'],
    properties: {
      kind: { type: 'string', maxLength: 30 },
      message: { type: 'string' },
      source: { type: 'string' },
      stack: { type: 'string' },
      url: { type: 'string' },
      count: { type: 'integer', minimum: 1 },
    },
  }),
};
