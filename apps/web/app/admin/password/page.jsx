"use client";

import React, { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { passwordProblem } from '@/lib/data/admin';
import { AdminCard, Field, FormError, SafeForm, Submit, useAdmin } from '@/components/admin/AdminShell';
import { Alert, Card, PageHeader } from '@/components/admin/ui';

// A signed-in admin changes their own password (POST /admin/password): the current one first. Every other session of theirs ends (another
// browser, a forgotten laptop); this one stays signed in.
export default function AdminPasswordPage() {
  const { admin, call } = useAdmin();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const problem = !current ? 'Enter your current password.' : passwordProblem(admin.username, password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    setDone('');
    try {
      const out = await call('/admin/password', { method: 'POST', body: { currentPassword: current, newPassword: password } });
      setDone(out.endedSessions ? `Password changed. ${out.endedSessions} other session${out.endedSessions === 1 ? '' : 's'} signed out.` : 'Password changed.');
      setCurrent('');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Your account" description={`Signed in as ${admin.username}.`} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        <AdminCard inShell title="Change your password" intro={`Signed in as ${admin.username}. Changing it signs you out everywhere else.`}>
          {done && <Alert tone="success" className="mb-4">{done}</Alert>}
          <SafeForm onSubmit={submit}>
            <Field id="current" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Field id="password" label="New password" type="password" autoComplete="new-password" hint="At least 12 characters, and not your username." value={password} onChange={(e) => setPassword(e.target.value)} />
            <Field id="confirm" label="The new password again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <FormError>{error}</FormError>
            <Submit busy={busy}>Change the password</Submit>
          </SafeForm>
        </AdminCard>
        <Card className="space-y-4 p-5 text-sm text-sx-muted sm:p-6">
          <h2 className="text-base font-semibold text-white">About your sign-in</h2>
          <p className="flex gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sx-cyan" />Your session is a cookie this page cannot read. It ends after 2 hours without use, and after 12 hours in any case.</p>
          <p className="flex gap-3"><LogOut aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sx-cyan" />A new password signs out every other browser you are signed in on; this one stays signed in.</p>
          <p className="flex gap-3"><KeyRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sx-cyan" /><span>Forgot it? Another admin can add you again, or on the server: <code className="text-slate-200">npm run admin:reset-password</code>.</span></p>
        </Card>
      </div>
    </div>
  );
}
