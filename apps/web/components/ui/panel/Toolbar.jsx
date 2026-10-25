"use client";

import React, { useEffect } from 'react';
import { Gift, LayoutDashboard, List, Map as MapIcon, MapPin, MessageCircle, Minus, MoreHorizontal, Plus, Search, Shirt, Trophy, Users, X } from 'lucide-react';
import CameraMenu from './CameraMenu';
import { usePanel } from '@/lib/state/panelStore';
import { useWorld } from '@/lib/state/worldStore';
import { useNet } from '@/lib/net/multiplayer';
import { apiOn } from '@/lib/data/api';
import { useAccount } from '@/lib/state/accountStore';
import { startInboxSync, useChat } from '@/lib/state/chatStore';
import { useCompactHud, useHud, useQuietHud, useSmallScreen } from '@/lib/state/hudStore';

const BUTTONS = [
  { view: 'dashboard', label: 'My businesses', Icon: LayoutDashboard },
  { view: 'directory', label: 'Directory of buildings', Icon: List },
  { view: 'stats', label: 'Statistics', Icon: Trophy },
  { view: 'search', label: 'Search', Icon: Search },
  { view: 'places', label: 'Places', Icon: MapPin },
  { view: 'play', label: 'Today and quests', Icon: Gift },
  { view: 'online', label: 'Online', Icon: Users },
  { view: 'chat', label: 'Chat and messages', Icon: MessageCircle },
  { view: 'wardrobe', label: 'Wardrobe', Icon: Shirt },
  { view: 'city', label: 'City map and guide', Icon: MapIcon },
];
// the compact HUD keeps these four in view; the rest wait behind More
const PRIMARY = ['directory', 'search', 'city', 'chat'];


