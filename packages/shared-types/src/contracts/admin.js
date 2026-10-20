// Contracts of the admin sign-in and the admin accounts (services/api/admin.mjs; docs/architecture/backend.md#admin-sign-in).
const id = { type: 'integer', minimum: 1 };
const time = { type: 'integer', minimum: 0 };
const username = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$' };
const password = { type: 'string', minLength: 12, maxLength: 200 };
const ADMIN = {
  type: 'object',
  required: ['id', 'username', 'createdAt', 'lastLoginAt', 'disabled'],
  properties: { id, username, createdAt: time, lastLoginAt: { type: ['integer', 'null'], minimum: 0 }, disabled: { type: 'boolean' } },
};

// POST /admin/session: signing in. Also the body of POST /admin/setup (with Authorization: Bearer ADMIN_TOKEN) and POST /admin/admins,
// where the password must be 12+ characters and not the username.
export const ADMIN_LOGIN = {
  id: 'admin.login',
  version: 1,
  schema: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 200 } } },
};

// The answer to POST /admin/session (which also sets the session cookie) and to GET /admin/session (401 not_signed_in without a session).
export const ADMIN_SESSION = {
  id: 'admin.session',
  version: 1,
  schema: {
    type: 'object',
    required: ['admin', 'expiresAt', 'idleExpiresAt'],
    properties: { admin: { type: 'object', required: ['id', 'username'], properties: { id, username } }, expiresAt: time, idleExpiresAt: time },
  },
};

// GET /admin/setup: whether the first admin account is still to be made (public: it tells the login page to point to /admin/setup).
export const ADMIN_SETUP_STATE = { id: 'admin.setup.state', version: 1, schema: { type: 'object', required: ['needed'], properties: { needed: { type: 'boolean' } } } };

// The answer to POST /admin/setup (409 already_set_up once any admin exists) and POST /admin/admins.
export const ADMIN_ACCOUNT = { id: 'admin.account', version: 1, schema: { type: 'object', required: ['admin'], properties: { admin: ADMIN } } };

// GET /admin/admins: every admin account (never a password or its hash); `me` is the asking admin (null with ADMIN_TOKEN).
export const ADMIN_ACCOUNTS = {
  id: 'admin.accounts',
  version: 1,
  schema: { type: 'object', required: ['admins', 'me'], properties: { admins: { type: 'array', items: ADMIN }, me: { type: ['integer', 'null'], minimum: 1 } } },
};

// POST /admin/password (a signed-in admin's own): the current password and the new one. Every other session of theirs ends.
export const ADMIN_PASSWORD_CHANGE = {
  id: 'admin.password-change',
  version: 1,
  schema: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string', maxLength: 200 }, newPassword: password } },
};
export const ADMIN_PASSWORD_CHANGE_RESULT = {
  id: 'admin.password-change.result',
  version: 1,
  schema: { type: 'object', required: ['ok', 'endedSessions'], properties: { ok: { type: 'boolean' }, endedSessions: { type: 'integer', minimum: 0 } } },
};

// PATCH /admin/admins/:id: { disabled }. The answer is ADMIN_ACCOUNT.
export const ADMIN_UPDATE = { id: 'admin.update', version: 1, schema: { type: 'object', required: ['disabled'], properties: { disabled: { type: 'boolean' } } } };

// GET /admin/presence: the presence server's /status, passed on to admins (the monitor page). The parts the page relies on.
export const ADMIN_PRESENCE = {
  id: 'admin.presence',
  version: 1,
  schema: {
    type: 'object',
    required: ['uptime', 'now', 'players', 'recentErrors'],
    properties: { uptime: { type: 'number', minimum: 0 }, now: time, players: { type: 'array', items: { type: 'object', required: ['id', 'name'] } }, recentErrors: { type: 'array', items: { type: 'object' } } },
  },
};
