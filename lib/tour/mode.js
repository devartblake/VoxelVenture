// Whether a demo tour is running in this tab (docs/product/pilot_tour.md). While one is, the site only looks: lib/data/api.js refuses every
// request that would change something (anything but GET), the game neither loads nor saves the player's own game (so the tour sees the seeded
// city), and nothing is counted (no presence pings, no visits, no button presses).
//
// The flag is `?tour=<id>` in the address, or the tab's session storage while the tour runs. Session storage is shared with the same-origin pages
// the tour opens in a frame (a business page, Discover), so a link followed inside the frame is read-only too.
const KEY = 'voxelventure-tour';

const param = () => {
  try {
    return new URLSearchParams(window.location.search).get('tour') || null;
  } catch {
    return null;
  }
};

export function tourActive() {
  if (typeof window === 'undefined') return false;
  if (param()) return true;
  try {
    return Boolean(window.sessionStorage.getItem(KEY));
  } catch {
    return false;
  }
}

export function markTour(id) {
  try {
    window.sessionStorage.setItem(KEY, id);
  } catch {
    /* the address still says so */
  }
}

// The tour is over: the flag goes and the page reloads without ?tour=, as an ordinary visit with the player's own saved game (the tour neither
// loaded nor saved it).
export function endTour() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
  const q = new URLSearchParams(window.location.search);
  for (const k of ['tour', 'tourSpeed', 'tourStop']) q.delete(k);
  window.location.replace(`${window.location.pathname}${q.size ? `?${q}` : ''}`);
}

// A game page opened without ?tour= is not part of a tour, even if this tab ran one before.
export function forgetStaleTour() {
  if (typeof window === 'undefined' || param()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}
