"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { request } from '@/lib/data/api';
import { useCart } from '@/lib/state/cartStore';
import { CART } from '@voxelventure/business-core';
import AuthDialog from '@/components/ui/AuthDialog';
import NotLive from './NotLive';
import { signIn, useOwner } from './useOwner';

const money = (c) => `$${(c / 100).toFixed(2)}`;
const KIND = { claim: 'Plot lease', takeover: 'Take-over', renew: 'Lease renewal', exterior: 'Building upgrade', launch: 'Launch Pack', pro: 'Pro, monthly', sponsored: 'Sponsored week', stall: 'Market stall', ad: 'Ad space' };

// /cart: what is in the cart, each line at the server's price (the Pro plot discount as its own line), the total, the $4 minimum and checkout. One
// payment for everything, so Stripe's fixed fee is paid once (services/api/cart.mjs, docs/monetization/billing.md#the-cart).
export default function CartPage() {
  const { live, ready, account } = useOwner();
  const { cart, busy, notice, problems } = useCart();
  useEffect(() => {
    if (account) useCart.getState().load();
  }, [account]);

  if (!live) return <NotLive />;
  if (!ready) return <p className="text-sx-muted">Loading…</p>;
  if (!account)
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-3xl font-bold text-white">Your cart</h1>
        <p className="mt-2 text-slate-300">Sign in to see your cart.</p>
        <button type="button" onClick={() => signIn().catch(() => {})} className="mt-5 min-h-11 rounded-xl bg-sx-purple px-5 font-semibold text-white hover:bg-violet-400">Sign in</button>
        <AuthDialog />
      </div>
    );

  const items = cart?.items ?? [];
  return (
    <div className="mx-auto max-w-2xl" data-testid="cart-page">
      <h1 className="text-3xl font-bold text-white">Your cart</h1>
      <p className="mt-1 text-sm text-sx-muted">Everything here is paid in one go, so the card fee is paid once. Up to {CART.maxPlots} plots, Pro once, at least {money(CART.minimumCents)} in all.</p>
      <PaymentReturn />
      {notice && <p role="status" className={`mt-4 rounded-xl border p-3 text-sm ${notice.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/40 bg-rose-500/10 text-rose-100'}`}>{notice.text}</p>}
      {cart?.pending && <p className="mt-4 rounded-xl border border-sx-stroke bg-sx-alt p-3 text-sm text-slate-200">A checkout is open until {new Date(cart.pending.until).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}: everything in it is held for you. Checking out again starts a new one.</p>}
      {!cart && <p className="mt-6 text-sx-muted">Loading…</p>}
      {cart && !items.length && (
        <p className="mt-6 rounded-2xl border border-dashed border-sx-stroke p-6 text-center text-slate-300">
          Your cart is empty. Add a plot in the <Link href="/" className="text-sx-cyan underline">3D city</Link>, a market stall, or a plan from <Link href="/business/manage" className="text-sx-cyan underline">My profiles</Link>.
        </p>
      )}
      {items.length > 0 && (
        <>
          <ul className="mt-6 divide-y divide-sx-stroke rounded-2xl border border-sx-stroke bg-sx-panel" data-testid="cart-lines">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-xs uppercase tracking-wide text-sx-muted">{KIND[i.kind] ?? i.kind}</p>
                  <p className="break-words text-slate-100">{i.label}</p>
                  {i.discountCents > 0 && <p className="text-xs text-emerald-300">Pro price: {money(i.discountCents)} off</p>}
                  {i.promoCents > 0 && <p className="text-xs text-emerald-300">Code {cart.promo?.code}: {money(i.promoCents)} off</p>}
                  {i.previousCents != null && i.previousCents !== i.cents && <p className="text-xs text-amber-300">The price changed: it was {money(i.previousCents)}.</p>}
                  {problems[i.id] && <p className="text-xs text-rose-300" role="alert">Cannot be bought now: {problems[i.id]}</p>}
                </div>
                <span className="font-mono text-slate-100">{money(i.cents)}</span>
                <button type="button" disabled={busy} onClick={() => useCart.getState().remove(i.id)} aria-label={`Remove ${i.label}`} className="min-h-11 rounded-lg border border-sx-stroke px-3 text-sm text-slate-200 hover:bg-sx-alt disabled:opacity-40">Remove</button>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 rounded-2xl border border-sx-stroke bg-sx-alt/50 p-4 text-sm">
            {(cart.discountCents > 0 || cart.promo?.cents > 0) && <div className="flex justify-between text-slate-300"><dt>Subtotal</dt><dd className="font-mono">{money(cart.subtotalCents)}</dd></div>}
            {cart.discountCents > 0 && <div className="flex justify-between text-emerald-300"><dt>Pro discount (15% off plots and ad spaces)</dt><dd className="font-mono">−{money(cart.discountCents)}</dd></div>}
            {cart.promo?.cents > 0 && <div className="flex justify-between text-emerald-300" data-testid="cart-promo"><dt>Code {cart.promo.code}{cart.items.some((i) => i.kind === 'pro' && i.promoCents > 0) ? ' (Pro: first month only)' : ''}</dt><dd className="font-mono">−{money(cart.promo.cents)}</dd></div>}
            <div className="flex justify-between text-base font-semibold text-white"><dt>Total</dt><dd className="font-mono" data-testid="cart-total">{money(cart.totalCents)}</dd></div>
            {cart.feeSavedCents > 0 && <p className="text-xs text-sx-muted">One payment instead of {cart.count} saves {money(cart.feeSavedCents)} in card fees.</p>}
            {cart.missingCents > 0 && <p className="text-xs text-amber-300" data-testid="cart-minimum">A cart checkout is at least {money(cart.minimumCents)}: add {money(cart.missingCents)} more, or use Buy now for a single item.</p>}
          </dl>
          {cart.payments && <CartPromo cart={cart} busy={busy} />}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !cart.ready} onClick={() => useCart.getState().checkout()} className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-sx-purple to-sx-blue px-5 font-bold text-white hover:brightness-110 disabled:opacity-40" data-testid="cart-checkout">
              {cart.payments ? `Check out · ${money(cart.totalCents)}` : 'Check out'}
            </button>
            <button type="button" disabled={busy} onClick={() => window.confirm('Empty your cart?') && useCart.getState().clear()} className="min-h-11 rounded-xl border border-sx-stroke px-4 text-sm text-slate-200 hover:bg-sx-alt disabled:opacity-40">Empty cart</button>
          </div>
          <p className="mt-3 text-xs text-sx-muted">Prices are checked again when you check out; if one changed, the cart shows it before you pay. Everything is held for you for 30 minutes while you pay. If something can no longer be had once you have paid, that item alone is refunded. By paying you agree to the <Link href="/legal/terms" className="underline">terms</Link> and the <Link href="/legal/refunds" className="underline">refund policy</Link>.</p>
        </>
      )}
    </div>
  );
}

