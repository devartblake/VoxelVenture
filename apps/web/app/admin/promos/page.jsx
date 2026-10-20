"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { BadgePercent, Copy, Download, RefreshCw, Ticket, TicketCheck, Wallet } from 'lucide-react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Alert, Button, Checkbox, DataTable, Input, PageHeader, Section, Select, StatCard, StatusPill, cx, inputClass } from '@/components/admin/ui';
import { PROMO_GROUPS, PROMO_GROUP_IDS } from '@voxelventure/business-core';

// Promo codes (services/api/promo.mjs, docs/monetization/billing.md#promo-codes): discount codes for VoxelVenture's own services (plot leases, building
// upgrades, the Launch Pack, Pro's first month, sponsored weeks, market stalls). Not the merchants' coupons. Make one code or a batch, see how each is
// used, switch one off, change its limits or end, copy it, export the list. Needs the API and a signed-in admin (components/admin/AdminShell.jsx).
const usd = (cents) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const day = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const toMs = (local) => (local ? new Date(local).getTime() : null); // a datetime-local value, in this browser's time zone
const toLocal = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const covers = (p) => (p.appliesTo.includes('all') ? 'Everything' : p.groups.map((g) => PROMO_GROUPS[g]?.label ?? g).join(', '));
const STATUS = { active: ['green', 'Active'], scheduled: ['cyan', 'Scheduled'], used_up: ['amber', 'Used up'], expired: ['neutral', 'Ended'], inactive: ['red', 'Off'] };
const EMPTY = { code: '', count: 1, prefix: 'VV', kind: 'percent', value: '', groups: ['all'], minSubtotal: '', maxRedemptions: '', perAccountLimit: 1, startsAt: '', expiresAt: '', newCustomersOnly: false, campaign: '', note: '' };

