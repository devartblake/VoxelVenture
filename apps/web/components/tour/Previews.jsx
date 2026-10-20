"use client";

import { useMemo } from 'react';
import { useCityStore } from '@/lib/state/store';
import { addressOf } from '@/lib/game/plotInfo';
import { claimTerms, sampleCart, sampleFigures } from '@/lib/tour/previews';
import { Funnel, Results } from '@/components/business/ManageProfiles';

// The demo tour's stand-ins for the screens that need an account or would buy something (docs/product/pilot_tour.md): the owner's dashboard, the
// claim form's lease terms and the cart. Each shows what the real screen shows, priced and shaped the same (lib/tour/previews.js), and none of
// them can send anything: their buttons are disabled.
const money = (c) => `$${(c / 100).toFixed(2)}`;
const dollars = (d) => `$${d.toLocaleString(undefined, { minimumFractionDigits: d % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const SOURCE_LABEL = { direct: 'Direct', search: 'Search engines', social: 'Social sites', referral: 'Referral links', city: 'The 3D city', x: 'VoxelVenture on X' };

function Note({ children }) {
  return <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" data-testid="tour-preview-note">{children}</p>;
}

// "My profiles" for the tour's business: the funnel, the outcomes and revenue, Pro's sources, and the pilot's weekly check-in.
export function FiguresPreview({ plot, seed }) {
  const stats = useMemo(() => sampleFigures(seed, plot.id), [seed, plot.id]);
  const top = Math.max(1, ...stats.sources.map((s) => s.views));
  return (
    <div className="space-y-4" data-testid="tour-figures">
      <header>
        <p className="text-xs uppercase tracking-wide text-sx-muted">My profiles · owner view</p>
        <h2 className="text-2xl font-bold text-white">{plot.title}</h2>
      </header>
      <Note>Sample figures for the tour: what a pilot business sees after its first 30 days. A real dashboard counts verified visitors only.</Note>
      <Funnel stats={stats} ctaLabel="Order online" />
      <Results stats={stats} />
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Where visitors came from <span className="font-normal text-sx-muted">(Pro)</span></h3>
        <ul className="space-y-1">
          {stats.sources.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0 text-slate-300">{SOURCE_LABEL[s.id] ?? s.id}</span>
              <span className="h-2 rounded bg-sx-cyan" style={{ width: `${(s.views / top) * 60}%` }} aria-hidden="true" />
              <span className="text-slate-400">{s.views}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-sx-stroke bg-sx-alt/50 p-3 text-sm text-slate-300">
        <h3 className="font-semibold text-white">Pilot check-in, this week</h3>
        <p className="mt-1">Four quick questions each week: how useful it was, what it brought you, what is missing and whether you would pay for it as it is.</p>
      </div>
    </div>
  );
}

// The claim form's price box for an empty lot: 7, 14 and 30 days, each with and without Pro.
export function ClaimPreview({ plot }) {
  const layout = useCityStore((s) => s.layout);
  const terms = useMemo(() => claimTerms(plot), [plot]);
  const month = terms.find((t) => t.days === 30) ?? terms[terms.length - 1];
  return (
    <div className="space-y-3" data-testid="tour-claim">
      <header>
        <p className="text-xs uppercase tracking-wide text-sx-muted">Claim this plot</p>
        <h2 className="text-2xl font-bold text-white">{plot.title}</h2>
        <p className="text-sm text-slate-400">{addressOf(plot, layout)}</p>
      </header>
      <fieldset className="rounded-xl border border-sx-stroke p-3">
        <legend className="px-1 text-xs uppercase text-slate-400">Lease</legend>
        <ul className="grid grid-cols-3 gap-2" data-testid="tour-claim-terms">
          {terms.map((t) => (
            <li key={t.days} className={`rounded-lg px-2 py-2 text-center ${t.days === 30 ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'bg-sx-alt text-slate-200'}`} data-days={t.days}>
              <span className="block text-sm font-semibold">{t.label}</span>
              <span className="block font-mono text-sm">{dollars(t.price)}</span>
              <span className="block text-[11px] text-emerald-200">Pro {dollars(t.proPrice)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">Nobody can take your business over while the lease runs, and only you can renew it near the end.</p>
      </fieldset>
      <div className="rounded-xl border border-sx-stroke bg-sx-alt/40 px-3 py-2 text-sm text-slate-300">
        {month.lines.map((l) => (
          <div key={l.label} className="flex justify-between"><span>{l.label}</span><span className="font-mono">{dollars(l.amount)}</span></div>
        ))}
        <div className="mt-1 flex justify-between border-t border-sx-stroke pt-1"><span>For 30 days</span><span className="font-mono">{dollars(month.price)}</span></div>
        <div className="flex justify-between text-emerald-300" data-testid="tour-pro-discount"><span>Pro: {month.proOff}% off plots</span><span className="font-mono">−{dollars(Math.round((month.price - month.proPrice) * 100) / 100)}</span></div>
        <div className="mt-1 flex justify-between border-t border-sx-stroke pt-1 font-bold text-white"><span>Total with Pro</span><span className="font-mono">{dollars(month.proPrice)}</span></div>
      </div>
      <button type="button" disabled className="min-h-11 w-full rounded-lg bg-green-600 text-sm font-medium text-white opacity-50">Claim plot ({dollars(month.price)})</button>
      <Note>Preview: in the tour nothing is claimed or paid. In the city the same form is open to anyone signed in.</Note>
    </div>
  );
}

// The cart with a lease, Pro and a sponsored week: one payment, the card fee paid once.
export function CartPreview({ plot, lot }) {
  const cart = useMemo(() => sampleCart(lot, plot.title), [lot, plot.title]);
  const KIND = { claim: 'Plot lease', pro: 'Pro, monthly', sponsored: 'Sponsored week' };
  return (
    <div className="space-y-3" data-testid="tour-cart">
      <header>
        <p className="text-xs uppercase tracking-wide text-sx-muted">Your cart</p>
        <h2 className="text-2xl font-bold text-white">One checkout for everything</h2>
      </header>
      <ul className="divide-y divide-sx-stroke rounded-xl border border-sx-stroke bg-sx-panel">
        {cart.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-sx-muted">{KIND[i.kind]}</p>
              <p className="break-words text-slate-100">{i.label}</p>
              {i.discountCents > 0 && <p className="text-xs text-emerald-300">Pro price: {money(i.discountCents)} off</p>}
            </div>
            <span className="font-mono text-slate-100">{money(i.cents)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 rounded-xl border border-sx-stroke bg-sx-alt/50 p-3 text-sm">
        <div className="flex justify-between text-slate-300"><dt>Subtotal</dt><dd className="font-mono">{money(cart.subtotalCents)}</dd></div>
        <div className="flex justify-between text-emerald-300"><dt>Pro discount (15% off plots)</dt><dd className="font-mono">−{money(cart.discountCents)}</dd></div>
        <div className="flex justify-between text-base font-semibold text-white"><dt>Total</dt><dd className="font-mono" data-testid="tour-cart-total">{money(cart.totalCents)}</dd></div>
        <p className="text-xs text-sx-muted">One payment instead of {cart.count} saves {money(cart.feeSavedCents)} in card fees.</p>
      </dl>
      <button type="button" disabled className="min-h-11 w-full rounded-xl bg-gradient-to-r from-sx-purple to-sx-blue font-bold text-white opacity-50">Check out · {money(cart.totalCents)}</button>
      <Note>Preview: in the tour nothing is bought. The real cart is at /cart for a signed-in owner.</Note>
    </div>
  );
}
