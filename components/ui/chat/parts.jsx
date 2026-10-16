"use client";

import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, MoreHorizontal, Send } from 'lucide-react';

// Pieces the Nearby tab and the inbox share: the time of a message, a name with its verified mark, the box you type in, and the
// small menu of actions on someone else's message.

export const BUTTON = 'rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-40';
export const QUIET = 'rounded-lg border border-sx-stroke px-2.5 py-1 text-[11px] text-slate-200 hover:border-sx-line hover:bg-sx-alt disabled:opacity-40';

export function when(at) {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// A signed-in account shows a check mark; a guest says so (anyone can call themselves anything as a guest).
export function Who({ name, verified, mine, className = '' }) {
  if (mine) return <span className={`font-semibold text-sx-cyan ${className}`}>You</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold text-slate-100 ${className}`}>
      {name}
      {verified ? <BadgeCheck className="h-3 w-3 shrink-0 text-sx-cyan" aria-label="signed-in account" /> : <span className="font-normal text-slate-500">(guest)</span>}
    </span>
  );
}

// The box you type a message in. Enter sends; in a multi-line box Shift+Enter starts a new line. Typing with an input method (IME)
// is never cut short by its own Enter. On a phone the box is scrolled into view above the keyboard.
export function Composer({ value, onChange, onSend, max, multiline = false, disabled = false, placeholder, label, busy = false }) {
  const ref = useRef(null);
  const left = max - [...value].length;
  const send = () => {
    if (!disabled && !busy && value.trim()) onSend();
  };
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (multiline && e.shiftKey) return;
    e.preventDefault();
    send();
  };
  const Field = multiline ? 'textarea' : 'input';
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-1.5">
      <div className="relative min-w-0 flex-1">
        <Field
          ref={ref}
          value={value}
          onChange={(e) => onChange([...e.target.value].slice(0, max).join(''))}
          onKeyDown={onKeyDown}
          onFocus={() => setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest' }), 250)}
          rows={multiline ? Math.min(5, Math.max(1, value.split('\n').length)) : undefined}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label}
          enterKeyHint="send"
          className="block w-full resize-none rounded-xl border border-sx-stroke bg-sx-panel px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-sx-cyan focus:outline-none disabled:opacity-50"
        />
        {left <= 40 && <span className={`pointer-events-none absolute bottom-1 right-2 text-[9px] ${left <= 10 ? 'text-amber-300' : 'text-slate-500'}`} aria-live="polite">{left}</span>}
      </div>
      <button type="submit" disabled={disabled || busy || !value.trim()} className={`${BUTTON} flex shrink-0 items-center gap-1`} aria-label="Send">
        <Send className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

// "…" on someone else's message: a list of actions. Report asks why first.
export function MessageMenu({ label, actions }) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(null);
  const [done, setDone] = useState('');
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  const shown = actions.filter(Boolean);
  if (!shown.length) return null;
  return (
    <span ref={box} className="relative inline-block">
      <button type="button" onClick={() => { setOpen((o) => !o); setReporting(null); setDone(''); }} className="rounded p-0.5 text-slate-500 hover:bg-sx-alt hover:text-white" aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span role="menu" className="absolute right-0 top-5 z-10 flex w-44 flex-col rounded-xl border border-sx-stroke bg-sx-page p-1 text-[11px] shadow-2xl">
          {done && <span className="px-2 py-1 text-green-300" role="status">{done}</span>}
          {!done && !reporting && shown.map((a) => (
            <button key={a.label} type="button" role="menuitem" className={`rounded-lg px-2 py-1 text-left hover:bg-sx-alt ${a.danger ? 'text-rose-300' : 'text-slate-200'}`} onClick={async () => {
              if (a.report) return setReporting(a);
              try {
                await a.run();
                setDone(a.doneText ?? 'Done.');
              } catch (e) {
                setDone(e?.message || 'That did not work.');
              }
              setTimeout(() => setOpen(false), 900);
            }}>
              {a.label}
            </button>
          ))}
          {!done && reporting && (
            <>
              <span className="px-2 py-1 text-slate-400">Why are you reporting it?</span>
              {[['spam', 'Spam'], ['offensive', 'Offensive or abusive'], ['misleading', 'A scam or misleading'], ['other', 'Something else']].map(([id, text]) => (
                <button key={id} type="button" role="menuitem" className="rounded-lg px-2 py-1 text-left text-slate-200 hover:bg-sx-alt" onClick={async () => {
                  try {
                    const out = await reporting.run(id);
                    setDone(out?.already ? 'You already reported it.' : 'Reported. A moderator will look at it.');
                  } catch (e) {
                    setDone(e?.message || 'Could not report it.');
                  }
                  setTimeout(() => setOpen(false), 1400);
                }}>{text}</button>
              ))}
            </>
          )}
        </span>
      )}
    </span>
  );
}
