import { create } from 'zustand';
import { apiOn, request } from '../data/api';
import { useAccount } from './accountStore';

// The cart (services/api/cart.mjs, docs/monetization/billing.md#the-cart): the server keeps it, one per account, and prices every line; this only
// shows it. Several purchases go through one payment, so Stripe's fixed fee is paid once. Needs a game server and an account.
//   cart      GET /cart as the server sends it (null: no server, or nobody signed in)
//   notice    the last thing that happened ({ ok, text }), for whoever shows it
//   problems  the lines a refused checkout named, by id: { [id]: reason }
export const useCart = create((set, get) => ({
  cart: null,
  busy: false,
  notice: null,
  problems: {},
  load: async () => {
    if (!apiOn() || !useAccount.getState().account) return set({ cart: null });
    try {
      set({ cart: await request('GET', '/cart') });
    } catch {
      set({ cart: null });
    }
  },
  // Adds a line ({ kind, plotId?, business?, placement?, input? }); resolves with the new line, or throws the server's reason (also in `notice`).
  add: async (item) => {
    set({ busy: true, notice: null });
    try {
      const r = await request('POST', '/cart/items', item);
      const line = r.cart.items.find((i) => i.id === r.added);
      set({ cart: r.cart, busy: false, notice: { ok: true, text: `Added to your cart: ${line?.label ?? 'done'}.` } });
      return line;
    } catch (e) {
      set({ busy: false, notice: { ok: false, text: e.message } });
      throw e;
    }
  },
  remove: async (id) => {
    set({ busy: true });
    try {
      const cart = await request('DELETE', `/cart/items/${id}`);
      const { [id]: _gone, ...problems } = get().problems;
      set({ cart, busy: false, problems });
    } catch (e) {
      set({ busy: false, notice: { ok: false, text: e.message } });
    }
  },
  clear: async () => {
    set({ busy: true });
    try {
      set({ cart: await request('DELETE', '/cart'), busy: false, problems: {} });
    } catch (e) {
      set({ busy: false, notice: { ok: false, text: e.message } });
    }
  },
  // A promo code for the cart (one at a time; services/api/promo.mjs): the server checks it on the cart's lines and keeps it; the cart then shows what it
  // takes off. Resolves true if it was taken; the reason is in `promoError` if not.
  promoError: null,
  applyPromo: async (code) => {
    set({ busy: true, promoError: null });
    try {
      set({ cart: await request('POST', '/cart/promo', { code }), busy: false });
      return true;
    } catch (e) {
      set({ busy: false, promoError: e.message });
      return false;
    }
  },
  removePromo: async () => {
    set({ busy: true, promoError: null });
    try {
      set({ cart: await request('DELETE', '/cart/promo'), busy: false });
    } catch (e) {
      set({ busy: false, notice: { ok: false, text: e.message } });
    }
  },
  // Checks out the whole cart: to Stripe's page with payments on, or done at once without. A refusal (a line taken, a changed price, under the
  // minimum) leaves the cart showing why.
  checkout: async () => {
    set({ busy: true, notice: null, problems: {} });
    try {
      const r = await request('POST', '/cart/checkout');
      if (r.checkout) {
        set({ notice: { ok: true, text: r.checkout.free ? 'Free with your code: confirming...' : `Everything is held for you: taking you to secure payment ($${(r.checkout.cents / 100).toFixed(2)})...` } });
        window.location.assign(r.checkout.url);
        return r;
      }
      set({ cart: r.cart, busy: false, notice: { ok: true, text: `Done: ${r.done.map((d) => d.label).join(', ')}.` } });
      return r;
    } catch (e) {
      set({ busy: false, notice: { ok: false, text: e.message }, ...(e.cart ? { cart: e.cart } : {}), problems: Object.fromEntries((e.problems ?? []).map((p) => [p.id, p.error])) });
      return null;
    }
  },
}));

// The setup a plot line needs, from the claim or take-over form (as lib/data/sync.js sends it to the plot's own route).
export const plotSetup = (b) => ({ title: b.title, buildingType: b.buildingType, website: b.website, variant: b.variant, logo: b.logo, description: b.description, ...(b.exterior ? { exterior: b.exterior } : {}), ...(b.leaseDays ? { leaseDays: b.leaseDays } : {}) });
