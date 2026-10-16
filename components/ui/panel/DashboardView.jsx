"use client";

import React, { useMemo } from 'react';
import { CheckCircle2, Circle, Download, Eye, MousePointerClick, Paintbrush, Search, Users } from 'lucide-react';
import { dashboardCsv, dashboardRows, dashboardTotals, ownedAdSlots, ownedBusinesses } from '@/lib/game/dashboard';
import { liveDataProvider } from '@/lib/data/liveData';
import { FIXTURE_PRICES } from '@/lib/content/fixturePrices';
import { businessWorth, pricesConfigured } from '@/lib/content/fixturePricing';
import { describeLease } from '@/lib/game/leases';
import { useCityStore } from '@/lib/state/store';
import { useDesigns } from '@/lib/state/designStore';
import { usePanel } from '@/lib/state/panelStore';
import { useWorld } from '@/lib/state/worldStore';
import { LogoBadge } from '../PlotInfoCards';
import ShareBox from '../ShareBox';

const money = (n) => `$${Math.round(n).toLocaleString()}`;

function Tile({ icon: Icon, label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-sx-stroke bg-sx-alt/40 p-2.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400"><Icon className="h-3 w-3" /> {label}</span>
      <span className={`mt-0.5 block font-mono text-lg font-bold ${tone}`}>{value}</span>
    </div>
  );
}

// The last fourteen days of visits as small bars.
function Bars({ days }) {
  const max = Math.max(1, ...days.map((d) => d.views));
  return (
    <div className="mt-2 flex h-9 items-end gap-0.5" role="img" aria-label="Visits over the last fourteen days" data-testid="dashboard-bars">
      {days.map((d) => (
        <span key={d.ago} title={`${d.ago === 0 ? 'Today' : `${d.ago} days ago`}: ${d.views} views`} className="flex-1 rounded-t bg-gradient-to-t from-sx-blue/70 to-sx-cyan/80" style={{ height: `${Math.max(8, (d.views / max) * 100)}%` }} />
      ))}
    </div>
  );
}

