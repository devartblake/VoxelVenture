"use client";

import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Bell, BellOff, RotateCcw, Store, X } from 'lucide-react';
import { usePanel } from '@/lib/state/panelStore';
import { blockAccount, closeConversation, discardOutgoing, loadOlder, markRead, reportMessage, respondRequest, retryInbox, sendInbox, setDraft, setMuted, useChat } from '@/lib/state/chatStore';
import { INBOX_MAX } from './limits';
import { BUTTON, Composer, MessageMenu, QUIET, Who, when } from './parts';

// One conversation: its messages (older ones on demand), a request to answer if it is one, and the box to reply in.
export default function Conversation({ id }) {
  const c = useChat((s) => s.conversations[id]);
  const messages = useChat((s) => s.messages[id]) ?? [];
  const more = useChat((s) => s.more[id]);
  const outgoing = useChat((s) => s.outgoing[id]) ?? [];
  const draft = useChat((s) => s.drafts[id]) ?? '';
  const panelOpen = usePanel((s) => s.view === 'chat');
  const list = useRef(null);
  const newestId = messages[messages.length - 1]?.id;

  // keep the newest message in view as messages arrive
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId, outgoing.length]);

  // Read only advances while this conversation is on screen with its newest messages showing (and the page is visible).
  useEffect(() => {
    if (!newestId || !panelOpen) return;
    const mark = () => {
      const el = list.current;
      const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      if (document.visibilityState === 'visible' && atBottom) markRead(id, newestId);
    };
    mark();
    const el = list.current;
    el?.addEventListener('scroll', mark);
    document.addEventListener('visibilitychange', mark);
    return () => {
      el?.removeEventListener('scroll', mark);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [id, newestId, panelOpen]);

  if (!c) return <p className="text-[11px] text-slate-500">Loading…</p>;
  const other = c.other?.username ?? 'Someone';
  const isRequest = c.status === 'pending';
  const cannotSend = c.blocked || (c.waiting && !isRequest);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={closeConversation} className="rounded-md p-1 text-slate-300 hover:bg-sx-alt hover:text-white" aria-label="Back to the inbox"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-white">{other}</p>
          {c.plot && <p className="flex items-center gap-1 truncate text-[10px] text-violet-300"><Store className="h-3 w-3" /> About {c.plot.title}{c.plot.youOwnedIt ? ' (your building when they asked)' : ''}</p>}
        </div>
        <button type="button" onClick={() => setMuted(id, !c.muted)} className="rounded-md p-1 text-slate-300 hover:bg-sx-alt hover:text-white" aria-pressed={c.muted} aria-label={c.muted ? 'Unmute: show alerts again' : 'Mute: no alerts (messages still arrive)'} title={c.muted ? 'Muted: messages arrive without an alert' : 'Mute alerts'}>
          {c.muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        </button>
        {c.other && !c.blocked && (
          <MessageMenu label={`More for ${other}`} actions={[{ label: `Block ${other}`, danger: true, run: () => blockAccount(c.other.id), doneText: 'Blocked.' }]} />
        )}
      </div>

      {isRequest && (
        <div className="rounded-xl border border-sx-cyan/40 bg-sx-cyan/10 p-2 text-[11px] text-slate-200">
          <p className="mb-1.5">{other} wants to {c.kind === 'business_inquiry' ? 'ask about your building' : 'message you'}. They cannot see whether you have read it. Replying accepts.</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => respondRequest(id, 'accept')} className={BUTTON}>Accept</button>
            <button type="button" onClick={() => respondRequest(id, 'decline')} className={QUIET}>Decline</button>
            <button type="button" onClick={() => blockAccount(c.other.id).then(() => respondRequest(id, 'decline'))} className={`${QUIET} text-rose-300`}>Block</button>
          </div>
        </div>
      )}

      <ul ref={list} role="log" aria-live="polite" aria-relevant="additions" aria-label={`Messages with ${other}`} className="max-h-80 min-h-32 space-y-2 overflow-y-auto rounded-xl border border-sx-alt bg-sx-panel/50 p-2 text-[11px]">
        {more && (
          <li className="text-center">
            <button type="button" onClick={() => loadOlder(id)} className={QUIET}>Load older messages</button>
          </li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
            <span className="flex items-center gap-1 text-[9px] text-slate-500">
              {!m.mine && <Who name={m.sender.username} verified />}
              {when(m.at)}
              {!m.mine && m.text && (
                <MessageMenu label="Actions for this message" actions={[{ label: 'Report…', danger: true, report: true, run: (category) => reportMessage(m.ref, category) }]} />
              )}
            </span>
            <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-2.5 py-1.5 ${m.mine ? 'bg-gradient-to-r from-sx-purple/80 to-sx-blue/80 text-white' : 'bg-sx-alt text-slate-100'} ${m.text === null ? 'italic text-slate-400' : ''}`}>
              {m.text ?? (m.state === 'removed' ? 'Removed by a moderator' : 'This message has expired')}
            </p>
          </li>
        ))}
        {outgoing.map((o) => (
          <li key={o.clientMessageId} className="flex flex-col items-end">
            <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-sx-alt/60 px-2.5 py-1.5 text-slate-300">{o.text}</p>
            {o.state === 'pending' ? (
              <span className="text-[9px] text-slate-500">Sending…</span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] text-amber-300">
                {o.error}
                {o.code !== 'content_rejected' && o.code !== 'not_allowed' && o.code !== 'request_pending' && (
                  <button type="button" onClick={() => retryInbox(id, o.clientMessageId)} className="inline-flex items-center gap-0.5 underline"><RotateCcw className="h-2.5 w-2.5" /> Retry</button>
                )}
                <button type="button" onClick={() => discardOutgoing(id, o.clientMessageId)} className="inline-flex items-center underline" aria-label="Discard this message"><X className="h-2.5 w-2.5" /></button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {c.blocked ? (
        <p className="text-[11px] text-slate-500">You blocked {other}. Unblock them in chat settings to write again.</p>
      ) : cannotSend ? (
        <p className="text-[11px] text-slate-500">Waiting for {other} to accept. You can send more once they do.</p>
      ) : (
        <Composer
          value={draft}
          onChange={(t) => setDraft(id, t)}
          onSend={() => {
            const text = draft;
            setDraft(id, '');
            sendInbox(id, text);
          }}
          max={INBOX_MAX}
          multiline
          placeholder={isRequest ? `Reply to ${other} (this accepts)` : `Message ${other}`}
          label={`Message to ${other}`}
        />
      )}
    </div>
  );
}
