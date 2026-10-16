"use client";

import React, { useEffect } from 'react';
import { Gift, LayoutDashboard, List, Map as MapIcon, MapPin, MessageCircle, Minus, Plus, Search, Shirt, Trophy, Users } from 'lucide-react';
import CameraMenu from './CameraMenu';
import { usePanel } from '@/lib/state/panelStore';
import { useWorld } from '@/lib/state/worldStore';
import { useNet } from '@/lib/net/multiplayer';
import { apiOn } from '@/lib/data/api';
import { useAccount } from '@/lib/state/accountStore';
import { startInboxSync, useChat } from '@/lib/state/chatStore';

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

// The icon bar down the right-hand side: each button opens its view in the side panel (a second press closes it).
// Below it, zoom buttons for the map.
export default function Toolbar() {
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

  const button = (active) =>
    `relative flex h-10 w-10 items-center justify-center rounded-lg transition max-sm:h-9 max-sm:w-9 ${active ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:bg-sx-alt hover:text-white'}`;

  return (
    <>
      <nav aria-label="Tools" className="absolute right-3 top-16 z-20 flex flex-col gap-1 rounded-xl border border-sx-stroke bg-sx-page/90 p-1 shadow-2xl backdrop-blur-md max-sm:right-2 max-sm:top-14">
        {BUTTONS.map(({ view: v, label, Icon }) => (
          <button key={v} onClick={() => toggle(v)} title={label} aria-label={label} aria-pressed={view === v} className={button(view === v)} data-tool={v}>
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
      </nav>
      <div className="absolute right-3 top-[32.25rem] z-20 flex flex-col gap-1 rounded-xl border border-sx-stroke bg-sx-page/90 p-1 shadow-2xl backdrop-blur-md max-sm:right-2 max-sm:top-[29rem]">
        <CameraMenu className={button(false)} />
      </div>
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
