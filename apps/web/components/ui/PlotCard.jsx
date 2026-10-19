"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Eye, FileText, Footprints, Globe, Home, Image as ImageIcon, MessageCircle, Repeat, Star } from 'lucide-react';
import { usePanel } from '@/lib/state/panelStore';
import { shareImage } from '@/lib/game/shareImage';
import ShareBox from './ShareBox';
import ExteriorBuilder from './ExteriorBuilder';
import { applyExterior, cleanExterior, defaultExterior } from '@/lib/game/exterior';
import { useDraft } from '@/lib/state/draftStore';
import { claimPrice, exteriorChangeQuote, landPriceOf, leaseQuote, renewalQuote, takeoverQuote } from '@/lib/game/claimPrice';
import { explainPrice } from '@/lib/game/landPrice';
import { holdState } from '@/lib/game/claimHold';
import { useClaimHold } from '@/lib/state/claimHoldStore';
import { BUILDING_TYPES, SUBURB_ID, TAKEOVER_MULTIPLIER, floorsForHeight } from '@/lib/city/cityGenerator';
import { useCityStore } from '@/lib/state/store';
import { plotOfTheDay, POTD_VISIT_GOLD } from '@/lib/game/daily';
import { LOGO_COLORS, LOGO_ICONS, cleanLogo, generatedSpec, isValidLogo, kindOf, logoOf } from '@/lib/game/logos';
import { fileToLogoImage } from './imageLogo';
import { avatarState } from '@/lib/sim/avatarState';
import { useWorld } from '@/lib/state/worldStore';
import { interiorSummaryFor } from '@/lib/content/interiorScenes';
import { addressOf, describeBusiness, rankByValue } from '@/lib/game/plotInfo';
import { liveDataProvider } from '@/lib/data/liveData';
import { slugify } from '@voxelventure/business-core';
import { figuresState, useLiveStats, wantFigures } from '@/lib/data/liveStats';
import { apiOn } from '@/lib/data/api';
import { claimRemote, openSiteLink, renewRemote, takeOverRemote, updateRemote, upgradeExteriorRemote } from '@/lib/data/sync';
import { DEFAULT_TERM, TERMS, describeLease, leaseState, termFor, termOf, termPrice, takeoverAllowed } from '@/lib/game/leases';
import { useCommunity } from '@/lib/state/communityStore';
import ReportButton from './ReportButton';
import { useAccount } from '@/lib/state/accountStore';
import { composeTo } from '@/lib/state/chatStore';
import { voteProblem } from '@/lib/game/buildingOfWeek';
import { holdRemote, releaseRemote, sendIntent, watchingRemote, watchRemote } from '@/lib/data/economy';

// A question for whoever owns this building now (it opens a new message in Chat; signing in first if needed).
function MessageOwner({ plot }) {
  const ask = () => {
    const go = () => {
      composeTo({ plot: { id: plot.id, title: plot.title } });
      usePanel.getState().open('chat');
    };
    if (useAccount.getState().ask(go)) go();
  };
  return (
    <button type="button" onClick={ask} className="flex w-full items-center justify-center gap-2 rounded-lg border border-sx-stroke bg-sx-alt/80 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-sx-stroke" data-testid="message-owner">
      <MessageCircle className="h-4 w-4 text-sx-cyan" /> Message the owner
    </button>
  );
}
import { AddressCard, BuildingHistory, Chip, HqLive, LogoBadge, SiteVisits, StatGrid, StepInside } from './PlotInfoCards';

const INPUT = 'w-full px-3 py-1.5 text-xs bg-sx-alt border border-sx-stroke rounded text-white focus:outline-none focus:border-sx-cyan';

function TypeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
      <option value="shop">Shop</option>
      <option value="restaurant">Restaurant</option>
      <option value="office">Office</option>
    </select>
  );
}

const VARIANT_LABELS = {
  openplan: 'Open-plan office',
  meetings: 'Meeting rooms',
  diner: 'Diner (booths and counter)',
  cafe: 'Cafe (small tables)',
  boutique: 'Boutique (racks and mirrors)',
  market: 'Market (shelves and stalls)',
};

// The interior layout: the choices follow the building type, and the first is the default.
function VariantSelect({ type, value, onChange }) {
  const options = BUILDING_TYPES[type].variants;
  return (
    <label className="block text-[10px] uppercase text-slate-400">
      Interior layout
      <select value={options.includes(value) ? value : options[0]} onChange={(e) => onChange(e.target.value)} className={`${INPUT} mt-0.5 normal-case`}>
        {options.map((v) => (
          <option key={v} value={v}>{VARIANT_LABELS[v] ?? v}</option>
        ))}
      </select>
    </label>
  );
}

// The logo for the building's roof banner: drawn from the business (the default), an icon on a board colour, or a
// picture the owner uploads. Required when setting up a plot: the form will not go through without a valid one.
const LOGO_TABS = [
  { kind: 'generated', label: 'From my business' },
  { kind: 'icon', label: 'Icon' },
  { kind: 'image', label: 'Upload' },
];

