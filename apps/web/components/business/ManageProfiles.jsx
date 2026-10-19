"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiBase, getToken, request } from '@/lib/data/api';
import { PLACEMENTS, PRODUCTS, dollars } from '@voxelventure/business-core';
import { CTA_KINDS, categoryOf, districtOf, profileUrl } from '@voxelventure/business-core';
import { FUNNEL, OUTCOMES, RESULTS, CLICK_PARAM } from '@voxelventure/analytics';
import AuthDialog from '@/components/ui/AuthDialog';
import { useCart } from '@/lib/state/cartStore';
import ProfileForm from './ProfileForm';
import NotLive from './NotLive';
import { signIn, useOwner } from './useOwner';

const SOURCE_LABEL = { direct: 'Direct', search: 'Search engines', social: 'Social sites', referral: 'Referral links', city: 'The 3D city', x: 'VoxelVenture on X' };
const POST_STATUS = { review: 'waiting for a quick check before it goes out', queued: 'about to be posted', posted: 'posted', failed: 'could not be posted', rejected: 'not posted', skipped: 'not posted' };
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

// "My profiles": every profile the owner has, with its verified figures (never simulated), what to do next, the share link that credits
// them, its plan (Free, Pro, the Launch Pack, sponsored weeks) with checkout through Stripe, and the upgrades their own figures justify.
export default function ManageProfiles() {
  const { live, ready, account, logout } = useOwner();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [plots, setPlots] = useState([]);
  const load = useCallback(async () => {
    try {
      setData(await request('GET', '/me/businesses'));
      const state = await request('GET', '/plots/state');
      setPlots(state.plots.filter((p) => p.ownerAccount != null));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (account) load();
  }, [account, load]);

  if (!live) return <NotLive />;
  if (!ready) return <p className="text-sx-muted">Loading…</p>;
  if (!account)
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-3xl font-bold text-white">My profiles</h1>
        <p className="mt-2 text-slate-300">Sign in to see your business profiles and how they are doing.</p>
        <button type="button" onClick={() => signIn().catch(() => {})} className="mt-5 rounded-xl bg-sx-purple px-5 py-3 font-semibold text-white hover:bg-violet-400">Sign in</button>
        <p className="mt-4 text-sm text-sx-muted">New here? <Link href="/business/new" className="underline hover:text-white">List your business free</Link></p>
        <AuthDialog />
      </div>
    );

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const mine = plots.filter((p) => p.ownerAccount === account.id);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-3xl font-bold text-white">My profiles</h1>
          <p className="mt-1 text-sm text-sx-muted">Signed in as {account.username} · <button type="button" onClick={logout} className="underline hover:text-white">sign out</button></p>
        </div>
        <Link href="/business/new" className="rounded-xl bg-sx-purple px-4 py-2 font-semibold text-white hover:bg-violet-400">Add a business</Link>
      </div>
      <PaymentReturn onPaid={load} />
      {error && <p className="mb-4 text-rose-300" role="alert">{error}</p>}
      {!data && !error && <p className="text-sx-muted">Loading…</p>}
      {data && !data.profiles.length && (
        <p className="rounded-2xl border border-dashed border-sx-stroke p-6 text-center text-slate-300">You have no profiles yet. <Link href="/business/new" className="text-sx-cyan underline">List your business free</Link>.</p>
      )}
      <div className="space-y-6">
        {data?.profiles.map((row) => <ProfileRow key={row.profile.slug} row={row} code={data.referral.code} origin={origin} plots={mine} onChange={load} checkoutOn={data.checkout} />)}
      </div>
      {data && <Referrals referral={data.referral} origin={origin} />}
      {data?.checkout && <Orders />}
      <p className="mt-8 text-xs text-sx-muted">All figures are the last 30 days and count verified visitors only: no bots, no visits of your own, and a daily limit per network.</p>
    </>
  );
}

