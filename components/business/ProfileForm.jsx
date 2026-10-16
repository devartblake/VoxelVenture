"use client";

import { useState } from 'react';
import { BUSINESS_DISTRICTS, CATEGORIES, CTA_KINDS, LIMITS, cleanProfile } from '@/lib/business/profile';

const INPUT = 'w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-2 text-white placeholder:text-slate-500 focus:border-sx-cyan focus:outline-none';
const LABEL = 'mb-1 block text-sm font-medium text-slate-200';

// The fields of a free profile, checked with the same rules as the server (lib/business/profile.js) before sending.
// `onSubmit(values)` resolves, or throws an error with `errors` (the server's per-field messages).
export default function ProfileForm({ initial = {}, submitLabel, onSubmit, onCancel }) {
  const [v, setV] = useState({
    name: initial.name ?? '',
    category: initial.category ?? '',
    district: initial.district ?? '',
    tagline: initial.tagline ?? '',
    description: initial.description ?? '',
    website: initial.website ?? '',
    ctaKind: initial.cta?.kind ?? 'website',
    ctaUrl: initial.cta?.kind && initial.cta.kind !== 'website' ? initial.cta.url ?? '' : '',
    xHandle: initial.xHandle ?? '',
    announce: initial.announce ?? false,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const kind = CTA_KINDS.find((k) => k.id === v.ctaKind);

  const submit = async (e) => {
    e.preventDefault();
    const input = { name: v.name, category: v.category, district: v.district || null, tagline: v.tagline, description: v.description, website: v.website, cta: { kind: v.ctaKind, url: v.ctaKind === 'website' ? v.website : v.ctaUrl }, xHandle: v.xHandle, announce: v.announce && Boolean(v.xHandle.replace(/^@/, '').trim()) };
    const checked = cleanProfile(input);
    if (!checked.ok) return setErrors(checked.errors);
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setErrors(err.errors ?? { form: err.message });
    } finally {
      setBusy(false);
    }
  };
  const err = (k) => errors[k] && <p id={`${k}-error`} className="mt-1 text-sm text-rose-300">{errors[k]}</p>;
  const aria = (k) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-error` } : {});

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="pf-name" className={LABEL}>Business name</label>
        <input id="pf-name" className={INPUT} value={v.name} onChange={set('name')} maxLength={LIMITS.name} required autoComplete="organization" {...aria('name')} />
        {err('name')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-category" className={LABEL}>Category</label>
          <select id="pf-category" className={INPUT} value={v.category} onChange={set('category')} required {...aria('category')}>
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {err('category')}
        </div>
        <div>
          <label htmlFor="pf-district" className={LABEL}>District <span className="font-normal text-sx-muted">(optional)</span></label>
          <select id="pf-district" className={INPUT} value={v.district} onChange={set('district')} {...aria('district')}>
            <option value="">None yet</option>
            {BUSINESS_DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {err('district')}
        </div>
      </div>
      <div>
        <label htmlFor="pf-tagline" className={LABEL}>Tagline <span className="font-normal text-sx-muted">(one line)</span></label>
        <input id="pf-tagline" className={INPUT} value={v.tagline} onChange={set('tagline')} maxLength={LIMITS.tagline} placeholder="Coffee and pastries by the river" />
      </div>
      <div>
        <label htmlFor="pf-description" className={LABEL}>What you do</label>
        <textarea id="pf-description" className={`${INPUT} min-h-28`} value={v.description} onChange={set('description')} maxLength={LIMITS.description} {...aria('description')} />
        <p className="mt-1 text-xs text-sx-muted">{v.description.length}/{LIMITS.description} · two sentences or more help people (and search engines) find you</p>
        {err('description')}
      </div>
      <div>
        <label htmlFor="pf-website" className={LABEL}>Website <span className="font-normal text-sx-muted">(optional)</span></label>
        <input id="pf-website" type="url" className={INPUT} value={v.website} onChange={set('website')} placeholder="https://" autoComplete="url" {...aria('website')} />
        {err('website')}
      </div>
      <fieldset>
        <legend className={LABEL}>Your one call to action</legend>
        <p className="mb-2 text-xs text-sx-muted">The main button on your page. Every press is counted for you.</p>
        <div className="flex flex-wrap gap-2">
          {CTA_KINDS.map((k) => (
            <label key={k.id} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${v.ctaKind === k.id ? 'border-sx-cyan bg-cyan-500/10 text-white' : 'border-sx-stroke text-slate-300'}`}>
              <input type="radio" name="cta" value={k.id} checked={v.ctaKind === k.id} onChange={set('ctaKind')} className="sr-only" />
              {k.label}
            </label>
          ))}
        </div>
        {kind?.needsUrl && kind.id !== 'website' && (
          <div className="mt-3">
            <label htmlFor="pf-cta-url" className={LABEL}>Link for “{kind.label}”</label>
            <input id="pf-cta-url" type="url" className={INPUT} value={v.ctaUrl} onChange={set('ctaUrl')} placeholder={kind.id === 'booking' ? 'https://cal.com/you' : 'https://'} {...aria('cta')} />
          </div>
        )}
        {kind?.id === 'newsletter' && <p className="mt-2 text-xs text-sx-muted">Visitors leave their email; they confirm it before you see it.</p>}
        {err('cta')}
      </fieldset>
      <fieldset className="rounded-xl border border-sx-stroke p-3">
        <legend className="px-1 text-sm font-medium text-slate-200">On X <span className="font-normal text-sx-muted">(optional)</span></legend>
        <label htmlFor="pf-x" className={LABEL}>Your X handle</label>
        <div className="flex items-center gap-1">
          <span className="text-slate-400" aria-hidden="true">@</span>
          <input id="pf-x" className={INPUT} value={v.xHandle} onChange={(e) => setV((s) => ({ ...s, xHandle: e.target.value.replace(/^@+/, '') }))} maxLength={16} placeholder="yourbusiness" autoComplete="off" {...aria('xHandle')} />
        </div>
        {err('xHandle')}
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={v.announce} disabled={!v.xHandle.replace(/^@/, '').trim()} onChange={(e) => setV((s) => ({ ...s, announce: e.target.checked }))} className="mt-1" />
          <span>Welcome my business on VoxelVenture&apos;s X account and tag my handle. <span className="block text-xs text-sx-muted">One post with a link to your page; visits from it show up in your figures as “VoxelVenture on X”.</span></span>
        </label>
      </fieldset>
      {errors.form && <p className="text-sm text-rose-300" role="alert">{errors.form}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="rounded-xl bg-sx-purple px-5 py-3 font-semibold text-white hover:bg-violet-400 disabled:opacity-60">{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl border border-sx-stroke px-5 py-3 text-slate-200 hover:bg-sx-alt">Cancel</button>}
      </div>
    </form>
  );
}
