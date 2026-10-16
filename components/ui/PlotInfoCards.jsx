"use client";

import React from 'react';
import { Building2, ChevronRight, Clock, Eye, Footprints, History, LogIn, MapPin, MousePointerClick, Tag, Users } from 'lucide-react';
import { generatedSpec, kindOf, LOGO_ICONS, boardColor, logoOf } from '@/lib/game/logos';
import { formatDaysAgo, formatHour, formatSeconds } from '@/lib/game/plotInfo';

// The pieces of the building card (see PlotCard.jsx): the business's identity, its figures, where it is, who visits its website and
// its past. Styled with the SynaptixPlay palette (deep indigo-navy surfaces, cyan / blue / purple accents).

// The business's logo, as it shows on its roof banner.
export function LogoBadge({ plot, size = 'h-16 w-16' }) {
  const logo = logoOf(plot);
  if (!logo) {
    return <span className={`flex ${size} shrink-0 items-center justify-center rounded-2xl border border-sx-stroke bg-sx-alt text-2xl`}>{plot.buildingType === 'house' ? '🏠' : '🏷'}</span>;
  }
  const kind = kindOf(logo);
  const color = boardColor(plot, logo);
  if (kind === 'image') {
    return (
      <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-lg`} style={{ boxShadow: `inset 0 0 0 3px ${color}, 0 4px 14px rgba(0,0,0,.4)` }}>
        <img src={logo.image} alt={`${plot.title} logo`} className="h-full w-full object-contain" />
      </span>
    );
  }
  if (kind === 'icon') {
    return (
      <span className={`flex ${size} shrink-0 items-center justify-center rounded-2xl text-3xl`} style={{ background: color, boxShadow: '0 4px 14px rgba(0,0,0,.4)' }} aria-label={`${plot.title} logo`}>
        {LOGO_ICONS.find((i) => i.id === logo.icon)?.emoji ?? '⭐'}
      </span>
    );
  }
  const spec = generatedSpec(plot);
  const shape = spec.shape === 'circle' ? 'rounded-full' : spec.shape === 'tag' ? 'rounded-2xl' : '[clip-path:polygon(25%_5%,75%_5%,100%_50%,75%_95%,25%_95%,0_50%)]';
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center text-xl font-extrabold ${shape}`} style={{ background: spec.bg, color: spec.fg, boxShadow: `inset 0 0 0 3px ${spec.fg}` }} aria-label={`${plot.title} logo`}>
      {spec.letters}
    </span>
  );
}

// The main action: a filled gradient button.
export function StepInside({ plot, people, visits, onClick }) {
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-sx-purple to-sx-blue px-4 py-3 text-left shadow-lg shadow-violet-900/40 transition hover:brightness-110">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><LogIn className="h-5 w-5 text-white" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-white">{plot.mall ? 'Go inside the store' : 'Step inside'}</span>
        <span className="block text-[11px] text-violet-100/80">{people} people fit · {visits.toLocaleString()} visits</span>
      </span>
      <ChevronRight className="h-5 w-5 text-white/80 transition group-hover:translate-x-0.5" />
    </button>
  );
}

const Tile = ({ icon: Icon, label, value, sub, accent = 'text-white', tint = 'bg-cyan-500/15 text-cyan-300' }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-sx-stroke bg-sx-alt/60 px-3 py-2.5">
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon className="h-4 w-4" /></span>
    <span className="min-w-0">
      <span className="block text-[11px] text-slate-400">{label}</span>
      <span className={`block text-lg font-bold leading-tight ${accent}`}>{value}{sub ? <span className="ml-1 text-[11px] font-normal text-slate-500">{sub}</span> : null}</span>
    </span>
  </div>
);

// Floors, visits, price and owners, as four tiles.
export function StatGrid({ height, visits, price, priceLabel, owners }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile icon={Building2} label="Height" value={height} sub={height === 1 ? 'floor' : 'floors'} />
      <Tile icon={Eye} label="Visits" value={visits.toLocaleString()} tint="bg-violet-500/15 text-violet-300" />
      <Tile icon={Tag} label={priceLabel} value={`$${price.toLocaleString()}`} accent="text-sx-cyan" tint="bg-sky-500/15 text-sky-300" />
      <Tile icon={Users} label="Owners" value={owners ?? '…'} tint="bg-amber-500/15 text-amber-300" />
    </div>
  );
}

export const Chip = ({ children, tone = 'border-sx-stroke text-slate-300', dot = 'bg-slate-500' }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border bg-sx-panel/70 px-2.5 py-1 text-[11px] font-medium ${tone}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    {children}
  </span>
);

export function AddressCard({ address }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-sx-stroke bg-sx-alt/40 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-sx-cyan"><MapPin className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-[11px] text-slate-400">Address</span>
        <span className="block truncate text-sm font-semibold text-white">{address}</span>
      </span>
    </div>
  );
}

// Thirty days of visits as a bar chart (the last fourteen are drawn).
function Bars({ days }) {
  const shown = days.slice(-14);
  const max = Math.max(1, ...shown.map((d) => d.views));
  return (
    <div className="flex h-16 items-end gap-1" role="img" aria-label="Visits over the last fourteen days">
      {shown.map((d) => (
        <span key={d.ago} title={`${d.ago === 0 ? 'Today' : `${d.ago} days ago`}: ${d.views} visits`} className={`flex-1 rounded-t-md ${d.ago === 0 ? 'bg-gradient-to-t from-sx-purple to-sx-cyan' : 'bg-gradient-to-t from-sx-blue/70 to-sx-cyan/70'}`} style={{ height: `${Math.max(6, (d.views / max) * 100)}%` }} />
      ))}
    </div>
  );
}

