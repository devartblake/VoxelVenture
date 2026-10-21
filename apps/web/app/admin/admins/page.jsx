"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, ShieldCheck, UserPlus } from 'lucide-react';
import { passwordProblem, PASSWORD_HINT } from '@/lib/data/admin';
import { Field, FormError, SafeForm, Submit, useAdmin } from '@/components/admin/AdminShell';
import { Alert, Badge, Button, DataTable, PageHeader, Section, StatusPill } from '@/components/admin/ui';

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
      setNotice(`${out.admin.username} can sign in now. Give them the password in person or over a channel you trust; they can change it, and add an email for password resets, on their Account page.`);
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

  const columns = [
    {
      key: 'username',
      header: 'Username',
      render: (a) => (
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sx-purple to-sx-blue text-xs font-bold uppercase text-white">{a.username.slice(0, 2)}</span>
          <span className="font-medium text-white">{a.username}</span>
          {a.id === me && <Badge tone="cyan">you</Badge>}
        </span>
      ),
    },
    // the address each admin's reset links go to: shown in full (every admin here is staff), with whether it is confirmed
    {
      key: 'email',
      header: 'Reset email',
      render: (a) => (
        <span className="flex flex-wrap items-center gap-2">
          {a.email ? <span className="max-w-[16rem] truncate text-slate-200" title={a.email}>{a.email}</span> : <span className="text-sx-muted">none</span>}
          {a.email && (a.emailVerified ? <StatusPill tone="green">Confirmed</StatusPill> : <StatusPill tone="amber">Unconfirmed</StatusPill>)}
        </span>
      ),
    },
    { key: 'created', header: 'Created', className: 'whitespace-nowrap text-sx-muted', render: (a) => when(a.createdAt) },
    { key: 'last', header: 'Last sign-in', className: 'whitespace-nowrap text-sx-muted', render: (a) => when(a.lastLoginAt) },
    { key: 'status', header: 'Status', render: (a) => (a.disabled ? <StatusPill tone="amber">Disabled</StatusPill> : <StatusPill tone="green">Active</StatusPill>) },
    {
      key: 'action',
      header: 'Action',
      srOnly: true,
      align: 'right',
      render: (a) => a.id !== me && (
        <Button size="sm" variant={a.disabled ? 'secondary' : 'danger'} icon={a.disabled ? CheckCircle2 : Ban} onClick={() => toggle(a)}>{a.disabled ? 'Enable' : 'Disable'}</Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Admins" description="Who can sign in to these pages. Players' accounts are separate and never admins." />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Section title="Accounts" icon={ShieldCheck} description="Disabling an admin signs them out at once. Every change is in the audit trail." bodyClassName="p-3 sm:p-4">
          <DataTable caption="Admin accounts" columns={columns} rows={list ?? []} rowKey={(a) => a.id} empty={list ? 'No admins.' : 'Loading…'} minWidth="48rem" />
        </Section>

        <Section title="Add an admin" icon={UserPlus} description="They should change the password after signing in.">
          <SafeForm onSubmit={add} className="space-y-4">
            <Field id="new-username" label="Username" autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
            <Field id="new-password" label="A first password" type="password" autoComplete="new-password" hint={`${PASSWORD_HINT} They should change it after signing in.`} value={password} onChange={(e) => setPassword(e.target.value)} />
            <FormError>{formError}</FormError>
            <Submit busy={busy}>Add the admin</Submit>
          </SafeForm>
        </Section>
      </div>
    </div>
  );
}
