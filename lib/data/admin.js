import { apiBase } from './api';
import { passwordProblem as rulesProblem } from './adminPassword';

// The admin pages' connection to the API (services/api/admin.mjs). An admin signs in at /admin/login and the API sets a session cookie on its own
// host (HttpOnly: no script here can read it); every call sends it back with credentials: 'include'. Nothing about the admin is kept in this
// browser's storage, and the API's ADMIN_TOKEN is never asked for, except once on /admin/setup to make the first account.

export class AdminFailure extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// the pages anyone may open (everything else under /admin needs a session)
export const OPEN_ADMIN_PATHS = ['/admin/login', '/admin/setup'];
export const isOpenAdminPath = (pathname) => OPEN_ADMIN_PATHS.some((p) => pathname === p || pathname === `${p}/`);

// true when an answer means "you are not (or no longer) signed in"
export const signedOut = (e) => e instanceof AdminFailure && (e.status === 401 || (e.status === 403 && ['forbidden', 'session_required'].includes(e.code)));

// One call. `token`: the ADMIN_TOKEN, only for POST /admin/setup. A change is always JSON (the API refuses any other kind with the cookie).
export async function adminFetch(path, { method = 'GET', body, token, raw = false } = {}) {
  const base = apiBase();
  if (!base) throw new AdminFailure(0, 'The admin pages need the API: build the site with NEXT_PUBLIC_LIVE_API_URL.', 'no_api');
  const write = method !== 'GET' && method !== 'HEAD';
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      credentials: token ? 'omit' : 'include',
      cache: 'no-store',
      headers: { ...(write ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: write ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    throw new AdminFailure(0, 'The API cannot be reached. Try again in a moment.', 'offline');
  }
  if (raw && res.ok) return res;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new AdminFailure(res.status, json.error ?? `The API answered ${res.status}.`, json.code);
  return json;
}

// Where to go after signing in: a path on this site only (never another host, never back to the login), else the monitor.
export function safeNext(next) {
  const s = String(next ?? '');
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || [...s].some((c) => c.charCodeAt(0) < 32)) return '/admin';
  try {
    const u = new URL(s, 'https://same.invalid');
    if (u.origin !== 'https://same.invalid' || isOpenAdminPath(u.pathname)) return '/admin';
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return '/admin';
  }
}
// The game with the market panel open on the weekly layout editor (components/DeepLink.jsx, components/ui/panel/MarketPanel.jsx): the admin
// Overview links to it, and the editor's "Sign in as an admin" comes back to it.
export const MARKET_EDIT_PATH = '/?market=edit';
export const loginHref = (next) => `/admin/login?next=${encodeURIComponent(safeNext(next))}`;

export { PASSWORD_MIN, PASSWORD_HINT } from './adminPassword';
// the API's rules (lib/data/adminPassword.js), checked here first for a quicker answer (the API checks again)
export function passwordProblem(username, password, confirm) {
  const problem = rulesProblem(username, password);
  if (problem) return problem;
  if (confirm !== undefined && password !== confirm) return 'The two passwords are not the same.';
  return '';
}
