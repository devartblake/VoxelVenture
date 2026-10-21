"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { passwordProblem, PASSWORD_HINT } from '@/lib/data/admin';
import { AdminCard, Field, FormError, SafeForm, Submit, useAdmin } from '@/components/admin/AdminShell';
import { Alert, Button, Card, PageHeader, StatusPill } from '@/components/admin/ui';

// A signed-in admin's own account (the route stays /admin/password; the nav says "Account"):
//   - the password (POST /admin/password): the current one first. Every other session of theirs ends; this one stays signed in.
//   - the email for password resets (GET/POST /admin/email): confirmed by a one-use link sent to it (30 minutes). Only a confirmed address
//     gets reset links from /admin/forgot.
export default function AdminPasswordPage() {
  const { admin } = useAdmin();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Your account" description={`Signed in as ${admin.username}.`} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <PasswordCard />
          <EmailCard />
        </div>
        <Card className="space-y-4 p-5 text-sm text-sx-muted sm:p-6">
          <h2 className="text-base font-semibold text-white">About your sign-in</h2>
          <p className="flex gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sx-cyan" />Your session is a cookie this page cannot read. It ends after 2 hours without use, and after 12 hours in any case.</p>
          <p className="flex gap-3"><LogOut aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sx-cyan" />A new password signs out every other browser you are signed in on; this one stays signed in.</p>
          <p className="flex gap-3"><Mail aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sx-cyan" />With a confirmed email, &ldquo;Forgot your password?&rdquo; on the sign-in page emails you a link that works once, for 30 minutes. The address is used for nothing else.</p>
          <p className="flex gap-3"><KeyRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sx-cyan" />Without one, the same page takes the server&apos;s admin token instead.</p>
        </Card>
      </div>
    </div>
  );
}

function PasswordCard() {
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
    <AdminCard inShell title="Change your password" intro="Changing it signs you out everywhere else.">
      {done && <Alert tone="success" className="mb-4">{done}</Alert>}
      <SafeForm onSubmit={submit}>
        <Field id="current" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field id="password" label="New password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field id="confirm" label="The new password again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <FormError>{error}</FormError>
        <Submit busy={busy}>Change the password</Submit>
      </SafeForm>
    </AdminCard>
  );
}

function EmailCard() {
  const { call } = useAdmin();
  const [state, setState] = useState(null); // { email, emailVerified }
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call('/admin/email').then(setState).catch((e) => setError(e.message)), [call]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (value) => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const out = await call('/admin/email', { method: 'POST', body: { email: value } });
      setState(out);
      setEmail('');
      setDone(!out.email ? 'Your email is removed. Reset links can no longer be emailed to you.' : out.sent ? `A confirmation link is on its way to ${out.email}. It works once, for 30 minutes.` : `${out.email} is already confirmed.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Enter an email address.');
    save(email.trim());
  };

  const status = !state ? null : !state.email ? <StatusPill tone="neutral">No email</StatusPill> : state.emailVerified ? <StatusPill tone="green">Confirmed</StatusPill> : <StatusPill tone="amber">Waiting for confirmation</StatusPill>;
  return (
    <AdminCard inShell title="Email for password resets" intro="Where a reset link goes if you forget your password. Confirm it with the link we send.">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" data-testid="admin-email-status" data-verified={state?.emailVerified ? '1' : '0'}>
        {state ? <span className="min-w-0 break-all font-medium text-white">{state.email ?? 'None yet'}</span> : <span className="text-sx-muted">Loading…</span>}
        {status}
      </div>
      {done && <Alert tone="success" className="mb-4">{done}</Alert>}
      {state?.email && !state.emailVerified && <Alert tone="warn" className="mb-4">Not confirmed yet: open the link in the email (check your spam folder), or send it again below.</Alert>}
      <SafeForm onSubmit={submit} data-testid="admin-email-form">
        <Field id="email" label={state?.email ? 'A new address, or the same one to send the link again' : 'Your email'} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormError>{error}</FormError>
        <Submit busy={busy}>Send the confirmation link</Submit>
        {state?.email && <Button variant="ghost" block disabled={busy} onClick={() => save('')}>Remove the email</Button>}
      </SafeForm>
    </AdminCard>
  );
}
