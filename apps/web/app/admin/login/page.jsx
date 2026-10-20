"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiOn } from '@/lib/data/api';
import { adminFetch, safeNext } from '@/lib/data/admin';
import { AdminCard, Field, FormError, SafeForm, Submit } from '@/components/admin/AdminShell';

// The admin sign-in (services/api/admin.mjs). On success the API sets an HttpOnly session cookie and this page goes on to the page the admin
// wanted (?next=, a path on this site only). With no admin account yet, it points to /admin/setup.
export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [next, setNext] = useState('/admin');
  const api = apiOn();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const target = safeNext(q.get('next'));
    setNext(target);
    if (q.get('signedOut')) setNotice('You are signed out.');
    else if (q.get('created')) setNotice('The admin account is ready. Sign in with it.');
    if (!api) return;
    // already signed in: straight on
    adminFetch('/admin/session').then(() => window.location.replace(target)).catch(() => {});
    adminFetch('/admin/setup').then((s) => setSetupNeeded(Boolean(s.needed))).catch(() => {});
  }, [api]);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError('Enter your username and password.');
    setBusy(true);
    setError('');
    try {
      await adminFetch('/admin/session', { method: 'POST', body: { username: username.trim(), password } });
      window.location.replace(next);
    } catch (err) {
      setPassword('');
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AdminCard title="Sign in" intro="For VoxelVenture's staff. Your session ends after 2 hours without use, and after 12 hours in any case.">
      {!api && <FormError>The admin pages need the API: build the site with NEXT_PUBLIC_LIVE_API_URL.</FormError>}
      {notice && <p className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200" role="status">{notice}</p>}
      {setupNeeded && (
        <p className="mb-4 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100" data-testid="admin-setup-needed">
          There is no admin account yet. <Link href="/admin/setup" className="font-semibold underline">Create the first one</Link> with the API&apos;s admin token.
        </p>
      )}
      <SafeForm onSubmit={submit} disabled={!api} data-testid="admin-login-form">
        <Field id="username" label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
        <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <FormError>{error}</FormError>
        <Submit busy={busy}>Sign in</Submit>
      </SafeForm>
      <p className="mt-6 text-center text-xs text-sx-muted">Forgot your password? Another admin can add you again, or on the server: <code>npm run admin:reset-password</code>.</p>
    </AdminCard>
  );
}
