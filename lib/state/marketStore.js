import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiBase, apiOn, request } from '../data/api';
import { EMPTY_LOCAL, bookLocal, cancelLocal, clearDemo, fillDemo, myBookingsLocal, setLayoutLocal, updateLocal, visitLocal, weekPayload } from '../market/local';
import { upcomingWeeks, weekStartOf } from '../market/weeks';
import { promoBody } from './promoStore';

// The pop-up market in the game: which week is showing, what the market looks like that week (stalls, prices, who has what), the stall being
// looked at, and the player's own bookings. With a game server (NEXT_PUBLIC_LIVE_API_URL) everything comes from it; without one the same rules
// run in the browser (lib/market/local.js) so the market can be tried on one machine.
const ADMIN_KEY = 'voxelventure-admin';
const readAdmin = () => {
  try {
    return sessionStorage.getItem(ADMIN_KEY) || '';
  } catch {
    return '';
  }
};

// An admin call: the admin token goes where a player's token would.
async function adminRequest(method, path, body, token) {
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('The game server cannot be reached.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 403 ? 'That is not the admin token.' : data.error ?? 'Something went wrong.');
  return data;
}

const message = (e) => (e instanceof Error ? e.message : 'Something went wrong.');
const noStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

export const useMarket = create(
  persist(
    (set, get) => ({
      site: null, // the market site (from the city layout): { code, number, x0 ... frontRoad, frontSide } plus `road`
      week: weekStartOf(),
      data: null,
      error: null,
      busy: false,
      selected: null, // the stall being looked at
      mine: [],
      local: EMPTY_LOCAL, // the browser's own market, used only without a server
      adminToken: '',
      adminOpen: false,
      notice: null,

      setSite: (site) => {
        if (site?.code !== get().site?.code) set({ site, data: null });
        else set({ site });
        if (site) get().load();
      },
      setWeek: (week) => {
        set({ week, selected: null, notice: null });
        get().load();
      },
      select: (stallId) => set({ selected: stallId, notice: null }),
      weeks: () => upcomingWeeks(),

      load: async () => {
        const { site, week } = get();
        if (!site) return;
        try {
          if (apiOn()) set({ data: await request('GET', `/market/${site.code}/${week}`), error: null });
          else set({ data: weekPayload(get().local, site, site.road, week), error: null });
        } catch (e) {
          set({ error: message(e) });
        }
        get().loadMine();
      },
      loadMine: async () => {
        try {
          if (apiOn()) set({ mine: (await request('GET', '/market/mine')).bookings });
          else set({ mine: myBookingsLocal(get().local) });
        } catch {
          set({ mine: apiOn() ? [] : myBookingsLocal(get().local) }); // not signed in: nothing to list
        }
      },

      // Rents a stall; returns true if it worked (the reason is in `notice` if not).
      book: async ({ stallId, hours, start, brand, product }) => {
        const { site, week } = get();
        set({ busy: true, notice: null });
        try {
          const input = { siteCode: site.code, week, stallId, hours, start, brand, product };
          if (apiOn()) {
            const r = await request('POST', '/market/book', { ...input, ...promoBody('stall') }); // with a promo code applied (lib/state/promoStore.js)
            if (r.checkout) {
              // payments on: the stall is held while the player pays on Stripe's page, and booked once the payment is confirmed
              set({ notice: { ok: true, text: r.checkout.free ? `Stall ${stallId} is free with your code: confirming...` : `Stall ${stallId} is held for you: taking you to secure payment ($${(r.checkout.cents / 100).toFixed(2)})...` }, busy: false });
              window.location.assign(r.checkout.url);
              return true;
            }
          } else set({ local: bookLocal(get().local, site, site.road, input).local });
          set({ notice: { ok: true, text: `Booked: ${stallId} for ${hours} hours.` }, busy: false });
          await get().load();
          return true;
        } catch (e) {
          set({ notice: { ok: false, text: message(e) }, busy: false });
          return false;
        }
      },
      // The owner sets up their shop: goods, an offer, a website.
      updateStall: async (id, input) => {
        try {
          if (apiOn()) await request('PATCH', `/market/bookings/${id}`, input);
          else set({ local: updateLocal(get().local, id, input) });
          set({ notice: { ok: true, text: 'Your stall is updated.' } });
          await get().load();
          return true;
        } catch (e) {
          set({ notice: { ok: false, text: message(e) } });
          return false;
        }
      },
      // A visitor looked at an open stall (counted once an hour).
      recordVisit: async (id) => {
        try {
          if (apiOn()) {
            let guest = '';
            try {
              guest = localStorage.getItem('voxelventure-guest') || '';
              if (!guest) localStorage.setItem('voxelventure-guest', (guest = Math.random().toString(36).slice(2, 12)));
            } catch {
              guest = 'anon';
            }
            await request('POST', `/market/bookings/${id}/visit`, { visitor: guest });
          } else set({ local: visitLocal(get().local, id) });
        } catch {
          /* a visit that is not counted is not worth a message */
        }
      },
      // Without a server: a market with nearly every stall let and open, to see it as it is when busy.
      demo: async (on) => {
        const { site, week } = get();
        if (apiOn() || !site) return;
        set({ local: on ? fillDemo(get().local, site, site.road, week) : clearDemo(get().local), notice: { ok: true, text: on ? 'The market is full of demo stallholders.' : 'The demo stallholders have gone home.' } });
        await get().load();
      },
      // Called now and then: refreshes what is open, and tells the player when one of their stalls opens or closes.
      tick: async () => {
        const before = new Map(get().mine.map((b) => [b.id, b.state]));
        await get().loadMine();
        for (const b of get().mine) {
          const was = before.get(b.id);
          if (was && was !== b.state && b.state === 'live') set({ notice: { ok: true, text: `Your stall ${b.stallId} (${b.brand}) is open for visitors now.` } });
          if (was && was !== b.state && b.state === 'ended') set({ notice: { ok: true, text: `Your stall ${b.stallId} has closed. ${b.visits ?? 0} people stopped by.` } });
        }
        set({ clock: Date.now() });
      },
      clock: Date.now(),
      cancel: async (id) => {
        try {
          if (apiOn()) await request('POST', `/market/bookings/${id}/cancel`);
          else set({ local: cancelLocal(get().local, id) });
          set({ notice: { ok: true, text: 'Booking cancelled.' } });
          await get().load();
        } catch (e) {
          set({ notice: { ok: false, text: message(e) } });
        }
      },

      // ---- admin
      setAdminToken: (token) => {
        try {
          if (token) sessionStorage.setItem(ADMIN_KEY, token);
          else sessionStorage.removeItem(ADMIN_KEY);
        } catch {
          /* kept in memory only */
        }
        set({ adminToken: token });
      },
      isAdmin: () => (apiOn() ? Boolean(get().adminToken) : true), // without a server the browser is its own admin
      saveLayout: async ({ week, params, rates, note, publish }) => {
        const { site } = get();
        set({ busy: true, notice: null });
        try {
          const input = { siteCode: site.code, week, params, rates, note, publish };
          if (apiOn()) await adminRequest('POST', '/admin/market/layout', input, get().adminToken);
          else set({ local: setLayoutLocal(get().local, site, site.road, input) });
          set({ notice: { ok: true, text: publish ? 'Published: the week is open for booking.' : 'Saved as a draft.' }, busy: false });
          if (week === get().week) await get().load();
          return true;
        } catch (e) {
          set({ notice: { ok: false, text: message(e) }, busy: false });
          return false;
        }
      },
      adminSummary: async (week) => {
        if (!apiOn()) return null;
        try {
          return await adminRequest('GET', `/admin/market?week=${week}`, null, get().adminToken);
        } catch {
          return null;
        }
      },
    }),
    {
      name: 'voxelventure-market',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? noStorage : window.localStorage)),
      partialize: (s) => ({ local: s.local }),
      skipHydration: true,
    }
  )
);

// Reads the saved local market (and the admin token of this tab) once the page is up: not at import time, so the server and the first client render match.
export function hydrateMarket() {
  useMarket.persist.rehydrate();
  useMarket.setState({ adminToken: readAdmin() });
}
