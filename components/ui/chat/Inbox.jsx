"use client";

import React, { useEffect, useState } from 'react';
import { BellOff, Settings, SquarePen, Store, X } from 'lucide-react';
import { apiOn } from '@/lib/data/api';
import { newClientId } from '@/lib/data/messaging';
import { useAccount } from '@/lib/state/accountStore';
import { cancelCompose, composeTo, loadList, loadSettings, openConversation, sendCompose, setBox, setComposeDraft, setRequestsAllowed, unblockAccount, useChat } from '@/lib/state/chatStore';
import Conversation from './Conversation';
import { INBOX_MAX } from './limits';
import { BUTTON, Composer, QUIET, when } from './parts';

// Private messages: the inbox and the requests waiting for an answer, one conversation at a time, a new message to someone,
// and the settings (who may send you requests, who you blocked).
export default function Inbox() {
  const account = useAccount((s) => s.account);
  const openId = useChat((s) => s.openId);
  const compose = useChat((s) => s.compose);
  const error = useChat((s) => s.error);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!apiOn()) return <p className="text-[11px] text-slate-400">Private messages need the game server. This copy of the game runs on its own.</p>;
  if (!account) {
    return (
      <div className="space-y-2 text-[11px] text-slate-300">
        <p>Sign in to send and receive private messages. They stay in your account, so you can read them on any device.</p>
        <button type="button" onClick={() => useAccount.getState().ask()} className={BUTTON}>Sign in or create an account</button>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-col gap-2">
      {error && <p className="rounded-lg bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300" role="alert">{error}</p>}
      {settingsOpen ? <ChatSettings onClose={() => setSettingsOpen(false)} /> : compose ? <NewMessage /> : openId ? <Conversation id={openId} /> : <Lists onSettings={() => setSettingsOpen(true)} />}
      {!openId && !compose && !settingsOpen && (
        <p className="text-[10px] leading-snug text-slate-500">
          Private messages can be read by the people in the conversation, and by a moderator if one is reported. They are encrypted on the way, not end to end, and kept for 90 days.
        </p>
      )}
    </div>
  );
}

