"use client";

import React, { useState } from 'react';
import { passwordProblem, PASSWORD_HINT } from '@/lib/data/admin';
import { AdminCard, Field, FormError, SafeForm, Submit, useAdmin } from '@/components/admin/AdminShell';

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
    <AdminCard title="Change your password" intro={`Signed in as ${admin.username}. Changing it signs you out everywhere else.`}>
      {done && <p role="status" className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{done}</p>}
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
