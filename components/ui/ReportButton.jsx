"use client";

import React, { useState } from 'react';
import { Flag } from 'lucide-react';
import { reportRemote } from '@/lib/data/sync';
import { useAccount } from '@/lib/state/accountStore';

const REASONS = [['spam', 'Spam'], ['offensive', 'Offensive'], ['misleading', 'Misleading'], ['other', 'Something else']];

// "Report": asks why, tells the moderators. It needs an account (the sign-in form opens first), and a message that enough
// different players report is hidden straight away. Shows nothing unless there is a game server to report to.
export default function ReportButton({ kind, id, label = 'Report', className = '' }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState('');
  const send = (reason) => {
    const go = () => reportRemote(kind, id, reason).then((r) => { setDone(r.already ? 'You already reported this.' : 'Thanks: a moderator will look.'); setOpen(false); }).catch((e) => { setDone(e.message); setOpen(false); });
    if (useAccount.getState().ask(go)) go();
  };
  if (done) return <span className="text-[10px] text-slate-400">{done}</span>;
  return (
    <span className={`relative inline-block ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-200" aria-label={`${label} this ${kind === 'feedback' ? 'message' : kind === 'ad' ? 'ad' : 'business'}`} aria-expanded={open}>
        <Flag className="h-3 w-3" /> {label}
      </button>
      {open && (
        <span role="menu" className="absolute right-0 top-5 z-20 w-36 rounded-lg border border-sx-line bg-sx-panel p-1 shadow-xl">
          {REASONS.map(([r, name]) => (
            <button type="button" role="menuitem" key={r} onClick={() => send(r)} className="block w-full rounded px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-sx-alt">{name}</button>
          ))}
        </span>
      )}
    </span>
  );
}
