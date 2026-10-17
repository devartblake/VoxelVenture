"use client";

import React from 'react';
import { useChat, setTab } from '@/lib/state/chatStore';
import NearbyChat from './NearbyChat';
import Inbox from './Inbox';

// The Chat panel: Nearby (the people around you) and Inbox (private messages). The open tab, the open conversation and every
// draft stay put when you switch to another panel and back.
export default function ChatView() {
  const tab = useChat((s) => s.tab);
  const unread = useChat((s) => s.summary.unread + s.summary.requests);
  const nearbyUnseen = useChat((s) => s.nearbyUnseen);
  return (
    <div className="flex min-h-0 flex-col gap-3 text-slate-100" data-testid="chat-view">
      <div className="flex gap-1 rounded-lg bg-sx-alt/80 p-0.5" role="tablist" aria-label="Chat">
        {[['nearby', 'Nearby', nearbyUnseen], ['inbox', 'Inbox', unread]].map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`chat-tab-${id}`} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium transition ${tab === id ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:bg-sx-stroke'}`}>
            {label}
            {n > 0 && tab !== id && <span className="rounded-full bg-sx-cyan px-1.5 text-[9px] font-bold text-slate-950">{n}</span>}
          </button>
        ))}
      </div>
      {tab === 'nearby' ? <NearbyChat /> : <Inbox />}
    </div>
  );
}
