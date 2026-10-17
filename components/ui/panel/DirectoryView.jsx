"use client";

import React, { useMemo, useState } from 'react';
import { Globe, Search } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';
import { DIRECTORY_SORTS, buildDirectory, isLive, liveDataProvider } from '@/lib/data/liveData';
import { describeBusiness } from '@/lib/game/plotInfo';
import { openSiteLink } from '@/lib/data/sync';
import { LogoBadge } from '../PlotInfoCards';

// The directory: every plot with a building, numbered from 1 to the last, newest ideas first (by value by default). It is the first
// thing a visitor sees. Click a row to open the building (and fly the map there); Visit website opens the business's site.
export default function DirectoryView() {
  const plots = useCityStore((s) => s.plots);
  const activity = useCityStore((s) => s.activity);
  const setSelectedPlot = useCityStore((s) => s.setSelectedPlot);
  const [sort, setSort] = useState('value');
  const [query, setQuery] = useState('');
  const provider = liveDataProvider();
  const { total, entries } = useMemo(() => buildDirectory(plots, { sort, query }), [plots, sort, query]);
  const pad = String(total).length;

  return (
    <div className="text-slate-100">
      <div className="mb-3 rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3">
        <p className="text-sm font-bold text-white">{total.toLocaleString()} buildings</p>
        <p className="text-[11px] text-slate-400">Every plot with a business, numbered from 1 to {total.toLocaleString()}. Pick one to see its building, its visitors and its history.</p>
        <label className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, owner, district or plot number" className="w-full rounded-full border border-sx-stroke bg-sx-panel py-1.5 pl-8 pr-3 text-xs text-white focus:border-sx-cyan focus:outline-none" />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-500">Sort by</span>
          {Object.entries(DIRECTORY_SORTS).map(([id, s]) => (
            <button key={id} onClick={() => setSort(id)} aria-pressed={sort === id} className={`rounded-full border px-2.5 py-0.5 ${sort === id ? 'border-transparent bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'border-sx-stroke text-slate-300 hover:border-sx-line'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!entries.length && <p className="text-xs text-slate-500">Nothing matches.</p>}
      <ol className="space-y-2" data-testid="directory-list">
        {entries.map(({ plot: p, number, rank }) => {
          const visits = provider.visits(p, activity[p.id]);
          return (
            <li key={p.id} className="overflow-hidden rounded-2xl border border-sx-stroke bg-sx-alt/40 transition hover:border-sx-line">
              <button
                onClick={() => {
                  setSelectedPlot(p);
                  useWorld.getState().focusOn(p.x, p.z, 26);
                }}
                className="flex w-full items-start gap-3 p-3 text-left"
              >
                <span className="mt-0.5 w-7 shrink-0 rounded-md bg-sx-stroke px-1 py-0.5 text-center font-mono text-[10px] font-bold text-sx-cyan" title={`Rank ${rank} by value`}>
                  {String(number).padStart(Math.max(2, pad), '0')}
                </span>
                <LogoBadge plot={p} size="h-12 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{p.title}</span>
                  <span className="line-clamp-2 text-[11px] leading-snug text-slate-400">{describeBusiness(p)}</span>
                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-wide text-slate-500">
                    Plot #{p.id} · ${p.value.toLocaleString()} value · {visits.toLocaleString()} visits
                  </span>
                </span>
              </button>
              <div className="flex border-t border-sx-stroke text-[11px]">
                {p.website ? (
                  <a href={p.website} target="_blank" rel="noreferrer" onClick={(e) => openSiteLink(e, p)} className="flex flex-1 items-center justify-center gap-1.5 py-2 font-semibold text-slate-300 hover:bg-sx-panel hover:text-sx-cyan">
                    <Globe className="h-3.5 w-3.5" /> Visit website
                  </a>
                ) : (
                  <span className="flex-1" />
                )}
                <span className="flex w-24 shrink-0 flex-col items-center justify-center border-l border-sx-stroke bg-sx-panel/60 py-1.5">
                  <span className="font-bold text-sx-cyan">${p.value.toLocaleString()}</span>
                  <span className="text-[9px] uppercase text-slate-500">value</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[10px] leading-snug text-slate-500">
        {isLive() ? 'Live data.' : 'Visit counts here are simulated until the live data service is connected (docs/live_data.md).'}
      </p>
    </div>
  );
}
