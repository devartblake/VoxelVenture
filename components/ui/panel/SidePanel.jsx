"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2, X } from 'lucide-react';
import { SELECTION_VIEWS, VIEWS, usePanel } from '@/lib/state/panelStore';
import { useCityStore } from '@/lib/state/store';
import { CityView, PlayView } from '@/components/ui/Legend';
import PlotCard from '@/components/ui/PlotCard';
import ParkCard from '@/components/ui/ParkCard';
import BillboardCard from '@/components/ui/BillboardCard';
import Wardrobe from '@/components/ui/Wardrobe';
import SitesView from './SitesView';
import DirectoryView from './DirectoryView';
import DashboardView from './DashboardView';
import AccountView from './AccountView';
import MallView from './MallView';
import CreditsView from './CreditsView';
import ChatView from '@/components/ui/chat/ChatView';
import { OnlineView, PlacesView, SearchView, StatsView } from './views';

const WIDTH = { normal: 440, expanded: 760 };

// The side panel. Every toolbar button, and selecting a plot, park or ad space, opens its view in this one panel.
// It has a back arrow (to the view before), expand / shrink, and close; on a computer the header is a handle:
// drag it anywhere (double-click it to put the panel back). On a phone it is a sheet along the bottom.
export default function SidePanel() {
  const view = usePanel((s) => s.view);
  const history = usePanel((s) => s.history);
  const expanded = usePanel((s) => s.expanded);
  const pos = usePanel((s) => s.pos);
  const { open, back, close, toggleExpanded, setPos, hydrate } = usePanel.getState();

  const selectedPlot = useCityStore((s) => s.selectedPlot);
  const selectedPark = useCityStore((s) => s.selectedPark);
  const selectedBillboardId = useCityStore((s) => s.selectedBillboardId);
  const clearSelection = useCityStore((s) => s.clearSelectedPlot);
  const setWardrobeOpen = useCityStore((s) => s.setWardrobeOpen);

  const [small, setSmall] = useState(false);
  const panel = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    hydrate();
    const q = window.matchMedia('(max-width: 639px)');
    const update = () => setSmall(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, [hydrate]);

  // selecting something in the city shows it in the panel; deselecting takes it away again
  const selectionKey = selectedPlot ? `plot-${selectedPlot.id}` : selectedPark ? `park-${selectedPark.id}` : selectedBillboardId ? `ad-${selectedBillboardId}` : null;
  useEffect(() => {
    const current = usePanel.getState().view;
    if (selectedPlot) open('plot');
    else if (selectedPark) open('park');
    else if (selectedBillboardId) open('billboard');
    else if (SELECTION_VIEWS.includes(current)) back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  // the avatar stops reacting to the keyboard while the wardrobe is open
  useEffect(() => {
    setWardrobeOpen(view === 'wardrobe');
  }, [view, setWardrobeOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (SELECTION_VIEWS.includes(usePanel.getState().view)) clearSelection();
      else if (usePanel.getState().view) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, close]);

  if (!view) return null;

  const isSelection = SELECTION_VIEWS.includes(view);
  const onClose = () => {
    if (isSelection) clearSelection(); // the selection effect then goes back to what was showing before
    else close();
  };

  const width = expanded ? WIDTH.expanded : WIDTH.normal;
  const style = small
    ? undefined
    : { left: pos ? pos.x : 12, top: pos ? pos.y : 64, width, maxHeight: `calc(100dvh - ${(pos ? pos.y : 64) + 12}px)` };

  // dragging by the header (computers only)
  const startDrag = (e) => {
    if (small || e.target.closest('button')) return;
    const rect = panel.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e) => {
    if (!drag.current) return;
    const x = Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 120);
    const y = Math.min(Math.max(8, e.clientY - drag.current.dy), window.innerHeight - 80);
    usePanel.setState({ pos: { x, y } });
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setPos(usePanel.getState().pos);
  };

  return (
    <aside
      ref={panel}
      data-testid="side-panel"
      style={style}
      className="absolute z-30 flex flex-col overflow-hidden rounded-2xl border border-sx-stroke bg-gradient-to-b from-[#15104a]/95 via-sx-page/95 to-[#02040d]/97 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-md max-sm:inset-x-2 max-sm:bottom-2 max-sm:max-h-[62dvh]"
    >
      <header
        className={`relative flex shrink-0 items-center gap-1 border-b border-sx-stroke bg-sx-panel/70 px-2 py-2.5 ${small ? '' : 'cursor-move select-none'}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          if (!small && !e.target.closest('button')) setPos(null);
        }}
        title={small ? undefined : 'Drag to move · double-click to reset'}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sx-purple via-sx-blue to-sx-cyan" />
        {history.length > 0 ? (
          <button onClick={back} className="rounded-md p-1.5 text-slate-300 hover:bg-sx-alt hover:text-white" aria-label="Back" title="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <h2 className="flex flex-1 items-center gap-2 truncate text-xs font-bold uppercase tracking-[0.18em] text-slate-100"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sx-cyan shadow-[0_0_8px_#22d3ee]" />{VIEWS[view]}</h2>
        {!small && (
          <button onClick={toggleExpanded} className="rounded-md p-1.5 text-slate-300 hover:bg-sx-alt hover:text-white" aria-label={expanded ? 'Shrink the panel' : 'Expand the panel'} title={expanded ? 'Shrink' : 'Expand'}>
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
        <button onClick={onClose} className="rounded-md p-1.5 text-slate-300 hover:bg-sx-alt hover:text-white" aria-label="Close" title="Close">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {view === 'directory' && <DirectoryView />}
        {view === 'account' && <AccountView />}
        {view === 'dashboard' && <DashboardView />}
        {view === 'city' && <CityView />}
        {view === 'stats' && <StatsView />}
        {view === 'search' && <SearchView />}
        {view === 'places' && <PlacesView />}
        {view === 'online' && <OnlineView />}
        {view === 'chat' && <ChatView />}
        {view === 'play' && <PlayView />}
        {view === 'wardrobe' && <Wardrobe />}
        {view === 'plot' && <PlotCard />}
        {view === 'park' && <ParkCard />}
        {view === 'billboard' && <BillboardCard />}
        {view === 'reserved' && <SitesView />}
        {view === 'mall' && <MallView />}
        {view === 'credits' && <CreditsView />}
      </div>
    </aside>
  );
}