function Lists({ onSettings }) {
  const box = useChat((s) => s.box);
  const page = useChat((s) => s.lists[box]);
  const conversations = useChat((s) => s.conversations);
  const summary = useChat((s) => s.summary);
  const [to, setTo] = useState('');
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    loadList(box);
  }, [box]);
  return (
    <>
      <div className="flex items-center gap-1">
        <div className="flex flex-1 gap-1 rounded-lg bg-sx-alt/80 p-0.5" role="tablist" aria-label="Messages">
          {[['inbox', 'Inbox', summary.unread], ['requests', 'Requests', summary.requests]].map(([id, label, n]) => (
            <button key={id} type="button" role="tab" aria-selected={box === id} onClick={() => setBox(id)} className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium ${box === id ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:bg-sx-stroke'}`}>
              {label}
              {n > 0 && <span className="rounded-full bg-sx-cyan px-1.5 text-[9px] font-bold text-slate-950">{n}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setWriting((w) => !w)} className="rounded-md p-1.5 text-slate-300 hover:bg-sx-alt hover:text-white" aria-label="New message" aria-expanded={writing} title="New message"><SquarePen className="h-4 w-4" /></button>
        <button type="button" onClick={onSettings} className="rounded-md p-1.5 text-slate-300 hover:bg-sx-alt hover:text-white" aria-label="Chat settings" title="Settings"><Settings className="h-4 w-4" /></button>
      </div>
      {writing && (
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (to.trim()) { composeTo({ to: { username: to.trim() } }); setTo(''); setWriting(false); } }}>
          <input value={to} onChange={(e) => setTo(e.target.value)} maxLength={20} placeholder="Their player name" aria-label="Who to message" className="min-w-0 flex-1 rounded-lg border border-sx-stroke bg-sx-panel px-2.5 py-1 text-xs text-white focus:border-sx-cyan focus:outline-none" />
          <button type="submit" className={QUIET}>Write</button>
        </form>
      )}
      {page.error && <p className="text-[11px] text-rose-300">{page.error} <button type="button" className="underline" onClick={() => loadList(box)}>Try again</button></p>}
      <ul className="space-y-1" aria-label={box === 'inbox' ? 'Conversations' : 'Message requests'}>
        {page.loaded && page.items.length === 0 && <li className="text-[11px] text-slate-500">{box === 'inbox' ? 'No conversations yet. Message someone from Nearby, the Online list, or a building\'s card.' : 'No requests. When someone new messages you, it waits here until you answer.'}</li>}
        {!page.loaded && page.loading && <li className="text-[11px] text-slate-500">Loading…</li>}
        {page.items.map((id) => {
          const c = conversations[id];
          if (!c) return null;
          return (
            <li key={id}>
              <button type="button" onClick={() => openConversation(id)} className="flex w-full items-start gap-2 rounded-xl border border-sx-alt bg-sx-panel/60 px-2.5 py-1.5 text-left hover:bg-sx-alt">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-xs font-semibold text-white">
                    <span className="truncate">{c.other?.username ?? 'Someone'}</span>
                    {c.muted && <BellOff className="h-3 w-3 shrink-0 text-slate-500" aria-label="muted" />}
                  </span>
                  {c.plot && <span className="flex items-center gap-1 truncate text-[10px] text-violet-300"><Store className="h-3 w-3 shrink-0" /> {c.plot.title}</span>}
                  <span className="block truncate text-[11px] text-slate-400">{c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.text ?? '(removed)'}` : ''}</span>
                  {c.waiting && <span className="block text-[10px] text-slate-500">Waiting for them to accept</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-[9px] text-slate-500">{when(c.lastAt)}</span>
                  {c.unread > 0 && <span className="rounded-full bg-sx-cyan px-1.5 text-[9px] font-bold text-slate-950" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {page.next && <button type="button" onClick={() => loadList(box, { more: true })} disabled={page.loading} className={QUIET}>Show more</button>}
    </>
  );
}

// Writing to someone you have no conversation with yet (a request), or to a building's owner.
function NewMessage() {
  const compose = useChat((s) => s.compose);
  const draft = useChat((s) => s.composeDraft);
  const busy = useChat((s) => s.sendingCompose);
  const [clientId, setClientId] = useState(newClientId); // the same id until it is sent, so a retry is not a second message
  const target = compose.plot ? `the owner of ${compose.plot.title}` : compose.to.username;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-white">To {target}</p>
        <button type="button" onClick={cancelCompose} className="rounded-md p-1 text-slate-300 hover:bg-sx-alt hover:text-white" aria-label="Cancel"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-[10px] text-slate-400">
        {compose.plot ? 'It goes to whoever owns the building now. If it changes hands later, your conversation stays with this owner.' : 'Your first message is a request: they choose whether to accept it. You can send more once they do.'}
      </p>
      <Composer
        value={draft}
        onChange={setComposeDraft}
        onSend={async () => {
          if (await sendCompose(clientId)) setClientId(newClientId());
        }}
        max={INBOX_MAX}
        multiline
        busy={busy}
        placeholder={compose.plot ? 'Ask about the business' : 'Say hello'}
        label={`Message to ${target}`}
      />
    </div>
  );
}

function ChatSettings({ onClose }) {
  const settings = useChat((s) => s.settings);
  useEffect(() => {
    loadSettings();
  }, []);
  return (
    <div className="space-y-2 text-[11px] text-slate-300">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-white">Chat settings</p>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-300 hover:bg-sx-alt hover:text-white" aria-label="Close settings"><X className="h-4 w-4" /></button>
      </div>
      {!settings ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.requests} onChange={(e) => setRequestsAllowed(e.target.checked)} />
            Let new people send me message requests
          </label>
          <p className="text-[10px] text-slate-500">Turned off, only people you already talk to can message you. Questions about a building you own still come in.</p>
          <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Blocked</p>
          {settings.blocks.length === 0 && <p className="text-slate-500">Nobody. Block someone from a message's menu.</p>}
          <ul className="space-y-1">
            {settings.blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg border border-sx-alt px-2 py-1">
                {b.username}
                <button type="button" onClick={() => unblockAccount(b.id)} className={QUIET}>Unblock</button>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-slate-500">Blocking stops their private messages and you stop hearing each other nearby. They are not told.</p>
        </>
      )}
    </div>
  );
}
