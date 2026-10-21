"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiOn } from '@/lib/data/api';
import { adminFetch, takeLinkToken } from '@/lib/data/admin';
import { AdminCard, FormError } from '@/components/admin/AdminShell';
import { Alert, buttonClass } from '@/components/admin/ui';

// Confirms an admin's email (/admin/verify-email#token=..., emailed when it was set on the Account page): POST /admin/email/verify. No
// session is needed (the link may be opened on another device); the link's value is taken out of the address at once.
export default function AdminVerifyEmailPage() {
  const api = apiOn();
  const started = useRef(false);
  const [state, setState] = useState({ done: false, ok: false, email: '', error: '' });

  useEffect(() => {
    if (started.current) return; // once (the link works once)
    started.current = true;
    const value = takeLinkToken();
    if (!api) return setState({ done: true, ok: false, email: '', error: 'The admin pages need the API: build the site with NEXT_PUBLIC_LIVE_API_URL.' });
    if (!value) return setState({ done: true, ok: false, email: '', error: 'This page needs the link from the email.' });
    adminFetch('/admin/email/verify', { method: 'POST', body: { token: value } })
      .then((r) => setState({ done: true, ok: true, email: r.email, error: '' }))
      .catch((e) => setState({ done: true, ok: false, email: '', error: e.message }));
  }, [api]);

  if (!state.done) return <AdminCard title="Confirming your email" intro="One moment…" />;
  return (
    <AdminCard title={state.ok ? 'Email confirmed' : 'This link does not work'} intro={state.ok ? 'A forgotten password can now be reset by email.' : 'A confirmation link works once, for 30 minutes. Set the address again on your Account page for a new one.'}>
      <div className="space-y-3" data-testid="admin-verify-result" data-ok={state.ok ? '1' : '0'}>
        {state.ok ? <Alert tone="success">Reset links for your account will go to {state.email}.</Alert> : <FormError>{state.error}</FormError>}
        <Link href="/admin/password" className={buttonClass({ variant: 'primary', block: true })}>Your account</Link>
      </div>
    </AdminCard>
  );
}
