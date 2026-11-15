// Contracts of the player tasks (services/api/tasks.mjs; docs/product/daily_weekly_tasks.md). The server verifies every task from its own records and pays the tier's Gold:
// a request to collect carries nothing but the task in its address, and there is no amount, progress or "done" in any request.
const count = { type: 'integer', minimum: 0 };
const time = { type: 'integer', minimum: 0 };
const progress = { type: 'object', required: ['have', 'need', 'done'], properties: { have: count, need: { type: 'integer', minimum: 1 }, done: { type: 'boolean' } } };
const task = {
  type: 'object',
  required: ['id', 'cadence', 'category', 'title', 'text', 'tier', 'gold', 'period', 'progress', 'collected'],
  properties: {
    id: { type: 'string', pattern: '^[DW]-[A-Z]{3}-[0-9a-z]{8}$' }, cadence: { type: 'string', enum: ['daily', 'weekly'] }, category: { type: 'string' }, family: { type: 'string' },
    title: { type: 'string' }, text: { type: 'string' }, tier: { type: 'string', enum: ['easy', 'medium', 'hard'] }, gold: count,
    period: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, progress,
    collected: { type: ['object', 'null'], properties: { at: time, gold: count } },
  },
};

// GET /tasks: today's three tasks and this week's five for this account (a guest sees them with no progress and cannot collect).
export const TASKS_VIEW = {
  id: 'tasks.view',
  version: 1,
  schema: {
    type: 'object',
    required: ['signedIn', 'day', 'week', 'daily', 'weekly', 'summary'],
    properties: {
      signedIn: { type: 'boolean' }, day: { type: 'string' }, week: { type: 'string' }, daily: { type: 'array', items: task }, weekly: { type: 'array', items: task },
      summary: { type: 'object', required: ['collected', 'offered', 'gold'], properties: { collected: count, offered: count, gold: count } },
    },
  },
};

// The answer to POST /tasks/<id>/claim: what the server paid, the balance after, and the progress it worked out. Refusals (not_done, already_done, not_offered) are errors; not_done carries `progress`.
export const TASKS_CLAIM_RESULT = {
  id: 'tasks.claim-result',
  version: 1,
  schema: {
    type: 'object',
    required: ['paid', 'gold', 'task', 'period', 'progress'],
    properties: { paid: count, gold: count, task: { type: 'object', required: ['id', 'title', 'tier', 'gold'], properties: { id: { type: 'string' }, title: { type: 'string' }, tier: { type: 'string' }, gold: count } }, period: { type: 'string' }, progress },
  },
};

// GET /me/tasks: what an account has collected, newest first, and its totals.
export const TASKS_HISTORY = {
  id: 'tasks.history',
  version: 1,
  schema: {
    type: 'object',
    required: ['claims', 'next', 'totals'],
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'taskId', 'title', 'period', 'cadence', 'tier', 'category', 'gold', 'claimedAt'],
          properties: { id: { type: 'integer' }, taskId: { type: 'string' }, title: { type: 'string' }, period: { type: 'string' }, cadence: { type: 'string' }, tier: { type: 'string' }, category: { type: 'string' }, gold: count, claimedAt: time },
        },
      },
      next: { type: ['integer', 'null'] },
      totals: {
        type: 'object',
        required: ['collected', 'gold', 'bestStreak', 'currentStreak', 'byCategory', 'byCadence'],
        properties: { collected: count, gold: count, bestStreak: count, currentStreak: count, byCategory: { type: 'object', additionalProperties: count }, byCadence: { type: 'object', additionalProperties: count } },
      },
    },
  },
};

// GET /admin/tasks: how many accounts were shown and how many collected each task, who, and what the server cannot verify yet.
export const ADMIN_TASKS = {
  id: 'admin.tasks',
  version: 1,
  schema: {
    type: 'object',
    required: ['catalogue', 'collected', 'goldPaid', 'accounts', 'tasks', 'recent'],
    properties: {
      catalogue: { type: 'object', required: ['total', 'offered', 'dormant'], properties: { total: count, offered: count, dormant: count } },
      collected: count, goldPaid: count, accounts: count,
      tasks: { type: 'array', items: { type: 'object', required: ['id', 'offered', 'collected', 'gold', 'collectors'], properties: { id: { type: 'string' }, title: { type: ['string', 'null'] }, offered: count, collected: count, gold: count, collectors: { type: 'array', items: { type: 'string' } } } } },
      recent: { type: 'array', items: { type: 'object', required: ['taskId', 'gold', 'at', 'username'], properties: { taskId: { type: 'string' }, title: { type: ['string', 'null'] }, gold: count, at: time, username: { type: 'string' } } } },
    },
  },
};
