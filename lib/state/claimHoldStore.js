import { create } from 'zustand';
import { holdUntil } from '../game/claimHold';

// The plot a player is holding while they set it up (see lib/game/claimHold.js): its id and when the hold ends.
export const useClaimHold = create((set, get) => ({
  plotId: null,
  until: 0,
  start: (plotId) => {
    if (get().plotId === plotId && get().until > Date.now()) return;
    set({ plotId, until: holdUntil() });
  },
  clear: () => set({ plotId: null, until: 0 }),
}));
