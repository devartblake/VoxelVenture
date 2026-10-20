import { create } from 'zustand';
import { request } from '../data/api';

// Promo codes on a single checkout (services/api/promo.mjs, docs/monetization/billing.md#promo-codes): the "Have a code?" field of a claim, a take-over,
// a renewal, an outside upgrade, a market stall or a business plan keeps the code it checked here, by `scope` (which checkout it is for, e.g.
// 'claim:12'), and the checkout sends it as `promoCode`. The server checks and prices it again when the checkout starts: nothing here is charged.
// (The cart keeps its own code on the server: POST /cart/promo.)
//   applied   { [scope]: { code, label, kind, value, groups, minSubtotalCents } } as POST /promo/check answered
//   errors    { [scope]: what the server said about the last code tried there }
export const usePromo = create((set, get) => ({
  applied: {},
  errors: {},
  busy: null,
  payments: null, // whether the server takes payments (GET /billing/config): without, there is nothing to discount and no field is shown
  loadConfig: async () => {
    if (get().payments !== null) return;
    set({ payments: false });
    try {
      set({ payments: Boolean((await request('GET', '/billing/config')).enabled) });
    } catch {
      set({ payments: null }); // asked again next time
    }
  },
  // Checks a code for a purchase of this kind (a cart kind: claim, takeover, renew, exterior, stall, launch, pro, sponsored; none: any).
  apply: async (scope, code, kind, cents) => {
    set((s) => ({ busy: scope, errors: { ...s.errors, [scope]: null } }));
    try {
      const view = await request('POST', '/promo/check', { code, ...(kind ? { kind } : {}), ...(Number.isInteger(cents) && cents > 0 ? { cents } : {}) });
      set((s) => ({ busy: null, applied: { ...s.applied, [scope]: view } }));
      return view;
    } catch (e) {
      set((s) => ({ busy: null, errors: { ...s.errors, [scope]: e.message } }));
      return null;
    }
  },
  remove: (scope) => set((s) => ({ applied: { ...s.applied, [scope]: undefined }, errors: { ...s.errors, [scope]: null } })),
  // the code to send with this checkout, if one was applied
  codeFor: (scope) => get().applied[scope]?.code ?? undefined,
}));

// The body field a checkout adds: { promoCode } when a code is applied for this scope, else nothing.
export const promoBody = (scope) => {
  const code = usePromo.getState().codeFor(scope);
  return code ? { promoCode: code } : {};
};
