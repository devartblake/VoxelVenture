"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { request } from '@/lib/data/api';
import { CTA_KINDS, categoryOf, districtOf, profileUrl } from '@/lib/business/profile';
import AuthDialog from '@/components/ui/AuthDialog';
import ProfileForm from './ProfileForm';
import NotLive from './NotLive';
import { signIn, useOwner } from './useOwner';

const SOURCE_LABEL = { direct: 'Direct', search: 'Search engines', social: 'Social sites', referral: 'Referral links', city: 'The 3D city', x: 'VoxelVenture on X' };
const POST_STATUS = { review: 'waiting for a quick check before it goes out', queued: 'about to be posted', posted: 'posted', failed: 'could not be posted', rejected: 'not posted', skipped: 'not posted' };
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

// "My profiles": every profile the owner has, with its verified figures (never simulated), what to do next, the share link that credits
// them, and the upgrades their own figures justify.
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
      {error && <p className="mb-4 text-rose-300" role="alert">{error}</p>}
      {!data && !error && <p className="text-sx-muted">Loading…</p>}
      {data && !data.profiles.length && (
        <p className="rounded-2xl border border-dashed border-sx-stroke p-6 text-center text-slate-300">You have no profiles yet. <Link href="/business/new" className="text-sx-cyan underline">List your business free</Link>.</p>
      )}
      <div className="space-y-6">
        {data?.profiles.map((row) => <ProfileRow key={row.profile.slug} row={row} code={data.referral.code} origin={origin} plots={mine} onChange={load} />)}
      </div>
      {data && <Referrals referral={data.referral} origin={origin} />}
      <p className="mt-8 text-xs text-sx-muted">All figures are the last 30 days and count verified visitors only: no bots, no visits of your own, and a daily limit per network.</p>
    </>
  );
}

function ProfileRow({ row, code, origin, plots, onChange }) {
  const { profile: p, stats, steps, prompts, welcomePost } = row;
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');
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
  const maxSource = Math.max(1, ...stats.sources.map((s) => s.views));

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
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Profile views', stats.views],
              ['Unique visitors', stats.uniques],
              [`“${p.cta.label}” presses`, stats.ctaClicks],
              ['Press rate', pct(stats.ctr)],
              ['Via your link', stats.referralVisits],
              ['Newsletter sign-ups', stats.newsletterSignups],
            ].map(([k, val]) => (
              <div key={k} className="rounded-xl bg-sx-alt p-3">
                <dt className="text-xs text-sx-muted">{k}</dt>
                <dd className="mt-1 text-2xl font-semibold text-white">{val}</dd>
              </div>
            ))}
          </dl>
          {welcomePost && (
            <p className="mt-3 text-sm text-slate-300">
              Welcome post on X: {POST_STATUS[welcomePost.status] ?? welcomePost.status}
              {welcomePost.url && <> · <a href={welcomePost.url} target="_blank" rel="noopener" className="text-sx-cyan underline">see the post</a></>}
            </p>
          )}
          {stats.views > 0 && (
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
                <thead><tr className="text-left text-xs text-sx-muted"><th className="font-normal">Campaign</th><th className="font-normal">Views</th><th className="font-normal">Presses</th></tr></thead>
                <tbody>
                  {stats.campaigns.map((c) => (
                    <tr key={c.id} className="border-t border-sx-stroke/60"><td className="py-1 text-slate-200">{c.id}</td><td className="text-slate-300">{c.views}</td><td className="text-slate-300">{c.ctaClicks}</td></tr>
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
                  {requested ? (
                    <p className="mt-2 text-sm text-emerald-300">Thanks: we will tell you as soon as it is available.</p>
                  ) : (
                    <button type="button" onClick={() => interest(plan.id)} className="mt-2 rounded-lg bg-sx-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-400">Tell me when it is ready</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {msg && <p className="mt-3 text-sm text-rose-300" role="alert">{msg}</p>}
        </>
      )}
    </section>
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
