"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiOn } from '@/lib/data/api';
import { adminFetch, passwordProblem, PASSWORD_HINT } from '@/lib/data/admin';
import { AdminCard, Field, FormError, SafeForm, Submit } from '@/components/admin/AdminShell';
import { buttonClass } from '@/components/admin/ui';

// The first admin account (POST /admin/setup): only while there is none, and only with the API's ADMIN_TOKEN. The token is typed here, sent
// once as Authorization: Bearer, and never kept: not in storage, not in the address. Afterwards, the login.
export default function AdminSetupPage() {
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needed, setNeeded] = useState(null);
  const api = apiOn();

  useEffect(() => {
    if (api) adminFetch('/admin/setup').then((s) => setNeeded(Boolean(s.needed))).catch((e) => setError(e.message));
  }, [api]);

  const submit = async (e) => {
    e.preventDefault();
    const problem = !token.trim() ? 'Enter the admin token.' : !username.trim() ? 'Choose a username.' : passwordProblem(username, password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await adminFetch('/admin/setup', { method: 'POST', token: token.trim(), body: { username: username.trim(), password } });
      setToken('');
      window.location.replace('/admin/login?created=1');
    } catch (err) {
      setError(err.status === 403 ? 'That is not the admin token.' : err.message);
      if (err.status === 409) setNeeded(false);
      setBusy(false);
    }
  };

  if (needed === false) {
    return (
      <AdminCard title="Already set up" intro="An admin account exists, so this page is closed. Sign in instead; another admin can add you.">
        <Link href="/admin/login" className={buttonClass({ variant: 'primary', block: true })}>Go to the sign-in</Link>
      </AdminCard>
    );
  }
  return (
    <AdminCard title="Create the first admin" intro="This works once, while there is no admin account. It needs the API's ADMIN_TOKEN (from api.env, or your own records): it is sent once and not kept in this browser.">
      {!api && <FormError className="mb-4">The admin pages need the API: build the site with NEXT_PUBLIC_LIVE_API_URL.</FormError>}
      <SafeForm onSubmit={submit} disabled={!api} data-testid="admin-setup-form">
        <Field id="token" label="Admin token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
        <Field id="username" label="Your username" autoComplete="username" autoCapitalize="none" spellCheck={false} hint="3 to 32 letters, numbers, dots, dashes or underscores." value={username} onChange={(e) => setUsername(e.target.value)} />
        <Field id="password" label="Password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field id="confirm" label="The same password again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <FormError>{error}</FormError>
        <Submit busy={busy}>Create the account</Submit>
      </SafeForm>
      <p className="mt-6 text-center text-xs text-sx-muted"><Link href="/admin/login" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-white">Back to the sign-in</Link></p>
    </AdminCard>
  );
}
