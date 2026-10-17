"use client";

import React, { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { apiOn } from '@/lib/data/api';
import { retryNearby, sendNearby, useNet } from '@/lib/net/multiplayer';
import { useAccount } from '@/lib/state/accountStore';
import { blockAccount, composeTo, hidePlayer, reportMessage, seenNearby, setNearbyDraft, useChat } from '@/lib/state/chatStore';
import { Composer, MessageMenu, QUIET, Who, when } from './parts';

// Nearby: what the players around you say, and what you say to them. Nothing here is saved for you: it is gone when you change city
// or reload. (A signed-in player's lines are kept a week on the server, only so a report can be checked.)
export default function NearbyChat() {
  const status = useNet((s) => s.status);
  const lines = useChat((s) => s.nearby);
  const hidden = useChat((s) => s.hidden);
  const draft = useChat((s) => s.nearbyDraft);
  const features = useChat((s) => s.features);
  const bound = useChat((s) => s.presenceAccount);
  const account = useAccount((s) => s.account);
  const list = useRef(null);

  useEffect(() => {
    seenNearby();
  }, [lines.length]);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const online = status === 'online';
  const needsSignIn = online && features && !features.guestChat && !bound;
  const canAct = apiOn() && Boolean(account);
  const shown = lines.filter((l) => l.mine || !hidden[l.connId]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <p className="text-[10px] text-slate-400">
        {online ? `Players within about ${features?.chatRadius ?? 60} m of you hear you. Not saved: it is gone when you leave.` : status === 'connecting' ? 'Connecting to the city…' : 'Chat needs the multiplayer server.'}
      </p>
      <ul ref={list} role="log" aria-live="polite" aria-relevant="additions" aria-label="Nearby chat" data-testid="chat-log" className="max-h-72 min-h-24 space-y-1.5 overflow-y-auto rounded-xl border border-sx-alt bg-sx-panel/50 p-2 text-[11px]">
        {shown.length === 0 && <li className="text-slate-500">Nobody has said anything yet. Walk up to someone and say hello.</li>}
        {shown.map((l) => (
          <li key={l.key} className="group">
            <div className="flex items-baseline gap-1.5">
              <Who name={l.name} verified={l.verified} mine={l.mine} />
              <span className="text-[9px] text-slate-500">{when(l.at)}</span>
              {!l.mine && (
                <span className="ml-auto opacity-60 group-hover:opacity-100 focus-within:opacity-100">
                  <MessageMenu
                    label={`Actions for ${l.name}'s message`}
                    actions={[
                      canAct && l.account && { label: 'Message privately', run: async () => composeTo({ to: { id: l.account, username: l.name } }), doneText: 'Opening…' },
                      { label: 'Hide this player (this visit)', run: async () => hidePlayer(l.connId), doneText: 'Hidden.' },
                      canAct && l.account && { label: 'Block', danger: true, run: () => blockAccount(l.account), doneText: 'Blocked. You will not hear each other.' },
                      canAct && l.verified && /^n\d+$/.test(l.messageId ?? '') && { label: 'Report…', danger: true, report: true, run: (category) => reportMessage(l.messageId, category) },
                    ]}
                  />
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words text-slate-200">{l.text}</p>
            {l.mine && l.state === 'pending' && <p className="text-[9px] text-slate-500">Sending…</p>}
            {l.mine && l.state === 'failed' && (
              <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-amber-300">
                {l.error}
                {l.code !== 'content_rejected' && l.code !== 'unauthenticated' && (
                  <button type="button" onClick={() => retryNearby(l.clientMessageId)} disabled={!online} className="inline-flex items-center gap-0.5 underline disabled:opacity-40">
                    <RotateCcw className="h-2.5 w-2.5" /> Retry
                  </button>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
      {needsSignIn ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-sx-stroke bg-sx-alt/40 p-2 text-[11px] text-slate-300">
          <span>{apiOn() ? 'Sign in to chat. Reading is open to everyone.' : 'Chat on this server is for signed-in players.'}</span>
          {apiOn() && !account && <button type="button" onClick={() => useAccount.getState().ask()} className={QUIET}>Sign in</button>}
          {apiOn() && account && <span className="text-slate-500">Connecting your account…</span>}
        </div>
      ) : (
        <Composer
          value={draft}
          onChange={setNearbyDraft}
          onSend={() => {
            if (sendNearby(draft)) setNearbyDraft('');
          }}
          max={features?.chatMax ?? 140}
          disabled={!online}
          placeholder={online ? 'Say something to people nearby' : 'Chat needs the multiplayer server'}
          label="Chat message"
        />
      )}
    </div>
  );
}
