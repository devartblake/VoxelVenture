import { create } from 'zustand';
import { apiOn, getToken, request, setToken } from '../data/api';
import { currentRef } from '../business/referral';

// Who is signed in. Nobody has to sign in to look around: `ask(then)` opens the sign-in form only when something needs an account
// (claiming or taking over a plot), and runs `then` once they are in.
let waiting = null;
export const useAccount = create((set, get) => ({
  account: null,
  ready: false,
  askOpen: false,
  hydrate: async () => {
    if (!apiOn() || !getToken()) return set({ ready: true });
    try {
      set({ account: (await request('GET', '/me')).account, ready: true });
    } catch {
      setToken('');
      set({ account: null, ready: true });
    }
  },
  // a referral code this browser arrived with (lib/business/referral.js) credits the person who shared the link
  signup: async (username, password, email) => finish(set, await request('POST', '/auth/signup', { username, password, ...(email ? { email } : {}), ...(currentRef() ? { ref: currentRef() } : {}) })),
  login: async (username, password) => finish(set, await request('POST', '/auth/login', { username, password })),
  logout: async () => {
    try {
      await request('POST', '/auth/logout');
    } catch {
      /* the token is dropped either way */
    }
    setToken('');
    set({ account: null });
  },
  // Returns true now if signed in; otherwise opens the form and remembers what to do afterwards.
  ask: (then) => {
    if (get().account) return true;
    waiting = then ?? null;
    set({ askOpen: true });
    return false;
  },
  cancelAsk: () => {
    waiting = null;
    set({ askOpen: false });
  },
}));

function finish(set, result) {
  setToken(result.token);
  set({ account: result.account, askOpen: false });
  const then = waiting;
  waiting = null;
  if (then) setTimeout(then, 0);
  return result.account;
}