function ProfileRow({ row, code, origin, plots, onChange, checkoutOn }) {
  const { profile: p, stats, steps, prompts, welcomePost, plan, launchSummary } = row;
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');
  const [added, setAdded] = useState('');
  const link = profileUrl(origin, p.slug, code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is shown to copy by hand */
    }
  };
  const save = async (input) => {
    await request('PATCH', `/businesses/${p.slug}`, input);
    setEditing(false);
    onChange();
  };
  const link3d = async (plotId) => {
    try {
      await request('PUT', `/businesses/${p.slug}/plot`, { plotId: plotId === '' ? null : Number(plotId) });
      onChange();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const interest = async (plan) => {
    try {
      await request('POST', `/businesses/${p.slug}/interest`, { plan });
      onChange();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const done = steps.filter((s) => s.done && !s.optional).length;
  const required = steps.filter((s) => !s.optional).length;
  const maxSource = Math.max(1, ...(stats.sources ?? []).map((s) => s.views));
  const buy = async (product, placement) => {
    setMsg('');
    try {
      const r = await request('POST', `/businesses/${p.slug}/checkout`, { product, placement });
      window.location.assign(r.url); // Stripe's own checkout page; it sends the owner back here
    } catch (e) {
      setMsg(e.message);
    }
  };
  // or into the cart, to pay for it with other things in one payment (services/api/cart.mjs)
  const toCart = async (product, placement) => {
    setMsg('');
    setAdded('');
    try {
      const line = await useCart.getState().add({ kind: product, business: p.slug, ...(placement ? { placement } : {}) });
      setAdded(line?.label ?? 'it');
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <section className="rounded-2xl border border-sx-stroke bg-sx-panel p-5" aria-labelledby={`h-${p.slug}`}>
      <header className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 id={`h-${p.slug}`} className="text-xl font-semibold text-white"><Link href={`/business/${p.slug}`} className="hover:underline">{p.name}</Link></h2>
          <p className="text-sm text-sx-muted">{[categoryOf(p.category)?.label, districtOf(p.district)?.name, CTA_KINDS.find((k) => k.id === p.cta.kind)?.label].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={() => setEditing((e) => !e)} className="rounded-lg border border-sx-stroke px-3 py-1.5 text-sm text-slate-200 hover:bg-sx-alt">{editing ? 'Close' : 'Edit'}</button>
      </header>

      {editing ? (
        <div className="mt-4"><ProfileForm initial={p} submitLabel="Save changes" onSubmit={save} onCancel={() => setEditing(false)} /></div>
      ) : (
        <>
          {row.pilot && <PilotFeedback slug={p.slug} pilot={row.pilot} onChange={onChange} />}
          <Funnel stats={stats} ctaLabel={p.cta.label} />
          <Results stats={stats} />
          {welcomePost && (
            <p className="mt-3 text-sm text-slate-300">
              Welcome post on X: {POST_STATUS[welcomePost.status] ?? welcomePost.status}
              {welcomePost.url && <> · <a href={welcomePost.url} target="_blank" rel="noopener" className="text-sx-cyan underline">see the post</a></>}
            </p>
          )}
          <PlanBox slug={p.slug} profile={p} plan={plan} checkoutOn={checkoutOn} buy={buy} toCart={toCart} onChange={onChange} sponsorOpen={sponsorOpen} setSponsorOpen={setSponsorOpen} setMsg={setMsg} />
          {launchSummary && <LaunchSummary s={launchSummary} />}
          {['meeting', 'quote'].includes(p.cta.kind) && <Inquiries slug={p.slug} />}
          {CTA_KINDS.find((k) => k.id === p.cta.kind)?.needsUrl && <PurchaseTracking slug={p.slug} />}
          {!plan.pro && (
            <p className="mt-4 rounded-xl border border-dashed border-sx-stroke p-3 text-sm text-slate-300">
              <span className="font-semibold text-white">Pro</span> adds where your visitors came from, campaign results, the 30-day chart and CSV export.
            </p>
          )}
          {plan.pro && stats.views > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-200">Where visitors came from</h3>
              <ul className="space-y-1">
                {stats.sources.filter((s) => s.views > 0).map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 text-slate-300">{SOURCE_LABEL[s.id] ?? s.id}</span>
                    <span className="h-2 rounded bg-sx-cyan" style={{ width: `${(s.views / maxSource) * 60}%` }} aria-hidden="true" />
                    <span className="text-slate-400">{s.views}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stats.campaigns?.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-200">Campaigns</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-sx-muted"><th className="font-normal">Campaign</th><th className="font-normal">Views</th><th className="font-normal">Presses</th><th className="font-normal">Leads</th><th className="font-normal">Purchases</th></tr></thead>
                <tbody>
                  {stats.campaigns.map((c) => (
                    <tr key={c.id} className="border-t border-sx-stroke/60"><td className="py-1 text-slate-200">{c.id}</td><td className="text-slate-300">{c.views}</td><td className="text-slate-300">{c.ctaClicks}</td><td className="text-slate-300">{c.leads ?? 0}</td><td className="text-slate-300">{c.purchases ?? 0}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-200">Getting started · {done} of {required}</h3>
              <ol className="space-y-2">
                {steps.map((s) => (
                  <li key={s.id} className="flex gap-2 text-sm">
                    <span aria-hidden="true" className={s.done ? 'text-emerald-400' : 'text-slate-500'}>{s.done ? '✓' : '○'}</span>
                    <span>
                      <span className={s.done ? 'text-slate-400 line-through' : 'text-slate-100'}>{s.label}</span>
                      <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                      {!s.done && <span className="block text-xs text-sx-muted">{s.hint}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-200">Your share link</h3>
                <p className="mb-2 text-xs text-sx-muted">Visits, presses and sign-ups through this link are credited to you. To compare campaigns, add <code className="text-slate-300">&amp;utm_campaign=spring-sale</code> (any name) to the link you post in each place.</p>
                <div className="flex gap-2">
                  <input readOnly value={link} aria-label="Your share link" className="min-w-0 flex-1 rounded-lg border border-sx-stroke bg-sx-alt px-3 py-2 text-xs text-slate-200" onFocus={(e) => e.target.select()} />
                  <button type="button" onClick={copy} className="rounded-lg bg-sx-cyan px-3 py-2 text-sm font-semibold text-slate-950">{copied ? 'Copied' : 'Copy'}</button>
                </div>
              </div>
              <div>
                <label htmlFor={`plot-${p.slug}`} className="mb-2 block text-sm font-semibold text-slate-200">3D storefront <span className="font-normal text-sx-muted">(optional)</span></label>
                {plots.length ? (
                  <select id={`plot-${p.slug}`} value={p.plotId ?? ''} onChange={(e) => link3d(e.target.value)} className="w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-2 text-sm text-white">
                    <option value="">Not linked</option>
                    {plots.map((pl) => <option key={pl.id} value={pl.id}>{pl.title} (plot #{pl.id})</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-sx-muted">You have no building in the city. A profile works without one; <Link href="/" className="underline">explore the city</Link> if you want one.</p>
                )}
              </div>
            </div>
          </div>

          {prompts.length > 0 && (
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">Based on your results</h3>
              {prompts.map(({ plan, reason, requested }) => (
                <div key={plan.id} className="rounded-xl border border-sx-purple/40 bg-violet-500/10 p-4">
                  <p className="font-semibold text-white">{plan.name} <span className="font-normal text-slate-300">· {plan.price}</span></p>
                  <p className="mt-1 text-sm text-slate-200">{reason}</p>
                  <p className="mt-1 text-xs text-sx-muted">{plan.pitch}</p>
                  {checkoutOn ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => (plan.id === 'sponsored' ? setSponsorOpen(true) : buy(plan.id))} className="min-h-11 rounded-lg bg-sx-purple px-3 text-sm font-semibold text-white hover:bg-violet-400">
                        {plan.id === 'sponsored' ? 'Choose a placement' : `Buy · ${plan.price}`}
                      </button>
                      {plan.id !== 'sponsored' && <button type="button" onClick={() => toCart(plan.id)} className={`${QUIET} min-h-11`}>Add to cart</button>}
                    </div>
                  ) : requested ? (
                    <p className="mt-2 text-sm text-emerald-300">Thanks: we will tell you as soon as it is available.</p>
                  ) : (
                    <button type="button" onClick={() => interest(plan.id)} className="mt-2 rounded-lg bg-sx-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-400">Tell me when it is ready</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {msg && <p className="mt-3 text-sm text-rose-300" role="alert">{msg}</p>}
          {added && <p className="mt-3 text-sm text-emerald-300" role="status">Added to your cart: {added}. <Link href="/cart" className="underline">Open the cart</Link></p>}
        </>
      )}
    </section>
  );
}

// The pilot's weekly check-in (services/api/pilot.mjs, docs/monetization/pilot.md): only for a business in the pilot. Four short questions,
// once a week; sending again the same week replaces the answers.
const WOULD_PAY = [['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']];
function PilotFeedback({ slug, pilot, onChange }) {
  const sent = pilot.feedback;
  const [open, setOpen] = useState(!sent);
  const [rating, setRating] = useState(sent?.rating ?? 0);
  const [wouldPay, setWouldPay] = useState(sent?.wouldPay ?? '');
  const [result, setResult] = useState(sent?.result ?? '');
  const [missing, setMissing] = useState(sent?.missing ?? '');
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await request('POST', `/businesses/${slug}/pilot-feedback`, { rating, wouldPay, result, missing });
      setErrors({});
      setOpen(false);
      onChange();
    } catch (err) {
      setErrors(err.errors ?? {});
      setMsg(err.message);
    }
  };
  const week = new Date(`${pilot.week}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' });
  return (
    <div className="mt-4 rounded-xl border border-sx-cyan/40 bg-cyan-500/10 p-4" data-testid="pilot-checkin">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-white">Pilot check-in · week of {week}</h3>
        {sent && !open && <button type="button" onClick={() => setOpen(true)} className="min-h-9 rounded-lg border border-sx-stroke px-3 text-sm text-slate-200 hover:bg-sx-alt">Change answers</button>}
      </div>
      {sent && !open ? (
        <p className="mt-1 text-sm text-emerald-300">Thank you: this week&apos;s answers are in ({sent.rating} of 5). They help decide what we build next.</p>
      ) : (
        <form onSubmit={submit} className="mt-2 space-y-3 text-sm">
          <p className="text-slate-300">You are in the VoxelVenture pilot. Four quick questions, once a week:</p>
          <fieldset>
            <legend className="mb-1 text-slate-200">How useful was VoxelVenture to your business this week?</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 ${rating === n ? 'border-sx-cyan bg-sx-cyan text-slate-950' : 'border-sx-stroke text-slate-200 hover:bg-sx-alt'}`}>
                  <input type="radio" name={`rating-${slug}`} value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
                  {n}
                </label>
              ))}
              <span className="self-center text-xs text-sx-muted">1 not at all · 5 very</span>
            </div>
            {errors.rating && <p className="mt-1 text-rose-300">{errors.rating}</p>}
          </fieldset>
          <label className="block">
            <span className="text-slate-200">What did it bring you? <span className="text-sx-muted">(a customer, a booking, a question; optional)</span></span>
            <textarea value={result} onChange={(e) => setResult(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-2 text-white" />
          </label>
          <label className="block">
            <span className="text-slate-200">What would make it more useful? <span className="text-sx-muted">(optional)</span></span>
            <textarea value={missing} onChange={(e) => setMissing(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-2 text-white" />
          </label>
          <fieldset>
            <legend className="mb-1 text-slate-200">As it is today, would you pay for it?</legend>
            <div className="flex gap-2">
              {WOULD_PAY.map(([id, label]) => (
                <label key={id} className={`flex min-h-11 cursor-pointer items-center rounded-lg border px-4 ${wouldPay === id ? 'border-sx-cyan bg-sx-cyan text-slate-950' : 'border-sx-stroke text-slate-200 hover:bg-sx-alt'}`}>
                  <input type="radio" name={`pay-${slug}`} value={id} checked={wouldPay === id} onChange={() => setWouldPay(id)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
            {errors.wouldPay && <p className="mt-1 text-rose-300">{errors.wouldPay}</p>}
          </fieldset>
          <div className="flex items-center gap-3">
            <button className="min-h-11 rounded-lg bg-sx-cyan px-4 font-semibold text-slate-950">Send this week&apos;s answers</button>
            {sent && <button type="button" onClick={() => setOpen(false)} className="text-slate-300 hover:text-white">Cancel</button>}
          </div>
          {msg && <p className="text-rose-300" role="alert">{msg}</p>}
        </form>
      )}
    </div>
  );
}

function Referrals({ referral, origin }) {
  return (
    <section className="mt-6 rounded-2xl border border-sx-stroke bg-sx-panel p-5" aria-labelledby="ref-h">
      <h2 id="ref-h" className="text-lg font-semibold text-white">Your referral link</h2>
      <p className="mt-1 text-sm text-sx-muted">Add <code className="text-slate-200">?ref={referral.code}</code> to any VoxelVenture address, e.g. <span className="break-all text-slate-300">{origin}/discover?ref={referral.code}</span></p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Visits', referral.visits], ['Presses', referral.ctaClicks], ['Sign-ups', referral.signups], ['New profiles', referral.profiles]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-sx-alt p-3"><dt className="text-xs text-sx-muted">{k}</dt><dd className="text-xl font-semibold text-white">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

// The profile's plan and what can be bought for it (checkout happens on Stripe's page).
function PlanBox({ slug, profile, plan, checkoutOn, buy, toCart, onChange, sponsorOpen, setSponsorOpen, setMsg }) {
  const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const lines = [
    plan.pro ? `Pro until ${day(plan.proUntil)}` : 'Free plan',
    plan.launch && `Launch week until ${day(plan.launchUntil)}`,
    ...plan.sponsored.map((s) => `Sponsored (${placementName(s.placement)}) until ${day(s.until)}`),
  ].filter(Boolean);
  const cancel = async () => {
    if (!window.confirm('Stop Pro? It keeps running until the end of the month you have paid for, then the profile goes back to the free plan.')) return;
    try {
      await request('POST', `/businesses/${slug}/pro/cancel`);
      onChange();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const download = async () => {
    const res = await fetch(`${apiBase()}/businesses/${slug}/export.csv`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return setMsg('The figures could not be downloaded.');
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: `${slug}-figures.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="mt-4 rounded-xl border border-sx-stroke bg-sx-alt/50 p-4" data-testid="plan-box">
      <p className="text-sm text-slate-200"><span className="font-semibold text-white">Plan:</span> {lines.join(' · ')}</p>
      {checkoutOn ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!plan.launch && (
            <>
              <button type="button" onClick={() => buy('launch')} className={BUY}>Launch Pack · {dollars(PRODUCTS.launch.cents)}</button>
              <button type="button" onClick={() => toCart('launch')} className={QUIET} aria-label="Add the Launch Pack to the cart">Add to cart</button>
            </>
          )}
          {plan.pro ? (
            <>
              <button type="button" onClick={download} className={QUIET}>Download figures (CSV)</button>
              <button type="button" onClick={cancel} className={QUIET}>Stop Pro</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => buy('pro')} className={BUY}>Go Pro · {dollars(PRODUCTS.pro.cents)} a month</button>
              <button type="button" onClick={() => toCart('pro')} className={QUIET} aria-label="Add Pro to the cart">Add Pro to cart</button>
            </>
          )}
          <button type="button" onClick={() => setSponsorOpen((o) => !o)} aria-expanded={sponsorOpen} className={QUIET}>Sponsor a week…</button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-sx-muted">Paid plans are not open yet.</p>
      )}
      {checkoutOn && sponsorOpen && <SponsorPicker profile={profile} buy={buy} toCart={toCart} />}
      {plan.pro && <OfferEditor slug={slug} offer={profile.offer} onChange={onChange} setMsg={setMsg} />}
    </div>
  );
}

// Pro: a one-line offer at the top of the public page, optionally until a date.
function OfferEditor({ slug, offer, onChange, setMsg }) {
  const [text, setText] = useState(offer?.text ?? '');
  const [until, setUntil] = useState(offer?.until ? new Date(offer.until).toISOString().slice(0, 10) : '');
  const save = async (clear = false) => {
    try {
      await request('PUT', `/businesses/${slug}/offer`, clear ? { text: '' } : { text, until: until ? `${until}T23:59:59` : null });
      if (clear) (setText(''), setUntil(''));
      setMsg(clear ? 'The offer is off your page.' : 'The offer is on your page.');
      onChange();
    } catch (e) {
      setMsg(e.message);
    }
  };
  return (
    <form className="mt-4 border-t border-sx-stroke pt-3" onSubmit={(e) => (e.preventDefault(), save())} data-testid="offer-editor">
      <label htmlFor={`offer-${slug}`} className="text-sm font-semibold text-white">Offer on your page</label>
      <p className="text-xs text-sx-muted">One line at the top of your public page, like &quot;10% off your first order with VOXEL&quot;.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input id={`offer-${slug}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={100} className="min-w-0 flex-1 rounded-lg border border-sx-stroke bg-sx-panel px-3 py-1.5 text-sm text-white" />
        <label className="text-xs text-slate-300">Until <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="rounded-lg border border-sx-stroke bg-sx-panel px-2 py-1 text-sm text-white" /></label>
        <button type="submit" disabled={!text.trim()} className={BUY}>Save offer</button>
        {offer && <button type="button" onClick={() => save(true)} className={QUIET}>Remove</button>}
      </div>
    </form>
  );
}
const BUY = 'min-h-11 rounded-lg bg-sx-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-400';
const QUIET = 'min-h-11 rounded-lg border border-sx-stroke px-3 py-1.5 text-sm text-slate-200 hover:bg-sx-alt';
const placementName = (key) => {
  const [kind, target] = String(key).split(':');
  if (kind === 'discover') return PLACEMENTS.discover.label;
  return kind === 'category' ? categoryOf(target)?.label ?? target : districtOf(target)?.name ?? target;
};

// Where a sponsored week can go for this profile (Discover, its category, its district), with the price and the free slots right now.
function SponsorPicker({ profile, buy, toCart }) {
  const keys = ['discover', `category:${profile.category}`, ...(profile.district ? [`district:${profile.district}`] : [])];
  const [spots, setSpots] = useState(null);
  useEffect(() => {
    Promise.all(keys.map((k) => request('GET', `/billing/availability?placement=${encodeURIComponent(k)}`))).then(setSpots, () => setSpots([]));
  }, [profile.category, profile.district]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!spots) return <p className="mt-3 text-sm text-sx-muted">Checking free spots…</p>;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-sx-muted">A week, clearly labelled “Sponsored”. A few spots per page, so it stays worth having.</p>
      {spots.map((s) => (
        <div key={s.placement} className="flex flex-wrap items-center gap-3 rounded-lg border border-sx-stroke p-3 text-sm">
          <span className="mr-auto text-slate-100">{placementName(s.placement)} <span className="text-sx-muted">· {s.free} of {s.slots} free</span></span>
          <button type="button" disabled={!s.free} onClick={() => buy('sponsored', s.placement)} className={`${BUY} disabled:opacity-40`}>{s.free ? `${dollars(s.cents)} for a week` : 'Full this week'}</button>
          {s.free > 0 && <button type="button" onClick={() => toCart('sponsored', s.placement)} className={QUIET} aria-label={`Add a sponsored week on ${placementName(s.placement)} to the cart`}>Add to cart</button>}
        </div>
      ))}
    </div>
  );
}

// What the launch week brought, against the week before it.
function LaunchSummary({ s }) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-50" data-testid="launch-summary">
      <p className="font-semibold">{s.running ? 'Your launch week so far' : 'Your launch week'}</p>
      <p className="mt-1">{s.views} verified views and {s.ctaClicks} presses of your button, against {s.viewsWeekBefore} views and {s.ctaWeekBefore} presses the week before.</p>
    </div>
  );
}

// Back from Stripe: ?paid=<order> waits (briefly) for the webhook to confirm it; ?canceled=<order> says nothing was charged.
function PaymentReturn({ onPaid }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paid = q.get('paid');
    if (q.get('canceled')) return setState({ tone: 'info', text: 'Checkout cancelled: nothing was charged.' });
    if (!/^\d+$/.test(paid ?? '')) return undefined;
    let tries = 0;
    let stop = false;
    setState({ tone: 'info', text: 'Payment received by Stripe: confirming it…' });
    const look = async () => {
      if (stop) return;
      try {
        const o = await request('GET', `/me/orders/${paid}`);
        if (o.status === 'paid') {
          setState({ tone: 'ok', text: `Thank you: your ${PRODUCTS[o.product]?.name ?? 'purchase'} is active. Stripe emails your receipt.` });
          return onPaid();
        }
      } catch {
        /* try again */
      }
      if (++tries < 15) setTimeout(look, 2000);
      else setState({ tone: 'info', text: 'Stripe has your payment; it can take a few minutes to show here. Nothing more to do.' });
    };
    look();
    return () => {
      stop = true;
    };
  }, [onPaid]);
  if (!state) return null;
  return <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${state.tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-sx-stroke bg-sx-alt text-slate-200'}`}>{state.text}</p>;
}

// The account's orders: what was bought, when, and its state.
function Orders() {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    request('GET', '/me/orders').then((r) => setOrders(r.orders), () => setOrders([]));
  }, []);
  if (!orders?.length) return null;
  return (
    <section className="mt-6 rounded-2xl border border-sx-stroke bg-sx-panel p-5" aria-labelledby="orders-h">
      <h2 id="orders-h" className="text-lg font-semibold text-white">Orders</h2>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="text-left text-xs text-sx-muted"><th className="font-normal">Date</th><th className="font-normal">Business</th><th className="font-normal">What</th><th className="font-normal">Amount</th><th className="font-normal">State</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-sx-stroke/60">
              <td className="py-1.5 text-slate-300">{new Date(o.createdAt).toLocaleDateString()}</td>
              <td className="text-slate-200">{o.business?.name ?? 'In the game'}</td>
              <td className="text-slate-200">{o.label ?? <>{PRODUCTS[o.product]?.name}{o.placement ? ` (${placementName(o.placement)})` : ''}</>}</td>
              <td className="text-slate-200">{o.cents ? dollars(o.cents) : 'free'}</td>
              <td className="text-slate-300">{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-sx-muted">Stripe emails a receipt for every payment.</p>
    </section>
  );
}

// The journey from being seen to a result, verified, for 30 days (@voxelventure/analytics), each step with its share of the step it
// follows from (visits, for everything after a visit).
function Funnel({ stats, ctaLabel }) {
  const steps = FUNNEL.map((f) => ({ ...f, hint: f.id === 'ctaClicks' ? `Presses of “${ctaLabel}”.` : f.hint, value: stats[f.id] ?? 0 }));
  const top = Math.max(1, ...steps.map((x) => x.value));
  return (
    <div className="mt-4" data-testid="funnel">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Last 30 days, verified</h3>
      <ol className="space-y-1.5">
        {steps.map((x) => {
          const before = x.of ? stats[x.of] ?? 0 : null;
          return (
            <li key={x.id} className="grid grid-cols-[8.5rem_1fr_9.5rem] items-center gap-2 text-sm" title={x.hint}>
              <span className="text-slate-300">{x.label}</span>
              <span className="h-2.5 rounded bg-gradient-to-r from-sx-purple to-sx-cyan" style={{ width: `${Math.max(2, (x.value / top) * 100)}%` }} aria-hidden="true" />
              <span className="text-right text-slate-100">
                {x.value.toLocaleString()}
                {before ? <span className="ml-1 text-xs text-sx-muted">({pct(x.value / before)} of {x.of === 'views' ? 'visits' : 'seen'})</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-xs text-sx-muted">{stats.uniques} unique visitors · {stats.referralVisits} via your link · store entries count people who walked into your 3D storefront</p>
    </div>
  );
}

// What came of it, by outcome family (@voxelventure/analytics): leads, coupon claims, coupons redeemed and purchases, each with its own
// cost, never added together (one customer can be in several). Then revenue by how far it can be trusted, and the return on what was spent.
function Results({ stats }) {
  const cents = (c) => (c == null ? '–' : `$${(c / 100).toFixed(2)}`);
  const byId = Object.fromEntries((stats.outcomes ?? []).map((o) => [o.id, o]));
  const leadsDetail = RESULTS.filter((r) => ['newsletterSignups', 'meetingRequests', 'quoteRequests'].includes(r.id) && stats[r.id]).map((r) => `${stats[r.id]} ${r.label.toLowerCase()}`).join(', ');
  const rev = stats.revenue ?? { verifiedCents: 0, unattributedCents: 0, browserCents: 0 };
  return (
    <div className="mt-4" data-testid="results">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {OUTCOMES.map((o) => (
          <div key={o.id} className="rounded-xl bg-sx-alt p-3" title={o.hint}>
            <dt className="text-xs text-sx-muted">{o.label}</dt>
            <dd className="mt-1 text-xl font-semibold text-white">{(byId[o.id]?.count ?? 0).toLocaleString()}</dd>
            <dd className="mt-0.5 text-xs text-slate-400">{o.cost}: {cents(byId[o.id]?.costCents)}</dd>
            {o.id === 'leads' && leadsDetail && <dd className="mt-0.5 text-xs text-sx-muted">{leadsDetail}</dd>}
          </div>
        ))}
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="revenue">
        <div className="rounded-xl bg-sx-alt p-3" title="Reported by your server with your conversion key, and credited to a press of your button.">
          <dt className="text-xs text-sx-muted">Verified revenue</dt>
          <dd className="mt-1 text-xl font-semibold text-white">{cents(rev.verifiedCents)}</dd>
        </div>
        <div className="rounded-xl bg-sx-alt p-3" title="Reported by your server, but no press of your button was found for it.">
          <dt className="text-xs text-sx-muted">Unattributed revenue</dt>
          <dd className="mt-1 text-xl font-semibold text-slate-300">{cents(rev.unattributedCents)}</dd>
        </div>
        <div className="rounded-xl bg-sx-alt p-3" title="From the pixel on your thank-you page. It cannot be verified, so it is shown apart; the same order from your server replaces it.">
          <dt className="text-xs text-sx-muted">Browser-reported revenue</dt>
          <dd className="mt-1 text-xl font-semibold text-slate-300">{cents(rev.browserCents)}</dd>
        </div>
        <div className="rounded-xl bg-sx-alt p-3" title="Verified revenue for each dollar spent here.">
          <dt className="text-xs text-sx-muted">Spent here · return</dt>
          <dd className="mt-1 text-xl font-semibold text-white">{cents(stats.spendCents)}</dd>
          <dd className="mt-0.5 text-xs text-slate-400">{stats.returnOnSpend == null ? 'No spend yet' : `${stats.returnOnSpend.toFixed(2)}× back (verified)`}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-sx-muted">Each kind of outcome is counted and costed on its own: one customer can sign up, claim a coupon and buy, so they are never added into one total.</p>
    </div>
  );
}

// Meeting and quote requests sent from the profile: who, what, and whether the owner has answered.
function Inquiries({ slug }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => request('GET', `/businesses/${slug}/inquiries`).then((r) => setList(r.inquiries), () => setList([])), [slug]);
  useEffect(() => {
    load();
  }, [load]);
  const mark = (id, status) => request('PATCH', `/businesses/${slug}/inquiries/${id}`, { status }).then(load, () => {});
  if (!list) return null;
  return (
    <div className="mt-4" data-testid="inquiries">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Requests · {list.filter((q) => q.status === 'new').length} to answer</h3>
      {!list.length && <p className="text-sm text-sx-muted">No requests yet. Each one is also emailed to you.</p>}
      <ul className="space-y-2">
        {list.slice(0, 20).map((q) => (
          <li key={q.id} className={`rounded-xl border p-3 text-sm ${q.status === 'new' ? 'border-sx-cyan/40' : 'border-sx-stroke opacity-70'}`}>
            <p className="text-slate-100">
              <span className="font-semibold">{q.name}</span> · <a href={`mailto:${q.email}`} className="text-sx-cyan underline">{q.email}</a>{q.phone ? ` · ${q.phone}` : ''}
              <span className="ml-2 text-xs text-sx-muted">{q.kind === 'meeting' ? 'Meeting' : 'Quote'} · {new Date(q.at).toLocaleDateString()}{q.verified ? '' : ' · not verified'}</span>
            </p>
            {q.preferred && <p className="text-slate-300">When: {q.preferred}</p>}
            {q.message && <p className="whitespace-pre-line text-slate-300">{q.message}</p>}
            <div className="mt-1 flex gap-2 text-xs">
              {q.status !== 'handled' && <button type="button" onClick={() => mark(q.id, 'handled')} className="text-emerald-300 hover:underline">Mark answered</button>}
              {q.status !== 'new' && <button type="button" onClick={() => mark(q.id, 'new')} className="text-slate-300 hover:underline">Mark to answer</button>}
              {q.status !== 'spam' && <button type="button" onClick={() => mark(q.id, 'spam')} className="text-rose-300 hover:underline">Spam</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Counting purchases on the owner's own site: the button's link carries a click id; their site reports the sale with it. Verified purchases
// come only from the owner's server, with a conversion key of this business's own in the Authorization header. The key is shown once when
// it is made (only its hash is kept), and making a new one stops the old. The pixel needs no key and is counted apart, as browser-reported.
function PurchaseTracking({ slug }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(null);
  const [fresh, setFresh] = useState(null); // the key just made: shown this once
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open && !t) request('GET', `/businesses/${slug}/tracking`).then(setT, () => {});
  }, [open, t, slug]);
  const makeKey = async () => {
    setError('');
    try {
      const out = await request('POST', `/businesses/${slug}/tracking/key`);
      setFresh(out.key);
      setConfirm(false);
      setT((x) => ({ ...x, hasKey: true, keyCreatedAt: out.createdAt }));
    } catch (e) {
      setError(e?.message ?? 'That did not work.');
    }
  };
  const keyShown = fresh ?? '<your conversion key>';
  return (
    <details className="mt-4 rounded-xl border border-sx-stroke p-3 text-sm" onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="purchase-tracking">
      <summary className="cursor-pointer font-semibold text-slate-200">Count purchases on your own site</summary>
      <p className="mt-2 text-slate-300">
        Your button&apos;s link carries <code className="text-sx-cyan">{CLICK_PARAM}</code>. Keep it with the order, and when the order is paid, report it from your server.
        A purchase is verified when it comes with a press of your button in the 30 days before.
      </p>
      {t ? (
        <div className="mt-3 space-y-3 text-xs">
          <div className="rounded-lg border border-sx-stroke p-2.5">
            <p className="font-semibold text-slate-200">Your conversion key</p>
            {fresh ? (
              <>
                <p className="mt-1 text-amber-200">Copy it now: it is shown only this once. Keep it on your server, never in a web page or a link.</p>
                <code className="mt-1 block break-all rounded bg-sx-alt p-2 text-slate-100" data-testid="new-key">{fresh}</code>
              </>
            ) : (
              <p className="mt-1 text-slate-400">{t.hasKey ? `Made ${new Date(t.keyCreatedAt).toLocaleDateString()}. For safety it is not shown again.` : 'You do not have one yet.'}</p>
            )}
            {t.hasKey && !fresh && !confirm ? (
              <button type="button" onClick={() => setConfirm(true)} className="mt-2 rounded-lg border border-sx-stroke px-3 py-1.5 text-slate-200 hover:border-sx-cyan">Make a new key…</button>
            ) : t.hasKey && confirm ? (
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-amber-200">The old key will stop working at once.</span>
                <button type="button" onClick={makeKey} className="rounded-lg bg-sx-purple px-3 py-1.5 font-semibold text-white">Make a new key</button>
                <button type="button" onClick={() => setConfirm(false)} className="text-slate-400 underline">Cancel</button>
              </span>
            ) : !t.hasKey ? (
              <button type="button" onClick={makeKey} className="mt-2 rounded-lg bg-sx-purple px-3 py-1.5 font-semibold text-white">Make my conversion key</button>
            ) : null}
            {error && <p className="mt-1 text-red-300" role="alert">{error}</p>}
          </div>
          <p className="text-slate-400">From your server (verified):</p>
          <pre className="overflow-x-auto rounded bg-sx-alt p-2 text-slate-200">{`curl -X POST ${t.postback} \\
  -H 'Authorization: Bearer ${keyShown}' -H 'Content-Type: application/json' \\
  -d '{"business":"${slug}","click":"<vv_click>","value":<cents>,"order":"<order number>"}'`}</pre>
          <p className="text-slate-400">Or a pixel on your thank-you page (no key; shown apart as browser-reported, because a browser&apos;s report cannot be verified; the same order from your server replaces it):</p>
          <pre className="overflow-x-auto rounded bg-sx-alt p-2 text-slate-200">{`<img src="${t.pixel}" width="1" height="1" alt="">`}</pre>
        </div>
      ) : open ? <p className="mt-2 text-xs text-sx-muted">Loading…</p> : null}
    </details>
  );
}
