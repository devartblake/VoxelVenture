"use client";

import React, { useEffect, useState } from 'react';
import { Crown, Map as MapIcon, Shuffle } from 'lucide-react';
import { useCommunity } from '@/lib/state/communityStore';
import { timeLeft } from '@/lib/game/buildingOfWeek';
import { useCityStore } from '@/lib/state/store';
import { useMap } from '@/lib/state/mapStore';
import MiniMap, { ZOOMS, useMapZoom } from './MiniMap';
import { usePanel } from '@/lib/state/panelStore';
import { useHudExtrasShown } from '@/lib/state/hudStore';
import { scavengerHunt } from '@/lib/game/daily';

const TAB_KEY = 'voxelventure-map-tab';
const COMPACT_SIZE = 132; // big enough to read the streets round you (the map follows you now, so it shows detail)

// The panel's notes, grouped so no single list grows past the panel: what is in the city, how its
// roads work, and what you can do in it.
const TABS = [
  { id: 'places', label: 'Places' },
  { id: 'roads', label: 'Roads' },
];

const Em = ({ children }) => <span className="text-slate-200">{children}</span>;

function Swatch({ color, className = '' }) {
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${className}`} style={color ? { background: color } : undefined} />;
}

function PlacesTab({ plots, layout }) {
  const count = (type) => plots.filter((p) => p.buildingType === type).length;
  const prime = plots.filter((p) => p.prime && !p.luxury);
  const luxury = plots.filter((p) => p.luxury && !p.grand);
  const grand = plots.filter((p) => p.grand);
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {layout.districts.map((d) => {
          const inDistrict = plots.filter((p) => p.districtId === d.id);
          const claimed = inDistrict.filter((p) => p.owner).length;
          return (
            <li key={d.id} className="flex items-center gap-2 text-xs">
              <Swatch color={d.color} />
              <span className="flex-1 truncate">{d.name}</span>
              <span className="font-mono text-slate-400">{claimed}/{inDistrict.length}</span>
            </li>
          );
        })}
        {layout.parks.map((park) => (
          <li key={park.id} className="flex items-center gap-2 text-xs">
            <Swatch className="bg-green-500" />
            <span className="flex-1 truncate">{park.name}</span>
            <span className="font-mono text-slate-400">park</span>
          </li>
        ))}
      </ul>

      <ul className="space-y-1 border-t border-sx-alt pt-2 text-[11px] text-slate-400">
        <li className="flex items-center gap-2"><Swatch color="#dc2626" /><span className="flex-1"><Em>Restaurants</Em> (red awning)</span><span className="font-mono">{count('restaurant')}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#f59e0b" /><span className="flex-1"><Em>Shops</Em> (amber awning)</span><span className="font-mono">{count('shop')}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#38bdf8" /><span className="flex-1"><Em>Offices</Em> (glass band)</span><span className="font-mono">{count('office')}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#0ea5e9" /><span className="flex-1"><Em>Waterfront</Em> (round the lakes)</span><span className="font-mono">{plots.filter((p) => p.districtId === 'lakeside').length}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#65a30d" /><span className="flex-1"><Em>Countryside</Em> (farm stands &amp; cafes)</span><span className="font-mono">{plots.filter((p) => p.districtId === 'countryside').length}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#f43f5e" /><span className="flex-1"><Em>Grand Diagonal</Em> (round the circles)</span><span className="font-mono">{plots.filter((p) => p.districtId === 'diagonal').length}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#06b6d4" /><span className="flex-1"><Em>Riverside</Em> (along the river)</span><span className="font-mono">{plots.filter((p) => p.districtId === 'riverside').length}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#fde68a" /><span className="flex-1"><Em>Grand estates</Em> (the high-end flagships, built)</span><span className="font-mono">{grand.length}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#c084fc" /><span className="flex-1"><Em>Luxury estates</Em> (violet rim, pillars, {luxury.filter((p) => !p.owner).length} for sale)</span><span className="font-mono">{luxury.length}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#fbbf24" /><span className="flex-1"><Em>Prime plots</Em> (gold rim, {prime.filter((p) => !p.owner).length} for sale)</span><span className="font-mono">{prime.length}</span></li>
        <li className="flex items-center gap-2"><Swatch color="#a8a29e" /><span className="flex-1"><Em>Houses</Em> (Old Town)</span><span className="font-mono">{count('house')}</span></li>
      </ul>

      <div className="space-y-1 border-t border-sx-alt pt-2 text-[11px] text-slate-400">
        <p><Em>Solid block</Em> = claimed · <Em>wireframe</Em> = empty lot.</p>
        <p><Em>Green-tinted plots</Em> border the park (+25% traffic).</p>
        <p><Em>Downtown</Em> (slate ground) has the tallest buildings; they get lower towards the edge, then give way to <Em>farmland and woods</Em>.</p>
        <p><Em>Rectangular lakes</Em> and a <Em>river</Em> cut through the country; the avatar can't wade in, but the river has bridges.</p>
        <p><Em>Amber dashed area</Em> south of Old Town is land kept free for your own road and plot.</p>
      </div>
    </div>
  );
}

function RoadsTab({ layout }) {
  const streets = layout.roads.filter((r) => r.kind === 'street');
  const count = (control) => layout.intersections.filter((i) => i.control === control).length;
  const crossings = layout.crossings.length;
  return (
    <div className="space-y-3 text-[11px] text-slate-400">
      <div className="space-y-1">
        <p><Em>Avenues</Em> run east–west, coloured by district.</p>
        <p><Em>Cross streets</Em> (white dashes): {streets.map((s) => s.name).join(', ')}.</p>
        <p><Em>No dead ends:</Em> every road starts and ends at a junction. Where one stops against another it makes a <Em>T</Em>; where two stop at each other it makes a <Em>corner</Em> with the sidewalk wrapped round it.</p>
        <p><Em>Ring roads</Em> (North, South, East and West) wrap the city; the arterials carry on across the country to the <Em>county road</Em>, which loops round everything. Old Town is closed in by its own roads.</p>
        <p><Em>Lake loops</Em> ring each lake with a closed road, joined to the network by a spur at a T-junction, with waterfront lots on the outside.</p>
        <p><Em>Bridges</Em> carry the roads over the river.</p>
        {layout.diagonals.length > 0 && <p><Em>{layout.diagonals[0].name}</Em> cuts diagonally across the grid, from circle to circle: a big circle with a monument wherever it meets an avenue. Two small circles replace the old roundabouts.</p>}
        <p><Em>Arterials</Em> (solid double line) are the through roads; <Em>local</Em> roads are dashed.</p>
      </div>

      <ul className="space-y-1 border-t border-sx-alt pt-2">
        <li className="flex justify-between"><span><Em>Signals</Em> (arterial × arterial)</span><span className="font-mono">{count('signal')}</span></li>
        <li className="flex justify-between"><span><Em>Two-way stops</Em> (local road stops)</span><span className="font-mono">{count('two-way-stop')}</span></li>
        <li className="flex justify-between"><span><Em>All-way stops</Em> (local × local)</span><span className="font-mono">{count('all-way-stop')}</span></li>
        <li className="flex justify-between"><span><Em>T-junctions</Em></span><span className="font-mono">{layout.intersections.filter((i) => Object.values(i.arms).filter(Boolean).length === 3).length}</span></li>
        <li className="flex justify-between"><span><Em>Corners</Em> (two roads meeting end to end)</span><span className="font-mono">{layout.intersections.filter((i) => Object.values(i.arms).filter(Boolean).length === 2).length}</span></li>
        <li className="flex justify-between"><span><Em>Circles</Em> (yield on entry)</span><span className="font-mono">{count('circle')}</span></li>
        <li className="flex justify-between"><span><Em>Mid-block crossings</Em> (blue signs)</span><span className="font-mono">{crossings}</span></li>
      </ul>

      <p className="border-t border-sx-alt pt-2">
        Cars and people follow all of this: they stop at red lights and stop signs, and give way to anyone on a zebra crossing, including you.
      </p>
    </div>
  );
}

const NO_STARS = []; // a stable empty list: a selector must not return a new array each time

function HuntClues() {
  const day = useCityStore((s) => s.day);
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  const found = useCityStore((s) => (s.daily.huntDay === s.day ? s.daily.huntFound : NO_STARS));
  if (!day) return null;
  const spots = scavengerHunt(layout, plots, layout.seed, day);
  return (
    <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Today's hunt: {found.length}/{spots.length} stars</p>
      <ul className="space-y-0.5">
        {spots.map((s) => (
          <li key={s.index} className={found.includes(s.index) ? 'text-slate-500 line-through' : 'text-slate-200'}>
            {found.includes(s.index) ? '★' : '☆'} {s.clue}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The weekly vote, at the top of Today & quests: who leads, how long is left, and the way into the Building of the Week panel.
function WeekTeaser() {
  const votes = useCommunity((s) => s.votes);
  if (!votes) return null;
  const top = votes.leaders[0];
  return (
    <button type="button" onClick={() => usePanel.getState().open('week')} className="flex w-full items-center gap-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-left hover:bg-yellow-400/15" data-testid="week-teaser">
      <Crown className="h-4 w-4 shrink-0 text-yellow-300" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-yellow-100">Building of the Week: vote</span>
        <span className="block truncate text-[10px] text-yellow-200/80">{top ? `${top.title} leads with ${top.votes}` : 'No votes yet'} · closes in {timeLeft(votes.endsAt)}{votes.votesLeft > 0 ? ` · ${votes.votesLeft} vote${votes.votesLeft === 1 ? '' : 's'} left` : ''}</span>
      </span>
      <span className="text-yellow-200/70">›</span>
    </button>
  );
}

function PlayTab({ billboards }) {
  return (
    <div className="space-y-2 text-[11px] text-slate-400">
      <WeekTeaser />
      <HuntClues />
      <p><Em>Move:</Em> WASD / arrows (Shift runs), or click the ground. <Em>E</Em> interacts, <Em>1 2 3</Em> are emotes. On a phone: the joystick walks, the run and interact buttons sit beside it, tap the ground to walk there, drag to pan, pinch to zoom.</p>
      <p><Em>Today:</Em> a gold gem marks the Plot of the Day (walk in for +20 Gold; gold ring on the map). A gold dot is the daily chest (E to open).</p>
      <p><Em>Billboards</Em> ({billboards.filter((b) => !b.kind).length}, at the start of the arterials): click one to see the ad, earn Gold or take the slot over for 1.25× ({billboards.filter((b) => !b.kind && !b.ad).length} open).</p>
      <p><Em>Aerial banners:</Em> two planes fly between the airports towing an ad across the city. Click a plane or its banner to see the ad, or buy the ad space ({billboards.filter((b) => b.kind === 'banner' && !b.ad).length} open).</p>
      <p><Em>Take over</Em> a business that isn't yours for 1.25×. The old owner is paid and moves to <Em>Old Town</Em>, the grey houses past the East Ring.</p>
      <p><Em>Gold</Em> buys clothes, hats and emotes in the Wardrobe.</p>
    </div>
  );
}

// The compact round map in the corner. Clicking it opens the city guide in the side panel (it hides while the guide is showing).
export function MiniMapButton() {
  const view = usePanel((s) => s.view);
  const level = useMapZoom((s) => s.level);
  const zoom = useMapZoom((s) => s.zoom);
  const shown = useHudExtrasShown();
  useEffect(() => {
    useMapZoom.getState().hydrate();
  }, []);
  if (view === 'city' || !shown) return null;
  return (
    <aside style={{ marginLeft: 'env(safe-area-inset-left)' }} className="absolute bottom-6 left-6 z-20 rounded-full border border-sx-stroke bg-sx-panel/90 p-1 shadow-2xl backdrop-blur-md max-sm:bottom-auto max-sm:left-2 max-sm:top-14" data-testid="minimap">
      <button onClick={() => useMap.getState().toggle()} className="block rounded-full" title="Open the world map (M)" aria-label="Open the world map">
        <MiniMap size={COMPACT_SIZE} follow />
      </button>
      <div className="absolute -right-3 top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-sx-stroke bg-sx-panel/95 text-slate-200 shadow-lg" title={`${ZOOMS[level].label}: how much of the city the map shows`}>
        <button type="button" onClick={() => zoom(-1)} disabled={level === 0} aria-label="Map closer" className="px-1.5 py-0.5 text-sm leading-none hover:bg-sx-alt disabled:opacity-30 pointer-coarse:px-3 pointer-coarse:py-2.5">
          +
        </button>
        <button type="button" onClick={() => zoom(1)} disabled={level === ZOOMS.length - 1} aria-label="Map wider" className="border-t border-sx-stroke px-1.5 py-0.5 text-sm leading-none hover:bg-sx-alt disabled:opacity-30 pointer-coarse:px-3 pointer-coarse:py-2.5">
          −
        </button>
      </div>
    </aside>
  );
}

// The city guide: the round map, what is in the city and how its roads work.
export function CityView() {
  const [tab, setTab] = useState('places');
  const plots = useCityStore((s) => s.plots);
  const layout = useCityStore((s) => s.layout);
  const regenerateCity = useCityStore((s) => s.regenerateCity);
  useEffect(() => {
    try {
      const savedTab = localStorage.getItem(TAB_KEY);
      if (TABS.some((t) => t.id === savedTab)) setTab(savedTab);
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);
  const pickTab = (id) => {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="text-slate-100">
      <button
        type="button"
        onClick={() => useMap.getState().openMap()}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-sx-stroke bg-sx-alt/80 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-sx-stroke"
        data-testid="open-world-map"
      >
        <MapIcon className="h-4 w-4" /> Open the world map <kbd className="rounded bg-sx-page px-1.5 py-0.5 font-mono text-[10px]">M</kbd>
      </button>

      <div className="mb-2 flex gap-1 rounded-lg bg-sx-alt/80 p-0.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pickTab(t.id)}
            className={`flex-1 rounded-md py-1 text-[11px] font-medium transition ${tab === t.id ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:bg-sx-stroke'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mb-3 pr-1">
        {tab === 'places' && <PlacesTab plots={plots} layout={layout} />}
        {tab === 'roads' && <RoadsTab layout={layout} />}
      </div>

      <button
        onClick={() => regenerateCity()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-sx-stroke bg-sx-alt py-1.5 text-xs font-medium text-slate-200 transition hover:bg-sx-stroke"
      >
        <Shuffle className="h-3.5 w-3.5" />
        Regenerate city
        <span suppressHydrationWarning className="font-mono text-[10px] text-slate-500">#{layout.seed}</span>
      </button>
      <button onClick={() => usePanel.getState().open('credits')} className="mt-2 w-full text-center text-[11px] text-slate-400 hover:text-white" data-testid="open-credits">
        Credits &amp; licences
      </button>
    </div>
  );
}

// Today's hunt, how to play, billboards and banners.
export function PlayView() {
  const billboards = useCityStore((s) => s.billboards);
  return <PlayTab billboards={billboards} />;
}
