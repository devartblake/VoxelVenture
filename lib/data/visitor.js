// This browser's anonymous visitor id, kept in localStorage: lets the server count one visitor once (verified events, docs/monetization/conversions.md).
// A module of its own, so the business pages can use it without loading the game (lib/data/sync.js re-exports it).
export const visitorId = () => {
  try {
    const k = 'voxelventure-visitor';
    return localStorage.getItem(k) || (localStorage.setItem(k, Math.random().toString(36).slice(2)), localStorage.getItem(k));
  } catch {
    return 'anon';
  }
};
