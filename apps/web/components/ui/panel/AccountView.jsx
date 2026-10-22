"use client";

import React, { useEffect, useState } from 'react';
import { Coins, Download, LogOut, Mail, Users } from 'lucide-react';
import { apiOn } from '@/lib/data/api';
import { leadsCsv } from '@/lib/data/csv';
import { myLeadsRemote, setEmailRemote, walletRemote } from '@/lib/data/sync';
import { useAccount } from '@/lib/state/accountStore';
import PrivacyControls, { DeletedNotice } from '@/components/legal/PrivacyControls';

const INPUT = 'w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-1.5 text-xs text-white focus:border-sx-cyan focus:outline-none';
const REASON = { starter: 'Welcome Credits', quest: 'Visit quest reward', quest_budget: 'Added to a quest budget', budget_refund: 'Quest budget returned' };

// Your account: the email for notices (confirmed by a link), whether to get them, and your Gold wallet (visit quests pay into it, and a
// business owner funds their quest budget from it).
export default function AccountView() {
  const account = useAccount((s) => s.account);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [ledger, setLedger] = useState([]);
  const [leads, setLeads] = useState(null);
  useEffect(() => {
    if (account) {
      walletRemote().then((w) => setLedger(w.ledger)).catch(() => {});
      myLeadsRemote().then(setLeads).catch(() => {});
    }
  }, [account?.id, account?.gold]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!apiOn()) return <p className="text-xs text-slate-400">Accounts need the game server. This copy of the game runs on its own.</p>;
  if (!account) {
    return (
      <div className="space-y-2 text-xs text-slate-300">
        <DeletedNotice compact />
        <p>You are not signed in. You only need an account to own a plot or an ad space, claim a coupon, earn quest Credits or post on a feedback board.</p>
        <button onClick={() => useAccount.getState().ask()} className="rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-4 py-2 text-xs font-bold text-white hover:brightness-110">Sign in or create an account</button>
      </div>
    );
  }
  const save = (e) => {
    e.preventDefault();
    setEmailRemote({ email }).then(() => setNote('We sent you a link: open it to confirm this address.')).catch((err) => setNote(err.message));
  };
  return (
    <div className="space-y-3 text-slate-100">
      <div className="flex items-center justify-between rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3">
        <div>
          <p className="text-sm font-bold text-white">{account.username}</p>
          <p className="text-[11px] text-slate-400">Signed in</p>
        </div>
        <button onClick={() => useAccount.getState().logout()} className="flex items-center gap-1 rounded-full border border-sx-stroke px-3 py-1 text-xs text-slate-200 hover:border-sx-line"><LogOut className="h-3 w-3" /> Sign out</button>
      </div>

      <section className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-white"><Mail className="h-3.5 w-3.5 text-sx-cyan" /> Email notices</h3>
        <p className="mb-2 text-[11px] text-slate-400">We email you when someone takes over your plot or ad space, and the Plot of the Day. Only to an address you have confirmed.</p>
        {account.email && (
          <p className="mb-2 text-[11px]">
            {account.email} · <span className={account.emailVerified ? 'text-green-400' : 'text-amber-300'}>{account.emailVerified ? 'confirmed' : 'waiting for you to open the link we sent'}</span>
          </p>
        )}
        <form onSubmit={save} className="flex gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={account.email ? 'Change the address' : 'you@email.com'} className={INPUT} aria-label="Email address" />
          <button className="shrink-0 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 text-xs font-medium text-white hover:brightness-110">Save</button>
        </form>
        {note && <p className="mt-1.5 text-[11px] text-slate-300">{note}</p>}
        <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
          <input type="checkbox" checked={account.notify} onChange={(e) => setEmailRemote({ notify: e.target.checked })} /> Send me notices
        </label>
      </section>


      <section className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3" data-testid="my-leads">
        <h3 className="mb-1 flex items-center justify-between text-xs font-bold text-white">
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-sx-cyan" /> Your sign-ups</span>
          {leads && <span className="font-mono text-sx-cyan">{leads.totals.confirmed}</span>}
        </h3>
        <p className="mb-2 text-[11px] text-slate-400">People who gave their email to hear from your businesses and ad spaces. Only addresses they have confirmed are shown.</p>
        {!leads ? (
          <p className="text-[11px] text-slate-500">Loading…</p>
        ) : leads.items.length === 0 ? (
          <p className="text-[11px] text-slate-500">You do not own a plot or an ad space yet.</p>
        ) : (
          <ul className="space-y-2">
            {leads.items.map((l) => (
              <li key={`${l.kind}-${l.id}`} className="rounded-xl bg-sx-panel/80 p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="min-w-0 truncate font-semibold text-slate-100">{l.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{l.confirmed.length} confirmed{l.pending ? ` · ${l.pending} waiting` : ''}{l.unsubscribed ? ` · ${l.unsubscribed} left` : ''}</span>
                </div>
                {l.confirmed.length > 0 && (
                  <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-slate-300">
                    {l.confirmed.map((c) => (
                      <li key={c.email} className="flex justify-between"><span>{c.email}</span><span className="text-slate-500">{new Date(c.at).toLocaleDateString()}</span></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {leads && leads.totals.confirmed > 0 && (
          <button onClick={() => downloadCsv(leads)} className="mt-2 flex items-center gap-1.5 rounded-full border border-sx-stroke px-3 py-1 text-[11px] text-slate-200 hover:border-sx-line"><Download className="h-3 w-3" /> Download as CSV</button>
        )}
      </section>

      <section className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3">
        <h3 className="mb-1 flex items-center justify-between text-xs font-bold text-white"><span className="flex items-center gap-1.5"><Coins className="h-3.5 w-3.5 text-violet-300" /> Quest wallet</span><span className="font-mono text-violet-300">{account.gold} Credits</span></h3>
        <p className="mb-2 text-[11px] text-slate-400">Credits are the server's money for visit quests: visitors earn them, and business owners add them to their quest budget. They are separate from the Gold you earn and spend in the game itself (chests, hunts, clothes).</p>
        <ul className="space-y-1 text-[11px]">
          {ledger.map((l, i) => (
            <li key={i} className="flex justify-between text-slate-300"><span>{REASON[l.reason] ?? l.reason}</span><span className={l.delta >= 0 ? 'text-green-400' : 'text-slate-400'}>{l.delta > 0 ? '+' : ''}{l.delta}</span></li>
          ))}
        </ul>
      </section>

      <PrivacyControls account={account} compact />
    </div>
  );
}

function downloadCsv(leads) {
  const url = URL.createObjectURL(new Blob([leadsCsv(leads)], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'my-signups.csv' });
  a.click();
  URL.revokeObjectURL(url);
}
