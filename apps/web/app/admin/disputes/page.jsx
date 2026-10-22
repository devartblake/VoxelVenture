"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldAlert, Undo2 } from 'lucide-react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Alert, Button, DataTable, Input, PageHeader, Section, StatCard, StatusPill } from '@/components/admin/ui';

// Disputes and refunds (services/api/billing.mjs, docs/monetization/billing.md#disputes-and-partial-refunds): every disputed payment (chargeback), open
// ones first, with what it paused and how it ended; every refund recorded, in full or in part, by an admin, by the server or in the Stripe dashboard;
// and one order looked up by number, with its lines, refunds and disputes. Disputes are answered in the Stripe dashboard; this page only shows them.
// Needs the API and a signed-in admin (components/admin/AdminShell.jsx).
const usd = (cents) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const when = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const STATUS = { open: ['amber', 'Open'], won: ['green', 'Won'], lost: ['red', 'Lost'] };
const SOURCE = { admin: 'An admin', system: 'The server', stripe: 'Stripe dashboard' };
const paused = (d) => (d.paused.length ? d.paused.map((p) => `#${p.order} ${p.product}: ${p.after ?? p.what}`).join('; ') : 'nothing (no order found)');

const disputeColumns = [
  { key: 'status', header: 'Status', render: (d) => <StatusPill tone={STATUS[d.status]?.[0]}>{STATUS[d.status]?.[1] ?? d.status}</StatusPill> },
  { key: 'amount', header: 'Amount', align: 'right', render: (d) => usd(d.cents) },
  { key: 'order', header: 'Order', render: (d) => (d.orderId ? <span><span className="font-mono">#{d.orderId}</span> {d.label}</span> : '–') },
  { key: 'reason', header: 'Reason', render: (d) => <span className="text-xs">{d.reason ?? '–'}{d.stripeStatus ? ` (${d.stripeStatus})` : ''}</span> },
  { key: 'paused', header: 'Paused, then', render: (d) => <span className="text-xs">{paused(d)}</span> },
  { key: 'opened', header: 'Opened', className: 'whitespace-nowrap text-xs', render: (d) => when(d.createdAt) },
  { key: 'closed', header: 'Closed', className: 'whitespace-nowrap text-xs', render: (d) => when(d.closedAt) },
  { key: 'stripe', header: 'Stripe id', className: 'font-mono text-xs', render: (d) => d.stripeDispute },
];
const refundColumns = [
  { key: 'order', header: 'Order', render: (r) => <span><span className="font-mono">#{r.orderId}</span>{r.parentId ? <span className="text-sx-muted"> (cart #{r.parentId})</span> : null} {r.label ?? r.product}</span> },
  { key: 'amount', header: 'Refunded', align: 'right', render: (r) => usd(r.cents) },
  { key: 'full', header: 'Ended', render: (r) => (r.full ? <StatusPill tone="red">In full</StatusPill> : <StatusPill tone="amber">In part</StatusPill>) },
  { key: 'by', header: 'By', className: 'text-xs', render: (r) => SOURCE[r.source] ?? r.source },
  { key: 'note', header: 'Note', className: 'text-xs', render: (r) => r.note ?? '' },
  { key: 'at', header: 'When', className: 'whitespace-nowrap text-xs', render: (r) => when(r.at) },
];
const lineColumns = [
  { key: 'id', header: 'Order', className: 'font-mono', render: (o) => `#${o.id}` },
  { key: 'label', header: 'What', render: (o) => o.label ?? o.product },
  { key: 'cents', header: 'Paid', align: 'right', render: (o) => usd(o.cents) },
  { key: 'refunded', header: 'Refunded', align: 'right', render: (o) => usd(o.refundedCents) },
  { key: 'status', header: 'Status', render: (o) => o.status },
];

export default function DisputesPage() {
  const { call } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState('');
  const [one, setOne] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await call('/admin/billing/disputes'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [call]);
  useEffect(() => {
    load();
  }, [load]);
  const find = async (e) => {
    e.preventDefault();
    const id = Math.round(Number(lookup));
    if (!(id > 0)) return;
    try {
      setOne(await call(`/admin/billing/orders/${id}`));
      setError('');
    } catch (err) {
      setOne(null);
      setError(err.message);
    }
  };

  const disputes = data?.disputes ?? [];
  const refunds = data?.refunds ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Disputes and refunds"
        icon={ShieldAlert}
        description="Disputed payments pause what they paid for until Stripe closes them: won puts it back, lost ends it. Answer a dispute in the Stripe dashboard before its deadline."
        actions={<Button icon={RefreshCw} onClick={load} disabled={busy}>Refresh</Button>}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open disputes" value={data ? data.open : '–'} icon={AlertTriangle} tone={data?.open ? 'amber' : 'green'} data-testid="disputes-open" />
        <StatCard label="Won" value={disputes.filter((d) => d.status === 'won').length} icon={CheckCircle2} tone="green" />
        <StatCard label="Lost" value={disputes.filter((d) => d.status === 'lost').length} icon={ShieldAlert} tone="red" />
        <StatCard label="Refunded (listed)" value={usd(refunds.reduce((a, r) => a + r.cents, 0))} icon={Undo2} />
      </div>
      <Section title="Disputes" icon={ShieldAlert} description="Open first, then newest first." bodyClassName="p-3 sm:p-4">
        <DataTable caption="Disputes" columns={disputeColumns} rows={disputes} rowKey={(d) => d.id} minWidth="64rem" empty="No disputes. Good." data-testid="disputes-table" />
      </Section>
      <Section title="Refunds" icon={Undo2} description="Every refund recorded, newest first: in full (what it bought was ended) or in part (it goes on)." bodyClassName="p-3 sm:p-4">
        <DataTable caption="Refunds" columns={refundColumns} rows={refunds} rowKey={(r) => r.id} minWidth="52rem" empty="No refunds yet." />
      </Section>
      <Section title="One order" icon={Search} description="Its lines (a cart), what was refunded of each, and the disputes of its payment." bodyClassName="p-3 sm:p-4 space-y-3">
        <form onSubmit={find} className="flex max-w-md gap-2">
          <Input type="number" min={1} value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Order number" aria-label="Order number" />
          <Button type="submit" variant="primary">Show</Button>
        </form>
        {one && (
          <div className="space-y-3" data-testid="order-detail">
            <p className="text-sm">
              <span className="font-mono">#{one.order.id}</span> {one.order.label ?? one.order.product}: {usd(one.order.cents)} paid, {usd(one.order.refundedCents)} refunded, {one.order.status}
              {one.cart ? <span className="text-sx-muted"> (a line of cart #{one.cart.id})</span> : null}
            </p>
            {one.lines.length > 0 && <DataTable caption="Lines" columns={lineColumns} rows={one.lines} rowKey={(o) => o.id} minWidth="36rem" />}
            <DataTable caption="Refunds of this order" columns={refundColumns} rows={one.refunds} rowKey={(r) => r.id} minWidth="52rem" empty="Nothing refunded." />
            <DataTable caption="Disputes of this payment" columns={disputeColumns} rows={one.disputes} rowKey={(d) => d.id} minWidth="64rem" empty="No disputes." />
          </div>
        )}
      </Section>
    </div>
  );
}
