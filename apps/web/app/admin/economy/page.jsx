"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { apiBase } from '@/lib/data/api';

// The plot economy's data (services/api/economy.mjs, docs/monetization/plot_economy_data.md): per tier and per district, the supply (plots, vacancy),
// the demand (visits, store entries, foot traffic, watchers) and the claim funnel with its conversion rates, for a date range. What a demand index
// will be fitted on after the pilot; nothing here sets a price. Needs the API and its ADMIN_TOKEN, kept for this browser tab only.
const TOKEN_KEY = 'voxelventure-admin'; // the same key as the pilot dashboard and the market's admin tools: one sign-in for all
const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};
const keepToken = (t) => {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: asked again next time */
  }
};
const usd = (cents) => (cents == null ? '–' : `$${(cents / 100).toFixed(2)}`);
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

const COLUMNS = [
  ['Plots', (g) => g.plots],
  ['Occupied', (g) => g.occupied],
  ['Vacant', (g) => `${g.vacant} (${pct(g.vacancyRate)})`],
  ['Mean days empty', (g) => g.meanDaysEmpty],
  ['Visits', (g) => g.visits],
  ['Store entries', (g) => g.storeEntries],
  ['Foot traffic', (g) => `${g.traffic.passes} / ${g.traffic.players}`, 'passes (a player once an hour per area) / players (once a day per area)'],
  ['Cards → hold → quote → checkout → claimed', (g) => ['card_open', 'hold', 'quote', 'checkout', 'claimed'].map((s) => g.claim.steps[s]).join(' → ')],
  ['Card → claim', (g) => pct(g.claim.conversion.cardToClaim)],
  ['Quote → claim', (g) => pct(g.claim.conversion.quoteToClaim)],
  ['Abandoned', (g) => g.claim.steps.abandoned, 'holds that ended without a claim or a checkout'],
  ['Median quote', (g) => usd(g.claim.medianQuoteCents)],
  ['Take-overs tried / done', (g) => `${g.takeover.attempts} / ${g.takeover.completions}`, 'take-over forms opened / take-overs completed'],
  ['Renewed / lapsed', (g) => `${g.renewals} / ${g.lapses}`],
  ['Watchers', (g) => g.watchers],
];

function GroupTable({ title, groups }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[72rem] text-left text-xs">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2">Group</th>
              {COLUMNS.map(([label, , hint]) => <th key={label} className="px-3 py-2" title={hint}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className={`border-t border-slate-800 ${g.id === 'all' ? 'font-semibold' : ''}`}>
                <td className="px-3 py-2 capitalize">{g.label}</td>
                {COLUMNS.map(([label, value]) => <td key={label} className="whitespace-nowrap px-3 py-2 font-mono">{value(g)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EconomyPage() {
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState('');
  const [range, setRange] = useState(() => ({ from: day(Date.now() - 29 * 86400000), to: day(Date.now()) }));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = apiBase();

  useEffect(() => setToken(readToken()), []);
  const load = useCallback(async () => {
    if (!token || !base) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/admin/economy?from=${range.from}&to=${range.to}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) {
        keepToken('');
        setToken('');
        throw new Error('That admin token is not right.');
      }
      if (!res.ok) throw new Error(json.error ?? `The API answered ${res.status}.`);
      setData(json);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [token, base, range]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-bold">Plot economy</h1>
          <p className="text-sm text-slate-400">Verified figures only. The data a demand index will be fitted on; it sets no price.</p>
          <a href="/admin/pilot" className="ml-auto text-sm text-cyan-300 hover:underline">Pilot dashboard</a>
        </header>

        {!base && <p className="mt-6 rounded-lg border border-amber-900 bg-amber-950/30 p-4 text-sm">This page needs the API: build the app with <code>NEXT_PUBLIC_LIVE_API_URL</code> set, and start it with <code>npm run api</code>.</p>}

        {base && !token && (
          <form className="mt-6 flex max-w-md flex-col gap-2" onSubmit={(e) => (e.preventDefault(), keepToken(draft.trim()), setToken(draft.trim()))}>
            <label htmlFor="admin-token" className="text-sm text-slate-300">Admin token (the API&apos;s <code>ADMIN_TOKEN</code>; kept for this tab only)</label>
            <div className="flex gap-2">
              <input id="admin-token" type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3" />
              <button className="min-h-11 rounded-lg bg-cyan-600 px-4 font-medium text-white hover:bg-cyan-500">Open</button>
            </div>
          </form>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}

        {token && data && (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">From <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="min-h-9 rounded-md border border-slate-700 bg-slate-900 px-2" /></label>
              <label className="flex items-center gap-2">To <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="min-h-9 rounded-md border border-slate-700 bg-slate-900 px-2" /></label>
              <button onClick={load} disabled={busy} className="min-h-9 rounded-md border border-slate-700 px-3 hover:bg-slate-800">{busy ? 'Loading…' : 'Refresh'}</button>
              <button onClick={() => (keepToken(''), setToken(''), setData(null))} className="ml-auto min-h-9 px-2 text-slate-400 hover:text-slate-200">Sign out</button>
            </div>
            <p className="mt-2 text-xs text-slate-400">{data.from} to {data.to} (UTC). Foot traffic is counted per {data.areaSize}-unit square of the map; a group&apos;s traffic is that of the squares its plots stand in.</p>

            <GroupTable title="By tier" groups={[...data.tiers, data.total]} />
            <GroupTable title="By district" groups={[...data.districts, data.total]} />

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section>
                <h2 className="text-sm font-semibold text-slate-300">Most watched plots</h2>
                {data.topWatched.length === 0 ? <p className="mt-2 text-sm text-slate-400">Nobody watches a plot yet.</p> : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {data.topWatched.map((w) => <li key={w.plotId}><a href={`/?plot=${w.plotId}`} className="text-cyan-300 hover:underline">{w.title}</a> <span className="text-slate-400">#{w.plotId} · {w.watchers} watching · lease {w.lease}</span></li>)}
                  </ul>
                )}
              </section>
              <section>
                <h2 className="text-sm font-semibold text-slate-300">Busiest areas</h2>
                {data.topAreas.length === 0 ? <p className="mt-2 text-sm text-slate-400">No foot traffic in this range.</p> : (
                  <ul className="mt-2 space-y-1 font-mono text-sm">
                    {data.topAreas.map((a) => <li key={a.area}>{a.area} <span className="text-slate-400">{a.passes} passes · {a.players} players · {a.plots} plots</span></li>)}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
