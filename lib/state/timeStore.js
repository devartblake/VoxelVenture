import { create } from 'zustand';
import { clockOffset, parseTime } from '../game/dayCycle';

// Which time of day the player is looking at: the shared live clock, or a fixed time they picked (Day / Dusk / Night, or ?time=14.5 in the address).
// The pick is remembered in this browser. Tests and automated browsers (and ?diag=1 and ?tour=) start in Day so a picture does not depend on the clock.
const KEY = 'voxelventure-time-mode';

export function initialMode() {
  if (typeof window === 'undefined') return 'live';
  const q = new URLSearchParams(window.location.search);
  const asked = parseTime(q.get('time'));
  if (asked) return asked;
  if (q.has('diag') || q.has('tour') || navigator.webdriver) return 'day'; // a demo tour too: the same light on every run
  try {
    return parseTime(localStorage.getItem(KEY)) ?? 'live';
  } catch {
    return 'live';
  }
}

export const useTime = create((set) => ({
  mode: 'live',
  offset: 0, // ms to add to this machine's clock to get the server's
  hydrated: false,
  hydrate: () => set({ mode: initialMode(), hydrated: true }),
  setMode: (mode) => {
    const m = parseTime(mode) ?? 'live';
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* not remembered */
    }
    set({ mode: m });
  },
  setOffset: (offset) => set({ offset: Number.isFinite(offset) ? offset : 0 }),
}));

// With a game server, ask it for its clock once so everyone's day lines up even if a machine's clock is wrong. Without one, the UTC clock is used as it is.
export async function syncClock(base) {
  if (!base || typeof fetch === 'undefined') return;
  try {
    const sent = Date.now();
    const res = await fetch(`${base}/health`, { cache: 'no-store' });
    const received = Date.now();
    const body = await res.json();
    useTime.getState().setOffset(clockOffset(body.now, sent, received));
  } catch {
    /* the local clock is fine */
  }
}
