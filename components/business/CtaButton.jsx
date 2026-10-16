"use client";

import { useState } from 'react';
import { apiOn, request } from '@/lib/data/api';
import { trackCta } from './ProfileTracker';

const BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl bg-sx-cyan px-5 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white';

// The profile's one call to action: a link (website, booking, order, demo) or a newsletter sign-up form (double opt-in, server/api/engage.mjs).
export default function CtaButton({ slug, cta }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, done: '', error: '' });

  if (cta?.kind === 'newsletter') {
    if (!apiOn()) return <p className="text-sm text-sx-muted">Newsletter sign-ups open when the site is live.</p>;
    const submit = async (e) => {
      e.preventDefault();
      setState({ busy: true, done: '', error: '' });
      trackCta(slug);
      try {
        const r = await request('POST', '/leads', { targetKind: 'business', targetId: slug, email, source: 'profile' });
        setState({ busy: false, done: r.status === 'confirmed' ? 'You are already signed up.' : 'Check your inbox to confirm.', error: '' });
      } catch (err) {
        setState({ busy: false, done: '', error: err.message });
      }
    };
    if (state.done) return <p className="text-sm font-medium text-emerald-300" role="status">{state.done}</p>;
    return (
      <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="cta-email">Email address</label>
        <input id="cta-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="min-w-0 flex-1 rounded-xl border border-sx-stroke bg-sx-alt px-4 py-3 text-white placeholder:text-slate-500 focus:border-sx-cyan focus:outline-none" />
        <button type="submit" disabled={state.busy} className={BUTTON}>{cta.label}</button>
        {state.error && <p className="text-sm text-rose-300 sm:basis-full" role="alert">{state.error}</p>}
      </form>
    );
  }
  if (!cta?.url) return <p className="text-sm text-sx-muted">This business has not added a link yet.</p>;
  return (
    <a href={cta.url} target="_blank" rel="noopener nofollow ugc" onClick={() => trackCta(slug)} className={BUTTON}>
      {cta.label}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