function GeneratedPreview({ title, type }) {
  const spec = generatedSpec({ id: 0, title: title || 'Your Business', buildingType: type });
  const shape = spec.shape === 'circle' ? 'rounded-full' : spec.shape === 'tag' ? 'rounded-lg' : '[clip-path:polygon(25%_5%,75%_5%,100%_50%,75%_95%,25%_95%,0_50%)]';
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center text-sm font-extrabold ${shape}`} style={{ background: spec.bg, color: spec.fg, boxShadow: `inset 0 0 0 2px ${spec.fg}` }}>
      {spec.letters}
    </span>
  );
}

function LogoPicker({ value, onChange, title = '', type = 'shop' }) {
  const kind = kindOf(value) ?? 'generated';
  const logo = value ?? { kind: 'generated' };
  const [error, setError] = useState(null);
  const color = logo.color ?? LOGO_COLORS[0];
  const pick = (k) => {
    setError(null);
    if (k === 'generated') onChange({ kind: 'generated' });
    else if (k === 'icon') onChange({ kind: 'icon', icon: logo.icon ?? null, color });
    else onChange({ kind: 'image', image: logo.image ?? null, color: logo.color ?? '#0f172a' });
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const image = await fileToLogoImage(file);
      setError(null);
      onChange({ kind: 'image', image, color: logo.color ?? '#0f172a' });
    } catch (err) {
      setError(err.message);
    }
  };
  const swatches = (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Banner colour">
      {LOGO_COLORS.map((c) => (
        <button type="button" key={c} onClick={() => onChange({ ...logo, color: c })} aria-label={`Colour ${c}`} aria-pressed={logo.color === c} className={`h-4 w-4 rounded-full border ${logo.color === c ? 'border-white ring-1 ring-white' : 'border-sx-line'}`} style={{ background: c }} />
      ))}
    </div>
  );
  return (
    <fieldset className="rounded-lg border border-sx-stroke bg-sx-panel/60 p-2">
      <legend className="px-1 text-[10px] uppercase text-slate-400">Roof banner logo</legend>
      <div className="mb-2 flex gap-1 rounded-md bg-sx-alt/80 p-0.5" role="tablist">
        {LOGO_TABS.map((t) => (
          <button type="button" key={t.kind} role="tab" aria-selected={kind === t.kind} onClick={() => pick(t.kind)} className={`flex-1 rounded py-1 text-[11px] font-medium ${kind === t.kind ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:bg-sx-stroke'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {kind === 'generated' && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <GeneratedPreview title={title} type={type} />
          <span>A logo drawn from your business name and type: its letters in a shape that suits it. It follows the name if you change it.</span>
        </div>
      )}

      {kind === 'icon' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-14 items-center justify-center rounded text-xl shadow-inner" style={{ background: color }} aria-label="Banner preview">
              {LOGO_ICONS.find((i) => i.id === logo.icon)?.emoji ?? <span className="text-[10px] text-white/70">?</span>}
            </span>
            {swatches}
          </div>
          <div className="grid grid-cols-8 gap-1" role="group" aria-label="Banner icon">
            {LOGO_ICONS.map((i) => (
              <button type="button" key={i.id} title={i.label} aria-label={i.label} aria-pressed={logo.icon === i.id} onClick={() => onChange({ ...logo, kind: 'icon', icon: i.id, color })} className={`flex h-7 items-center justify-center rounded text-base ${logo.icon === i.id ? 'bg-gradient-to-r from-sx-purple to-sx-blue ring-1 ring-violet-300' : 'bg-sx-alt hover:bg-sx-stroke'}`}>
                {i.emoji}
              </button>
            ))}
          </div>
          {!logo.icon && <p className="text-[10px] text-amber-400">Choose an icon.</p>}
        </div>
      )}

      {kind === 'image' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-white">
              {logo.image ? <img src={logo.image} alt="Your logo" className="h-full w-full object-contain" /> : <span className="text-[10px] text-slate-500">none</span>}
            </span>
            <label className="cursor-pointer rounded-md border border-sx-line bg-sx-alt px-2.5 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-sx-stroke">
              {logo.image ? 'Choose another picture' : 'Choose a picture'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={upload} className="sr-only" aria-label="Upload a logo" />
            </label>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">Banner colour {swatches}</div>
          <p className="text-[10px] text-slate-500">PNG, JPEG, WebP, GIF or SVG. It is shrunk to fit and kept in your saved game; nothing is sent anywhere.</p>
          {!logo.image && !error && <p className="text-[10px] text-amber-400">Choose a picture, or use another tab.</p>}
          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
      )}
    </fieldset>
  );
}

