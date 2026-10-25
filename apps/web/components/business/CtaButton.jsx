"use client";

import { useState } from 'react';
import { apiOn, request } from '@/lib/data/api';
import { visitorId } from '@/lib/data/visitor';
import { newClickId, withClickId } from '@voxelventure/analytics';
import { trackCta } from './ProfileTracker';
import { RETENTION } from '@/lib/legal/retention';

const BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl bg-sx-cyan px-5 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white';
const FIELD = 'w-full rounded-xl border border-sx-stroke bg-sx-alt px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-sx-cyan focus:outline-none';

// The profile's one call to action:
//   a link (website, booking, order, demo): opens it with a click id added, so a sale on the business's site can be credited to the press
//   newsletter: a sign-up form (double opt-in, services/api/engage.mjs)
//   meeting / quote: a short form; the owner gets the request by email (services/api/conversions.mjs)
//   call / email / directions: a tel:, mailto: or map link, counted as a press (no click id: nothing to credit a sale to)
export default function CtaButton({ slug, cta }) {
  if (cta?.kind === 'newsletter') return <Newsletter slug={slug} cta={cta} />;
  if (cta?.kind === 'meeting' || cta?.kind === 'quote') return <Inquiry slug={slug} cta={cta} />;
  if (['call', 'email', 'directions'].includes(cta?.kind) && cta.url) {
    const away = cta.kind === 'directions' ? { target: '_blank', rel: 'noopener nofollow' } : {};
    return (
      <a href={cta.url} {...away} onClick={() => trackCta(slug)} className={BUTTON}>
        {cta.label}
        {away.target && <span aria-hidden="true">↗</span>}
      </a>
    );
  }
  if (!cta?.url) return <p className="text-sm text-sx-muted">This business has not added a link yet.</p>;
  // the click id is made when the button is pressed, sent with the press, and added to the link the browser then opens
  const open = (e) => {
    const id = newClickId();
    e.currentTarget.href = withClickId(cta.url, id);
    trackCta(slug, id);
  };
  return (
    <a href={cta.url} target="_blank" rel="noopener nofollow ugc" onClick={open} className={BUTTON}>
      {cta.label}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

function Newsletter({ slug, cta }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, done: '', error: '' });
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

// A meeting or quote request: opens a short form under the button.
function Inquiry({ slug, cta }) {
  const meeting = cta.kind === 'meeting';
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', preferred: '', message: '', website: '' });
  const [state, setState] = useState({ busy: false, done: false, error: '', errors: {} });
  if (!apiOn()) return <p className="text-sm text-sx-muted">Requests open when the site is live.</p>;
  if (state.done) return <p className="text-sm font-medium text-emerald-300" role="status">Sent. The business will reply to {form.email}.</p>;
  if (!open) {
    return (
      <button type="button" className={BUTTON} onClick={() => (setOpen(true), trackCta(slug))} aria-expanded="false">
        {cta.label}
      </button>
    );
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, done: false, error: '', errors: {} });
    try {
      await request('POST', `/businesses/${encodeURIComponent(slug)}/inquiries`, { kind: cta.kind, ...form, visitor: visitorId() });
      setState({ busy: false, done: true, error: '', errors: {} });
    } catch (err) {
      setState({ busy: false, done: false, error: err.message, errors: err.errors ?? {} });
    }
  };
  const field = (k, label, props = {}) => (
    <label className="block text-sm text-slate-300">
      {label}
      {props.textarea ? <textarea value={form[k]} onChange={set(k)} rows={4} maxLength={1000} required={props.required} className={`${FIELD} mt-1`} /> : <input value={form[k]} onChange={set(k)} {...props} className={`${FIELD} mt-1`} />}
      {state.errors[k] && <span className="mt-1 block text-xs text-rose-300">{state.errors[k]}</span>}
    </label>
  );
  return (
    <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-2xl border border-sx-stroke bg-sx-panel p-4" data-testid="inquiry-form">
      <p className="font-semibold text-white">{cta.label}</p>
      {field('name', 'Your name', { required: true, maxLength: 60, autoComplete: 'name' })}
      {field('email', 'Email', { required: true, type: 'email', maxLength: 120, autoComplete: 'email' })}
      {field('phone', 'Phone (optional)', { type: 'tel', maxLength: 30, autoComplete: 'tel' })}
      {meeting && field('preferred', 'When suits you? (optional)', { maxLength: 120, placeholder: 'Weekday mornings, or Tue 3pm' })}
      {field('message', meeting ? 'What would you like to talk about? (optional)' : 'What would you like a quote for?', { textarea: true, required: !meeting })}
      {/* left empty by people; robots fill it in */}
      <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <p className="text-xs text-sx-muted">
        Your details go only to this business, so it can reply, and are wiped from VoxelVenture after {RETENTION.inquiryDays} days. <a href="/legal/privacy" target="_blank" rel="noopener" className="underline hover:text-white">Privacy</a>
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={state.busy} className={BUTTON}>Send</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-sx-stroke px-4 text-sm text-slate-300 hover:bg-sx-alt">Cancel</button>
      </div>
      {state.error && <p className="text-sm text-rose-300" role="alert">{state.error}</p>}
    </form>
  );
}