// The icon bar down the right-hand side: each button opens its view in the side panel (a second press closes it).
// Below it, zoom buttons for the map. In the compact HUD (lib/state/hudStore.js) it shows the four most used tools, the camera and More.
export default function Toolbar() {
  const chosen = useCompactHud();
  const quiet = useQuietHud();
  const small = useSmallScreen();
  const compact = chosen || quiet;
  const more = useHud((s) => s.more);
  const mode = useHud((s) => s.mode);
  const view = usePanel((s) => s.view);
  const toggle = usePanel((s) => s.toggle);
  const status = useNet((s) => s.status);
  const online = useNet((s) => s.online);
  const zoomBy = useWorld((s) => s.zoomBy);
  const account = useAccount((s) => s.account);
  const waiting = useChat((s) => s.summary.unread + s.summary.requests); // private messages to read and requests to answer
  const nearbyUnseen = useChat((s) => s.nearbyUnseen);
  // while signed in, keep the unread count fresh (the presence server's nudges do most of it)
  useEffect(() => (apiOn() && account ? startInboxSync() : undefined), [account]);

  // 44 px on a touch screen (the usual smallest comfortable target), 40 px with a mouse
  const button = (active) =>
    `relative flex h-10 w-10 items-center justify-center rounded-lg transition pointer-coarse:h-11 pointer-coarse:w-11 ${active ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:bg-sx-alt hover:text-white'}`;
  const shown = compact && (!more || quiet) ? BUTTONS.filter((b) => PRIMARY.includes(b.view) || b.view === view) : BUTTONS;
  // clear of a notch or rounded corner in landscape (safe-area insets; 0 on most screens)
  const edge = { right: 'max(0.5rem, env(safe-area-inset-right))' };

  return (
    <>
      <nav aria-label="Tools" style={edge} className="absolute top-16 z-20 flex max-h-[calc(100dvh-5rem)] flex-col gap-1 overflow-y-auto rounded-xl max-sm:max-h-[calc(100dvh-14rem)] short:top-[4.75rem] short:max-h-none short:max-w-[calc(100vw-1rem)] short:flex-row short:overflow-x-auto border border-sx-stroke bg-sx-page/90 p-1 shadow-2xl backdrop-blur-md max-sm:top-14" data-testid="toolbar" data-compact={compact ? 'true' : 'false'}>
        {shown.map(({ view: v, label, Icon }) => (
          <button key={v} onClick={() => (toggle(v), useHud.getState().closeMore())} title={label} aria-label={label} aria-pressed={view === v} className={button(view === v)} data-tool={v}>
            <Icon className="h-[18px] w-[18px]" />
            {v === 'online' && (
              <span className={`absolute -right-0.5 -top-0.5 min-w-4 rounded-full px-1 text-center text-[9px] font-bold leading-4 ${status === 'online' ? 'bg-green-500 text-slate-950' : 'bg-sx-line text-slate-200'}`}>
                {status === 'online' ? Math.max(1, online) : 1}
              </span>
            )}
            {v === 'chat' && waiting > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-sx-cyan px-1 text-center text-[9px] font-bold leading-4 text-slate-950" data-testid="chat-badge">{waiting > 99 ? '99+' : waiting}</span>
            )}
            {v === 'chat' && !waiting && nearbyUnseen > 0 && view !== 'chat' && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sx-cyan" aria-hidden="true" />}
          </button>
        ))}
        {(compact || small) && !quiet && <CameraMenu className={button(false)} />}
        {compact && !quiet && (
          <button type="button" onClick={() => useHud.getState().toggleMore()} title={more ? 'Fewer tools' : 'More tools and HUD settings'} aria-label={more ? 'Fewer tools' : 'More tools and HUD settings'} aria-expanded={more} className={button(more)} data-testid="hud-more">
            {more ? <X className="h-[18px] w-[18px]" /> : <MoreHorizontal className="h-[18px] w-[18px]" />}
          </button>
        )}
        {!quiet && (more || (!compact && (small || mode !== 'auto'))) && <HudSetting mode={mode} />}
      </nav>
      {!compact && !small && (
        <div style={edge} className="absolute top-[34.5rem] z-20 flex flex-col gap-1 rounded-xl border border-sx-stroke bg-sx-page/90 p-1 shadow-2xl backdrop-blur-md max-sm:top-[31rem]">
          <CameraMenu className={button(false)} />
        </div>
      )}
      <div className="absolute bottom-24 right-3 z-20 flex flex-col gap-1 rounded-xl border border-sx-stroke bg-sx-page/90 p-1 shadow-2xl backdrop-blur-md pointer-coarse:hidden">
        <button onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in" className={button(false)}>
          <Plus className="h-[18px] w-[18px]" />
        </button>
        <button onClick={() => zoomBy(0.8)} title="Zoom out" aria-label="Zoom out" className={button(false)}>
          <Minus className="h-[18px] w-[18px]" />
        </button>
      </div>
    </>
  );
}

// The HUD's own setting, at the end of the tool bar: compact or full (auto: compact on small screens), and a reset to auto.
function HudSetting({ mode }) {
  const setMode = useHud((s) => s.setMode);
  const next = mode === 'full' ? 'compact' : 'full';
  return (
    <div className="mt-1 flex flex-col items-center gap-0.5 border-t border-sx-stroke pt-1 text-[9px] text-slate-400 short:mt-0 short:justify-center short:border-l short:border-t-0 short:pl-1 short:pt-0" data-testid="hud-setting">
      <button type="button" onClick={() => setMode(next)} className="w-full rounded px-0.5 py-1 leading-tight hover:bg-sx-alt hover:text-white pointer-coarse:min-h-11" title={`Show the ${next} HUD`} aria-label={`Show the ${next} HUD`} data-testid="hud-mode">
        {next === 'full' ? 'Full HUD' : 'Compact'}
      </button>
      {mode !== 'auto' && (
        <button type="button" onClick={() => useHud.getState().reset()} className="w-full rounded px-0.5 py-1 leading-tight hover:bg-sx-alt hover:text-white pointer-coarse:min-h-11" title="Back to the automatic HUD (compact on small screens)" aria-label="Reset the HUD" data-testid="hud-reset">
          Reset
        </button>
      )}
    </div>
  );
}
