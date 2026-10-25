"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, KeyRound, LogOut, Menu, Rocket, ShieldAlert, ShieldCheck, Ticket, UserX, X } from 'lucide-react';
import { adminFetch, isOpenAdminPath, loginHref, signedOut } from '@/lib/data/admin';
import { Alert, BrandMark, Button, Field, StatusPill, Wordmark, buttonClass, cx } from '@/components/admin/ui';

// The guard every admin page sits in (apps/web/app/admin/layout.jsx): it asks the API who is signed in (GET /admin/session, with the session
// cookie) and sends anyone without a session to /admin/login?next=<this page>. Signed in, the page gets the dashboard's frame (a sidebar of
// the admin pages on a wide screen, a drawer behind a menu button on a phone, a top bar with the page's name, a live indicator when the
// page has one, who is signed in and Sign out) and useAdmin(): { admin, call, signOut, setLive } where call(path, options) is an API call
// that goes back to the login if the session ends meanwhile. A new admin page needs nothing more than to be under app/admin/, to make its
// calls with useAdmin().call and to be listed in ADMIN_NAV; the components it is drawn with are in components/admin/ui.jsx.
// The pages themselves hold no data: every figure comes from the API, which checks the session on each call.

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);
export { Field };

// The sidebar, in groups.
export const ADMIN_NAV = [
  { group: 'Live', items: [{ href: '/admin', label: 'Monitor', title: 'Client monitor', icon: Activity }] },
  {
    group: 'Business',
    items: [
      { href: '/admin/pilot', label: 'Pilot', title: 'Pilot dashboard', icon: Rocket },
      { href: '/admin/economy', label: 'Economy', title: 'Plot economy', icon: BarChart3 },
      { href: '/admin/promos', label: 'Promo codes', title: 'Promo codes', icon: Ticket },
      { href: '/admin/disputes', label: 'Disputes', title: 'Disputes and refunds', icon: ShieldAlert },
    ],
  },
  { group: 'Support', items: [{ href: '/admin/privacy', label: 'Privacy requests', title: 'Privacy requests', icon: UserX }] },
  {
    group: 'Settings',
    items: [
      { href: '/admin/admins', label: 'Admins', title: 'Admins', icon: ShieldCheck },
      { href: '/admin/password', label: 'Account', title: 'Your account', icon: KeyRound },
    ],
  },
];
export const ADMIN_PAGES = ADMIN_NAV.flatMap((g) => g.items.map((i) => [i.href, i.label]));
const navItemFor = (pathname) => {
  const items = ADMIN_NAV.flatMap((g) => g.items);
  const clean = pathname.replace(/\/+$/, '') || '/admin';
  return items.find((i) => i.href === clean) ?? items.filter((i) => i.href !== '/admin' && clean.startsWith(`${i.href}/`))[0] ?? null;
};

const here = () => `${window.location.pathname}${window.location.search}`;

// the dark page every admin screen is drawn on (also the body's background: app/globals.css, .admin-root)
const PAGE_BG = 'admin-root bg-sx-page bg-[radial-gradient(60rem_40rem_at_100%_-10%,rgba(139,92,246,0.12),transparent_60%),radial-gradient(50rem_30rem_at_-10%_110%,rgba(34,211,238,0.07),transparent_60%)] text-sx-text';