// "Have a code?": one promo code for the whole cart (services/api/promo.mjs). The server checks it on the cart's lines and keeps it with the cart; it
// comes off the lines it covers, after the Pro discount, and is checked again at checkout.
function CartPromo({ cart, busy }) {
  const promoError = useCart((s) => s.promoError);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  if (cart.promo)
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sx-stroke p-3 text-sm" data-testid="cart-promo-applied">
        <span className={cart.promo.error ? 'text-amber-300' : 'text-emerald-300'}>
          Code {cart.promo.code}{cart.promo.label ? ` (${cart.promo.label})` : ''}{cart.promo.error ? `: ${cart.promo.error} Remove it to check out.` : ''}
        </span>
        <button type="button" disabled={busy} onClick={() => useCart.getState().removePromo()} className="min-h-11 rounded-lg border border-sx-stroke px-3 text-slate-200 hover:bg-sx-alt disabled:opacity-40">Remove code</button>
      </div>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 text-sm text-sx-cyan underline hover:text-white" data-testid="cart-promo-open">
        Have a code?
      </button>
    );
  const apply = async (e) => {
    e.preventDefault();
    if (draft.trim() && (await useCart.getState().applyPromo(draft.trim()))) setDraft('');
  };
  return (
    <form onSubmit={apply} className="mt-3 space-y-1">
      <div className="flex gap-2">
        <label htmlFor="cart-promo" className="sr-only">Promo code</label>
        <input id="cart-promo" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Promo code" className="min-h-11 min-w-0 flex-1 rounded-lg border border-sx-stroke bg-sx-panel px-3 uppercase text-white focus:border-sx-cyan focus:outline-none" data-testid="cart-promo-input" />
        <button type="submit" disabled={busy || !draft.trim()} className="min-h-11 rounded-lg border border-sx-stroke px-4 text-sm text-slate-100 hover:bg-sx-alt disabled:opacity-40">Apply</button>
      </div>
      {promoError && <p role="alert" className="text-sm text-rose-300">{promoError}</p>}
    </form>
  );
}

// Back from Stripe (?paid=<order> or ?canceled=<order>): how it went, once the server has heard from Stripe, and any line refunded on its own.
function PaymentReturn() {
  const [state, setState] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paid = q.get('paid');
    if (q.get('canceled')) return setState({ ok: false, text: 'Checkout cancelled: nothing was charged. Your cart is kept.' });
    if (!/^\d+$/.test(paid ?? '')) return undefined;
    let tries = 0;
    let stop = false;
    setState({ ok: true, text: 'Payment received by Stripe: confirming it…' });
    const look = async () => {
      if (stop) return;
      try {
        const o = await request('GET', `/me/orders/${paid}`);
        if (o.status === 'paid' || o.status === 'refunded') {
          const lines = (await request('GET', '/me/orders')).orders.filter((x) => x.parentId === Number(paid));
          const back = lines.filter((x) => x.status === 'refunded');
          setState({ ok: true, text: `Thank you: your purchase is done.${o.cents > 0 ? ' Stripe emails your receipt.' : ''}${back.length ? ` ${back.map((x) => x.label).join(', ')} could no longer be had, so ${back.length === 1 ? 'it was' : 'they were'} refunded.` : ''}` });
          return useCart.getState().load();
        }
        if (o.status !== 'pending') return setState({ ok: false, text: 'That payment did not go through. Nothing was charged, and your cart is kept.' });
      } catch {
        /* try again */
      }
      if (++tries < 15) setTimeout(look, 2000);
      else setState({ ok: true, text: 'Stripe has your payment; it can take a few minutes to show here. Nothing more to do.' });
    };
    look();
    return () => {
      stop = true;
    };
  }, []);
  if (!state) return null;
  return <p role="status" className={`mt-4 rounded-xl border p-3 text-sm ${state.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-sx-stroke bg-sx-alt text-slate-200'}`}>{state.text}</p>;
}
