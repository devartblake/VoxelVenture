import { create } from 'zustand';
import { apiOn, request } from '../data/api';
import { localOverview } from '../data/localStats';
import { useNet } from '../net/multiplayer';

// The live figures for the Statistics panel and the pill at the top of the screen: online now, the latest arrivals, and recorded activity by period.
// With a game server they come from GET /stats/overview (real, from the database); without one, from this browser's own record.
export const useStats = create((set) => ({
  data: null,
  error: null,
  async refresh() {
    try {
      if (apiOn()) set({ data: await request('GET', '/stats/overview'), error: null });
      else {
        const net = useNet.getState();
        set({ data: localOverview(net.status === 'online' ? Math.max(1, net.online) : 1), error: null });
      }
    } catch (e) {
      set({ error: e?.message ?? 'The statistics cannot be loaded.' });
    }
  },
}));