const Fig = ({ icon: Icon, label, value }) => (
  <div className="rounded-xl bg-sx-panel/80 p-2.5">
    <span className="flex items-center gap-1 text-[10px] text-slate-400"><Icon className="h-3 w-3 text-sx-cyan" /> {label}</span>
    <span className="block text-base font-bold text-white">{value}</span>
  </div>
);

// Where the visitors come from: the sources as one stacked bar, with a key.
const SOURCE_COLOURS = ['#22d3ee', '#3b82f6', '#8b5cf6', '#fbbf24', '#ec4899'];
function Sources({ sources }) {
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sx-alt" role="img" aria-label="Where visitors come from">
        {sources.map((s, i) => (
          <span key={s.id} title={`${s.label}: ${Math.round(s.share * 100)}%`} style={{ width: `${s.share * 100}%`, background: SOURCE_COLOURS[i % SOURCE_COLOURS.length] }} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {sources.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SOURCE_COLOURS[i % SOURCE_COLOURS.length] }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="font-semibold text-slate-100">{Math.round(s.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Who visits the business and its website: thirty days of figures, the best times and where the visitors come from.
export function SiteVisits({ stats, own }) {
  if (!stats) return null;
  return (
    <section className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3">
      <h3 className="mb-3 flex items-center justify-between text-xs font-bold text-white">
        <span>Site visits <span className="font-normal text-slate-400">· last 30 days</span></span>
        {stats.simulated && <span className="rounded-full bg-sx-stroke px-2 py-0.5 text-[9px] font-medium text-slate-300">simulated</span>}
        {stats.verified && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-medium text-emerald-300" title="Only visits from a running page, not known bots, and at most 3 visits and 1 click per network per day are counted">verified human traffic{stats.humanShare != null && stats.humanShare < 1 ? ` · ${Math.round(stats.humanShare * 100)}% of raw` : ''}</span>}
      </h3>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fig icon={Eye} label="Visits" value={stats.views.toLocaleString()} />
        <Fig icon={Users} label="Visitors" value={stats.uniques.toLocaleString()} />
        <Fig icon={MousePointerClick} label="Site clicks" value={stats.clicks.toLocaleString()} />
        <Fig icon={Footprints} label="Click rate" value={`${(stats.ctr * 100).toFixed(1)}%`} />
      </div>
      <Bars days={stats.days} />
      <div className="mt-1 flex justify-between text-[9px] text-slate-500">
        <span>14 days ago</span>
        <span>today</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-xl bg-sx-panel/80 p-2">
          <span className="flex items-center gap-1 text-[10px] text-slate-400"><Clock className="h-3 w-3 text-sx-cyan" /> Time inside</span>
          <span className="font-semibold text-white">{formatSeconds(stats.avgSeconds)}</span>
        </div>
        <div className="rounded-xl bg-sx-panel/80 p-2">
          <span className="text-[10px] text-slate-400">Busiest hour</span>
          <span className="block font-semibold text-white">{stats.busiestHour == null ? '–' : formatHour(stats.busiestHour)}</span>
        </div>
        <div className="rounded-xl bg-sx-panel/80 p-2">
          <span className="text-[10px] text-slate-400">Busiest day</span>
          <span className="block font-semibold text-white">{stats.busiestDay ?? '–'}</span>
        </div>
      </div>
      <h4 className="mb-1.5 mt-3 text-[11px] font-semibold text-slate-300">Where visitors come from</h4>
      <Sources sources={stats.sources} />
      <p className="mt-2.5 text-[10px] leading-snug text-slate-500">
        {stats.simulated
          ? `${own ? 'Your own visits and website clicks are counted in these figures. ' : ''}These figures are simulated from the building's size and spot: this copy of the game has no server to count real visitors.`
          : `Counted by the game server: verified visitors only${own ? ', not your own visits' : ''}.`}
      </p>
    </section>
  );
}

// Past owners and what they paid, newest first, as a timeline.
export function BuildingHistory({ events, clicks, days }) {
  if (!events.length) return null;
  return (
    <section className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3">
      <h3 className="mb-3 flex items-center justify-between text-xs font-bold text-white">
        <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5 text-sx-cyan" /> Building history</span>
        <span className="font-normal text-slate-400">{clicks.toLocaleString()} clicks · {days} days</span>
      </h3>
      <ol className="relative ml-1.5 space-y-3 border-l border-sx-line pl-4">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span className={`absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-sx-panel ${e.now ? 'bg-sx-cyan' : e.kind === 'open' ? 'bg-sx-purple' : 'bg-sx-blue'}`} />
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-semibold text-slate-100">{e.title}{e.now ? <span className="ml-1.5 rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-medium text-sx-cyan">current owner</span> : null}</span>
              <span className="shrink-0 text-xs font-bold text-white">${e.price.toLocaleString()}</span>
            </div>
            <div className="text-[10px] text-slate-500">{e.kind === 'open' ? 'Plot opened' : 'Claimed'} · {formatDaysAgo(e.daysAgo)}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

