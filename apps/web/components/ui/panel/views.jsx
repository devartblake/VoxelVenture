"use client";

import { useCommunity } from '@/lib/state/communityStore';
import LiveStats from './LiveStats';
import React, { useMemo, useState } from 'react';
import { BadgeCheck, Eye, MapPin, Footprints, MessageCircle, Search as SearchIcon, Star } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';
import { avatarState } from '@/lib/sim/avatarState';
import { FISH, FISH_DAILY_CAP } from '@/lib/sim/vehicles';
import { setPlayerName, useNet } from '@/lib/net/multiplayer';
import { usePanel } from '@/lib/state/panelStore';
import { devToolsOn } from '@/lib/dev/devTools';
import { apiOn } from '@/lib/data/api';
import { useAccount } from '@/lib/state/accountStore';
import { composeTo, setTab, useChat } from '@/lib/state/chatStore';

// The views the side panel shows besides the plot, park and ad-space cards: statistics, search, places and who is online
// (chat itself is in apps/web/components/ui/chat/).

export const tierOf = (p) => (p.grand ? 'Grand estate' : p.luxury ? 'Luxury estate' : p.prime ? 'Prime plot' : 'Plot');
const TIER_COLOUR = { 'Grand estate': 'text-yellow-300', 'Luxury estate': 'text-violet-300', 'Prime plot': 'text-amber-300', Plot: 'text-slate-400' };

const Row = ({ label, value, accent = 'text-slate-100' }) => (
  <div className="flex items-baseline justify-between border-b border-sx-alt/70 py-1.5 text-xs last:border-0">
    <span className="text-slate-400">{label}</span>
    <span className={`font-mono font-semibold ${accent}`}>{value}</span>
  </div>
);
const Section = ({ title, children }) => (
  <section className="mb-4">
    <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
    {children}
  </section>
);

// Show a spot on the map, and optionally select a plot there
function show(x, z, zoom = 30) {
  useWorld.getState().focusOn(x, z, zoom);
}
function walkTo(x, z) {
  avatarState.target = { x, z };
}

