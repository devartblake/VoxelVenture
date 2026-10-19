// The game's connection to the API server (server/api). Only used when NEXT_PUBLIC_LIVE_API_URL is set; without it the game is
// single-player and everything stays in the browser.
const TOKEN_KEY = 'voxelventure-token';

export const apiBase = () => process.env.NEXT_PUBLIC_LIVE_API_URL || '';
export const apiOn = () => Boolean(apiBase());

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};
export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the sign-in lasts until the page closes */
  }
};

export class ApiFailure extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// One call. Resolves with the JSON, or throws an ApiFailure carrying the server's message ("Someone claimed this plot first.").
export async function request(method, path, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiFailure(0, 'The game server cannot be reached. Try again in a moment.', 'offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const f = new ApiFailure(res.status, data.error ?? 'Something went wrong.', data.code ?? 'error');
    if (data.errors) f.errors = data.errors; // a message per field of a form
    if (data.quote) f.quote = data.quote; // what a dearer outside costs (402 exterior_payment_required): the owner's editor offers to pay it
    if (data.secondsLeft != null) f.secondsLeft = data.secondsLeft; // a plot held by someone else (409 held): how long until it opens again
    if (data.cart) f.cart = data.cart; // a cart checkout refused (lib/state/cartStore.js): the cart as it is now, and why
    if (data.problems) f.problems = data.problems;
    throw f;
  }
  return data;
}