// The owner's editor for the outside of their building. A change that costs nothing more a year (the basic outside: colours, the shape, fewer floors,
// taking something off) is saved at once and shows in the city; with a game server it is saved there a moment after the last change, so dragging a
// slider sends one request. A change that costs more (lib/game/claimPrice.js exteriorChangeQuote: floors above the usual number, a roof garden, a dome,
// a spire) shows in the city but is not saved: the owner pays for the rest of the lease, or undoes it back to the outside they have.
const saveTimers = new Map();
function OwnerOutside({ plot }) {
  const setPlotExterior = useCityStore((s) => s.setPlotExterior);
  const notify = (t) => useCityStore.getState().notify(t);
  const type = plot.buildingType ?? 'shop';
  const [saved, setSaved] = useState(() => plot.exterior ?? null); // the outside the server has, which a priced change is quoted from
  const [pending, setPending] = useState(null); // a priced change waiting to be paid: { config, quote }
  const [busy, setBusy] = useState(false);
  // an outside never set up starts from the building as it stands (before verified traffic grew it)
  const value = { floors: floorsForHeight(plot.baseHeight ?? plot.height), wallColor: plot.wallColor, ...(plot.exterior ?? {}) };
  const server = apiOn() && typeof plot.id === 'number';
  const quoteOf = (config) => exteriorChangeQuote(plot, saved, config, type, { leaseDays: plot.lease?.days, leaseEnd: plot.lease?.end });
  const change = (c) => {
    setPlotExterior(plot.id, c);
    if (!server) return;
    clearTimeout(saveTimers.get(plot.id));
    const config = cleanExterior(c, plot, type);
    const quote = quoteOf(config);
    if (quote.diff > 0) return setPending({ config, quote });
    setPending(null);
    saveTimers.set(
      plot.id,
      setTimeout(
        () =>
          updateRemote(plot.id, { exterior: config }).then(
            () => setSaved(config),
            (e) => (e.code === 'exterior_payment_required' && e.quote ? setPending({ config, quote: e.quote }) : notify(`Not saved: ${e.message}`))
          ),
        700
      )
    );
  };
  const undo = () => {
    setPending(null);
    setPlotExterior(plot.id, saved ?? defaultExterior(plot, type));
  };
  const pay = async () => {
    setBusy(true);
    try {
      const r = await upgradeExteriorRemote(plot.id, pending.config);
      if (!r.checkout) (setSaved(pending.config), setPending(null));
    } catch {
      /* said by upgradeExteriorRemote */
    }
    setBusy(false);
  };
  const ended = ['grace', 'open'].includes(leaseState(plot.lease?.end));
  const money = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-1.5">
      <ExteriorBuilder plot={plot} type={type} value={value} onChange={change} />
      {pending && (
        <div className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-100" data-testid="exterior-quote" role="status">
          <p>
            These changes cost <b>{money(pending.quote.charge)}</b> for the rest of your lease ({money(pending.quote.diff)} a year more{pending.quote.lines.length ? `: ${pending.quote.lines.map((l) => l.label.toLowerCase()).join(', ')}` : ''}).
          </p>
          {ended ? (
            <p className="text-amber-200">The lease has ended: renew it first, then you can build onto the outside again.</p>
          ) : null}
          <div className="flex gap-1.5">
            <button type="button" disabled={busy || ended} onClick={pay} className="flex-1 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 font-bold text-white hover:brightness-110 disabled:opacity-40" data-testid="exterior-pay">
              Pay {money(pending.quote.charge)} and apply
            </button>
            <button type="button" disabled={busy} onClick={undo} className="rounded-lg border border-sx-stroke px-3 py-1.5 text-slate-200 hover:bg-sx-alt disabled:opacity-40" data-testid="exterior-undo">
              Undo
            </button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-500">Free changes show in the city straight away. More floors mean a bigger building on the map and more rooms to design inside.</p>
    </div>
  );
}

// The owner of a plot can change its roof banner at any time.
function ChangeLogo({ plot }) {
  const setPlotLogo = useCityStore((s) => s.setPlotLogo);
  const [logo, setLogo] = useState(() => logoOf(plot));
  const changed = isValidLogo(logo) && JSON.stringify(cleanLogo(logo)) !== JSON.stringify(cleanLogo(logoOf(plot)));
  return (
    <div className="space-y-2 border-t border-sx-alt pt-3">
      <LogoPicker value={logo} onChange={setLogo} title={plot.title} type={plot.buildingType} />
      <button type="button" disabled={!changed} onClick={() => (apiOn() && typeof plot.id === 'number' ? updateRemote(plot.id, { logo: cleanLogo(logo) }).then(() => setPlotLogo(plot.id, logo), (e) => useCityStore.getState().notify(`Not saved: ${e.message}`)) : setPlotLogo(plot.id, logo))} className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-40">
        Update the roof banner
      </button>
    </div>
  );
}

// Buy out a business you don't own: pay 1.25x its value, the owner is paid out (and logged in this
// plot's Hall of Fame) and moves to the next free house in Old Town. The building becomes yours.
function TakeOver({ plot }) {
  const takeOverPlot = useCityStore((s) => s.takeOverPlot);
  const homesLeft = useCityStore((s) => s.plots.filter((p) => p.districtId === SUBURB_ID && !p.owner).length);
  const [form, setForm] = useState({ name: '', title: '', link: '', type: 'shop', variant: null, logo: { kind: 'generated' }, about: '' });
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  // with a server, the price it charges (lib/game/claimPrice.js: 1.25x what the business is worth, for a year); without one, the game's own 1.25x its value
  const price = apiOn() ? takeoverQuote(plot, null, form.type).total : Math.round(plot.value * TAKEOVER_MULTIPLIER);

  return (
    <form
      className="space-y-2 border-t border-sx-alt pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if ((!apiOn() && !form.name) || !form.title || !isValidLogo(form.logo)) return;
        if (!apiOn()) {
          const done = takeOverPlot(plot.id, form.name, form.title, form.link || 'https://example.com', form.type, form.variant, form.logo, form.about);
          if (done) usePanel.getState().open('dashboard'); // your new business: the dashboard shows what to set up next
          return done;
        }
        // with a server: sign in only now, when taking over
        const biz = { title: form.title, buildingType: form.type, website: form.link || 'https://example.com', variant: form.variant, logo: form.logo, description: form.about };
        const go = () => takeOverRemote(plot.id, biz, price).then(() => usePanel.getState().open('dashboard'), () => {});
        if (useAccount.getState().ask(go)) go();
      }}
    >
      <span className="flex items-center gap-1.5 text-[10px] uppercase text-slate-400">
        <Repeat className="h-3.5 w-3.5" /> Take over this business
      </span>
      <p className="text-[11px] text-slate-400">
        {plot.owner} is paid ${price.toLocaleString()} (+25%) and {homesLeft ? 'moves to a house in Old Town' : 'retires (Old Town is full)'}.
      </p>
      <input type="text" required placeholder="New business name" value={form.title} onChange={(e) => set('title')(e.target.value)} className={INPUT} />
      <TypeSelect value={form.type} onChange={(t) => setForm((f) => ({ ...f, type: t, variant: null }))} />
      <VariantSelect type={form.type} value={form.variant} onChange={set('variant')} />
      {!apiOn() && <input type="text" required placeholder="Your username" value={form.name} onChange={(e) => set('name')(e.target.value)} className={INPUT} />}
      <input type="url" placeholder="External link (https://...)" value={form.link} onChange={(e) => set('link')(e.target.value)} className={INPUT} />
      <textarea value={form.about} maxLength={160} rows={2} onChange={(e) => set('about')(e.target.value)} placeholder="A line or two about your business (optional)" className={INPUT} />
      <LogoPicker value={form.logo} onChange={set('logo')} title={form.title} type={form.type} />
      <button type="submit" disabled={!isValidLogo(form.logo)} className="w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-amber-500 disabled:opacity-40">
        Take over for ${price.toLocaleString()}
      </button>
    </form>
  );
}

