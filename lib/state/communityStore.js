import { create } from 'zustand';
import { apiOn, request } from '../data/api';

// Building of the Week (server/api/community.mjs): this week's votes so far, whether the player can vote (they found all three daily collectibles), and last
// week's winner. Only with a game server.
export const useCommunity = create((set, get) => ({
  votes: null, // { week, earned, voted, canVote, leaders, winner }
  botw: null, // last week's winner: { plotId, title, votes, week } (from the state sync)
  notice: null,
  async loadVotes() {
    if (!apiOn()) return;
    try {
      set({ votes: await request('GET', '/votes') });
    } catch {
      /* the card just shows no voting */
    }
  },
  async vote(plotId) {
    try {
      set({ votes: await request('POST', '/vote', { plotId }), notice: { ok: true, text: 'Thanks: your vote for Building of the Week is in.' } });
      return true;
    } catch (e) {
      set({ notice: { ok: false, text: e?.message ?? 'The vote did not go through.' } });
      return false;
    }
  },
  setBotw: (botw) => {
    const was = get().botw;
    if ((was?.plotId ?? null) !== (botw?.plotId ?? null)) set({ botw });
  },
}));
