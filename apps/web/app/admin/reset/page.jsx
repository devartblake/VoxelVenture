"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiOn } from '@/lib/data/api';
import { adminFetch, passwordProblem, PASSWORD_HINT, takeLinkToken } from '@/lib/data/admin';
import { AdminCard, Field, FormError, SafeForm, Submit } from '@/components/admin/AdminShell';
import { Alert, buttonClass } from '@/components/admin/ui';

// A new password from a reset link (/admin/reset#token=..., emailed by POST /admin/password-reset/request). The link's value is taken out of
// the address at once; the page asks whether it is still good (POST /admin/password-reset/check), then sets the password
// (POST /admin/password-reset/confirm): every session of that admin ends, the lockout is cleared, and the sign-in says so.
export default function AdminResetPage() {
  const api = apiOn();
  const token = useRef(null);
  const [state, setState] = useState({ checking: true, valid: false, username: '' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    token.current ??= takeLinkToken();
    if (!api || !token.current) return setState({ checking: false, valid: false, username: '' });
    adminFetch('/admin/password-reset/check', { method: 'POST', body: { token: token.current } })
      .then((r) => setState({ checking: false, valid: r.valid, username: r.username ?? '' }))
      .catch((e) => (setState({ checking: false, valid: false, username: '' }), setError(e.message)));
  }, [api]);

  const submit = async (e) => {
    e.preventDefault();
    const problem = passwordProblem(state.username, password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await adminFetch('/admin/password-reset/confirm', { method: 'POST', body: { token: token.current, password } });
      token.current = '';
      window.location.replace('/admin/login?reset=1');
    } catch (err) {
      setError(err.message);
      if (err.code === 'reset_invalid' || err.code === 'disabled') setState({ checking: false, valid: false, username: '' });
      setBusy(false);
    }
  };

  if (state.checking) return <AdminCard title="Choose a new password" intro="Checking the link…" />;
  if (!state.valid) {
    return (
      <AdminCard title="This link does not work" intro="A reset link works once, for 30 minutes, and only the newest one asked for. Ask for another.">
        <FormError className="mb-4">{error}</FormError>
        <div className="space-y-3" data-testid="admin-reset-invalid">
          <Link href="/admin/forgot" className={buttonClass({ variant: 'primary', block: true })}>Ask for a new link</Link>
          <Link href="/admin/login" className={buttonClass({ variant: 'secondary', block: true })}>Back to the sign-in</Link>
        </div>
      </AdminCard>
    );
  }
  return (
    <AdminCard title="Choose a new password" intro={`For the admin account ${state.username}. Setting it signs this account out everywhere.`}>
      <Alert tone="info" className="mb-4">This link works once. Keep this tab open until you are done.</Alert>
      <SafeForm onSubmit={submit} disabled={!api} data-testid="admin-reset-form">
        {/* the username, for password managers */}
        <input type="text" name="username" autoComplete="username" value={state.username} readOnly hidden />
        <Field id="password" label="New password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field id="confirm" label="The new password again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <FormError>{error}</FormError>
        <Submit busy={busy}>Set the new password</Submit>
      </SafeForm>
    </AdminCard>
  );
}