export default function AdminShell({ children }) {
  const pathname = usePathname() ?? '';
  const open = isOpenAdminPath(pathname);
  const [state, setState] = useState({ checking: true, admin: null, error: '' });
  const [live, setLive] = useState(null);

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
  // a page's live indicator is its own: it goes when the page does
  useEffect(() => setLive(null), [pathname]);

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
  const value = useMemo(() => ({ admin: state.admin, call, signOut, setLive }), [state.admin, call, signOut]);

  if (open) return <main className={cx('h-dvh overflow-y-auto', PAGE_BG)}>{children}</main>;
  if (!state.admin) {
    return (
      <div className={cx('grid h-dvh place-items-center px-4', PAGE_BG)}>
        {state.error ? (
          <Alert tone="error" className="max-w-md">
            {state.error} <button type="button" className="ml-1 font-semibold underline" onClick={() => window.location.reload()}>Try again</button>
          </Alert>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <BrandMark size={48} className="motion-safe:animate-pulse" />
            <p className="text-sm text-sx-muted" data-testid="admin-checking">Checking your sign-in…</p>
          </div>
        )}
      </div>
    );
  }
  const item = navItemFor(pathname);
  return (
    <AdminContext.Provider value={value}>
      <div id="admin-shell" className={cx('flex h-dvh overflow-hidden', PAGE_BG)}>
        <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-sx-cyan focus:px-3 focus:py-2 focus:font-semibold focus:text-slate-950">Skip to content</a>
        <aside className="hidden w-64 shrink-0 flex-col border-r border-sx-stroke bg-sx-panel/70 backdrop-blur lg:flex">
          <Link href="/admin" className="mx-3 mt-4 rounded-xl px-2 py-2 hover:bg-sx-alt/60" aria-label="Voxel Venture Admin, the monitor">
            <Wordmark />
          </Link>
          <AdminNav pathname={pathname} className="mt-4 flex-1 overflow-y-auto px-3 pb-4" />
          <p className="border-t border-sx-stroke px-5 py-3 text-[11px] text-sx-muted">A Theoretical Minds Technologies Game</p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-sx-stroke bg-sx-panel/70 px-3 backdrop-blur sm:gap-3 sm:px-5">
            <MobileNav pathname={pathname} admin={state.admin} />
            <BrandMark size={28} className="lg:hidden" />
            <p className="min-w-0 truncate text-base font-semibold text-white sm:text-lg">{item?.title ?? 'Admin'}</p>
            {live && (
              <span className="hidden sm:block" data-testid="admin-live">
                <StatusPill tone={live.tone ?? 'green'} pulse={live.pulse}>{live.label}</StatusPill>
              </span>
            )}
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {live && (
                <span className="sm:hidden" title={live.label}>
                  <StatusPill tone={live.tone ?? 'green'} pulse={live.pulse}><span aria-hidden="true">{live.short ?? ''}</span><span className="sr-only">{live.label}</span></StatusPill>
                </span>
              )}
              <span className="hidden items-center gap-2 text-sm text-slate-200 sm:flex">
                <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sx-purple to-sx-blue text-xs font-bold uppercase text-white">{state.admin.username.slice(0, 2)}</span>
                <span className="sr-only">Signed in as </span>
                <span className="max-w-[10rem] truncate font-medium" data-testid="admin-user">{state.admin.username}</span>
              </span>
              <button type="button" onClick={signOut} className={buttonClass({ variant: 'secondary', size: 'md', className: 'px-3 sm:px-4' })} data-testid="admin-sign-out">
                <LogOut aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </button>
            </div>
          </header>
          <main id="admin-main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden focus:outline-none">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}

function AdminNav({ pathname, className = '', onNavigate }) {
  const current = navItemFor(pathname)?.href;
  return (
    <nav aria-label="Admin pages" className={className}>
      {ADMIN_NAV.map((g) => (
        <div key={g.group} className="mb-5">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-sx-muted">{g.group}</p>
          <ul className="space-y-1">
            {g.items.map(({ href, label, icon: Icon }) => {
              const on = current === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={on ? 'page' : undefined}
                    className={cx(
                      'relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition motion-reduce:transition-none',
                      on ? 'bg-gradient-to-r from-sx-purple/25 via-sx-blue/10 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)]' : 'text-slate-300 hover:bg-sx-alt hover:text-white',
                    )}
                  >
                    {on && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gradient-to-b from-sx-cyan to-sx-purple shadow-[0_0_12px_var(--color-sx-cyan)]" />}
                    <Icon aria-hidden="true" className={cx('h-[18px] w-[18px] shrink-0', on ? 'text-sx-cyan' : 'text-sx-muted')} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The phone's navigation: a menu button opening the sidebar as a drawer (a modal dialog: Escape or the backdrop closes it, Tab stays
// inside while it is open, and the focus goes back to the button afterwards).
function MobileNav({ pathname, admin }) {
  const [openNav, setOpenNav] = useState(false);
  const button = useRef(null);
  const panel = useRef(null);
  const close = useCallback(() => setOpenNav(false), []);
  useEffect(() => setOpenNav(false), [pathname]);
  useEffect(() => {
    if (!openNav) return undefined;
    const el = panel.current;
    // the page behind is out of reach while the drawer is open (keyboard, pointer and screen reader)
    const shell = document.getElementById('admin-shell');
    shell?.setAttribute('inert', '');
    const opener = button.current;
    (el?.querySelector('[aria-current="page"]') ?? el?.querySelector(FOCUSABLE))?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      shell?.removeAttribute('inert');
      opener?.focus(); // back where the drawer was opened from
    };
  }, [openNav, close]);

  return (
    <>
      <button ref={button} type="button" onClick={() => setOpenNav(true)} aria-expanded={openNav} aria-controls="admin-drawer" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-200 hover:bg-sx-alt lg:hidden" data-testid="admin-menu">
        <Menu aria-hidden="true" className="h-5 w-5" />
        <span className="sr-only">Menu</span>
      </button>
      {/* drawn at the end of the body: inside the top bar (backdrop-blur) "fixed" would be relative to the bar */}
      {openNav && createPortal(
        <div className="admin-root fixed inset-0 z-50 text-sx-text lg:hidden">
          <div aria-hidden="true" className="absolute inset-0 bg-black/60 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in" onClick={close} />
          <div ref={panel} id="admin-drawer" role="dialog" aria-modal="true" aria-label="Admin pages" className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-sx-stroke bg-sx-panel shadow-2xl shadow-black/60 motion-safe:animate-in motion-safe:slide-in-from-left motion-safe:duration-200" data-testid="admin-drawer">
            <div className="flex items-center justify-between gap-2 px-3 pt-3">
              <Link href="/admin" onClick={close} className="rounded-xl px-2 py-2" aria-label="Voxel Venture Admin, the monitor"><Wordmark /></Link>
              <button type="button" onClick={close} className="grid h-11 w-11 place-items-center rounded-xl text-slate-200 hover:bg-sx-alt">
                <X aria-hidden="true" className="h-5 w-5" />
                <span className="sr-only">Close the menu</span>
              </button>
            </div>
            <AdminNav pathname={pathname} onNavigate={close} className="mt-3 flex-1 overflow-y-auto px-3 pb-4" />
            <p className="border-t border-sx-stroke px-5 py-3 text-xs text-sx-muted">Signed in as <span className="font-semibold text-slate-200">{admin.username}</span></p>
          </div>
        </div>,
        document.body,
      )}
    </>
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

// The card the sign-in and setup forms share: centred on the dark page, with the brand mark. (On /admin/password, inside the dashboard,
// `inShell` draws it as a plain card.)
export function AdminCard({ title, intro, children, inShell = false }) {
  if (inShell) {
    return (
      <div className="rounded-2xl border border-sx-stroke bg-sx-panel/80 p-5 shadow-xl shadow-black/20 sm:p-7">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {intro && <p className="mt-1 text-sm text-sx-muted">{intro}</p>}
        <div className="mt-5">{children}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <BrandMark size={72} className="drop-shadow-[0_0_24px_rgba(139,92,246,0.45)]" />
        <p className="mt-3 text-lg font-bold tracking-tight text-white">Voxel Venture <span className="bg-gradient-to-r from-sx-cyan to-sx-purple bg-clip-text text-transparent">Admin</span></p>
      </div>
      <div className="relative rounded-2xl border border-sx-stroke bg-sx-panel/85 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
        <span aria-hidden="true" className="absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-sx-cyan/70 to-transparent" />
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {intro && <p className="mt-2 text-sm text-sx-muted">{intro}</p>}
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 text-center text-xs text-sx-muted">A Theoretical Minds Technologies Game</p>
    </div>
  );
}

export function FormError({ children, className = '' }) {
  if (!children) return null;
  return <Alert tone="error" className={className} data-testid="admin-form-error">{children}</Alert>;
}

export function Submit({ busy, children }) {
  return (
    <Button type="submit" variant="primary" block disabled={busy}>
      {busy ? 'One moment…' : children}
    </Button>
  );
}
