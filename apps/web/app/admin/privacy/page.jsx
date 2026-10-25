"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Search, ShieldAlert, Trash2, Undo2 } from 'lucide-react';
import { Field, FormError, SafeForm, Submit, useAdmin } from '@/components/admin/AdminShell';
import { Alert, Badge, Button, Checkbox, DataTable, PageHeader, Section, StatusPill } from '@/components/admin/ui';
import ProrataRefund from '@/components/admin/ProrataRefund';
import { KEPT, REMOVED } from '@/lib/legal/privacy';

// Privacy requests by email (services/api/privacy.mjs): find the person's account (by email, name or number), download their data for them
// (GET /admin/accounts/:id/export) or delete the account (POST /admin/accounts/:id/delete, the name typed and a reason). Players can do both
// themselves from their account; this is for people who write in. Every export and deletion is in the audit trail, listed below.
// A deletion refunds the account's unused time first (prorata.mjs), unless the account is closed for breaking the rules (`rules`: nothing back);
// the form shows what it would refund. "Refund unused time" refunds it without deleting (services/api/prorata.mjs), and ends what was refunded.
const when = (t) => (t ? new Date(t).toLocaleString() : '');
const usd = (cents) => `${((cents ?? 0) / 100).toFixed(2)}`;
const saveJson = (name, data) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function AdminPrivacyPage() {
  const { call } = useAdmin();
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [log, setLog] = useState([]);
  const [rules, setRules] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [refundFor, setRefundFor] = useState(null);

  // what deleting would refund (nothing when closed for breaking the rules)
  useEffect(() => {
    if (!target) return undefined;
    let live = true;
    call(`/admin/accounts/${target.id}/prorata${rules ? '?rules=1' : ''}`).then((p) => live && setEstimate(p)).catch(() => live && setEstimate({ error: true }));
    return () => {
      live = false;
    };
  }, [call, target, rules]);

  const loadLog = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([call('/admin/audit?action=account.delete&limit=20'), call('/admin/audit?action=account.export&limit=20')]);
      setLog([...d.entries, ...e.entries].sort((a, b) => b.at - a.at).slice(0, 20));
    } catch {
      /* the list is a convenience */
    }
  }, [call]);
  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const search = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      setFound((await call(`/admin/privacy/accounts?q=${encodeURIComponent(q.trim())}`)).accounts);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const exportFor = async (a) => {
    setError('');
    try {
      const x = await call(`/admin/accounts/${a.id}/export`);
      saveJson(`voxelventure-account-${a.id}-${new Date().toISOString().slice(0, 10)}.json`, x);
      setNotice(`The data of ${a.username} is downloaded. Send it to the address the request came from only if it is the account's confirmed email.`);
      loadLog();
    } catch (err) {
      setError(err.message);
    }
  };
  const remove = async (e) => {
    e.preventDefault();
    if (confirm.trim().toLowerCase() !== target.username.toLowerCase()) return setFormError(`Type ${target.username} to confirm.`);
    setBusy(true);
    setFormError('');
    try {
      const out = await call(`/admin/accounts/${target.id}/delete`, { method: 'POST', body: { confirm: confirm.trim(), reason: reason.trim() || 'asked by email', rules } });
      setNotice(`${target.username} is deleted: the account is now ${out.username}.${out.plotsReleased.length ? ` Plots released: ${out.plotsReleased.join(', ')}.` : ''} ${out.refunds.closedForRules ? 'Closed for breaking the rules: nothing was refunded.' : out.refunds.totalCents ? `Refunded for unused time: ${usd(out.refunds.totalCents)}.` : 'Nothing to refund.'}`);
      setRules(false);
      setTarget(null);
      setConfirm('');
      setReason('');
      setFound((f) => f?.map((x) => (x.id === target.id ? { ...x, username: out.username, email: null, deletedAt: Date.now() } : x)));
      loadLog();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'user', header: 'Account', render: (a) => <span className="font-medium text-white">{a.username} <span className="text-sx-muted">#{a.id}</span></span> },
    { key: 'email', header: 'Email', render: (a) => (a.email ? <span className="flex flex-wrap items-center gap-2"><span className="text-slate-200">{a.email}</span>{a.emailVerified ? <StatusPill tone="green">Confirmed</StatusPill> : <StatusPill tone="amber">Unconfirmed</StatusPill>}</span> : <span className="text-sx-muted">none</span>) },
    { key: 'what', header: 'Holds', render: (a) => <span className="text-sx-muted">{a.businesses} pages · {a.plots} plots · {a.paidOrders} paid orders</span> },
    { key: 'state', header: 'State', render: (a) => (a.deletedAt ? <Badge tone="neutral">deleted {when(a.deletedAt)}</Badge> : <StatusPill tone="green">Active</StatusPill>) },
    {
      key: 'act',
      header: 'Actions',
      srOnly: true,
      align: 'right',
      render: (a) => !a.deletedAt && (
        <span className="flex justify-end gap-2">
          <Button size="sm" icon={Download} onClick={() => exportFor(a)}>Export</Button>
          <Button size="sm" icon={Undo2} onClick={() => setRefundFor(a)} data-testid={`admin-prorata-${a.id}`}>Refund unused time…</Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => (setTarget(a), setConfirm(''), setFormError(''), setRules(false), setEstimate(null))} data-testid={`admin-delete-${a.id}`}>Delete…</Button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Support" title="Privacy requests" description="For someone who writes in: find their account, send them their data, or delete it. Players can do both themselves from their account." />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Section title="Find the account" icon={Search} description="By its confirmed email, its name or its number. Check the request came from the account's own email before acting.">
        <SafeForm onSubmit={search} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1"><Field id="privacy-q" label="Email, name or number" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Submit busy={busy}>Find</Submit>
        </SafeForm>
        {found && <div className="mt-4"><DataTable caption="Accounts found" columns={columns} rows={found} rowKey={(a) => a.id} empty="No account matches." minWidth="44rem" /></div>}
      </Section>

      {target && (
        <Section title={`Delete ${target.username}`} icon={ShieldAlert} description="It happens at once and cannot be undone. The unused time of what the account paid for is refunded first (unless it is closed for breaking the rules), then plots and ad spaces are released and Pro is cancelled in Stripe.">
          <SafeForm onSubmit={remove} className="space-y-4" data-testid="admin-delete-form">
            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div><p className="mb-1 font-semibold text-white">Removed</p><ul className="ml-4 list-disc space-y-1 text-slate-300">{REMOVED.map((r) => <li key={r}>{r}</li>)}</ul></div>
              <div><p className="mb-1 font-semibold text-white">Kept, and why</p><ul className="ml-4 list-disc space-y-1 text-slate-300">{KEPT.map((k) => <li key={k.what}>{k.what}: {k.why}.</li>)}</ul></div>
            </div>
            <Field id="privacy-confirm" label={`Type ${target.username} to confirm`} autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <div className="rounded-xl border border-sx-line p-3 text-sm text-slate-200" data-testid="admin-delete-refund">
              {!estimate ? 'Working out the refund…' : estimate.error ? 'The refund could not be worked out: the deletion will still refund what is due, or refuse if Stripe cannot.' : estimate.totalCents ? <>Refunded first, for unused time: <span className="font-semibold text-white">{usd(estimate.totalCents)}</span> ({estimate.lines.filter((l) => l.refund).map((l) => `#${l.orderId} ${l.label}: ${usd(l.cents)}`).join('; ')}).</> : rules ? 'Closed for breaking the rules: nothing is refunded.' : 'Nothing to refund.'}
            </div>
            <Checkbox label="Closed for breaking the rules: no refund for unused time" checked={rules} onChange={(e) => (setEstimate(null), setRules(e.target.checked))} data-testid="admin-delete-rules" />
            <Field id="privacy-reason" label="Why (for the audit trail)" hint="For example: asked by email on 21 October from their confirmed address." autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />
            <FormError>{formError}</FormError>
            <div className="flex flex-wrap gap-3">
              <Submit busy={busy}>Delete the account</Submit>
              <Button onClick={() => setTarget(null)}>Cancel</Button>
            </div>
          </SafeForm>
        </Section>
      )}

      {refundFor && (
        <Section title={`Refund unused time: ${refundFor.username}`} icon={Undo2} description="Every paid line of the account still running, pro rata, without deleting it. What is refunded ends at once." actions={<Button size="sm" onClick={() => setRefundFor(null)}>Close</Button>}>
          <ProrataRefund key={refundFor.id} path={`/admin/accounts/${refundFor.id}/prorata`} label="Show what would be refunded" />
        </Section>
      )}

      <Section title="Recent exports and deletions" description="From the audit trail.">
        {log.length ? (
          <ul className="space-y-1 text-sm">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap gap-2 text-slate-300"><span className="text-sx-muted">{when(l.at)}</span><span className="font-medium text-white">{l.action === 'account.delete' ? 'Deleted' : 'Exported'}</span><span>account #{l.target.id}</span><span className="text-sx-muted">by {l.detail?.by === 'admin' || l.actor.kind === 'admin' ? `admin ${l.actor.name ?? ''}`.trim() : 'the player'}{l.detail?.reason ? `: ${l.detail.reason}` : ''}</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-sx-muted">None yet.</p>
        )}
      </Section>
    </div>
  );
}
