"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { passwordProblem } from '@/lib/data/admin';
import { Field, FormError, SafeForm, useAdmin } from '@/components/admin/AdminShell';

// The admin accounts (GET/POST /admin/admins, PATCH /admin/admins/:id): who can sign in here, adding one, and disabling one (their sessions end
// at once). Nobody can disable themselves or the last admin who can sign in. Every change is in the audit trail.
const when = (t) => (t ? new Date(t).toLocaleString() : 'never');

export default function AdminAccountsPage() {
  const { call } = useAdmin();
  const [list, setList] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const out = await call('/admin/admins');
      setList(out.admins);
      setMe(out.me);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [call]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const problem = !username.trim() ? 'Choose a username.' : passwordProblem(username, password);
    if (problem) return setFormError(problem);
    setBusy(true);
    setFormError('');
    try {
      const out = await call('/admin/admins', { method: 'POST', body: { username: username.trim(), password } });
      setNotice(`${out.admin.username} can sign in now. Give them the password in person or over a channel you trust; they can change it on the Password page.`);
      setUsername('');
      setPassword('');
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (a) => {
    try {
      await call(`/admin/admins/${a.id}`, { method: 'PATCH', body: { disabled: !a.disabled } });
      setNotice(a.disabled ? `${a.username} can sign in again.` : `${a.username} is disabled and signed out.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold text-white">Admins</h1>
      <p className="mt-1 text-sm text-sx-muted">Who can sign in to these pages. Players&apos; accounts are separate and never admins.</p>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}

      <div className="mt-5 overflow-x-auto rounded-xl border border-sx-stroke">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="bg-sx-panel text-xs text-sx-muted">
            <tr><th className="px-3 py-2">Username</th><th className="px-3 py-2">Created</th><th className="px-3 py-2">Last sign-in</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"><span className="sr-only">Action</span></th></tr>
          </thead>
          <tbody>
            {(list ?? []).map((a) => (
              <tr key={a.id} className="border-t border-sx-stroke">
                <td className="px-3 py-2 font-medium">{a.username}{a.id === me && <span className="ml-1 text-xs text-sx-muted">(you)</span>}</td>
                <td className="px-3 py-2 text-sx-muted">{when(a.createdAt)}</td>
                <td className="px-3 py-2 text-sx-muted">{when(a.lastLoginAt)}</td>
                <td className={`px-3 py-2 ${a.disabled ? 'text-amber-300' : 'text-emerald-300'}`}>{a.disabled ? 'Disabled' : 'Active'}</td>
                <td className="px-3 py-2 text-right">
                  {a.id !== me && (
                    <button type="button" onClick={() => toggle(a)} className="rounded-lg border border-sx-line px-2.5 py-1 text-xs hover:border-sx-cyan">{a.disabled ? 'Enable' : 'Disable'}</button>
                  )}
                </td>
              </tr>
            ))}
            {list && list.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-sx-muted">No admins.</td></tr>}
          </tbody>
        </table>
      </div>

      <SafeForm onSubmit={add} className="mt-8 max-w-md space-y-4 rounded-xl border border-sx-stroke bg-sx-panel p-5">
        <h2 className="font-semibold text-white">Add an admin</h2>
        <Field id="new-username" label="Username" autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
        <Field id="new-password" label="A first password" type="password" autoComplete="new-password" hint="At least 12 characters, and not the username. They should change it after signing in." value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError>{formError}</FormError>
        <button type="submit" disabled={busy} className="rounded-lg bg-sx-cyan px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60">{busy ? 'One moment…' : 'Add the admin'}</button>
      </SafeForm>
    </main>
  );
}