export default function PromosPage() {
  const { call } = useAdmin();
  const [filters, setFilters] = useState({ status: 'all', group: '', q: '' });
  const [promos, setPromos] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState([]);
  const [open, setOpen] = useState(null); // the code whose uses are shown
  const [edit, setEdit] = useState(null); // { id, maxRedemptions, perAccountLimit, expiresAt }

  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v && v !== 'all')).toString();
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setPromos((await call(`/admin/promos${query ? `?${query}` : ''}`)).promos);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [call, query]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  const exportCsv = async () => {
    try {
      const res = await call(`/admin/promos.csv${query ? `?${query}` : ''}`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement('a'), { href: url, download: `promo-codes-${new Date().toISOString().slice(0, 10)}.csv` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  };
  const showUses = async (p) => {
    if (open?.id === p.id) return setOpen(null);
    setOpen({ id: p.id, uses: null });
    try {
      setOpen({ id: p.id, uses: (await call(`/admin/promos/${p.id}`)).redemptions });
    } catch (e) {
      setError(e.message);
    }
  };
  const save = () =>
    act(async () => {
      await call(`/admin/promos/${edit.id}`, { method: 'PATCH', body: { maxRedemptions: edit.maxRedemptions ? Math.round(Number(edit.maxRedemptions)) : null, perAccountLimit: Math.max(1, Math.round(Number(edit.perAccountLimit) || 1)), expiresAt: toMs(edit.expiresAt) } });
      setEdit(null);
    });

  const list = promos ?? [];
  const totals = list.reduce((a, p) => ({ active: a.active + (p.status === 'active' ? 1 : 0), redeemed: a.redeemed + p.usage.redeemed, reserved: a.reserved + p.usage.reserved, off: a.off + p.usage.discountedCents, revenue: a.revenue + p.usage.revenueCents }), { active: 0, redeemed: 0, reserved: 0, off: 0, revenue: 0 });

  const columns = [
    { key: 'code', header: 'Code', render: (p) => <span className="flex items-center gap-2"><span className="break-all font-mono font-semibold text-white">{p.code}</span><CopyButton text={p.code} /></span> },
    { key: 'off', header: 'Discount', className: 'whitespace-nowrap', render: (p) => p.label },
    { key: 'covers', header: 'Covers', render: (p) => <span className="text-xs">{covers(p)}</span> },
    { key: 'limits', header: 'Limits', render: (p) => <span className="text-xs">{p.maxRedemptions ?? '∞'} in all · {p.perAccountLimit} per account{p.minSubtotalCents ? ` · min ${usd(p.minSubtotalCents)}` : ''}{p.newCustomersOnly ? ' · new customers' : ''}</span> },
    { key: 'runs', header: 'Runs', render: (p) => <span className="text-xs">{p.startsAt ? day(p.startsAt) : 'now'} → {p.expiresAt ? day(p.expiresAt) : 'no end'}</span> },
    { key: 'status', header: 'Status', render: (p) => <StatusPill tone={STATUS[p.status]?.[0]}>{STATUS[p.status]?.[1] ?? p.status}</StatusPill> },
    { key: 'used', header: 'Used', align: 'right', title: 'paid / in a checkout now', render: (p) => <span data-testid="promo-usage">{p.usage.redeemed} / {p.usage.reserved}</span> },
    { key: 'discounted', header: 'Off', align: 'right', title: 'taken off paid orders', render: (p) => usd(p.usage.discountedCents) },
    { key: 'revenue', header: 'Taken', align: 'right', title: 'what the paid orders brought in', render: (p) => usd(p.usage.revenueCents) },
    {
      key: 'actions',
      header: 'Actions',
      srOnly: true,
      render: (p) => (
        <span className="flex flex-wrap justify-end gap-1.5">
          {p.active ? <Button size="sm" variant="danger" onClick={() => act(() => call(`/admin/promos/${p.id}/deactivate`, { method: 'POST' }))}>Deactivate</Button> : <Button size="sm" onClick={() => act(() => call(`/admin/promos/${p.id}/reactivate`, { method: 'POST' }))}>Reactivate</Button>}
          <Button size="sm" aria-expanded={edit?.id === p.id} onClick={() => setEdit(edit?.id === p.id ? null : { id: p.id, maxRedemptions: p.maxRedemptions ?? '', perAccountLimit: p.perAccountLimit, expiresAt: toLocal(p.expiresAt) })}>Limits</Button>
          <Button size="sm" aria-expanded={open?.id === p.id} onClick={() => showUses(p)}>Uses</Button>
        </span>
      ),
    },
  ];
  const after = (p) => {
    if (edit?.id !== p.id && open?.id !== p.id) return null;
    return (
      <tr>
        <td colSpan={columns.length} className="border-b border-sx-stroke/70 bg-sx-page/60 px-3 py-3">
          {(p.campaign || p.note) && <p className="mb-2 text-xs text-sx-muted">{[p.campaign, p.note].filter(Boolean).join(' · ')}</p>}
          {edit?.id === p.id && (
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label className="flex flex-col gap-1">Uses in all<Input type="number" min={1} value={edit.maxRedemptions} onChange={(e) => setEdit((x) => ({ ...x, maxRedemptions: e.target.value }))} placeholder="unlimited" className="w-32" /></label>
              <label className="flex flex-col gap-1">Per account<Input type="number" min={1} value={edit.perAccountLimit} onChange={(e) => setEdit((x) => ({ ...x, perAccountLimit: e.target.value }))} className="w-28" /></label>
              <label className="flex flex-col gap-1">Ends<Input type="datetime-local" value={edit.expiresAt} onChange={(e) => setEdit((x) => ({ ...x, expiresAt: e.target.value }))} /></label>
              <Button variant="primary" onClick={save}>Save</Button>
            </div>
          )}
          {open?.id === p.id && (
            <div className={cx('overflow-x-auto', edit?.id === p.id && 'mt-3')}>
              {!open.uses ? <p className="text-sm text-sx-muted">Loading…</p> : open.uses.length === 0 ? <p className="text-sm text-sx-muted">Not used yet.</p> : (
                <table className="w-full min-w-[36rem] text-left text-xs">
                  <thead className="text-sx-muted"><tr><th className="py-1 pr-3">When</th><th className="py-1 pr-3">Account</th><th className="py-1 pr-3">Order</th><th className="py-1 pr-3">Off</th><th className="py-1 pr-3">Paid</th><th className="py-1">Use</th></tr></thead>
                  <tbody>
                    {open.uses.map((u) => (
                      <tr key={u.id} className="border-t border-sx-stroke">
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
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        icon={BadgePercent}
        title="Promo codes"
        description="Discounts on VoxelVenture's own services, applied at checkout. One code per checkout; Pro codes cover the first month only. Not the merchants' coupons."
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</Button>
            <Button icon={Download} onClick={exportCsv}>Export CSV</Button>
          </>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active codes" value={totals.active} hint={`${list.length} in this list`} icon={Ticket} tone="cyan" />
        <StatCard label="Redemptions (paid)" value={totals.redeemed} hint={`${totals.reserved} in a checkout now`} icon={TicketCheck} tone="green" />
        <StatCard label="Discounted in all" value={usd(totals.off)} hint="taken off paid orders" icon={BadgePercent} tone="purple" />
        <StatCard label="Revenue with codes" value={usd(totals.revenue)} hint="what those orders brought in" icon={Wallet} tone="gold" />
      </div>

      <CreateForm call={call} onMade={(codes) => (setMade(codes), load())} />
      {made.length > 0 && (
        <Alert tone="success">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Made {made.length} code{made.length === 1 ? '' : 's'}</span>
            <CopyButton text={made.map((p) => p.code).join('\n')} label={made.length === 1 ? 'Copy code' : 'Copy all'} />
            <button type="button" onClick={() => setMade([])} className="ml-auto min-h-11 px-2 text-sm underline">Close</button>
          </div>
          <p className="mt-1 break-all font-mono text-sm">{made.slice(0, 50).map((p) => p.code).join('  ')}{made.length > 50 ? ` … and ${made.length - 50} more (in the list and the CSV)` : ''}</p>
        </Alert>
      )}

      <Section
        title="Codes"
        description="Newest first, with their usage. Deactivating stops a code at once; checkouts already paid keep their price."
        icon={Ticket}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="all">Any status</option>
              {Object.entries(STATUS).map(([k, [, label]]) => <option key={k} value={k}>{label}</option>)}
            </Select>
            <Select aria-label="Covers" value={filters.group} onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))}>
              <option value="">Covers anything</option>
              {PROMO_GROUP_IDS.map((g) => <option key={g} value={g}>{PROMO_GROUPS[g].label}</option>)}
            </Select>
            <Input aria-label="Search code, note or campaign" placeholder="Search" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} className="w-40" />
          </div>
        }
      >
        <DataTable caption="Promo codes" columns={columns} rows={list} rowKey={(p) => p.id} minWidth="64rem" empty={promos ? 'No codes match.' : 'Loading…'} renderAfter={after} data-testid="promo-list" />
      </Section>
    </div>
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
  return <Button size="sm" variant="ghost" icon={Copy} onClick={copy} aria-label={`${label}: ${text.split('\n')[0]}`}>{done ? 'Copied' : label}</Button>;
}

// Making codes: one (a code you choose, or a generated one) or a batch of generated ones (a campaign). Defaults: percent off, everything, one use per
// account, no total limit, no end.
function CreateForm({ call, onMade }) {
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleGroup = (g) =>
    setF((x) => {
      if (g === 'all') return { ...x, groups: ['all'] };
      const rest = x.groups.filter((y) => y !== 'all');
      const next = rest.includes(g) ? rest.filter((y) => y !== g) : [...rest, g];
      return { ...x, groups: next.length ? next : ['all'] };
    });
  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    const body = {
      ...(f.code.trim() ? { code: f.code.trim() } : { count: Math.max(1, Math.round(Number(f.count) || 1)), prefix: f.prefix.trim() || 'VV' }),
      kind: f.kind,
      value: f.kind === 'percent' ? Math.round(Number(f.value)) : Math.round(Number(f.value) * 100),
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
      onMade((await call('/admin/promos', { method: 'POST', body })).promos);
      setF(EMPTY);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };
  const labelCls = 'block text-sm font-medium text-slate-200';
  return (
    <Section title="New code" description="Leave the code blank to generate one (VV-XXXX-XXXX), or a batch for a campaign." icon={BadgePercent}>
      <form onSubmit={submit} className="space-y-4" data-testid="promo-create">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelCls}>Code<Input value={f.code} onChange={set('code')} maxLength={32} placeholder="blank: generated, e.g. SPRING25" className="mt-1.5 uppercase" /></label>
          {!f.code.trim() && (
            <>
              <label className={labelCls}>How many<Input type="number" min={1} max={500} value={f.count} onChange={set('count')} className="mt-1.5" /></label>
              <label className={labelCls}>Prefix<Input value={f.prefix} onChange={set('prefix')} maxLength={8} className="mt-1.5 uppercase" /></label>
            </>
          )}
          <div>
            <span className={labelCls}>Discount</span>
            <div className="mt-1.5 flex gap-2">
              <Select aria-label="Kind of discount" value={f.kind} onChange={set('kind')}>
                <option value="percent">% off</option>
                <option value="amount">$ off</option>
              </Select>
              <input type="number" required min={f.kind === 'percent' ? 1 : 0.01} max={f.kind === 'percent' ? 100 : 10000} step={f.kind === 'percent' ? 1 : 0.01} value={f.value} onChange={set('value')} placeholder={f.kind === 'percent' ? '25' : '5.00'} aria-label={f.kind === 'percent' ? 'Percent off' : 'Dollars off'} className={inputClass} />
            </div>
          </div>
        </div>
        <fieldset>
          <legend className={labelCls}>Covers</legend>
          <div className="mt-1 flex flex-wrap gap-x-4">
            {['all', ...PROMO_GROUP_IDS].map((g) => <Checkbox key={g} label={g === 'all' ? 'Everything' : PROMO_GROUPS[g].label} checked={f.groups.includes(g)} onChange={() => toggleGroup(g)} />)}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelCls}>Minimum total before the code ($)<Input type="number" min={0} step={0.01} value={f.minSubtotal} onChange={set('minSubtotal')} placeholder="none" className="mt-1.5" /></label>
          <label className={labelCls}>Uses in all (each code)<Input type="number" min={1} value={f.maxRedemptions} onChange={set('maxRedemptions')} placeholder="unlimited" className="mt-1.5" /></label>
          <label className={labelCls}>Uses per account<Input type="number" min={1} max={1000} value={f.perAccountLimit} onChange={set('perAccountLimit')} className="mt-1.5" /></label>
          <Checkbox label="New customers only (no paid order before)" checked={f.newCustomersOnly} onChange={set('newCustomersOnly')} className="self-end" />
          <label className={labelCls}>Starts<Input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} className="mt-1.5" /></label>
          <label className={labelCls}>Ends (blank: never)<Input type="datetime-local" value={f.expiresAt} onChange={set('expiresAt')} className="mt-1.5" /></label>
          <label className={labelCls}>Campaign<Input value={f.campaign} onChange={set('campaign')} maxLength={60} className="mt-1.5" /></label>
          <label className={labelCls}>Note<Input value={f.note} onChange={set('note')} maxLength={200} className="mt-1.5" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Making…' : f.code.trim() || Number(f.count) <= 1 ? 'Make the code' : `Make ${f.count} codes`}</Button>
          {msg && <Alert tone="error" className="flex-1">{msg}</Alert>}
        </div>
      </form>
    </Section>
  );
}
