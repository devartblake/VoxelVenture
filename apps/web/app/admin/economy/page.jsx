"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CalendarRange, Eye, Footprints, Layers, LandPlot, MapPinned, Percent, RefreshCw, Rocket, Star, Tag } from 'lucide-react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Alert, Button, Card, DataTable, Input, Meter, PageHeader, Section, StatCard, Tabs } from '@/components/admin/ui';

// The plot economy's data (services/api/economy.mjs, docs/monetization/plot_economy_data.md): per tier and per district, the supply (plots, vacancy),
// the demand (visits, store entries, foot traffic, watchers) and the claim funnel with its conversion rates, for a date range. What a demand index
// will be fitted on after the pilot; nothing here sets a price. Needs the API and a signed-in admin (components/admin/AdminShell.jsx).
const usd = (cents) => (cents == null ? '–' : `$${(cents / 100).toFixed(2)}`);
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// [label, value, hint, right-aligned]
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
  const columns = [
    { key: 'group', header: 'Group', className: 'whitespace-nowrap capitalize font-medium text-white', render: (g) => g.label },
    ...COLUMNS.map(([label, value, hint]) => ({ key: label, header: label, title: hint, align: 'right', className: 'whitespace-nowrap font-mono', render: value })),
  ];
  return (
    <DataTable
      caption={title}
      columns={columns}
      rows={groups}
      rowKey={(g) => g.id}
      minWidth="80rem"
      empty="No plots in this group."
      rowClassName={(g) => (g.id === 'all' ? 'bg-sx-purple/[0.08] font-semibold [&>td]:border-t [&>td]:border-t-sx-line' : '')}
    />
  );
}

export default function EconomyPage() {
  const [range, setRange] = useState(() => ({ from: day(Date.now() - 29 * 86400000), to: day(Date.now()) }));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('tier');
  const { call } = useAdmin();

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await call(`/admin/economy?from=${range.from}&to=${range.to}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [call, range]);
  useEffect(() => {
    load();
  }, [load]);

  const t = data?.total;
  const topPasses = data ? Math.max(1, ...data.topAreas.map((a) => a.passes)) : 1;
  const topWatch = data ? Math.max(1, ...data.topWatched.map((w) => w.watchers)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Plot economy"
        description="Verified figures only. The data a demand index will be fitted on; it sets no price."
        actions={<Button href="/admin/pilot" variant="ghost" icon={Rocket}>Pilot dashboard</Button>}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {data && (
        <>
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:px-4">
            <CalendarRange aria-hidden="true" className="hidden h-5 w-5 text-sx-cyan sm:block" />
            <label className="flex items-center gap-2 text-sm text-slate-200">From <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-auto" /></label>
            <label className="flex items-center gap-2 text-sm text-slate-200">To <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="w-auto" /></label>
            <Button onClick={load} disabled={busy} icon={RefreshCw} className="sm:ml-auto">{busy ? 'Loading…' : 'Refresh'}</Button>
          </Card>
          <p className="-mt-3 text-xs text-sx-muted">{data.from} to {data.to} (UTC). Foot traffic is counted per {data.areaSize}-unit square of the map; a group&apos;s traffic is that of the squares its plots stand in.</p>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Plots" value={t.plots} icon={LandPlot} tone="cyan" hint={`${t.occupied} occupied`} />
            <StatCard label="Vacancy" value={pct(t.vacancyRate)} icon={Percent} tone={t.vacancyRate > 0.5 ? 'amber' : 'green'} hint={`${t.vacant} vacant`} footer={<Meter value={t.occupied} max={Math.max(1, t.plots)} label="Plots occupied" tone="green" />} />
            <StatCard label="Visits" value={t.visits} icon={Eye} tone="blue" hint={`${t.storeEntries} store entries`} />
            <StatCard label="Foot traffic" value={t.traffic.passes} icon={Footprints} tone="purple" hint={`${t.traffic.players} players`} />
            <StatCard label="Card → claim" value={pct(t.claim.conversion.cardToClaim)} icon={Layers} tone="purple" hint={`${t.claim.steps.claimed} claimed`} />
            <StatCard label="Median quote" value={usd(t.claim.medianQuoteCents)} icon={Tag} tone="gold" hint={`${t.watchers} watching`} />
          </div>

          <Card className="p-3 sm:p-4">
            <Tabs
              label="Group the figures"
              value={tab}
              onChange={setTab}
              tabs={[{ id: 'tier', label: 'By tier', icon: Layers, panel: 'economy-panel' }, { id: 'district', label: 'By district', icon: MapPinned, panel: 'economy-panel' }]}
            />
            <div id="economy-panel" role="tabpanel" aria-label={tab === 'tier' ? 'By tier' : 'By district'} className="mt-3">
              {tab === 'tier' ? <GroupTable title="By tier" groups={[...data.tiers, data.total]} /> : <GroupTable title="By district" groups={[...data.districts, data.total]} />}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Most watched plots" icon={Star}>
              {data.topWatched.length === 0 ? <p className="py-4 text-center text-sm text-sx-muted">Nobody watches a plot yet.</p> : (
                <ul className="space-y-3 text-sm">
                  {data.topWatched.map((w) => (
                    <li key={w.plotId}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <a href={`/?plot=${w.plotId}`} className="font-semibold text-sx-cyan hover:underline">{w.title}</a>
                        <span className="text-xs tabular-nums text-sx-muted">#{w.plotId} · {w.watchers} watching · lease {w.lease}</span>
                      </div>
                      <Meter value={w.watchers} max={topWatch} tone="gold" label={`${w.watchers} watching`} className="mt-1.5" />
                      <span className="mt-1 block text-xs text-sx-muted">{w.watchedBy.map((u) => `${u.username} (#${u.accountId})`).join(', ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Busiest areas" icon={Building2}>
              {data.topAreas.length === 0 ? <p className="py-4 text-center text-sm text-sx-muted">No foot traffic in this range.</p> : (
                <ul className="space-y-3 text-sm">
                  {data.topAreas.map((a) => (
                    <li key={a.area}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-mono text-white">{a.area}</span>
                        <span className="text-xs tabular-nums text-sx-muted">{a.passes} passes · {a.players} players · {a.plots} plots</span>
                      </div>
                      <Meter value={a.passes} max={topPasses} label={`${a.passes} passes`} className="mt-1.5" />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