// A row for a place: its name, a little detail, and Show (camera) / Walk (avatar) buttons.
function PlaceRow({ title, detail, x, z, onOpen, tone = 'text-slate-100' }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-sx-alt bg-sx-panel/60 px-2.5 py-1.5">
      <button className="min-w-0 flex-1 text-left" onClick={() => { show(x, z); onOpen?.(); }}>
        <span className={`block truncate text-xs font-medium ${tone}`}>{title}</span>
        {detail && <span className="block truncate text-[10px] text-slate-500">{detail}</span>}
      </button>
      <button className="rounded p-1 text-slate-400 hover:bg-sx-alt hover:text-white" title="Show on the map" aria-label={`Show ${title}`} onClick={() => show(x, z)}>
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button className="rounded p-1 text-slate-400 hover:bg-sx-alt hover:text-white" title="Walk there" aria-label={`Walk to ${title}`} onClick={() => walkTo(x, z)}>
        <Footprints className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export function StatsView() {
  const plots = useCityStore((s) => s.plots);
  const billboards = useCityStore((s) => s.billboards);
  const layout = useCityStore((s) => s.layout);
  const gold = useCityStore((s) => s.gold);
  const setSelectedPlot = useCityStore((s) => s.setSelectedPlot);
  const netOnline = useNet((s) => s.online);
  const netStatus = useNet((s) => s.status);
  const fishing = useCityStore((s) => s.fishing);

  const stats = useMemo(() => {
    const built = plots.filter((p) => p.owner);
    const mine = plots.filter((p) => p.userClaimed);
    const tiers = ['Plot', 'Prime plot', 'Luxury estate', 'Grand estate'].map((name) => {
      const all = plots.filter((p) => tierOf(p) === name);
      return { name, total: all.length, built: all.filter((p) => p.owner).length };
    });
    return {
      built: built.length,
      total: plots.length,
      cap: plots.reduce((a, p) => a + p.value, 0),
      mine: mine.length,
      mineValue: mine.reduce((a, p) => a + p.value, 0),
      visits: plots.reduce((a, p) => a + (p.visits ?? 0), 0),
      adViews: billboards.reduce((a, b) => a + b.views, 0),
      adClicks: billboards.reduce((a, b) => a + b.clicks, 0),
      parkVisits: layout.parks.reduce((a, p) => a + p.visits, 0),
      tiers,
      districts: layout.districts.map((d) => {
        const all = plots.filter((p) => p.districtId === d.id);
        return { ...d, total: all.length, built: all.filter((p) => p.owner).length };
      }),
      top: [...plots].sort((a, b) => b.value - a.value).slice(0, 6),
    };
  }, [plots, billboards, layout]);

  return (
    <div className="text-slate-100">
      <LiveStats />
      <div className="mb-4 flex items-center justify-between rounded-lg border border-sx-alt bg-sx-panel/60 p-3">
        <div>
          <span className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className={`h-2 w-2 rounded-full ${netStatus === 'online' ? 'bg-green-400' : 'bg-slate-500'}`} /> In your city
          </span>
          <span className="text-[10px] text-slate-500">{netStatus === 'online' ? 'Players on the live map with you, right now' : 'The multiplayer server is not running'}</span>
        </div>
        <span className="text-2xl font-bold">{netStatus === 'online' ? Math.max(1, netOnline) : 1}</span>
      </div>

      <Section title="You">
        <Row label="Gold" value={gold.toLocaleString()} accent="text-amber-400" />
        <Row label="Plots you own" value={stats.mine} />
        <Row label="Their value" value={`$${stats.mineValue.toLocaleString()}`} accent="text-green-400" />
      </Section>

      <Section title="Fishing (from a boat)">
        <Row label="Fish caught" value={Object.values(fishing.caught).reduce((a, n) => a + n, 0)} />
        <Row label="Gold from fishing today" value={`${fishing.goldToday ?? 0} / ${FISH_DAILY_CAP}`} accent="text-amber-400" />
        {FISH.filter((f) => fishing.caught[f.id]).map((f) => (
          <Row key={f.id} label={f.name} value={`× ${fishing.caught[f.id]}`} />
        ))}
      </Section>

      <Section title="The city">
        <Row label="Built plots" value={`${stats.built} / ${stats.total}`} />
        <Row label="City market cap" value={`$${stats.cap.toLocaleString()}`} accent="text-green-400" />
        {stats.tiers.map((t) => (
          <Row key={t.name} label={t.name === 'Plot' ? 'Ordinary plots built' : `${t.name}s built`} value={`${t.built} / ${t.total}`} accent={TIER_COLOUR[t.name]} />
        ))}
      </Section>

      <Section title="Recorded activity">
        <Row label="Plot visits (daily)" value={stats.visits.toLocaleString()} />
        <Row label="Park visits (daily)" value={stats.parkVisits.toLocaleString()} />
        <Row label="Ad views (billboards and banners)" value={stats.adViews.toLocaleString()} />
        <Row label="Ad clicks" value={stats.adClicks.toLocaleString()} />
      </Section>

      <Section title="Districts">
        {stats.districts.map((d) => (
          <div key={d.id} className="flex items-center gap-2 py-1 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1 truncate text-slate-300">{d.name}</span>
            <span className="font-mono text-slate-400">{d.built}/{d.total}</span>
          </div>
        ))}
      </Section>

      <Section title="Most valuable plots">
        <ul className="space-y-1">
          {stats.top.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  setSelectedPlot(p, 'search');
                  show(p.x, p.z);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-sx-alt bg-sx-panel/60 px-2.5 py-1.5 text-left hover:bg-sx-alt"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{p.title}</span>
                  <span className={`text-[10px] ${TIER_COLOUR[tierOf(p)]}`}>{tierOf(p)} · #{p.id}</span>
                </span>
                <span className="font-mono text-xs text-green-400">${p.value.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export function SearchView() {
  const plots = useCityStore((s) => s.plots);
  const layout = useCityStore((s) => s.layout);
  const setSelectedPlot = useCityStore((s) => s.setSelectedPlot);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return { plots: [], places: [] };
    const hit = (...fields) => fields.some((f) => String(f ?? '').toLowerCase().includes(q));
    const found = plots
      .filter((p) => hit(p.title, p.owner, p.district, p.category, p.buildingType, tierOf(p), `#${p.id}`, p.id === Number(q) ? q : ''))
      .sort((a, b) => b.value - a.value)
      .slice(0, 40);
    const places = [
      ...layout.parks.map((p) => ({ name: p.name, detail: 'Park', x: p.center.x, z: p.center.z })),
      ...(layout.amusement ? [{ name: layout.amusement.name, detail: 'Amusement park', x: layout.amusement.gate.x, z: layout.amusement.gate.z }] : []),
      ...layout.airports.map((a) => ({ name: a.name, detail: 'Airport', x: a.terminal.x, z: a.terminal.z })),
      ...layout.lakes.map((l) => ({ name: l.name, detail: 'Lake', x: l.x, z: l.z })),
      ...layout.roads.filter((r) => r.name).map((r) => ({ name: r.name, detail: 'Road', x: r.axis === 'x' ? (r.from + r.to) / 2 : r.center, z: r.axis === 'x' ? r.center : (r.from + r.to) / 2 })),
    ];
    const seen = new Set();
    return {
      plots: found,
      places: places.filter((p) => hit(p.name, p.detail) && !seen.has(p.name) && seen.add(p.name)).slice(0, 12),
    };
  }, [q, plots, layout]);

  return (
    <div className="text-slate-100">
      <label className="relative mb-3 block">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plots, owners, districts, parks, airports…"
          className="w-full rounded-lg border border-sx-stroke bg-sx-alt py-1.5 pl-8 pr-2 text-xs text-white focus:border-sx-cyan focus:outline-none"
        />
      </label>
      {!q && <p className="text-[11px] text-slate-500">Try a business name, an owner, a district (Arcade Alley), “luxury”, “prime”, “for sale”, or “airport”.</p>}
      {q && !results.plots.length && !results.places.length && <p className="text-[11px] text-slate-500">Nothing found.</p>}

      {results.places.length > 0 && (
        <Section title="Places">
          <ul className="space-y-1">
            {results.places.map((p) => (
              <PlaceRow key={`${p.detail}-${p.name}`} title={p.name} detail={p.detail} x={p.x} z={p.z} />
            ))}
          </ul>
        </Section>
      )}
      {results.plots.length > 0 && (
        <Section title={`Plots (${results.plots.length}${results.plots.length === 40 ? '+' : ''})`}>
          <ul className="space-y-1">
            {results.plots.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setSelectedPlot(p, 'search');
                    show(p.x, p.z);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-sx-alt bg-sx-panel/60 px-2.5 py-1.5 text-left hover:bg-sx-alt"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{p.title}</span>
                    <span className="block truncate text-[10px] text-slate-500">
                      <span className={TIER_COLOUR[tierOf(p)]}>{tierOf(p)}</span> · {p.district} · {p.owner ? `owned by ${p.owner}` : 'for sale'}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-green-400">${p.value.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function PlacesView() {
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  const billboards = useCityStore((s) => s.billboards);
  const setSelectedPlot = useCityStore((s) => s.setSelectedPlot);
  const setSelectedPark = useCityStore((s) => s.setSelectedPark);
  const setSelectedBillboard = useCityStore((s) => s.setSelectedBillboard);

  const botw = useCommunity((s) => s.botw);
  const winner = botw ? plots.find((p) => p.id === botw.plotId) : null;
  const estates = plots.filter((p) => p.luxury).sort((a, b) => Number(Boolean(a.owner)) - Number(Boolean(b.owner)) || b.value - a.value);
  const roadName = (id) => layout.roads.find((r) => r.id === id)?.name ?? 'a main road';

  return (
    <div className="text-slate-100">
      <Section title="Building of the Week">
        <ul className="space-y-1">
          {winner && <PlaceRow title={winner.title} detail={`${botw.votes} vote${botw.votes === 1 ? '' : 's'} last week · ${winner.district}`} x={winner.x} z={winner.z} onOpen={() => setSelectedPlot(winner, 'search')} tone="text-yellow-300" />}
        </ul>
        <button type="button" onClick={() => usePanel.getState().open('week')} className="mt-1 w-full rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-2.5 py-1.5 text-left text-[11px] font-medium text-yellow-100 hover:bg-yellow-400/15">
          {winner ? 'Vote for next week\'s: see this week\'s top 5 ›' : 'Vote for the first one: see this week\'s top 5 ›'}
        </button>
      </Section>
      <Section title="Mega malls">
        <ul className="space-y-1">
          {(layout.malls ?? []).map((m) => (
            <PlaceRow key={m.id} title={m.name} detail={`${m.stores.length} stores, each with an interior`} x={m.x} z={m.z} onOpen={() => usePanel.getState().openMall(m.id)} tone="text-violet-300" />
          ))}
        </ul>
      </Section>
      <Section title="Parks">
        <ul className="space-y-1">
          {layout.parks.map((p) => (
            <PlaceRow key={p.id} title={p.name} detail={`${p.big ? 'Large park' : 'Block park'} · ${p.visits.toLocaleString()} visitors a day · +${p.boostPercent}% for ${p.neighborIds.length} neighbours`} x={p.center.x} z={p.center.z} onOpen={() => setSelectedPark(p)} tone="text-green-300" />
          ))}
        </ul>
      </Section>
      <Section title="Airports and aerial banners">
        <ul className="space-y-1">
          {layout.airports.map((a) => (
            <PlaceRow key={a.id} title={a.name} detail="Airport · runway, tower, two hangars" x={a.terminal.x} z={a.terminal.z} tone="text-sky-300" />
          ))}
          {billboards.filter((b) => b.kind === 'banner').map((b) => (
            <PlaceRow key={b.id} title={b.airline ?? 'Aerial banner'} detail={b.ad ? `Banner: ${b.ad.headline}` : 'Banner ad space is open'} x={b.x} z={b.z} onOpen={() => setSelectedBillboard(b)} tone="text-rose-300" />
          ))}
        </ul>
      </Section>
      <Section title="Water">
        <ul className="space-y-1">
          {layout.rivers.map((r) => (
            <PlaceRow key={r.id} title={r.name} detail={`River with ${layout.bridges.length} bridges`} x={(r.x0 + r.x1) / 2} z={(r.z0 + r.z1) / 2} tone="text-sky-300" />
          ))}
          {layout.lakes.map((l) => (
            <PlaceRow key={l.id} title={l.name} detail="Lake with a road all the way round" x={l.x} z={l.z} tone="text-sky-300" />
          ))}
        </ul>
      </Section>
      <Section title="Estates">
        <ul className="space-y-1">
          {estates.map((p) => (
            <PlaceRow key={p.id} title={p.title} detail={`${tierOf(p)} · ${p.owner ? `built, ${p.owner}` : `for sale $${p.value.toLocaleString()}`}`} x={p.x} z={p.z} onOpen={() => setSelectedPlot(p, 'search')} tone={TIER_COLOUR[tierOf(p)]} />
          ))}
        </ul>
      </Section>
      <Section title="Reserved land">
        <ul className="space-y-1">
          {layout.reserved.map((a, i) => (
            <PlaceRow key={a.id} title={a.market ? `Pop-up market · ${a.code}` : `Reserved site ${a.number ?? i + 1} · ${a.code ?? ''}${a.designed ? ` · ${a.designName}` : ''}`} detail={`${(a.x1 - a.x0).toFixed(0)} × ${(a.z1 - a.z0).toFixed(0)}, beside ${roadName(a.frontRoad)}${a.market ? ' · rent a stall' : devToolsOn() ? ' · click to design (dev)' : ''}`} x={(a.x0 + a.x1) / 2} z={(a.z0 + a.z1) / 2} onOpen={a.market || devToolsOn() ? () => usePanel.getState().editReserved(a.id) : undefined} tone="text-amber-300" />
          ))}
        </ul>
      </Section>
      {layout.diagonals.length > 0 && (
        <Section title="Landmarks">
          <ul className="space-y-1">
            {layout.intersections
              .filter((i) => i.control === 'circle' && i.circle.island > 1.5)
              .map((c, i) => (
                <PlaceRow key={c.id} title={`${layout.diagonals[0].name} circle ${i + 1}`} detail="Circle with a monument" x={c.x} z={c.z} />
              ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function OnlineView() {
  const status = useNet((s) => s.status);
  const players = useNet((s) => s.players);
  const online = useNet((s) => s.online);
  const name = useNet((s) => s.name);
  const room = useNet((s) => s.room);
  const url = useNet((s) => s.url);
  const bound = useChat((s) => s.presenceAccount);
  const account = useAccount((s) => s.account);
  const [draft, setDraft] = useState('');
  const openChat = (tab) => {
    setTab(tab);
    usePanel.getState().open('chat');
  };
  const message = (p) => {
    composeTo({ to: { id: p.account, username: p.name } });
    usePanel.getState().open('chat');
  };
  return (
    <div className="text-slate-100">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">
        {status === 'online' ? `Online · city #${room} · ${Math.max(1, online)} in the city` : status === 'connecting' ? 'Connecting…' : status === 'outdated' ? 'This game is out of date: reload the page' : 'Server not reachable'}
      </p>
      <ul className="mb-3 space-y-1 text-xs">
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-300" />{bound?.username ?? (name || 'You')} {bound && <BadgeCheck className="h-3 w-3 text-sx-cyan" aria-label="signed-in account" />}<span className="text-slate-500">(you)</span></li>
        {online > players.length + 1 && <li className="text-[10px] text-slate-500">Showing the {players.length} near you; {online - players.length - 1} more are elsewhere in the city (the world map shows where).</li>}
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            {p.name}
            {p.verified ? <BadgeCheck className="h-3 w-3 text-sx-cyan" aria-label="signed-in account" /> : <span className="text-[10px] text-slate-500">(guest)</span>}
            {p.verified && p.account && apiOn() && account && p.account !== account.id && (
              <button type="button" onClick={() => message(p)} className="ml-auto rounded p-1 text-slate-400 hover:bg-sx-alt hover:text-white" aria-label={`Message ${p.name}`} title="Message privately"><MessageCircle className="h-3.5 w-3.5" /></button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => openChat('nearby')} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-sx-stroke bg-sx-alt/80 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-sx-stroke" data-testid="open-chat">
        <MessageCircle className="h-4 w-4" /> Chat with people nearby
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) setPlayerName(draft);
          setDraft('');
        }}
        className="flex gap-1"
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Change your name" maxLength={20} className="min-w-0 flex-1 rounded border border-sx-stroke bg-sx-alt px-2 py-1 text-xs text-white focus:border-sx-cyan focus:outline-none" />
        <button className="rounded bg-gradient-to-r from-sx-purple to-sx-blue px-2 py-1 text-xs font-medium text-white hover:brightness-110">Set</button>
      </form>
      {status !== 'online' && <p className="mt-2 text-[10px] text-slate-500">Start it with <code>npm run dev:all</code> ({url || 'port 3001'}). Everything else works solo.</p>}
      <a href="/admin" className="mt-3 inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline">
        <Star className="h-3 w-3" /> Open the client monitor
      </a>
      <p className="mt-3 flex items-center gap-1 text-[10px] text-slate-600">
        <MapPin className="h-3 w-3 shrink-0" />
        {apiOn() ? 'Players, cars, boats and chat are live; plots, ad spaces and accounts are kept by the game server. The Gold you earn exploring stays in this browser.' : 'Players, cars, boats and nearby chat are live. Plots and Gold are saved in this browser (no game server).'}
      </p>
    </div>
  );
}
