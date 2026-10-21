"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { KeyRound, Mail } from 'lucide-react';
import { apiOn } from '@/lib/data/api';
import { adminFetch, passwordProblem, PASSWORD_HINT } from '@/lib/data/admin';
import { AdminCard, Field, FormError, SafeForm, Submit } from '@/components/admin/AdminShell';
import { Alert, Tabs } from '@/components/admin/ui';

// A forgotten admin password (services/api/admin.mjs). Two ways:
//   - Email me a link (POST /admin/password-reset/request): the answer is the same whether the account exists or not; the link goes to the
//     admin's confirmed email (set on the Account page) and opens /admin/reset.
//   - The server's admin token (POST /admin/password-reset/token): the ADMIN_TOKEN is typed here, sent once as Authorization: Bearer and
//     kept nowhere (as on /admin/setup). Wrong tokens count as failed sign-ins of this network.
// Either one ends every session of that admin and clears the lockout of their username, then the sign-in says so.
export default function AdminForgotPage() {
  const api = apiOn();
  const [way, setWay] = useState('email');

  return (
    <AdminCard title="Forgot your password?" intro="Get a link by email, or use the server's admin token. A new password signs the account out everywhere.">
      {!api && <FormError className="mb-4">The admin pages need the API: build the site with NEXT_PUBLIC_LIVE_API_URL.</FormError>}
      <Tabs
        label="How to reset"
        value={way}
        onChange={setWay}
        className="mb-5"
        tabs={[
          { id: 'email', label: 'Email me a link', icon: Mail, panel: 'forgot-panel' },
          { id: 'token', label: 'Admin token', icon: KeyRound, panel: 'forgot-panel' },
        ]}
      />
      <div id="forgot-panel" role="tabpanel" aria-label={way === 'email' ? 'Email me a link' : "Reset with the server's admin token"}>
        {way === 'email' ? <ByEmail api={api} /> : <ByToken api={api} />}
      </div>
      <p className="mt-6 text-center text-xs text-sx-muted"><Link href="/admin/login" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-white">Back to the sign-in</Link></p>
    </AdminCard>
  );
}

function ByEmail({ api }) {
  const [login, setLogin] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!login.trim()) return setError('Enter your username or your email.');
    setBusy(true);
    setError('');
    try {
      const out = await adminFetch('/admin/password-reset/request', { method: 'POST', body: { login: login.trim() } });
      setSent(out.message);
      setLogin('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4" data-testid="admin-forgot-sent">
        <Alert tone="success">{sent}</Alert>
        <p className="text-sm text-sx-muted">Nothing came? Check your spam folder, or ask again in a few minutes. An email is only sent to an address its admin confirmed on the Account page; otherwise use the admin token.</p>
      </div>
    );
  }
  return (
    <SafeForm onSubmit={submit} disabled={!api} data-testid="admin-forgot-form">
      <Field id="login" label="Username or email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} hint="The link goes to the account's confirmed email and works once, for 30 minutes." />
      <FormError>{error}</FormError>
      <Submit busy={busy}>Email me a link</Submit>
    </SafeForm>
  );
}

function ByToken({ api }) {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const problem = !username.trim() ? 'Enter the username.' : !token.trim() ? 'Enter the admin token.' : passwordProblem(username, password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await adminFetch('/admin/password-reset/token', { method: 'POST', token: token.trim(), body: { username: username.trim(), password } });
      setToken('');
      window.location.replace('/admin/login?reset=1');
    } catch (err) {
      setToken('');
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <SafeForm onSubmit={submit} disabled={!api} data-testid="admin-forgot-token-form">
      <p className="text-sm text-sx-muted">The API&apos;s <code className="text-slate-200">ADMIN_TOKEN</code> (from api.env, or your own records). It is sent once and not kept in this browser. Five wrong tries lock this network for 15 minutes.</p>
      <Field id="reset-username" label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
      <Field id="reset-token" label="Admin token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
      <Field id="reset-password" label="New password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field id="reset-confirm" label="The new password again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <FormError>{error}</FormError>
      <Submit busy={busy}>Reset the password</Submit>
    </SafeForm>
  );
}
