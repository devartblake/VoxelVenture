// Contracts of Building of the Week (server/api/community.mjs, lib/game/buildingOfWeek.js; docs/product/community.md).
const WEEK = '^\\d{4}-\\d{2}-\\d{2}$';
const tally = {
  type: 'object',
  required: ['plotId', 'title', 'votes'],
  properties: { plotId: { type: 'integer', minimum: 1 }, title: { type: 'string' }, owner: { type: ['string', 'null'] }, votes: { type: 'integer', minimum: 1 }, slug: { type: ['string', 'null'] } },
};

// GET /votes and POST /vote: this player's votes, this week's leaders, last week's winner and when voting closes.
export const WEEKLY_VOTE = {
  id: 'community.weekly-vote',
  version: 1,
  schema: {
    type: 'object',
    required: ['week', 'signedIn', 'huntWon', 'allowed', 'votedFor', 'votesLeft', 'canVote', 'leaders', 'winner', 'endsAt'],
    properties: {
      week: { type: 'string', pattern: WEEK },
      signedIn: { type: 'boolean' },
      huntWon: { type: 'boolean' },
      allowed: { type: 'integer', minimum: 0, maximum: 2 },
      votedFor: { type: 'array', maxItems: 2, items: { type: 'integer', minimum: 1 } },
      votesLeft: { type: 'integer', minimum: 0 },
      canVote: { type: 'boolean' },
      leaders: { type: 'array', maxItems: 5, items: tally },
      winner: { type: ['object', 'null'], required: ['plotId', 'title', 'votes', 'week'], properties: { ...tally.properties, week: { type: 'string', pattern: WEEK } } },
      endsAt: { type: 'integer', minimum: 0 },
    },
  },
};