// "My businesses": everything you own, how each is doing over the last 30 days, and what to do next to make it better.
// (Figures are the live ones with a game server and simulated ones without; the card says which.)
export default function DashboardView() {
  const plots = useCityStore((s) => s.plots);
  const layout = useCityStore((s) => s.layout);
  const activity = useCityStore((s) => s.activity);
  const gold = useCityStore((s) => s.gold);
  const designs = useDesigns((s) => s.designs);
  const billboards = useCityStore((s) => s.billboards);
  const setSelectedPlot = useCityStore((s) => s.setSelectedPlot);
  const openInterior = useCityStore((s) => s.openInterior);

  const mine = useMemo(() => ownedBusinesses(plots, layout), [plots, layout]);
  const rows = useMemo(
    () =>
      dashboardRows(mine, {
        statsOf: (p) => liveDataProvider().plotStats(p, activity[p.id] ?? {}),
        designed: designs,
        leaseOf: (p) => (p.lease?.end ? describeLease(p.lease.end, p.lease.days) : null),
        worthOf: (p) => businessWorth(p, designs[p.id]),
      }),
    [mine, activity, designs]
  );
  const totals = dashboardTotals(rows);
  const slots = useMemo(() => ownedAdSlots(billboards), [billboards]);
  const byId = new Map(mine.map((p) => [p.id, p]));

  if (!rows.length && !slots.length) {
    return (
      <div className="space-y-3 text-xs text-slate-300" data-testid="dashboard-empty">
        <p className="text-sm font-bold text-white">You don't own a building yet.</p>
        <p>Claim an empty lot or take over a business, then design its inside. Your buildings, their visitors and what to do next all show up here.</p>
        <div className="flex gap-2">
          <button onClick={() => usePanel.getState().open('directory')} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-2 font-bold text-white hover:brightness-110"><Search className="h-3.5 w-3.5" /> Browse the directory</button>
          <button onClick={() => usePanel.getState().open('places')} className="rounded-lg border border-sx-stroke px-3 py-2 text-slate-200 hover:bg-sx-alt">Places</button>
        </div>
      </div>
    );
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([dashboardCsv(rows)], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'my-businesses.csv' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-3 text-slate-100" data-testid="dashboard">
      <div className="grid grid-cols-2 gap-2">
        <Tile icon={Users} label="Businesses" value={totals.businesses} />
        <Tile icon={Eye} label="Visitors (30 d)" value={totals.uniques.toLocaleString()} />
        <Tile icon={MousePointerClick} label="Website clicks" value={totals.clicks.toLocaleString()} tone="text-sx-cyan" />
        <Tile icon={Paintbrush} label="Set-up steps left" value={totals.stepsLeft} tone={totals.stepsLeft ? 'text-amber-300' : 'text-emerald-300'} />
      </div>
      <p className="text-[11px] text-slate-400">
        Worth {money(totals.value)} in all · you have {gold.toLocaleString()} Gold.{' '}
        {rows[0]?.simulated ? 'Visitor figures are simulated until the game server is connected.' : 'Visitor figures count verified human visits only.'}
      </p>

      {rows.map((r) => {
        const p = byId.get(r.id);
        const next = r.steps.find((s) => !s.done);
        return (
          <section key={r.id} className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3" data-testid="dashboard-row">
            <div className="flex items-start gap-2.5">
              <LogoBadge plot={p} size="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-white">{r.title}</h3>
                <p className="truncate text-[11px] text-slate-400">{r.mall ? 'Mega mall store' : r.district} · {money(r.value)}</p>
                {r.lease && <p className={`mt-0.5 text-[10px] ${r.lease.state === 'active' ? 'text-emerald-300' : 'text-amber-300'}`}>{r.lease.text}</p>}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg bg-sx-panel/70 py-1"><span className="block font-mono text-sm font-bold">{r.views.toLocaleString()}</span><span className="text-[9px] uppercase text-slate-400">views</span></div>
              <div className="rounded-lg bg-sx-panel/70 py-1"><span className="block font-mono text-sm font-bold">{r.clicks.toLocaleString()}</span><span className="text-[9px] uppercase text-slate-400">clicks · {(r.ctr * 100).toFixed(1)}%</span></div>
              <div className="rounded-lg bg-sx-panel/70 py-1"><span className="block font-mono text-sm font-bold">{r.avgSeconds}s</span><span className="text-[9px] uppercase text-slate-400">inside</span></div>
            </div>
            {r.days.length > 1 && <Bars days={r.days} />}
            {pricesConfigured() && r.worth && (
              <p className="mt-1.5 text-[11px] text-slate-300" data-testid="dashboard-worth">
                Worth <span className="font-semibold text-emerald-300">{FIXTURE_PRICES.currency}{r.worth.total.toLocaleString()}</span>
                <span className="text-slate-500"> · the place {FIXTURE_PRICES.currency}{r.worth.base.toLocaleString()} + {r.worth.count} fixture{r.worth.count === 1 ? '' : 's'} {FIXTURE_PRICES.currency}{r.worth.fixtures.toLocaleString()}</span>
              </p>
            )}
            {r.offers.length > 0 && <p className="mt-1.5 text-[10px] text-amber-200">Offers: {r.offers.join(', ')}</p>}

            <details className="mt-2" open={r.stepsDone < r.steps.length && r.stepsDone < 3}>
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-200">Set-up: {r.stepsDone} of {r.steps.length} done{next ? ` · next: ${next.label}` : ''}</summary>
              <ul className="mt-1.5 space-y-1">
                {r.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-1.5 text-[11px]">
                    {s.done ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />}
                    <span className={s.done ? 'text-slate-500 line-through' : 'text-slate-200'}>{s.label}<span className="block text-[10px] text-slate-500 no-underline">{s.hint}</span></span>
                  </li>
                ))}
              </ul>
            </details>

            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-200">Share this building: link and website badge</summary>
              <div className="mt-1.5"><ShareBox plot={p} /></div>
            </details>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => setSelectedPlot(p)} className="rounded-full border border-sx-stroke px-2.5 py-1 text-[11px] text-slate-200 hover:bg-sx-alt">Open card</button>
              <button onClick={() => openInterior(p)} className="flex items-center gap-1 rounded-full bg-gradient-to-r from-sx-purple to-sx-blue px-2.5 py-1 text-[11px] font-bold text-white hover:brightness-110"><Paintbrush className="h-3 w-3" /> Design inside</button>
              <button onClick={() => useWorld.getState().focusOn(p.x, p.z, 30)} className="rounded-full border border-sx-stroke px-2.5 py-1 text-[11px] text-slate-200 hover:bg-sx-alt">Show on map</button>
            </div>
          </section>
        );
      })}

      {slots.length > 0 && (
        <section className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3" data-testid="dashboard-slots">
          <h3 className="mb-1.5 text-sm font-bold text-white">Your ad spaces</h3>
          <ul className="space-y-1.5">
            {slots.map((a) => (
              <li key={a.id} className="rounded-lg bg-sx-panel/70 p-2 text-[11px]">
                <div className="flex justify-between gap-2"><span className="truncate font-semibold text-slate-100">{a.headline ?? a.name}</span><span className="shrink-0 text-slate-400">{a.kind} · {a.holder ? 'you hold it' : 'shared'}</span></div>
                <div className="text-slate-400">{a.name} · {a.views.toLocaleString()} views · {a.clicks.toLocaleString()} clicks ({(a.ctr * 100).toFixed(1)}%){a.sharers ? ` · ${a.sharers} sharing` : ''}</div>
                <button onClick={() => useCityStore.getState().setSelectedBillboard(billboards.find((b) => b.id === a.id))} className="mt-1 text-sx-cyan hover:underline">Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button onClick={download} className="flex items-center gap-1.5 rounded-full border border-sx-stroke px-3 py-1 text-[11px] text-slate-200 hover:border-sx-line" data-testid="dashboard-csv"><Download className="h-3 w-3" /> Download figures as CSV</button>
    </div>
  );
}
