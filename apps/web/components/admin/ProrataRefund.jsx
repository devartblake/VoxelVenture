"use client";

import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Alert, Button, DataTable, Field, StatusPill } from '@/components/admin/ui';

// "Refund unused time" (services/api/prorata.mjs, docs/monetization/billing.md#refunds-of-unused-time) for one order or every line of an account:
// the preview (each line, its unused days, what goes back, or why nothing does), then a reason (required, for the audit trail and the order) and
// the refund. What is refunded ends at once: a lease is released, an ad or sponsored week ends, Pro is cancelled. A second refund gives nothing more.
// `path`: /admin/billing/orders/<id>/prorata or /admin/accounts/<id>/prorata.
const usd = (cents) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const columns = [
  { key: 'order', header: 'Order', render: (l) => <span><span className="font-mono">#{l.orderId}</span>{l.parentId ? <span className="text-sx-muted"> (cart #{l.parentId})</span> : null}</span> },
  { key: 'what', header: 'What', render: (l) => l.label },
  { key: 'paid', header: 'Paid (left)', align: 'right', render: (l) => usd(l.paidCents) },
  { key: 'unused', header: 'Days unused', align: 'right', render: (l) => (l.unusedDays == null ? (l.refund ? 'not opened' : '–') : `${l.unusedDays}${l.termDays ? ` of ${l.termDays}` : ''}${l.notStarted ? ' (not started)' : ''}`) },
  { key: 'back', header: 'Back', align: 'right', render: (l) => (l.refund ? <span className="font-semibold text-white">{usd(l.cents)}</span> : <span className="text-sx-muted">–</span>) },
  { key: 'why', header: '', className: 'text-xs text-sx-muted', render: (l) => (l.refund ? <StatusPill tone="green">Refund</StatusPill> : l.why) },
];

export default function ProrataRefund({ path, label = 'Refund unused time…', onDone }) {
  const { call } = useAdmin();
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const open = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setPreview(await call(path));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const refund = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError('Give a reason: it goes in the audit trail and on the order.');
    setBusy(true);
    setError('');
    try {
      const out = await call(path, { method: 'POST', body: { reason: reason.trim() } });
      setResult(out);
      setPreview(null);
      setReason('');
      onDone?.(out);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="prorata-refund">
      {!preview && <Button icon={Undo2} onClick={open} disabled={busy} data-testid="prorata-open">{busy ? 'One moment…' : label}</Button>}
      {error && <Alert tone="error">{error}</Alert>}
      {result && (
        <Alert tone={result.warnings.length ? 'warn' : 'success'} data-testid="prorata-result">
          {result.totalCents ? `Refunded ${usd(result.totalCents)} for unused time (${result.refunded.length} ${result.refunded.length === 1 ? 'line' : 'lines'}).` : 'Nothing more to refund.'}
          {result.ended.length > 0 && <> Ended: {result.ended.map((x) => `#${x.orderId} ${x.what}`).join('; ')}.</>}
          {result.warnings.map((w) => <span key={w} className="block">{w}</span>)}
        </Alert>
      )}
      {preview && (
        <form onSubmit={refund} className="space-y-3 rounded-xl border border-sx-line p-3" data-testid="prorata-preview">
          <p className="text-sm text-slate-200">
            {preview.totalCents ? <>This refunds <span className="font-semibold text-white">{usd(preview.totalCents)}</span> for unused time ({preview.count} {preview.count === 1 ? 'line' : 'lines'}), to the card each was paid with. Stripe keeps its fee. What is refunded ends at once.</> : 'Nothing to refund: no line has unused time worth at least $1.00.'}
          </p>
          <DataTable caption="Unused time, line by line" columns={columns} rows={preview.lines} rowKey={(l) => l.orderId} minWidth="44rem" empty="No paid orders." />
          {preview.totalCents > 0 && <Field id={`prorata-reason-${path}`} label="Why (required: for the audit trail and the order)" autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />}
          <div className="flex flex-wrap gap-2">
            {preview.totalCents > 0 && <Button type="submit" variant="danger" disabled={busy || reason.trim().length < 3} data-testid="prorata-confirm">{busy ? 'Refunding…' : `Refund ${usd(preview.totalCents)}`}</Button>}
            <Button onClick={() => (setPreview(null), setError(''))}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
