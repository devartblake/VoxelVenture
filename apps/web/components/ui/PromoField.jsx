"use client";

import React, { useEffect, useState } from 'react';
import { PROMO_GROUPS, promoDiscount, promoGroupOf } from '@voxelventure/business-core';
import { apiOn } from '@/lib/data/api';
import { useAccount } from '@/lib/state/accountStore';
import { usePromo } from '@/lib/state/promoStore';

const money = (c) => `$${(c / 100).toFixed(2)}`;
const STYLE = {
  game: { text: 'text-[11px]', input: 'min-h-9 flex-1 rounded border border-sx-stroke bg-sx-alt px-2 text-xs uppercase text-white focus:border-sx-cyan focus:outline-none', button: 'min-h-9 rounded border border-sx-stroke px-3 text-xs text-slate-100 hover:bg-sx-stroke disabled:opacity-40' },
  page: { text: 'text-sm', input: 'min-h-11 flex-1 rounded-lg border border-sx-stroke bg-sx-panel px-3 uppercase text-white focus:border-sx-cyan focus:outline-none', button: 'min-h-11 rounded-lg border border-sx-stroke px-4 text-sm text-slate-100 hover:bg-sx-alt disabled:opacity-40' },
};

// "Have a code?" on a single checkout (a claim, take-over, renewal, outside upgrade, market stall, or a business's plans): a promo code for
// VoxelVenture's own services (services/api/promo.mjs). One code per checkout. The server checks it here and again, and prices it, when the checkout
// starts; what this shows is worked out with the same rule (business-core promoDiscount) on the price shown.
//   scope   which checkout ('claim:12'); the checkout sends the code applied there (lib/state/promoStore.js promoBody)
//   kind    the purchase (claim, takeover, renew, exterior, stall, launch, pro, sponsored); none on a page that sells several
//   cents   the price shown, to show what the code takes off it
// Shown with a game server, signed in, and payments on (without payments nothing is charged, so there is nothing to discount).
export default function PromoField({ scope, kind = null, cents = null, size = 'game' }) {
  const account = useAccount((s) => s.account);
  const applied = usePromo((s) => s.applied[scope]);
  const error = usePromo((s) => s.errors[scope]);
  const busy = usePromo((s) => s.busy === scope);
  const payments = usePromo((s) => s.payments);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (apiOn() && account) usePromo.getState().loadConfig();
  }, [account]);
  if (!apiOn() || !account || payments !== true) return null;
  const st = STYLE[size] ?? STYLE.game;

  if (applied) {
    const group = kind ? promoGroupOf(kind) : null;
    const off = group && cents > 0 ? promoDiscount(applied, [{ group, cents }]).cents : null;
    const covers = applied.groups.map((g) => PROMO_GROUPS[g]?.label).filter(Boolean).join(', ');
    return (
      <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-emerald-300 ${st.text}`} data-testid="promo-applied">
        <span>
          Code {applied.code}: {off != null ? `−${money(off)}` : applied.label}
          {kind === 'pro' && ' on the first month'}
          {!kind && <span className="block text-xs text-sx-muted">{covers}. Checked again when you pay.</span>}
        </span>
        <button type="button" onClick={() => usePromo.getState().remove(scope)} className="text-xs text-slate-300 underline hover:text-white">Remove</button>
      </div>
    );
  }
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`text-left text-sx-cyan underline hover:text-white ${st.text}`} data-testid="promo-open">
        Have a code?
      </button>
    );
  const submit = (e) => {
    e?.preventDefault?.();
    if (draft.trim()) usePromo.getState().apply(scope, draft.trim(), kind, cents ?? undefined);
  };
  return (
    <div className={`space-y-1 ${st.text}`}>
      <div className="flex gap-1.5">
        <label htmlFor={`promo-${scope}`} className="sr-only">Promo code</label>
        <input
          id={`promo-${scope}`}
          type="text"
          value={draft}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Promo code"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit(e)}
          className={st.input}
          data-testid="promo-input"
        />
        <button type="button" disabled={busy || !draft.trim()} onClick={submit} className={st.button} data-testid="promo-apply">
          {busy ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </div>
  );
}
