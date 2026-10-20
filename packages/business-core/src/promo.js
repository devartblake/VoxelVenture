// Promo codes (services/api/promo.mjs, docs/monetization/billing.md#promo-codes): discount codes the owner makes in /admin/promos for VoxelVenture's
// own services. Not the merchants' coupons (a business giving its customers a coupon: coupon_claims, conversions.mjs): those are another thing.
// Pure, shared by the server (which prices and enforces every code) and the pages (which show what a code would take off, as the server will).

// The product groups a code can apply to, and which purchases are in each. A purchase is named by its cart kind (services/api/cart.mjs CART_KINDS),
// which is also how a single checkout names it: a lease action (claim, takeover, renew, exterior), a stall, or a business product.
export const PROMO_GROUPS = {
  plots: { label: 'Plot leases (claim, take-over, renewal)', kinds: ['claim', 'takeover', 'renew'] },
  outside: { label: 'Building upgrades (the outside)', kinds: ['exterior'] },
  launch: { label: 'Launch Pack', kinds: ['launch'] },
  pro: { label: 'Pro (first month only)', kinds: ['pro'] },
  sponsored: { label: 'Sponsored weeks', kinds: ['sponsored'] },
  market: { label: 'Market stalls', kinds: ['stall'] },
};
export const PROMO_GROUP_IDS = Object.keys(PROMO_GROUPS);
export const PROMO_KINDS = ['percent', 'amount'];
// Stripe's smallest charge: a code never brings a payment below it, except to nothing at all (a free order).
export const STRIPE_MIN_CENTS = 50;
// What a generated code looks like: PREFIX-XXXX-XXXX from letters and digits nobody misreads (no 0/O, 1/I/L).
export const PROMO_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PROMO_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

// The group a purchase is in: a cart kind ('claim', 'stall', 'pro', ...) or an order (product 'lease' with its action, 'market', 'launch', ...).
export function promoGroupOf(kindOrProduct, action = null) {
  const kind = kindOrProduct === 'lease' ? action : kindOrProduct === 'market' ? 'stall' : kindOrProduct;
  return PROMO_GROUP_IDS.find((g) => PROMO_GROUPS[g].kinds.includes(kind)) ?? null;
}

// A code as typed, the way it is stored: trimmed, upper case, no inner spaces. '' when it cannot be a code.
export const normalizeCode = (raw) => {
  const c = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return PROMO_CODE_RE.test(c) ? c : '';
};

// The groups a code covers, from what is stored ('all' or a list).
export const groupsOf = (appliesTo) => {
  const list = Array.isArray(appliesTo) ? appliesTo : [appliesTo];
  return list.includes('all') ? [...PROMO_GROUP_IDS] : PROMO_GROUP_IDS.filter((g) => list.includes(g));
};

// "25% off" or "$5 off".
export const promoLabel = ({ kind, value }) => (kind === 'percent' ? `${value}% off` : `$${(value / 100).toFixed(value % 100 ? 2 : 0)} off`);

// What a code takes off a checkout. `promo` is { kind, value, groups }; `lines` are the checkout's lines [{ group, cents }], each already after the Pro
// plot discount and the renewal discount (the code comes last). Only the lines in the code's groups are discounted:
//   percent  each eligible line loses that share (rounded to the cent)
//   amount   the amount, at most the eligible lines' total, shared out over them in proportion to their price
// Then, if what is left to pay is above nothing but under Stripe's minimum, the discount is made smaller so the payment is exactly the minimum.
// Returns { lines: [discountCents per line], cents (the whole discount), eligibleCents, totalCents (what is left to pay), free (nothing to pay) }.
export function promoDiscount(promo, lines) {
  const groups = new Set(promo.groups ?? groupsOf(promo.appliesTo ?? 'all'));
  const eligible = lines.map((l) => groups.has(l.group) && l.cents > 0);
  const eligibleCents = lines.reduce((a, l, i) => a + (eligible[i] ? l.cents : 0), 0);
  const subtotal = lines.reduce((a, l) => a + l.cents, 0);
  const off = lines.map(() => 0);
  if (eligibleCents > 0) {
    if (promo.kind === 'percent') {
      const pct = Math.max(0, Math.min(100, Number(promo.value) || 0));
      lines.forEach((l, i) => {
        if (eligible[i]) off[i] = Math.min(l.cents, Math.round((l.cents * pct) / 100));
      });
    } else {
      const amount = Math.min(eligibleCents, Math.max(0, Math.round(Number(promo.value) || 0)));
      // proportional shares, the cents left over by rounding down going to the largest remainders
      const shares = lines.map((l, i) => (eligible[i] ? (amount * l.cents) / eligibleCents : 0));
      shares.forEach((s, i) => (off[i] = Math.floor(s)));
      let left = amount - off.reduce((a, b) => a + b, 0);
      const order = shares.map((s, i) => [s - Math.floor(s), i]).filter(([, i]) => eligible[i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length) {
        const i = order[k][1];
        if (off[i] < lines[i].cents) (off[i]++, left--);
      }
    }
  }
  let cents = off.reduce((a, b) => a + b, 0);
  const rest = subtotal - cents;
  if (rest > 0 && rest < STRIPE_MIN_CENTS) {
    // keep the payment at Stripe's minimum: give back the difference, from the last discounted line first
    let back = Math.min(cents, STRIPE_MIN_CENTS - rest);
    for (let i = off.length - 1; i >= 0 && back > 0; i--) {
      const take = Math.min(off[i], back);
      off[i] -= take;
      back -= take;
    }
    cents = off.reduce((a, b) => a + b, 0);
  }
  return { lines: off, cents, eligibleCents, totalCents: subtotal - cents, free: subtotal > 0 && subtotal - cents === 0 };
}
