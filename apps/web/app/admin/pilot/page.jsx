"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Building2, CheckCircle2, CircleDollarSign, Download, Eye, MessageSquare, Plus, RefreshCw, ShoppingBag, Target, Ticket, Trash2, UserCheck, Users, Wallet } from 'lucide-react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Alert, Badge, Button, Card, Checkbox, DataTable, Input, Meter, PageHeader, Section, Select, StatCard, StatusPill, Sparkline, cx } from '@/components/admin/ui';

// The pilot dashboard (services/api/pilot.mjs, docs/monetization/pilot.md): each pilot business week by week, the merchants' feedback, and
// whether the criteria that lift the world-expansion freeze are met. Needs the API (NEXT_PUBLIC_LIVE_API_URL) and a signed-in admin
// (components/admin/AdminShell.jsx).
const usd = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const pct = (x) => `${Math.round(x * 100)}%`;
const shortWeek = (w) => new Date(`${w}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const PAY = { yes: 'Would pay', maybe: 'Maybe', no: 'Would not pay' };

// one figure, week by week, summed over the businesses (for the trend lines)
const weekly = (data, key) => data.weeks.map((w) => data.businesses.reduce((sum, b) => sum + (b.weekly.find((x) => x.week === w)?.[key] ?? 0), 0));

export default function PilotPage() {
  const [weeks, setWeeks] = useState(4);
  const [all, setAll] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [slug, setSlug] = useState('');
  const [note, setNote] = useState('');
  const admin = useAdmin();
  const call = useCallback((method, path, body) => admin.call(path, { method, body }), [admin]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await call('GET', `/admin/pilot?weeks=${weeks}${all ? '&all=1' : ''}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [call, weeks, all]);
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
    let res;
    try {
      res = await admin.call(`/admin/pilot.csv?weeks=${weeks}${all ? '&all=1' : ''}`, { raw: true });
    } catch {
      return setError('The spreadsheet could not be made.');
    }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `pilot-${data?.currentWeek ?? 'figures'}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = data && [
    {
      key: 'business',
      header: 'Business',
      render: (b) => (
        <div className="min-w-[11rem]">
          <a href={`/business/${b.slug}`} className="font-semibold text-sx-cyan hover:underline">{b.name}</a>
          <span className="block text-xs text-sx-muted">{b.category}{b.district ? ` · ${b.district}` : ''}</span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {b.activated ? <StatusPill tone="green">activated</StatusPill> : <StatusPill tone="amber">{`set-up ${b.stepsDone}/${b.stepsTotal}`}</StatusPill>}
          </span>
          {b.note && <span className="mt-1 block text-xs italic text-sx-muted">{b.note}</span>}
        </div>
      ),
    },
    {
      key: 'back',
      header: 'Owner back, by week',
      title: '# the owner came back that week · . they did not · blank: not in the pilot yet',
      render: (b) => (
        <div>
          <div className="flex gap-1" aria-label={`back in ${b.retention.activeWeeks} of ${b.retention.completedWeeks} completed weeks`}>
            {b.weekly.map((w) => (
              <span key={w.week} title={`${shortWeek(w.week)}: ${!w.member ? 'not in the pilot yet' : w.ownerActive ? 'came back' : 'did not come back'}; ${w.views} views, ${w.ctaClicks} presses`} className={cx('h-5 w-5 rounded-md', !w.member ? 'border border-dashed border-sx-line' : w.ownerActive ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 'bg-sx-line', w.week === data.currentWeek && 'ring-2 ring-sx-cyan/60 ring-offset-1 ring-offset-sx-panel')} />
            ))}
          </div>
          <span className={cx('mt-1 block text-xs', b.returnedWeekly ? 'text-emerald-300' : 'text-sx-muted')}>{b.retention.activeWeeks}/{b.retention.completedWeeks} weeks{b.returnedWeekly ? ' · returns weekly' : ''}</span>
        </div>
      ),
    },
    { key: 'views', header: 'Views', align: 'right', render: (b) => <span className="inline-flex items-center justify-end gap-2"><Sparkline values={b.weekly.map((w) => w.views)} className="hidden h-5 w-12 sm:block" />{b.totals.views}</span> },
    { key: 'qualified', header: 'Qualified', align: 'right', render: (b) => b.totals.qualified },
    { key: 'presses', header: 'Presses', align: 'right', render: (b) => b.totals.ctaClicks },
    { key: 'leads', header: 'Leads', align: 'right', render: (b) => b.totals.leads },
    { key: 'claims', header: 'Claims / redeemed', align: 'right', className: 'whitespace-nowrap', render: (b) => `${b.totals.claims} / ${b.totals.redemptions}` },
    { key: 'purchases', header: 'Purchases', align: 'right', render: (b) => b.totals.purchases },
    { key: 'revenue', header: 'Verified revenue', align: 'right', className: 'text-sx-gold', render: (b) => usd(b.totals.verifiedRevenueCents) },
    { key: 'paid', header: 'Paid / renewed', align: 'right', className: 'whitespace-nowrap', render: (b) => <>{b.paid ? usd(b.paidCents) : '–'}{b.renewed ? <Badge tone="green" className="ml-1.5">renewed</Badge> : null}</> },
    {
      key: 'actions',
      header: 'Actions',
      srOnly: true,
      align: 'right',
      className: 'whitespace-nowrap',
      render: (b) => (
        <span className="inline-flex gap-1.5">
          <Button size="sm" variant="ghost" icon={MessageSquare} onClick={() => setOpen(open === b.slug ? null : b.slug)} aria-expanded={open === b.slug}>Feedback ({b.feedback.length})</Button>
          {b.member && <Button size="sm" variant="danger" icon={Trash2} onClick={() => remove(b.slug)}>Remove</Button>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Pilot dashboard"
        description="Verified figures only. The criteria are the ones that lift the world-expansion freeze."
        actions={<Button href="/admin/economy" variant="ghost" icon={BarChart3}>Plot economy</Button>}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {data && (
        <>
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:px-4">
            <label className="flex items-center gap-2 text-sm text-slate-200">Weeks
              <Select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {[1, 2, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </label>
            <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} label="Every published business (a preview, not the pilot)" />
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button onClick={load} disabled={busy} icon={RefreshCw}>{busy ? 'Loading…' : 'Refresh'}</Button>
              <Button onClick={download} icon={Download}>Download CSV</Button>
            </div>
          </Card>

          <section aria-labelledby="criteria" className="space-y-3">
            <h2 id="criteria" className="sr-only">Criteria</h2>
            <Card glow={data.verdict.lifts} className={cx('flex flex-wrap items-center gap-3 p-4', data.verdict.lifts && 'border-emerald-400/40')}>
              <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1', data.verdict.lifts ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' : 'bg-sx-purple/15 text-violet-300 ring-sx-purple/30')}>
                {data.verdict.lifts ? <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> : <Target aria-hidden="true" className="h-5 w-5" />}
              </span>
              <p className={cx('min-w-0 flex-1 basis-48 text-sm font-medium', data.verdict.lifts ? 'text-emerald-100' : 'text-slate-200')}>
                {data.verdict.lifts ? 'Every criterion is met: the world-expansion freeze can lift (record the decision in docs/roadmap/world_freeze.md).' : `${data.verdict.met} of ${data.verdict.criteria.length} criteria met. The freeze stays until all are.`}
              </p>
              <Meter value={data.verdict.met} max={data.verdict.criteria.length} tone={data.verdict.lifts ? 'green' : 'purple'} label="Criteria met" className="w-full sm:w-48" />
            </Card>
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {data.verdict.criteria.map((c) => (
                <li key={c.id} className="flex">
                  <StatCard
                    className={cx('flex-1', c.met && 'border-emerald-400/40')}
                    title={c.hint}
                    label={c.label}
                    value={c.kind === 'share' ? pct(c.actual) : c.kind === 'count' ? c.actual : c.actual ? 'Yes' : 'No'}
                    tone={c.met ? 'green' : 'amber'}
                    hint={c.kind === 'share' ? `${c.businesses} of ${c.of}, needs ${pct(c.target)}` : c.kind === 'count' ? `needs ${c.target}` : 'needs yes'}
                    footer={<StatusPill tone={c.met ? 'green' : 'amber'} className="self-start">{c.met ? 'met' : 'not yet'}</StatusPill>}
                  />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="totals" className="space-y-3">
            <h2 id="totals" className="text-sm font-semibold uppercase tracking-wider text-sx-muted">All pilot businesses, {shortWeek(data.weeks[0])} to now</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Businesses', data.businesses.length, Building2, 'cyan'],
                ['Activated', data.totals.activated, UserCheck, 'green'],
                ['Qualified visits', data.totals.qualified, Eye, 'cyan', weekly(data, 'qualified')],
                ['Leads', data.totals.leads, Users, 'purple', weekly(data, 'leads')],
                ['Redeemed coupons', data.totals.redemptions, Ticket, 'purple', weekly(data, 'redemptions')],
                ['Purchases', data.totals.purchases, ShoppingBag, 'blue', weekly(data, 'purchases')],
                ['Verified revenue', usd(data.totals.verifiedRevenueCents), CircleDollarSign, 'gold', weekly(data, 'verifiedRevenueCents')],
                ['Paid to us', usd(data.totals.paidCents), Wallet, 'gold'],
              ].map(([k, v, Icon, tone, trend]) => (
                <StatCard key={k} label={k} value={v} icon={Icon} tone={tone} trend={trend} />
              ))}
            </div>
            <p className="text-xs text-sx-muted">Feedback this period: {data.totals.feedback} answer(s){data.totals.averageRating != null ? `, average ${data.totals.averageRating} of 5` : ''}.</p>
          </section>

          <Section id="businesses" title="Businesses" icon={Building2} description="Week by week. Press Feedback for what the merchant said." bodyClassName="p-3 sm:p-4">
            {data.businesses.length === 0 ? (
              <p className="py-6 text-center text-sm text-sx-muted">No business is in the pilot yet. Add one below (or tick &quot;Every published business&quot; to try the dashboard).</p>
            ) : (
              <DataTable
                caption="Pilot businesses"
                columns={columns}
                rows={data.businesses}
                rowKey={(b) => b.slug}
                minWidth="64rem"
                renderAfter={(b) => open === b.slug && (
                  <tr className="bg-sx-purple/[0.06]">
                    <td colSpan={columns.length} className="border-b border-sx-stroke px-4 py-3 text-sm">
                      {b.feedback.length === 0 ? <p className="text-sx-muted">No feedback in this period.</p> : (
                        <ul className="space-y-2">
                          {b.feedback.map((f) => (
                            <li key={f.week} className="rounded-lg border border-sx-stroke bg-sx-page/50 p-2.5">
                              <span className="font-semibold text-white">{shortWeek(f.week)}:</span> {f.rating}/5 · {PAY[f.wouldPay]}
                              {f.result ? <span className="block text-slate-300">Brought: {f.result}</span> : null}
                              {f.missing ? <span className="block text-slate-300">Missing: {f.missing}</span> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              />
            )}
          </Section>

          <Section title="Add a business to the pilot" icon={Plus} description="By its address on the site (the part after /business/).">
            <form onSubmit={add} className="flex flex-wrap items-end gap-3 text-sm">
              <label className="flex w-full flex-col gap-1.5 text-slate-200 sm:w-56">Business address (slug)
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9-]{1,48}" placeholder="amy-bakery" />
              </label>
              <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5 text-slate-200">Note (optional, only you see it)
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Met at the Saturday market" />
              </label>
              <Button type="submit" variant="primary" icon={Plus}>Add to the pilot</Button>
            </form>
          </Section>
        </>
      )}
    </div>
  );
}
