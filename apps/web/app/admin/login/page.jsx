"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiOn } from '@/lib/data/api';
import { adminFetch, safeNext } from '@/lib/data/admin';
import { AdminCard, Field, FormError, SafeForm, Submit } from '@/components/admin/AdminShell';
import { Alert } from '@/components/admin/ui';

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
    else if (q.get('reset')) setNotice('Your password is changed and every session of your account has ended. Sign in with the new password.');
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
      {!api && <FormError className="mb-4">The admin pages need the API: build the site with NEXT_PUBLIC_LIVE_API_URL.</FormError>}
      {notice && <Alert tone="success" className="mb-4" data-testid="admin-login-notice">{notice}</Alert>}
      {setupNeeded && (
        <Alert tone="warn" className="mb-4" data-testid="admin-setup-needed">
          There is no admin account yet. <Link href="/admin/setup" className="font-semibold underline underline-offset-2">Create the first one</Link> with the API&apos;s admin token.
        </Alert>
      )}
      <SafeForm onSubmit={submit} disabled={!api} data-testid="admin-login-form">
        <Field id="username" label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
        <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <FormError>{error}</FormError>
        <Submit busy={busy}>Sign in</Submit>
      </SafeForm>
      <p className="mt-6 text-center text-sm"><Link href="/admin/forgot" className="inline-flex min-h-11 items-center font-medium text-sx-muted underline underline-offset-2 hover:text-white" data-testid="admin-forgot-link">Forgot your password?</Link></p>
    </AdminCard>
  );
}
