import { create } from 'zustand';
import { holdUntil } from '../game/claimHold';

// The plot a player is holding while they set it up (see lib/game/claimHold.js): its id and when the hold ends. With a game server and a signed-in
// player the hold is the server's (services/api/economy.mjs): `sync` takes its end, and `server` says to let it go there too. `blocked` is a plot
// another player holds, with when it opens again.
export const useClaimHold = create((set, get) => ({
  plotId: null,
  until: 0,
  server: false,
  blocked: null,
  start: (plotId) => {
    if (get().plotId === plotId && get().until > Date.now()) return;
    set({ plotId, until: holdUntil(), server: false, blocked: null });
  },
  sync: (plotId, until) => set({ plotId, until, server: true, blocked: null }),
  block: (plotId, until) => set({ plotId: null, until: 0, server: false, blocked: { plotId, until } }),
  clear: () => set({ plotId: null, until: 0, server: false, blocked: null }),
}));
