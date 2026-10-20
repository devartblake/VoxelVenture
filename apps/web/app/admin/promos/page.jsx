"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { apiBase } from '@/lib/data/api';
import { PROMO_GROUPS, PROMO_GROUP_IDS } from '@voxelventure/business-core';

// Promo codes (services/api/promo.mjs, docs/monetization/billing.md#promo-codes): discount codes for VoxelVenture's own services (plot leases, building
// upgrades, the Launch Pack, Pro's first month, sponsored weeks, market stalls). Not the merchants' coupons. Make one code or a batch, see how each is
// used, switch one off, change its limits or end, copy it, export the list. Needs the API and its ADMIN_TOKEN, kept for this browser tab only.
const TOKEN_KEY = 'voxelventure-admin'; // the same key as the other admin pages: one sign-in for all
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
const usd = (cents) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const day = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const toMs = (local) => (local ? new Date(local).getTime() : null); // a datetime-local value, in this browser's time zone
const toLocal = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const covers = (p) => (p.appliesTo.includes('all') ? 'Everything' : p.groups.map((g) => PROMO_GROUPS[g]?.label ?? g).join(', '));
const STATUS_TONE = { active: 'text-emerald-300', scheduled: 'text-sky-300', used_up: 'text-amber-300', expired: 'text-slate-400', inactive: 'text-rose-300' };
const FIELD = 'min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm';
const BUTTON = 'min-h-11 rounded-lg border border-slate-700 px-3 text-sm hover:bg-slate-800 disabled:opacity-40';
const EMPTY = { code: '', count: 1, prefix: 'VV', kind: 'percent', value: '', groups: ['all'], minSubtotal: '', maxRedemptions: '', perAccountLimit: 1, startsAt: '', expiresAt: '', newCustomersOnly: false, campaign: '', note: '' };

