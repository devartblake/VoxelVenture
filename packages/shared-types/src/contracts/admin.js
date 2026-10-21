// Contracts of the admin sign-in and the admin accounts (services/api/admin.mjs; docs/architecture/backend.md#admin-sign-in).
const id = { type: 'integer', minimum: 1 };
const time = { type: 'integer', minimum: 0 };
const username = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$' };
const password = { type: 'string', minLength: 8, maxLength: 200 }; // the full rule: lib/data/adminPassword.js
const email = { type: ['string', 'null'], maxLength: 120 };
// version 2 of admin.account and admin.accounts: `email` (the address password reset links go to; shown to admins only) and `emailVerified`
const ADMIN = {
  type: 'object',
  required: ['id', 'username', 'createdAt', 'lastLoginAt', 'disabled', 'email', 'emailVerified'],
  properties: { id, username, createdAt: time, lastLoginAt: { type: ['integer', 'null'], minimum: 0 }, disabled: { type: 'boolean' }, email, emailVerified: { type: 'boolean' } },
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
export const ADMIN_ACCOUNT = { id: 'admin.account', version: 2, schema: { type: 'object', required: ['admin'], properties: { admin: ADMIN } } };

// GET /admin/admins: every admin account (never a password or its hash); `me` is the asking admin (null with ADMIN_TOKEN).
export const ADMIN_ACCOUNTS = {
  id: 'admin.accounts',
  version: 2,
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

// ---- a forgotten password (docs/architecture/backend.md#admin-password-reset)
const linkToken = { type: 'string', minLength: 1, maxLength: 100 }; // the one-use link's value (after "#token=")

// POST /admin/password-reset/request: a username or a confirmed email. The answer is always the same (ADMIN_RESET_REQUEST_RESULT), whether
// the account exists or not; 429 rate_limited after 10 an hour from one network.
export const ADMIN_RESET_REQUEST = { id: 'admin.reset-request', version: 1, schema: { type: 'object', required: ['login'], properties: { login: { type: 'string', maxLength: 120 } } } };
export const ADMIN_RESET_REQUEST_RESULT = {
  id: 'admin.reset-request.result',
  version: 1,
  schema: { type: 'object', required: ['ok', 'message'], properties: { ok: { type: 'boolean', enum: [true] }, message: { type: 'string' } } },
};
// POST /admin/password-reset/check: whether a link is still good (it is not used up by asking), and whose it is.
export const ADMIN_RESET_CHECK = { id: 'admin.reset-check', version: 1, schema: { type: 'object', required: ['token'], properties: { token: { type: 'string', maxLength: 200 } } } };
export const ADMIN_RESET_CHECK_RESULT = {
  id: 'admin.reset-check.result',
  version: 1,
  schema: { type: 'object', required: ['valid', 'username', 'expiresAt'], properties: { valid: { type: 'boolean' }, username: { type: ['string', 'null'] }, expiresAt: { type: ['integer', 'null'], minimum: 0 } } },
};
// POST /admin/password-reset/confirm: the link's value and the new password (400 reset_invalid: expired, used or voided; 409 disabled).
export const ADMIN_RESET_CONFIRM = { id: 'admin.reset-confirm', version: 1, schema: { type: 'object', required: ['token', 'password'], properties: { token: linkToken, password } } };
// POST /admin/password-reset/token, with Authorization: Bearer ADMIN_TOKEN: the username and the new password (401 reset_failed: a wrong
// token, or the network locked after 5 failures in 15 minutes).
export const ADMIN_RESET_TOKEN = { id: 'admin.reset-token', version: 1, schema: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string', maxLength: 64 }, password } } };
// The answer to both: every session of that admin ended; the lockout of their username is cleared.
export const ADMIN_RESET_RESULT = {
  id: 'admin.reset.result',
  version: 1,
  schema: { type: 'object', required: ['ok', 'username', 'endedSessions'], properties: { ok: { type: 'boolean', enum: [true] }, username, endedSessions: { type: 'integer', minimum: 0 } } },
};

// ---- a signed-in admin's email (for password resets)
// POST /admin/email: { email } sets it (unconfirmed until its link is opened: 30 minutes, once); "" or null removes it.
export const ADMIN_EMAIL_SET = { id: 'admin.email-set', version: 1, schema: { type: 'object', required: ['email'], properties: { email } } };
// GET /admin/email and the answer to POST /admin/email (`sent`: a confirmation link was emailed).
export const ADMIN_EMAIL = {
  id: 'admin.email',
  version: 1,
  schema: { type: 'object', required: ['email', 'emailVerified'], properties: { email, emailVerified: { type: 'boolean' }, sent: { type: 'boolean' } } },
};
// POST /admin/email/verify: the link's value (no session needed; 400 verify_invalid).
export const ADMIN_EMAIL_VERIFY = { id: 'admin.email-verify', version: 1, schema: { type: 'object', required: ['token'], properties: { token: linkToken } } };
export const ADMIN_EMAIL_VERIFY_RESULT = {
  id: 'admin.email-verify.result',
  version: 1,
  schema: { type: 'object', required: ['ok', 'username', 'email'], properties: { ok: { type: 'boolean', enum: [true] }, username, email: { type: 'string', maxLength: 120 } } },
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