// The lease term picker of the claim form: how long the tenant is protected, and what it costs (`year` is the price of a year: the land and the outside).
function LeaseTerm({ value, onChange, year }) {
  return (
    <fieldset className="rounded-lg border border-sx-stroke p-2">
      <legend className="px-1 text-[10px] uppercase text-slate-400">Lease</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {TERMS.map((t) => (
          <button key={t.days} type="button" onClick={() => onChange(t.days)} aria-pressed={value === t.days} className={`rounded-md px-1 py-1.5 text-[11px] font-medium ${value === t.days ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'bg-sx-alt text-slate-300 hover:bg-sx-stroke'}`}>
            {t.label}
            <span className="block text-[10px] font-normal opacity-80">${termPrice(year, t.days).toLocaleString()}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-400">Nobody can take your business over while the lease runs. In its last 14 days, and for a week after, only you can renew it.</p>
    </fieldset>
  );
}

// The lease of a business: what protects it, when it ends, and (for the tenant) renewing.
function LeaseBox({ plot }) {
  const [days, setDays] = useState(() => termFor(plot.lease?.days)); // a lease of a term no longer offered (30 days) renews for 3 months
  const [busy, setBusy] = useState(false);
  if (!plot.lease?.end) {
    return plot.userClaimed ? null : <p className="rounded-xl border border-sx-stroke bg-sx-alt/40 px-3 py-2 text-[11px] text-slate-400">No lease: this business can be taken over.</p>;
  }
  const state = leaseState(plot.lease.end);
  const info = describeLease(plot.lease.end, plot.lease.days);
  const tone = { active: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100', renewal: 'border-amber-500/40 bg-amber-500/10 text-amber-100', grace: 'border-orange-500/40 bg-orange-500/10 text-orange-100', open: 'border-slate-500/40 bg-slate-500/10 text-slate-200' }[state];
  const canRenew = plot.userClaimed && state !== 'active';
  return (
    <div className={`rounded-xl border px-3 py-2 text-[11px] ${tone}`} data-testid="lease-box">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">Lease: {state === 'active' ? 'protected' : state === 'renewal' ? 'ending soon' : state === 'grace' ? 'ended, first refusal' : 'open to a buyout'}</span>
        <span className="text-[10px] opacity-80">ends {new Date(plot.lease.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>
      <p className="mt-0.5 leading-snug opacity-90">{info.text}</p>
      {canRenew && (
        <div className="mt-2 flex items-center gap-1.5">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${INPUT} w-auto`} aria-label="Renew for">
            {TERMS.map((t) => (
              <option key={t.days} value={t.days}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); await renewRemote(plot.id, days).catch(() => {}); setBusy(false); }} className="flex-1 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 font-bold text-white hover:brightness-110 disabled:opacity-40">
            Renew for ${renewalQuote(plot, days).toLocaleString()}
          </button>
        </div>
      )}
    </div>
  );
}

// Vote for Building of the Week (lib/game/buildingOfWeek.js): one vote a week for everyone, a bonus one for the three gold stars, each for a
// different building. Works without a game server too (a demo: the votes stay in this browser).
function VoteBox({ plot }) {
  const account = useAccount((s) => s.account);
  const votes = useCommunity((s) => s.votes);
  const notice = useCommunity((s) => s.notice);
  const loadVotes = useCommunity((s) => s.loadVotes);
  const vote = useCommunity((s) => s.vote);
  useEffect(() => {
    loadVotes();
    useCommunity.getState().clearNotice();
  }, [loadVotes, account?.id, plot.id]);
  if (!votes) return null;
  const mine = votes.votedFor.includes(plot.id);
  const here = votes.leaders?.find((l) => l.plotId === plot.id)?.votes ?? 0;
  const needSignIn = apiOn() && !account;
  const problem = voteProblem(plot, { votedFor: votes.votedFor, left: votes.votesLeft, ownPlot: Boolean(plot.userClaimed) });
  return (
    <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/5 px-3 py-2 text-[11px] text-yellow-100" data-testid="vote-box">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">Building of the Week{here ? ` · ${here} vote${here === 1 ? '' : 's'} this week` : ''}</span>
        {mine ? (
          <span className="text-yellow-300">You voted for this</span>
        ) : needSignIn ? (
          <button type="button" onClick={() => useAccount.getState().ask(() => vote(plot.id))} className="rounded-lg bg-yellow-400 px-3 py-1 font-bold text-yellow-950 hover:brightness-110">Sign in to vote</button>
        ) : !problem ? (
          <button type="button" onClick={() => vote(plot.id)} className="rounded-lg bg-yellow-400 px-3 py-1 font-bold text-yellow-950 hover:brightness-110">Vote</button>
        ) : null}
      </div>
      {!mine && !needSignIn && problem && <p className="mt-0.5 text-yellow-200/70">{problem}{votes.votesLeft <= 0 && !votes.huntWon ? ' Find all three gold stars on any day this week for a bonus vote.' : ''}</p>}
      {notice && <p className={`mt-1 ${notice.ok ? 'text-emerald-300' : 'text-red-300'}`} role="status">{notice.text}</p>}
      <button type="button" onClick={() => usePanel.getState().open('week')} className="mt-1 text-yellow-200/80 underline hover:text-yellow-100">See this week's top 5{votes.demo ? ' (demo)' : ''}</button>
    </div>
  );
}

// A collapsible block: the purchase and management forms live in these, so the card reads as information first.
function Fold({ title, hint, defaultOpen = false, onOpen, children }) {
  return (
    <details open={defaultOpen} onToggle={(e) => e.currentTarget.open && onOpen?.()} className="group overflow-hidden rounded-2xl border border-sx-stroke border-l-4 border-l-sx-purple bg-sx-alt/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold text-white">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-[10px] font-normal text-slate-400">
          {hint}
          <span className="transition group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="border-t border-sx-stroke p-3 text-slate-100">{children}</div>
    </details>
  );
}

// The owner's own words about their business.
function EditDescription({ plot }) {
  const setPlotDescription = useCityStore((s) => s.setPlotDescription);
  const [text, setText] = useState(plot.description ?? '');
  return (
    <div className="space-y-1.5 border-t border-sx-alt pt-3">
      <label className="block text-[10px] uppercase text-slate-400">
        About your business ({text.length}/160)
        <textarea value={text} maxLength={160} onChange={(e) => setText(e.target.value)} rows={3} placeholder="A line or two for visitors" className={`${INPUT} mt-0.5 normal-case`} />
      </label>
      <button type="button" disabled={text.trim() === (plot.description ?? '')} onClick={() => setPlotDescription(plot.id, text)} className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40">
        Save the description
      </button>
    </div>
  );
}

// With a game server a player signs in before setting a plot up (claiming or taking over), so every setup is held for them on the server
// (services/api/economy.mjs). Once they are signed in the form shows by itself.
function SignInToSetUp({ action }) {
  return (
    <div className="space-y-2 rounded-lg border border-sx-stroke bg-sx-alt/40 p-3 text-[11px] text-slate-300" data-testid="sign-in-to-set-up">
      <p>Sign in to {action}. While you set it up, the plot is held for you for three minutes, so nobody else can take it.</p>
      <button type="button" onClick={() => useAccount.getState().ask(() => {})} className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-2 text-xs font-bold text-white hover:brightness-110">
        Sign in to {action}
      </button>
    </div>
  );
}

// The tenant's own building: how many players watch it (never who).
function WatchCount({ plot }) {
  const [watchers, setWatchers] = useState(null);
  useEffect(() => {
    watchingRemote(plot.id).then((r) => setWatchers(r.watchers ?? null), () => {});
  }, [plot.id]);
  if (!watchers) return null;
  return (
    <p className="flex items-center gap-1.5 rounded-xl border border-sx-cyan/40 bg-sx-cyan/5 px-3 py-2 text-[11px] text-sx-cyan" data-testid="watch-count">
      <Bell className="h-3.5 w-3.5" /> {watchers} {watchers === 1 ? 'player watches' : 'players watch'} this plot: they are told if your lease ends.
    </p>
  );
}

// "Watch this plot" (services/api/economy.mjs): a player who would like this location is emailed when its lease ends and when it opens to a
// buyout, and when it is taken over. Other players never see how many watch; the tenant sees the count, admins see who.
function WatchButton({ plot }) {
  const account = useAccount((s) => s.account);
  const [watching, setWatching] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setWatching(null);
    if (account) watchingRemote(plot.id).then((r) => setWatching(r.watching), () => {});
  }, [plot.id, account?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async () => {
    setBusy(true);
    try {
      const r = await watchRemote(plot.id, !watching);
      setWatching(r.watching);
      useCityStore.getState().notify(r.watching ? `Watching ${plot.title}: we'll email you if its lease ends or it opens to a buyout.` : `You stopped watching ${plot.title}.`);
    } catch (e) {
      useCityStore.getState().notify(e.message);
    }
    setBusy(false);
  };
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={Boolean(watching)}
      onClick={() => (account ? toggle() : useAccount.getState().ask(toggle))}
      title="Get an email if this business's lease ends or the plot opens to a buyout"
      className={`flex w-full items-center justify-center gap-1.5 rounded-full border py-1.5 text-xs disabled:opacity-50 ${watching ? 'border-sx-cyan/60 bg-sx-cyan/10 text-sx-cyan' : 'border-sx-stroke bg-sx-alt/60 text-slate-200 hover:border-sx-line hover:bg-sx-alt'}`}
      data-testid="watch-plot"
    >
      <Bell className="h-3.5 w-3.5" /> {watching ? 'Watching' : 'Watch this plot'}
    </button>
  );
}

export default function PlotCard() {
  const selectedPlot = useCityStore((s) => s.selectedPlot);
  const plots = useCityStore((s) => s.plots);
  const layout = useCityStore((s) => s.layout);
  const activity = useCityStore((s) => s.activity);
  const openInterior = useCityStore((s) => s.openInterior);
  const claimPlot = useCityStore((s) => s.claimPlot);
  const [claimantName, setClaimantName] = useState('');
  const [plotTitle, setPlotTitle] = useState('');
  const [plotLink, setPlotLink] = useState('');
  const [plotAbout, setPlotAbout] = useState('');
  const [buildingType, setBuildingType] = useState('shop');
  const [variant, setVariant] = useState(null);
  const [logo, setLogo] = useState({ kind: 'generated' });
  const [leaseDays, setLeaseDays] = useState(DEFAULT_TERM);
  const [exterior, setExterior] = useState(null); // the outside the player is setting up (null: the usual one for the kind of business)
  const [touched, setTouched] = useState(false); // once they start, the building shows on the lot
  const botw = useCommunity((s) => s.botw);

  const potdId = useCityStore((state) => (state.day ? plotOfTheDay(state.plots, state.layout.seed, state.day)?.id : null));
  const potdPaid = useCityStore((state) => state.daily.potdDay === state.day);

  const p = selectedPlot;
  const liveFigures = useLiveStats(); // with a server: the building's real figures, re-rendered when they arrive
  useEffect(() => {
    if (apiOn() && p?.owner) wantFigures(p.id);
  }, [p?.id, p?.owner]);
  const info = useMemo(() => {
    if (!p) return null;
    const act = activity[p.id] ?? {};
    const data = liveDataProvider();
    const stats = data.plotStats(p, act);
    return {
      address: addressOf(p, layout),
      exposure: data.exposure(p, layout, plots),
      rank: rankByValue(p, plots),
      owners: data.plotOwners(p),
      stats,
      history: data.plotHistory(p),
      visits: data.visits(p, act),
      room: p.owner ? interiorSummaryFor(p) : null,
    };
  }, [p, plots, layout, activity, liveFigures]); // eslint-disable-line react-hooks/exhaustive-deps

  // the building being set up shows on the empty lot while the claim form is in use, and goes when it is not
  const forClaim = Boolean(p && !p.owner && p.districtId !== SUBURB_ID);
  useEffect(() => {
    setExterior(null);
    setTouched(false);
  }, [p?.id]);
  useEffect(() => {
    if (!forClaim || !touched) {
      useDraft.setState({ plot: null });
      return;
    }
    const cfg = cleanExterior(exterior ?? defaultExterior(p, buildingType), p, buildingType);
    const business = { ...p, owner: 'draft', title: plotTitle || 'Your building', buildingType, color: '#10b981', interiorData: { rooms: 1, theme: buildingType, variant: variant ?? BUILDING_TYPES[buildingType].variants[0], floors: cfg.floors } };
    useDraft.setState({ plot: { ...business, ...applyExterior(business, cfg, buildingType) } });
  }, [p?.id, forClaim, touched, exterior, buildingType, plotTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => useDraft.setState({ plot: null }), []);

  // The hold: three minutes to claim and pay once the player starts setting a plot up, then it is open again.
  // With a game server (services/api/economy.mjs) a signed-in player's hold is the server's, so another player cannot hold or claim the plot
  // meanwhile; the card counts down the time the server gives. Each step is part of the plot economy's data: the card opened, the setup started,
  // the price shown (the server prices it from the setup).
  const hold = useClaimHold();
  const account = useAccount((s) => s.account);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (apiOn() && typeof p?.id === 'number') sendIntent(p.id, 'card_open');
  }, [p?.id]);
  useEffect(() => {
    if (forClaim && touched) useClaimHold.getState().start(p.id);
  }, [forClaim, touched, p?.id]);
  useEffect(() => {
    if (!forClaim || !touched || !apiOn() || !account || typeof p?.id !== 'number') return undefined;
    const t = setTimeout(() => {
      const setup = { leaseDays, buildingType, exterior: cleanExterior(exterior ?? defaultExterior(p, buildingType), p, buildingType) };
      holdRemote(p.id, setup).then(
        (r) => useClaimHold.getState().sync(p.id, Date.now() + r.secondsLeft * 1000),
        (e) => e.code === 'held' && useClaimHold.getState().block(p.id, Date.now() + (e.secondsLeft ?? 0) * 1000),
      );
    }, 800);
    return () => clearTimeout(t);
  }, [forClaim, touched, p?.id, account?.id, leaseDays, buildingType, exterior]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hold.plotId && !hold.blocked) return undefined;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hold.plotId, hold.blocked]);
  useEffect(() => {
    if (hold.plotId && hold.plotId === p?.id && holdState(hold.until, clock).expired) {
      setTouched(false);
      setExterior(null);
      setPlotTitle('');
      useClaimHold.getState().clear();
      useCityStore.getState().notify('Your three minutes are up: the plot is open again. Start again when you are ready.');
    }
  }, [clock, hold.plotId, hold.until, p?.id]);
  useEffect(() => {
    const h = useClaimHold.getState();
    if (h.plotId && h.plotId !== p?.id) {
      if (h.server) releaseRemote(h.plotId); // another plot (or none): the hold is let go, on the server too
      h.clear();
    } else if (h.blocked && h.blocked.plotId !== p?.id) h.clear();
  }, [p?.id]);

  if (!p || !info) return null;

  const isClaimed = Boolean(p.owner);
  const isSuburb = p.districtId === SUBURB_ID;
  const leased = Boolean(p.lease?.end) && !takeoverAllowed(p.lease.end); // a lease protects its tenant until it has ended and their week of first refusal has passed
  const canTakeOver = isClaimed && !isSuburb && !p.userClaimed && !p.admin && !leased; // an admin headquarters is never for sale
  // what claiming costs, priced from exactly the outside the claim sends (lib/game/claimPrice.js); with a server, a lease for the chosen term, as the server charges it
  const sent = forClaim ? cleanExterior(exterior ?? defaultExterior(p, buildingType), p, buildingType) : null;
  const claim = forClaim ? (apiOn() ? leaseQuote(p, sent, buildingType, leaseDays) : claimPrice(p, sent, buildingType)) : null;
  const takeoverPrice = apiOn() ? takeoverQuote(p, null, 'shop').total : Math.round(p.value * TAKEOVER_MULTIPLIER);
  const price = canTakeOver ? takeoverPrice : forClaim ? landPriceOf(p) : p.value; // an empty plot is its land price (for a year); a building's is its value
  const tier = p.admin ? ['Admin headquarters', 'border-cyan-400/70 text-cyan-300'] : p.grand ? ['Grand estate', 'border-yellow-400/70 text-yellow-300'] : p.luxury ? ['Luxury estate', 'border-violet-500/70 text-violet-300'] : p.prime ? ['Prime plot', 'border-amber-500/70 text-amber-300'] : null;
  const people = info.room ? Math.max(4, Math.round((info.room.width * info.room.depth * info.room.floors) / 3.2)) : 0;
  const floors = p.interiorData?.floors ?? floorsForHeight(p.height);
  const history = info.history;
  // the admin headquarters never show invented figures: with a server they are real like every building, without one they show none
  const hqOffline = Boolean(p.admin) && !apiOn();
  // its plain public page: the profile its owner linked (with a server), or the demo page of a business the city started with (without one)
  const businessPage = p.profileSlug ? `/business/${p.profileSlug}` : !apiOn() && p.generated && p.owner && p.buildingType && p.buildingType !== 'house' && p.height > 0.2 ? `/business/${slugify(p.title)}-${p.id}` : null;
  const daysOpen = history.length ? history[history.length - 1].daysAgo : 0;

  const handleClaim = (e) => {
    e.preventDefault();
    if ((!apiOn() && !claimantName) || !plotTitle || !isValidLogo(logo)) return;
    if (!apiOn()) {
      const done = claimPlot(p.id, claimantName, plotTitle, plotLink || 'https://example.com', buildingType, variant, logo, plotAbout, sent);
      if (done) {
        useClaimHold.getState().clear();
        usePanel.getState().open('dashboard'); // your new business: the dashboard shows what to set up next
      }
      return done;
    }
    // with a server: sign in only now, when claiming (then the claim carries on by itself)
    const biz = { title: plotTitle, buildingType, website: plotLink || 'https://example.com', variant, logo, description: plotAbout, leaseDays, exterior: sent };
    const go = () => claimRemote(p.id, biz).then(() => (useClaimHold.getState().clear(), usePanel.getState().open('dashboard')), () => {});
    if (useAccount.getState().ask(go)) go();
  };
  const focusHere = () => useWorld.getState().focusOn(p.x, p.z, 30);
  const walkHere = () => {
    const out = (p.facing ?? 1) * ((p.d ?? 3) / 2 + 0.7);
    avatarState.target = { x: p.x + Math.sin(p.yaw ?? 0) * out, z: p.z + Math.cos(p.yaw ?? 0) * out };
  };

  return (
    <div className="space-y-3 text-slate-100">
      {isClaimed && !isSuburb && <StepInside plot={p} people={people} visits={hqOffline ? null : info.visits} onClick={() => openInterior(p)} />}

      {/* who it is */}
      <div className="flex items-start gap-3">
        <LogoBadge plot={p} />
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight text-white">{p.title}</h2>
          <p className="mt-1 text-xs leading-snug text-slate-400">{describeBusiness(p)}</p>
        </div>
      </div>

      <StatGrid height={floors} visits={hqOffline ? null : info.visits} price={price} priceLabel={isClaimed ? (canTakeOver ? 'Take over for' : 'Value') : 'Buy from'} owners={isClaimed ? info.owners : 0} />

      {p.admin && <HqLive company={p.owner} />}
      {apiOn() && isClaimed && p.ownerAccount && !p.userClaimed && <MessageOwner plot={p} />}
      {apiOn() && isClaimed && !isSuburb && !p.admin && <LeaseBox plot={p} />}
      {apiOn() && isClaimed && !isSuburb && !p.admin && !p.userClaimed && typeof p.id === 'number' && <WatchButton plot={p} />}
      {apiOn() && p.userClaimed && account && typeof p.id === 'number' && <WatchCount plot={p} />}
      {isClaimed && !isSuburb && !p.admin && !p.userClaimed && <VoteBox plot={p} />}

      <div className="flex flex-wrap gap-1.5">
        <Chip tone="border-cyan-500/40 text-sx-cyan" dot="bg-sx-cyan">Rank {info.rank} by value</Chip>
        <Chip tone="border-sky-500/40 text-sky-200" dot="bg-sky-400">{info.exposure.zone}, {info.exposure.level.toLowerCase()} exposure</Chip>
        <Chip dot="bg-violet-400">{p.district}</Chip>
        {tier && <Chip tone={tier[1]} dot="bg-current">{tier[0]}</Chip>}
        {p.skyline?.badges?.includes('verified') && <Chip tone="border-emerald-500/50 text-emerald-300" dot="bg-emerald-400">Verified traffic</Chip>}
        {p.skyline?.level > 0 && <Chip tone="border-sky-500/50 text-sky-200" dot="bg-sky-400">Skyline level {p.skyline.level}</Chip>}
        {botw?.plotId === p.id && <Chip tone="border-yellow-400/60 text-yellow-300" dot="bg-yellow-300">Building of the Week</Chip>}
        {p.parkBoost ? <Chip tone="border-green-600/50 text-green-300" dot="bg-green-400">Next to a park +{p.parkBoost}%</Chip> : null}
        {p.id === potdId && <Chip tone="border-amber-500/50 text-amber-300" dot="bg-amber-400">Plot of the Day{potdPaid ? '' : ` +${POTD_VISIT_GOLD}`}</Chip>}
      </div>

      {p.website && isClaimed && (
        <a href={p.website} target="_blank" rel="noreferrer" onClick={(e) => openSiteLink(e, p)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sx-cyan/50 bg-sx-cyan/10 py-2.5 text-sm font-bold text-sx-cyan transition hover:bg-sx-cyan/20">
          <Globe className="h-4 w-4" /> Visit website
        </a>
      )}
      {businessPage && (
        <a href={businessPage} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sx-stroke bg-sx-alt/60 py-2 text-xs font-semibold text-slate-100 hover:border-sx-line" data-testid="business-page-link">
          <FileText className="h-3.5 w-3.5 text-sx-cyan" /> Business page
        </a>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={focusHere} className="flex items-center justify-center gap-1.5 rounded-full border border-sx-stroke bg-sx-alt/60 py-1.5 text-xs text-slate-200 hover:border-sx-line hover:bg-sx-alt">
          <Eye className="h-3.5 w-3.5" /> Show on the map
        </button>
        <button onClick={walkHere} className="flex items-center justify-center gap-1.5 rounded-full border border-sx-stroke bg-sx-alt/60 py-1.5 text-xs text-slate-200 hover:border-sx-line hover:bg-sx-alt">
          <Footprints className="h-3.5 w-3.5" /> Walk to the door
        </button>
      </div>

      <AddressCard address={info.address} />
      {isClaimed && !isSuburb && (
        <button
          type="button"
          onClick={() => shareImage({ plot: p, address: info.address, rank: info.rank, visits: info.visits, price, floors }).then((r) => useCityStore.getState().notify(r === 'saved' ? 'Image saved' : r === 'shared' ? 'Shared' : 'Could not make the image'))}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-sx-stroke bg-sx-alt/60 py-1.5 text-xs text-slate-200 hover:border-sx-line hover:bg-sx-alt"
          data-testid="create-image"
        >
          <ImageIcon className="h-3.5 w-3.5" /> Create image
        </button>
      )}
      {isClaimed && !isSuburb && (
        <details className="rounded-xl" data-testid="share-details">
          <summary className="cursor-pointer text-center text-xs text-slate-300 hover:text-white">Share link and website badge</summary>
          <div className="mt-2"><ShareBox plot={p} /></div>
        </details>
      )}
      {apiOn() && isClaimed && !isSuburb && !p.userClaimed && typeof p.id === 'number' && (
        <div className="flex justify-end"><ReportButton kind="plot" id={p.id} label="Report this business" /></div>
      )}

      {/* what is special about the plot */}
      {p.grand && (
        <p className="flex items-start gap-1.5 rounded-lg border border-yellow-400/60 bg-yellow-950/40 px-2.5 py-1.5 text-[11px] text-yellow-200">
          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Grand estate: the city's high-end flagship, about {p.w.toFixed(0)} × {p.d.toFixed(0)} units on an open road by the water or the countryside. The tallest building in its area, with the biggest interior.</span>
        </p>
      )}
      {p.luxury && !p.grand && (
        <p className="flex items-start gap-1.5 rounded-lg border border-violet-500/60 bg-violet-950/40 px-2.5 py-1.5 text-[11px] text-violet-200">
          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Luxury estate: about {p.w.toFixed(0)} × {p.d.toFixed(0)} units in a prime spot, beside the water or next to the large plots. A grand, tall building with a much bigger interior.</span>
        </p>
      )}
      {p.prime && !p.luxury && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-600/60 bg-amber-950/40 px-2.5 py-1.5 text-[11px] text-amber-300">
          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Prime plot: {p.cellCount} cells ({p.primeKind === 'block' ? '2 × 2' : p.primeKind === 'deep' ? 'double-deep, a door on each avenue' : 'double-wide'}) on prime frontage. A bigger, taller building and interior.</span>
        </p>
      )}
      {p.retiredFrom && (
        <p className="flex items-start gap-1.5 rounded-lg border border-sx-stroke bg-sx-alt/60 px-2.5 py-1.5 text-[11px] text-slate-300">
          <Home className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Moved here after being bought out of {p.retiredFrom.title} for ${p.retiredFrom.paidOut.toLocaleString()}.
        </p>
      )}
      {p.brand && (p.brand.coupon || p.brand.quest || p.brand.video || p.brand.game) && (
        <p className="rounded-lg border border-violet-900 bg-violet-950/40 px-2.5 py-1.5 text-[11px] text-violet-300">
          Offers inside: {[p.brand.coupon && 'coupon', p.brand.quest && `${p.brand.quest.gold} Gold visit reward`, p.brand.video && 'video', p.brand.game && 'game demo'].filter(Boolean).join(' · ')}
        </p>
      )}

      {/* buy it, take it over, or run it */}
      {isSuburb && !isClaimed ? (
        <p className="text-xs text-slate-400">A house lot in Old Town, kept for owners who get bought out of their business.</p>
      ) : isClaimed ? (
        p.userClaimed ? (
          <>
            <Fold title="Customize the outside" hint="floors, shape, colours, roof">
              <OwnerOutside key={`outside-${p.id}`} plot={p} />
            </Fold>
            <Fold title="Manage your business" hint="logo and description">
              <ChangeLogo key={`${p.id}-${p.logo?.kind}-${p.logo?.icon}`} plot={p} />
              <EditDescription key={`about-${p.id}`} plot={p} />
            </Fold>
          </>
        ) : p.admin ? (
          <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-cyan-100">This is the headquarters of {p.owner}. It is part of the city and is not for sale.</p>
        ) : canTakeOver ? (
          <Fold title={`Buy this building from $${price.toLocaleString()}`} hint="take it over" onOpen={() => apiOn() && account && sendIntent(p.id, 'open', { buildingType: 'shop' })}>
            {apiOn() && !account ? <SignInToSetUp action="take this business over" /> : <TakeOver key={p.id} plot={p} />}
          </Fold>
        ) : null
      ) : (
        <Fold title={`Claim this plot from $${price.toLocaleString()}`} hint="set up your business" defaultOpen>
          {apiOn() && !account ? <SignInToSetUp action="claim this plot" /> : (
          <form onSubmit={handleClaim} className="space-y-2">
            {hold.blocked?.plotId === p.id && !holdState(hold.blocked.until, clock).expired && (
              <p className="rounded-lg border border-red-500/60 bg-red-950/40 px-2.5 py-1.5 text-[11px] text-red-200" data-testid="claim-held-by-other" role="status">
                Someone else is setting this plot up: <b className="font-mono">{holdState(hold.blocked.until, clock).label}</b> left. It opens again if they don&apos;t claim it.
              </p>
            )}
            {hold.plotId === p.id && (() => {
              const h = holdState(hold.until, clock);
              return (
                <p className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${h.urgent ? 'border-red-500/60 bg-red-950/40 text-red-200' : 'border-amber-500/40 bg-amber-950/30 text-amber-200'}`} data-testid="claim-hold" role="timer">
                  Plot held for you: <b className="font-mono">{h.label}</b> left to claim and pay
                </p>
              );
            })()}
            <input type="text" placeholder="Store / Company Name" value={plotTitle} onChange={(e) => { setPlotTitle(e.target.value); setTouched(true); }} required className={INPUT} />
            <TypeSelect value={buildingType} onChange={(t) => { setBuildingType(t); setVariant(null); setExterior(null); }} />
            <VariantSelect type={buildingType} value={variant} onChange={setVariant} />
            <details open className="rounded-xl" data-testid="claim-outside">
              <summary className="mb-1.5 cursor-pointer text-xs font-semibold text-slate-200">The outside: floors, shape, colours and roof <span className="font-normal text-slate-500">(your building appears on the lot as you choose)</span></summary>
              <ExteriorBuilder plot={p} type={buildingType} value={exterior ?? defaultExterior(p, buildingType)} onChange={(c) => { setExterior(c); setTouched(true); useWorld.getState().focusOn(p.x, p.z, 30); }} />
            </details>
            {!apiOn() && <input type="text" placeholder="Your Username" value={claimantName} onChange={(e) => setClaimantName(e.target.value)} required className={INPUT} />}
            <input type="url" placeholder="External Link (https://...)" value={plotLink} onChange={(e) => setPlotLink(e.target.value)} className={INPUT} />
            <textarea value={plotAbout} maxLength={160} rows={2} onChange={(e) => setPlotAbout(e.target.value)} placeholder="A line or two about your business (optional)" className={INPUT} />
            <LogoPicker value={logo} onChange={setLogo} title={plotTitle} type={buildingType} />
            {apiOn() && <LeaseTerm value={leaseDays} onChange={setLeaseDays} year={claim.year} />}
            {claim && (
              <div className="rounded-lg border border-sx-stroke bg-sx-alt/40 px-2.5 py-2 text-[11px] text-slate-300" data-testid="claim-price">
                {claim.lines.map((l) => (
                  <div key={l.label} className="flex justify-between"><span>{l.label}</span><span className="font-mono">${l.amount.toLocaleString()}</span></div>
                ))}
                {claim.year != null && <div className="mt-1 flex justify-between border-t border-sx-stroke pt-1"><span>For a year</span><span className="font-mono">${claim.year.toLocaleString()}</span></div>}
                <div className="mt-1 flex justify-between border-t border-sx-stroke pt-1 font-bold text-white"><span>{claim.year != null ? `Total for ${termOf(claim.days)?.label ?? `${claim.days} days`}` : 'Total'}</span><span className="font-mono" data-testid="claim-total">${claim.total.toLocaleString()}</span></div>
                {p.land && explainPrice(p.land).length > 1 && <p className="mt-1 text-[10px] text-slate-500">{explainPrice(p.land).join(' · ')}</p>}
              </div>
            )}
            <button type="submit" disabled={!isValidLogo(logo)} className="w-full rounded-lg bg-green-600 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-green-500 disabled:opacity-40">
              Claim {p.luxury ? 'Luxury Estate' : p.prime ? 'Prime Plot' : 'Plot'} (${claim.total.toLocaleString()})
            </button>
          </form>
          )}
        </Fold>
      )}

      {isClaimed && !isSuburb && !hqOffline && <SiteVisits stats={info.stats} own={p.userClaimed} />}
      {isClaimed && !isSuburb && apiOn() && !info.stats && typeof p.id === 'number' && (
        <p className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3 text-[11px] text-slate-400" role="status">
          {figuresState(p.id, liveFigures) === 'error' ? 'Visitor figures could not be loaded from the server. Try again in a moment.' : 'Loading verified visitor figures…'}
        </p>
      )}
      {isClaimed && !isSuburb && !hqOffline && <BuildingHistory events={history} clicks={info.stats?.clicks ?? 0} days={daysOpen} />}
    </div>
  );
}