export default function PromosPage() {
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState({ status: 'all', group: '', q: '', campaign: '' });
  const [promos, setPromos] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState([]);
  const base = apiBase();

  useEffect(() => setToken(readToken()), []);
  // one admin call (the API's admin check, services/api/server.mjs adminOnly)
  const call = useCallback(
    async (method, path, body) => {
      const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 403) {
        keepToken('');
        setToken('');
        throw new Error('That admin token is not right.');
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `The API answered ${res.status}.`);
      return json;
    },
    [base, token]
  );
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v && v !== 'all')).toString();
  const load = useCallback(async () => {
    if (!token || !base) return;
    setBusy(true);
    try {
      setPromos((await call('GET', `/admin/promos${query ? `?${query}` : ''}`)).promos);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [token, base, call, query]);
  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      const res = await fetch(`${base}/admin/promos.csv${query ? `?${query}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('The list could not be exported.');
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement('a'), { href: url, download: `promo-codes-${new Date().toISOString().slice(0, 10)}.csv` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-bold">Promo codes</h1>
          <p className="text-sm text-slate-400">Discounts on VoxelVenture&apos;s own services. One code per checkout; Pro codes cover the first month only.</p>
          <nav className="flex gap-3 text-sm sm:ml-auto">
            <a href="/admin/pilot" className="text-cyan-300 hover:underline">Pilot</a>
            <a href="/admin/economy" className="text-cyan-300 hover:underline">Plot economy</a>
          </nav>
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

        {token && base && (
          <>
            <CreateForm call={call} onMade={(list) => (setMade(list), load())} />
            {made.length > 0 && (
              <section className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4" aria-live="polite">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-emerald-200">Made {made.length} code{made.length === 1 ? '' : 's'}</h2>
                  <CopyButton text={made.map((p) => p.code).join('\n')} label={made.length === 1 ? 'Copy code' : 'Copy all'} />
                  <button type="button" onClick={() => setMade([])} className="ml-auto text-sm text-slate-400 hover:text-slate-200">Close</button>
                </div>
                <p className="mt-2 break-all font-mono text-sm">{made.slice(0, 50).map((p) => p.code).join('  ')}{made.length > 50 ? ` … and ${made.length - 50} more (in the list and the CSV)` : ''}</p>
              </section>
            )}

            <section className="mt-6">
              <div className="flex flex-wrap items-end gap-2 text-sm">
                <label className="flex flex-col gap-1">Status
                  <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="min-h-11 rounded-lg border border-slate-700 bg-slate-900 px-2">
                    {['all', 'active', 'scheduled', 'used_up', 'expired', 'inactive'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">Covers
                  <select value={filters.group} onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))} className="min-h-11 rounded-lg border border-slate-700 bg-slate-900 px-2">
                    <option value="">anything</option>
                    {PROMO_GROUP_IDS.map((g) => <option key={g} value={g}>{PROMO_GROUPS[g].label}</option>)}
                  </select>
                </label>
                <label className="flex min-w-40 flex-1 flex-col gap-1">Search (code, note, campaign)
                  <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} className="min-h-11 rounded-lg border border-slate-700 bg-slate-900 px-3" />
                </label>
                <button type="button" onClick={load} disabled={busy} className={BUTTON}>{busy ? 'Loading…' : 'Refresh'}</button>
                <button type="button" onClick={exportCsv} className={BUTTON}>Export CSV</button>
                <button type="button" onClick={() => (keepToken(''), setToken(''), setPromos(null))} className="min-h-11 px-2 text-slate-400 hover:text-slate-200">Sign out</button>
              </div>
              {promos && promos.length === 0 && <p className="mt-4 text-sm text-slate-400">No codes match.</p>}
              <ul className="mt-4 space-y-3" data-testid="promo-list">
                {(promos ?? []).map((p) => <PromoRow key={p.id} promo={p} call={call} onChange={load} setError={setError} />)}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      window.prompt('Copy this:', text);
    }
  };
  return <button type="button" onClick={copy} className="min-h-9 rounded-md border border-slate-700 px-2 text-xs hover:bg-slate-800">{done ? 'Copied' : label}</button>;
}

// Making codes: one (a code you choose, or a generated one) or a batch of generated ones (a campaign). Defaults: percent off, everything, one use per
// account, no total limit, no end.
function CreateForm({ call, onMade }) {
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const toggleGroup = (g) => setF((x) => {
    if (g === 'all') return { ...x, groups: ['all'] };
    const rest = x.groups.filter((y) => y !== 'all');
    const next = rest.includes(g) ? rest.filter((y) => y !== g) : [...rest, g];
    return { ...x, groups: next.length ? next : ['all'] };
  });
  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    const value = f.kind === 'percent' ? Math.round(Number(f.value)) : Math.round(Number(f.value) * 100);
    const body = {
      ...(f.code.trim() ? { code: f.code.trim() } : { count: Math.max(1, Math.round(Number(f.count) || 1)), prefix: f.prefix.trim() || 'VV' }),
      kind: f.kind,
      value,
      appliesTo: f.groups,
      minSubtotalCents: f.minSubtotal ? Math.round(Number(f.minSubtotal) * 100) : 0,
      maxRedemptions: f.maxRedemptions ? Math.round(Number(f.maxRedemptions)) : null,
      perAccountLimit: Math.max(1, Math.round(Number(f.perAccountLimit) || 1)),
      startsAt: toMs(f.startsAt),
      expiresAt: toMs(f.expiresAt),
      newCustomersOnly: f.newCustomersOnly,
      ...(f.campaign.trim() ? { campaign: f.campaign.trim() } : {}),
      ...(f.note.trim() ? { note: f.note.trim() } : {}),
    };
    setBusy(true);
    try {
      const r = await call('POST', '/admin/promos', body);
      onMade(r.promos);
      setF(EMPTY);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4" data-testid="promo-create">
      <h2 className="text-sm font-semibold text-slate-200">New code</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">Code (blank: generated)
          <input value={f.code} onChange={set('code')} maxLength={32} placeholder="e.g. SPRING25" className={`${FIELD} uppercase`} />
        </label>
        {!f.code.trim() && (
          <>
            <label className="flex flex-col gap-1 text-sm">How many
              <input type="number" min={1} max={500} value={f.count} onChange={set('count')} className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Prefix
              <input value={f.prefix} onChange={set('prefix')} maxLength={8} className={`${FIELD} uppercase`} />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm">Discount
          <span className="flex gap-2">
            <select value={f.kind} onChange={set('kind')} className={`${FIELD} w-auto`} aria-label="Kind of discount">
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </select>
            <input type="number" required min={f.kind === 'percent' ? 1 : 0.01} max={f.kind === 'percent' ? 100 : 10000} step={f.kind === 'percent' ? 1 : 0.01} value={f.value} onChange={set('value')} placeholder={f.kind === 'percent' ? '25' : '5.00'} className={FIELD} aria-label={f.kind === 'percent' ? 'Percent off' : 'Dollars off'} />
          </span>
        </label>
      </div>
      <fieldset className="mt-3">
        <legend className="text-sm">Covers</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {['all', ...PROMO_GROUP_IDS].map((g) => (
            <label key={g} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm">
              <input type="checkbox" checked={f.groups.includes(g)} onChange={() => toggleGroup(g)} />
              {g === 'all' ? 'Everything' : PROMO_GROUPS[g].label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">Minimum total before the code ($)
          <input type="number" min={0} step={0.01} value={f.minSubtotal} onChange={set('minSubtotal')} placeholder="none" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Uses in all (each code)
          <input type="number" min={1} value={f.maxRedemptions} onChange={set('maxRedemptions')} placeholder="unlimited" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Uses per account
          <input type="number" min={1} max={1000} value={f.perAccountLimit} onChange={set('perAccountLimit')} className={FIELD} />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={f.newCustomersOnly} onChange={set('newCustomersOnly')} /> New customers only (no paid order before)
        </label>
        <label className="flex flex-col gap-1 text-sm">Starts
          <input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Ends (blank: never)
          <input type="datetime-local" value={f.expiresAt} onChange={set('expiresAt')} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Campaign
          <input value={f.campaign} onChange={set('campaign')} maxLength={60} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Note
          <input value={f.note} onChange={set('note')} maxLength={200} className={FIELD} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={busy} className="min-h-11 rounded-lg bg-cyan-600 px-5 font-medium text-white hover:bg-cyan-500 disabled:opacity-40">{busy ? 'Making…' : f.code.trim() || Number(f.count) <= 1 ? 'Make the code' : `Make ${f.count} codes`}</button>
        {msg && <p role="alert" className="text-sm text-red-300">{msg}</p>}
      </div>
    </form>
  );
}

// One code: what it gives, its limits and dates, its usage; switch it off or on, change its limits or end, see its uses.
function PromoRow({ promo: p, call, onChange, setError }) {
  const [open, setOpen] = useState(false);
  const [uses, setUses] = useState(null);
  const [edit, setEdit] = useState(null);
  const act = async (fn) => {
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e.message);
    }
  };
  const showUses = async () => {
    setOpen((o) => !o);
    if (!uses) {
      try {
        setUses((await call('GET', `/admin/promos/${p.id}`)).redemptions);
      } catch (e) {
        setError(e.message);
      }
    }
  };
  const save = () => act(async () => {
    await call('PATCH', `/admin/promos/${p.id}`, { maxRedemptions: edit.maxRedemptions ? Math.round(Number(edit.maxRedemptions)) : null, perAccountLimit: Math.max(1, Math.round(Number(edit.perAccountLimit) || 1)), expiresAt: toMs(edit.expiresAt) });
    setEdit(null);
  });
  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900/40 p-4" data-testid="promo-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="break-all font-mono text-base font-semibold">{p.code}</span>
        <CopyButton text={p.code} />
        <span className="text-sm">{p.label}</span>
        <span className={`text-xs uppercase ${STATUS_TONE[p.status] ?? ''}`}>{p.status.replace('_', ' ')}</span>
        <span className="flex flex-wrap gap-2 sm:ml-auto">
          {p.active ? (
            <button type="button" onClick={() => act(() => call('POST', `/admin/promos/${p.id}/deactivate`))} className={BUTTON}>Deactivate</button>
          ) : (
            <button type="button" onClick={() => act(() => call('POST', `/admin/promos/${p.id}/reactivate`))} className={BUTTON}>Reactivate</button>
          )}
          <button type="button" onClick={() => setEdit(edit ? null : { maxRedemptions: p.maxRedemptions ?? '', perAccountLimit: p.perAccountLimit, expiresAt: toLocal(p.expiresAt) })} className={BUTTON} aria-expanded={Boolean(edit)}>Limits</button>
          <button type="button" onClick={showUses} className={BUTTON} aria-expanded={open}>Uses</button>
        </span>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="inline text-slate-500">Covers: </dt><dd className="inline">{covers(p)}</dd></div>
        <div><dt className="inline text-slate-500">Limits: </dt><dd className="inline">{p.maxRedemptions ?? '∞'} in all · {p.perAccountLimit} per account{p.minSubtotalCents ? ` · min ${usd(p.minSubtotalCents)}` : ''}{p.newCustomersOnly ? ' · new customers' : ''}</dd></div>
        <div><dt className="inline text-slate-500">Runs: </dt><dd className="inline">{p.startsAt ? day(p.startsAt) : 'now'} → {p.expiresAt ? day(p.expiresAt) : 'no end'}</dd></div>
        <div><dt className="inline text-slate-500">Used: </dt><dd className="inline" data-testid="promo-usage">{p.usage.redeemed} paid · {p.usage.reserved} in checkout · {usd(p.usage.discountedCents)} off · {usd(p.usage.revenueCents)} taken</dd></div>
        {(p.campaign || p.note) && <div className="sm:col-span-2 lg:col-span-4"><dt className="inline text-slate-500">Note: </dt><dd className="inline">{[p.campaign, p.note].filter(Boolean).join(' · ')}</dd></div>}
      </dl>
      {edit && (
        <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">Uses in all<input type="number" min={1} value={edit.maxRedemptions} onChange={(e) => setEdit((x) => ({ ...x, maxRedemptions: e.target.value }))} placeholder="unlimited" className={`${FIELD} w-32`} /></label>
          <label className="flex flex-col gap-1">Per account<input type="number" min={1} value={edit.perAccountLimit} onChange={(e) => setEdit((x) => ({ ...x, perAccountLimit: e.target.value }))} className={`${FIELD} w-28`} /></label>
          <label className="flex flex-col gap-1">Ends<input type="datetime-local" value={edit.expiresAt} onChange={(e) => setEdit((x) => ({ ...x, expiresAt: e.target.value }))} className={FIELD} /></label>
          <button type="button" onClick={save} className="min-h-11 rounded-lg bg-cyan-600 px-4 font-medium text-white hover:bg-cyan-500">Save</button>
        </div>
      )}
      {open && (
        <div className="mt-3 overflow-x-auto">
          {!uses ? <p className="text-sm text-slate-400">Loading…</p> : uses.length === 0 ? <p className="text-sm text-slate-400">Not used yet.</p> : (
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="text-slate-400"><tr><th className="py-1 pr-3">When</th><th className="py-1 pr-3">Account</th><th className="py-1 pr-3">Order</th><th className="py-1 pr-3">Off</th><th className="py-1 pr-3">Paid</th><th className="py-1">Use</th></tr></thead>
              <tbody>
                {uses.map((u) => (
                  <tr key={u.id} className="border-t border-slate-800">
                    <td className="py-1 pr-3">{day(u.at)}</td>
                    <td className="py-1 pr-3">{u.username} #{u.accountId}</td>
                    <td className="py-1 pr-3">#{u.orderId} {u.label ?? u.product} ({u.orderStatus})</td>
                    <td className="py-1 pr-3 font-mono">{usd(u.centsOff)}</td>
                    <td className="py-1 pr-3 font-mono">{usd(u.orderCents)}</td>
                    <td className="py-1">{u.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}
