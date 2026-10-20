"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminFetch, isOpenAdminPath, loginHref, signedOut } from '@/lib/data/admin';

// The guard every admin page sits in (apps/web/app/admin/layout.jsx): it asks the API who is signed in (GET /admin/session, with the session
// cookie) and sends anyone without a session to /admin/login?next=<this page>. Signed in, the page gets the admin bar (the admin pages, who
// is signed in, Sign out) and useAdmin(): { admin, call } where call(path, options) is an API call that goes back to the login if the session
// ends meanwhile. A new admin page needs nothing more than to be under app/admin/ and to make its calls with useAdmin().call.
// The pages themselves hold no data: every figure comes from the API, which checks the session on each call.

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

export const ADMIN_PAGES = [
  ['/admin', 'Monitor'],
  ['/admin/pilot', 'Pilot'],
  ['/admin/economy', 'Economy'],
  ['/admin/admins', 'Admins'],
  ['/admin/password', 'Password'],
];

const here = () => `${window.location.pathname}${window.location.search}`;

export default function AdminShell({ children }) {
  const pathname = usePathname() ?? '';
  const open = isOpenAdminPath(pathname);
  const [state, setState] = useState({ checking: true, admin: null, error: '' });

  useEffect(() => {
    if (open) return undefined;
    let alive = true;
    adminFetch('/admin/session')
      .then((s) => alive && setState({ checking: false, admin: s.admin, error: '' }))
      .catch((e) => {
        if (!alive) return;
        if (signedOut(e) || e.code === 'no_api') window.location.replace(loginHref(here()));
        else setState({ checking: false, admin: null, error: e.message });
      });
    return () => {
      alive = false;
    };
  }, [open, pathname]);

  const call = useCallback(async (path, options) => {
    try {
      return await adminFetch(path, options);
    } catch (e) {
      if (signedOut(e)) window.location.replace(loginHref(here()));
      throw e;
    }
  }, []);
  const signOut = useCallback(async () => {
    try {
      await adminFetch('/admin/session', { method: 'DELETE' });
    } catch {
      /* the session ends on the server anyway after 2 hours idle; go to the login either way */
    }
    window.location.replace('/admin/login?signedOut=1');
  }, []);
  const value = useMemo(() => ({ admin: state.admin, call, signOut }), [state.admin, call, signOut]);

  if (open) return <div className="h-dvh overflow-y-auto bg-sx-page text-sx-text">{children}</div>;
  if (!state.admin) {
    return (
      <div className="grid h-dvh place-items-center bg-sx-page px-4 text-sx-text">
        {state.error ? (
          <div role="alert" className="max-w-md rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
            {state.error} <button type="button" className="ml-1 underline" onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : (
          <p className="text-sm text-sx-muted" data-testid="admin-checking">Checking your sign-in…</p>
        )}
      </div>
    );
  }
  return (
    <AdminContext.Provider value={value}>
      <div className="h-dvh overflow-y-auto bg-sx-page text-sx-text">
        <header className="border-b border-sx-stroke bg-sx-panel/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="font-bold tracking-tight text-white">VoxelVenture <span className="text-sx-cyan">admin</span></Link>
            <nav aria-label="Admin pages" className="order-3 w-full overflow-x-auto sm:order-none sm:w-auto">
              <ul className="flex gap-1 text-sm">
                {ADMIN_PAGES.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} aria-current={pathname === href ? 'page' : undefined} className={`block whitespace-nowrap rounded-lg px-2.5 py-1.5 ${pathname === href ? 'bg-sx-alt text-white' : 'text-sx-muted hover:text-white'}`}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="text-sx-muted" data-testid="admin-user">{state.admin.username}</span>
              <button type="button" onClick={signOut} className="rounded-lg border border-sx-line px-3 py-1.5 font-medium hover:border-sx-cyan hover:text-white" data-testid="admin-sign-out">Sign out</button>
            </div>
          </div>
        </header>
        {children}
      </div>
    </AdminContext.Provider>
  );
}

// true once React runs in the browser. Until then a form would submit natively (a GET, with the password in the address), so every admin
// form is a <SafeForm>: method="post" and every control disabled until the page is ready.
export function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
export function SafeForm({ onSubmit, disabled = false, className = 'space-y-4', children, ...rest }) {
  const ready = useHydrated();
  return (
    <form method="post" action="" onSubmit={onSubmit} noValidate data-ready={ready ? '1' : '0'} {...rest}>
      <fieldset disabled={!ready || disabled} className={`min-w-0 ${className}`}>{children}</fieldset>
    </form>
  );
}

// The card the sign-in, setup and password forms share.
export function AdminCard({ title, intro, children }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-sx-stroke bg-sx-panel p-6 shadow-xl shadow-black/30 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">VoxelVenture admin</p>
        <h1 className="mt-1 text-2xl font-bold text-white">{title}</h1>
        {intro && <p className="mt-2 text-sm text-sx-muted">{intro}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function Field({ id, label, hint, ...input }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">{label}</label>
      <input id={id} name={id} {...input} className="mt-1 block w-full rounded-lg border border-sx-line bg-sx-page px-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:border-sx-cyan focus:outline-none focus:ring-2 focus:ring-sx-cyan/40" />
      {hint && <p className="mt-1 text-xs text-sx-muted">{hint}</p>}
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return <p role="alert" className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200" data-testid="admin-form-error">{children}</p>;
}

export function Submit({ busy, children }) {
  return (
    <button type="submit" disabled={busy} className="w-full rounded-lg bg-sx-cyan px-4 py-2.5 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60">
      {busy ? 'One moment…' : children}
    </button>
  );
}
