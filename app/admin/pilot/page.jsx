"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { apiBase } from '@/lib/data/api';

// The pilot dashboard (server/api/pilot.mjs, docs/monetization/pilot.md): each pilot business week by week, the merchants' feedback, and
// whether the criteria that lift the world-expansion freeze are met. Needs the API (NEXT_PUBLIC_LIVE_API_URL) and its ADMIN_TOKEN, which is
// kept for this browser tab only.
const TOKEN_KEY = 'voxelventure-admin'; // the same key as the market's admin tools (lib/state/marketStore.js): one sign-in for both
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
const usd = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const pct = (x) => `${Math.round(x * 100)}%`;
const shortWeek = (w) => new Date(`${w}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const PAY = { yes: 'Would pay', maybe: 'Maybe', no: 'Would not pay' };

export default function PilotPage() {
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [all, setAll] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [slug, setSlug] = useState('');
  const [note, setNote] = useState('');
  const base = apiBase();

  useEffect(() => setToken(readToken()), []);

  const call = useCallback(async (method, path, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error ?? `The API answered ${res.status}.`), { status: res.status });
    return json;
  }, [base, token]);

  const load = useCallback(async () => {
    if (!token || !base) return;
    setBusy(true);
    try {
      setData(await call('GET', `/admin/pilot?weeks=${weeks}${all ? '&all=1' : ''}`));
      setError('');
    } catch (e) {
      setError(e.status === 403 ? 'That admin token is not right.' : e.message);
      if (e.status === 403) (keepToken(''), setToken(''));
    } finally {
      setBusy(false);
    }
  }, [call, token, base, weeks, all]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await call('POST', '/admin/pilot/members', { slug: slug.trim(), note: note.trim() || undefined });
      setSlug('');
      setNote('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const remove = async (s) => {
    if (!window.confirm(`Take ${s} out of the pilot? Its record is kept.`)) return;
    try {
      await call('DELETE', `/admin/pilot/members/${s}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const download = async () => {
    const res = await fetch(`${base}/admin/pilot.csv?weeks=${weeks}${all ? '&all=1' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return setError('The spreadsheet could not be made.');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `pilot-${data?.currentWeek ?? 'figures'}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-bold">Pilot dashboard</h1>
          <p className="text-sm text-slate-400">Verified figures only. The criteria are the ones that lift the world-expansion freeze.</p>
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
              <label className="flex items-center gap-2">Weeks
                <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="min-h-9 rounded-md border border-slate-700 bg-slate-900 px-2">
                  {[1, 2, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every published business (a preview, not the pilot)</label>
              <button onClick={load} disabled={busy} className="min-h-9 rounded-md border border-slate-700 px-3 hover:bg-slate-800">{busy ? 'Loading…' : 'Refresh'}</button>
              <button onClick={download} className="min-h-9 rounded-md border border-slate-700 px-3 hover:bg-slate-800">Download CSV</button>
              <button onClick={() => (keepToken(''), setToken(''), setData(null))} className="ml-auto min-h-9 px-2 text-slate-400 hover:text-slate-200">Sign out</button>
            </div>

            <section aria-labelledby="criteria" className="mt-5">
              <h2 id="criteria" className="sr-only">Criteria</h2>
              <p className={`mb-3 rounded-lg p-3 text-sm font-medium ${data.verdict.lifts ? 'bg-emerald-950/50 text-emerald-200' : 'bg-slate-900 text-slate-300'}`}>
                {data.verdict.lifts ? 'Every criterion is met: the world-expansion freeze can lift (record the decision in docs/roadmap/world_freeze.md).' : `${data.verdict.met} of ${data.verdict.criteria.length} criteria met. The freeze stays until all are.`}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {data.verdict.criteria.map((c) => (
                  <li key={c.id} className={`rounded-xl border p-3 ${c.met ? 'border-emerald-800 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/60'}`} title={c.hint}>
                    <p className="text-xs text-slate-400">{c.label}</p>
                    <p className="mt-1 text-2xl font-bold">{c.kind === 'share' ? pct(c.actual) : c.kind === 'count' ? c.actual : c.actual ? 'Yes' : 'No'}</p>
                    <p className="text-xs text-slate-400">{c.kind === 'share' ? `${c.businesses} of ${c.of}, needs ${pct(c.target)}` : c.kind === 'count' ? `needs ${c.target}` : 'needs yes'} · <span className={c.met ? 'text-emerald-300' : 'text-amber-300'}>{c.met ? 'met' : 'not yet'}</span></p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="totals" className="mt-5">
              <h2 id="totals" className="text-sm font-semibold text-slate-300">All pilot businesses, {shortWeek(data.weeks[0])} to now</h2>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-8">
                {[['Businesses', data.businesses.length], ['Activated', data.totals.activated], ['Qualified visits', data.totals.qualified], ['Leads', data.totals.leads], ['Redeemed coupons', data.totals.redemptions], ['Purchases', data.totals.purchases], ['Verified revenue', usd(data.totals.verifiedRevenueCents)], ['Paid to us', usd(data.totals.paidCents)]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-900 p-2"><dt className="text-xs text-slate-400">{k}</dt><dd className="font-mono text-lg">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-slate-400">Feedback this period: {data.totals.feedback} answer(s){data.totals.averageRating != null ? `, average ${data.totals.averageRating} of 5` : ''}.</p>
            </section>

            <section aria-labelledby="businesses" className="mt-6">
              <h2 id="businesses" className="text-sm font-semibold text-slate-300">Businesses</h2>
              {data.businesses.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No business is in the pilot yet. Add one below (or tick &quot;Every published business&quot; to try the dashboard).</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full min-w-[56rem] text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Business</th>
                        <th className="px-3 py-2" title="# the owner came back that week · . they did not · blank: not in the pilot yet">Owner back, by week</th>
                        <th className="px-3 py-2">Views</th>
                        <th className="px-3 py-2">Qualified</th>
                        <th className="px-3 py-2">Presses</th>
                        <th className="px-3 py-2">Leads</th>
                        <th className="px-3 py-2">Claims / redeemed</th>
                        <th className="px-3 py-2">Purchases</th>
                        <th className="px-3 py-2">Verified revenue</th>
                        <th className="px-3 py-2">Paid / renewed</th>
                        <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.businesses.map((b) => (
                        <React.Fragment key={b.slug}>
                          <tr className="border-t border-slate-800 align-top">
                            <td className="px-3 py-2">
                              <a href={`/business/${b.slug}`} className="font-medium text-cyan-300 hover:underline">{b.name}</a>
                              <span className="block text-slate-500">{b.category}{b.district ? ` · ${b.district}` : ''}</span>
                              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${b.activated ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`}>{b.activated ? 'activated' : `set-up ${b.stepsDone}/${b.stepsTotal}`}</span>
                              {b.note && <span className="block text-slate-500">{b.note}</span>}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1" aria-label={`back in ${b.retention.activeWeeks} of ${b.retention.completedWeeks} completed weeks`}>
                                {b.weekly.map((w) => (
                                  <span key={w.week} title={`${shortWeek(w.week)}: ${!w.member ? 'not in the pilot yet' : w.ownerActive ? 'came back' : 'did not come back'}; ${w.views} views, ${w.ctaClicks} presses`} className={`h-5 w-5 rounded ${!w.member ? 'border border-dashed border-slate-700' : w.ownerActive ? 'bg-emerald-500' : 'bg-slate-700'} ${w.week === data.currentWeek ? 'ring-1 ring-slate-400' : ''}`} />
                                ))}
                              </div>
                              <span className={`mt-1 block ${b.returnedWeekly ? 'text-emerald-300' : 'text-slate-400'}`}>{b.retention.activeWeeks}/{b.retention.completedWeeks} weeks{b.returnedWeekly ? ' · returns weekly' : ''}</span>
                            </td>
                            <td className="px-3 py-2 font-mono">{b.totals.views}</td>
                            <td className="px-3 py-2 font-mono">{b.totals.qualified}</td>
                            <td className="px-3 py-2 font-mono">{b.totals.ctaClicks}</td>
                            <td className="px-3 py-2 font-mono">{b.totals.leads}</td>
                            <td className="px-3 py-2 font-mono">{b.totals.claims} / {b.totals.redemptions}</td>
                            <td className="px-3 py-2 font-mono">{b.totals.purchases}</td>
                            <td className="px-3 py-2 font-mono">{usd(b.totals.verifiedRevenueCents)}</td>
                            <td className="px-3 py-2 font-mono">{b.paid ? usd(b.paidCents) : '–'}{b.renewed ? ' · renewed' : ''}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              <button onClick={() => setOpen(open === b.slug ? null : b.slug)} aria-expanded={open === b.slug} className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800">Feedback ({b.feedback.length})</button>
                              {b.member && <button onClick={() => remove(b.slug)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-800 hover:text-red-300">Remove</button>}
                            </td>
                          </tr>
                          {open === b.slug && (
                            <tr className="bg-slate-900/50">
                              <td colSpan={11} className="px-3 py-3">
                                {b.feedback.length === 0 ? <p className="text-slate-400">No feedback in this period.</p> : (
                                  <ul className="space-y-2">
                                    {b.feedback.map((f) => (
                                      <li key={f.week}><span className="font-medium">{shortWeek(f.week)}:</span> {f.rating}/5 · {PAY[f.wouldPay]}{f.result ? <span className="block text-slate-300">Brought: {f.result}</span> : null}{f.missing ? <span className="block text-slate-300">Missing: {f.missing}</span> : null}</li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <form onSubmit={add} className="mt-6 flex max-w-2xl flex-wrap items-end gap-2 text-sm">
              <label className="flex flex-col gap-1">Business address (slug)
                <input value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9-]{1,48}" placeholder="amy-bakery" className="min-h-10 rounded-md border border-slate-700 bg-slate-900 px-2" />
              </label>
              <label className="flex flex-1 flex-col gap-1">Note (optional, only you see it)
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Met at the Saturday market" className="min-h-10 rounded-md border border-slate-700 bg-slate-900 px-2" />
              </label>
              <button className="min-h-10 rounded-md bg-cyan-600 px-4 font-medium text-white hover:bg-cyan-500">Add to the pilot</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
