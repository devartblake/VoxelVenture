"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { apiOn, request } from '@/lib/data/api';
import { Globe, Search } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';
import { DIRECTORY_SORTS, buildDirectory, isLive, liveDataProvider } from '@/lib/data/liveData';
import { describeBusiness } from '@/lib/game/plotInfo';
import { openSiteLink } from '@/lib/data/sync';
import { LogoBadge } from '../PlotInfoCards';
import ImpressionTracker from '@/components/business/ImpressionTracker';

// What the directory is showing, kept while the page is open: opening a building and coming back finds the same search, sort and filters.
export const useDirectoryFilters = create((set) => ({ sort: 'value', query: '', type: null, district: null, set: (patch) => set(patch) }));
const TYPES = [['shop', 'Shops'], ['restaurant', 'Food'], ['office', 'Offices']];

// The businesses with a paid sponsored placement (GET /businesses/featured), by profile: their rows say "Sponsored" and come first.
function useSponsored() {
  const [slugs, setSlugs] = useState([]);
  useEffect(() => {
    if (!apiOn()) return undefined;
    let live = true;
    request('GET', '/businesses/featured?placement=discover').then((f) => live && setSlugs((f.sponsored ?? []).map((x) => x.slug)), () => {});
    return () => {
      live = false;
    };
  }, []);
  return slugs;
}

// The directory: every plot with a building, numbered from 1 to the last, newest ideas first (by value by default). It is the first
// thing a visitor sees. Click a row to open the building (and fly the map there); Visit website opens the business's site.
export default function DirectoryView() {
  const plots = useCityStore((s) => s.plots);
  const activity = useCityStore((s) => s.activity);
  const setSelectedPlot = useCityStore((s) => s.setSelectedPlot);
  const { sort, query, type, district, set } = useDirectoryFilters();
  const setSort = (v) => set({ sort: v });
  const setQuery = (v) => set({ query: v });
  const provider = liveDataProvider();
  const sponsored = useSponsored();
  const districts = useMemo(() => [...new Set(plots.filter((p) => p.owner && p.buildingType !== 'house').map((p) => p.district).filter(Boolean))].sort(), [plots]);
  const { total, entries: found } = useMemo(() => buildDirectory(plots, { sort, query, type, district }), [plots, sort, query, type, district]);
  // paid placements first, clearly labelled; the rest in the chosen order
  const entries = useMemo(() => [...found.filter((e) => sponsored.includes(e.plot.profileSlug)), ...found.filter((e) => !sponsored.includes(e.plot.profileSlug))], [found, sponsored]);
  const chip = (on) => `rounded-full border px-2.5 py-0.5 pointer-coarse:py-1.5 ${on ? 'border-transparent bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'border-sx-stroke text-slate-300 hover:bg-sx-alt'}`;
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]" role="group" aria-label="Kind of business">
          <span className="text-slate-500">Kind</span>
          <button type="button" onClick={() => set({ type: null })} aria-pressed={!type} className={chip(!type)}>All</button>
          {TYPES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => set({ type: type === id ? null : id })} aria-pressed={type === id} className={chip(type === id)} data-testid={`directory-type-${id}`}>{label}</button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          District
          <select value={district ?? ''} onChange={(e) => set({ district: e.target.value || null })} className="min-w-0 flex-1 rounded-full border border-sx-stroke bg-sx-panel px-2 py-1 text-[11px] text-slate-200 pointer-coarse:py-2" data-testid="directory-district">
            <option value="">Every district</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        {(type || district || query) && (
          <button type="button" onClick={() => set({ type: null, district: null, query: '' })} className="mt-2 text-[11px] text-sx-cyan underline">Clear the search and filters</button>
        )}
      </div>

      {!entries.length && <p className="text-xs text-slate-500" data-testid="directory-empty">Nothing matches{type || district ? ' with these filters' : ''}. Try another word, or clear the filters.</p>}
      {/* the rows of buildings linked to a business profile count as that profile's impressions in the in-game directory */}
      <ImpressionTracker surface="directory" watch={`${sort}|${query}`} />
      <ol className="space-y-2" data-testid="directory-list">
        {entries.map(({ plot: p, number, rank }) => {
          const visits = provider.visits(p, activity[p.id]);
          return (
            <li key={p.id} data-slug={p.profileSlug ?? undefined} className="overflow-hidden rounded-2xl border border-sx-stroke bg-sx-alt/40 transition hover:border-sx-line">
              <button
                onClick={() => {
                  setSelectedPlot(p, 'search');
                  useWorld.getState().focusOn(p.x, p.z, 26);
                }}
                className="flex w-full items-start gap-3 p-3 text-left"
              >
                <span className="mt-0.5 w-7 shrink-0 rounded-md bg-sx-stroke px-1 py-0.5 text-center font-mono text-[10px] font-bold text-sx-cyan" title={`Rank ${rank} by value`}>
                  {String(number).padStart(Math.max(2, pad), '0')}
                </span>
                <LogoBadge plot={p} size="h-12 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="block truncate text-sm font-bold text-white">{p.title}</span>
                    {sponsored.includes(p.profileSlug) && <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300" data-testid="sponsored-label">Sponsored</span>}
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-snug text-slate-400">{describeBusiness(p)}</span>
                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-wide text-slate-500">
                    Plot #{p.id} · ${p.value.toLocaleString()} value · {visits.toLocaleString()} visits
                  </span>
                </span>
              </button>
              <div className="flex border-t border-sx-stroke text-[11px]">
                {p.website ? (
                  <a href={p.website} target="_blank" rel="noreferrer" onClick={(e) => openSiteLink(e, p, 'directory')} className="flex flex-1 items-center justify-center gap-1.5 py-2 font-semibold text-slate-300 hover:bg-sx-panel hover:text-sx-cyan">
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
        {isLive() ? 'Live data.' : 'Visit counts here are simulated until the live data service is connected (docs/architecture/live_data.md).'}
      </p>
    </div>
  );
}
