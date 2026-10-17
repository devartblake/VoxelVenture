"use client";

import React, { useEffect, useState } from 'react';
import { Crown, Eye, Footprints, Sparkles, Star } from 'lucide-react';
import { apiOn } from '@/lib/data/api';
import { useAccount } from '@/lib/state/accountStore';
import { useCityStore } from '@/lib/state/store';
import { useCommunity } from '@/lib/state/communityStore';
import { useWorld } from '@/lib/state/worldStore';
import { avatarState } from '@/lib/sim/avatarState';
import { timeLeft, voteProblem } from '@/lib/game/buildingOfWeek';

// Building of the Week (lib/game/buildingOfWeek.js): last week's winner, this week's leaders with a Vote button, your votes and how to earn
// another, and when voting closes.
export default function WeekView() {
  const votes = useCommunity((s) => s.votes);
  const notice = useCommunity((s) => s.notice);
  const account = useAccount((s) => s.account);
  const plots = useCityStore((s) => s.plots);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    useCommunity.getState().loadVotes();
    useCommunity.getState().clearNotice();
  }, [account?.id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!votes) return <p className="text-xs text-slate-400">Loading this week's vote…</p>;
  const byId = new Map(plots.map((p) => [p.id, p]));
  const winner = votes.winner && byId.get(votes.winner.plotId);
  const most = Math.max(1, ...votes.leaders.map((l) => l.votes));
  const show = (p) => useWorld.getState().focusOn(p.x, p.z, 30);
  const walk = (p) => (avatarState.target = { x: p.x + Math.sin(p.yaw ?? 0) * ((p.d ?? 3) / 2 + 0.7), z: p.z + Math.cos(p.yaw ?? 0) * ((p.d ?? 3) / 2 + 0.7) });
  const open = (p) => useCityStore.getState().setSelectedPlot(p);
  const needSignIn = apiOn() && !account;

  return (
    <div className="space-y-3 text-slate-100" data-testid="week-view">
      <p className="flex items-center justify-between rounded-xl border border-yellow-400/25 bg-yellow-400/5 px-3 py-2 text-[11px] text-yellow-100">
        <span>Voting closes in <b data-testid="week-countdown">{timeLeft(votes.endsAt, now)}</b></span>
        <span className="text-yellow-200/70">{new Date(votes.endsAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </p>

      <section className="rounded-2xl border border-yellow-400/40 bg-gradient-to-br from-yellow-400/15 to-transparent p-3">
        <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-yellow-300"><Crown className="h-3.5 w-3.5" /> This week's Building of the Week</h3>
        {winner ? (
          <>
            <p className="text-base font-bold text-white">{winner.title}</p>
            <p className="text-[11px] text-slate-300">{votes.winner.votes} vote{votes.winner.votes === 1 ? '' : 's'} last week · {winner.district}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => open(winner)} className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-bold text-yellow-950 hover:brightness-110">Open its card</button>
              <button type="button" onClick={() => show(winner)} className="flex items-center gap-1 rounded-lg border border-sx-stroke px-2.5 py-1.5 text-xs text-slate-200 hover:bg-sx-alt"><Eye className="h-3.5 w-3.5" /> Show</button>
              <button type="button" onClick={() => walk(winner)} className="flex items-center gap-1 rounded-lg border border-sx-stroke px-2.5 py-1.5 text-xs text-slate-200 hover:bg-sx-alt"><Footprints className="h-3.5 w-3.5" /> Walk there</button>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-slate-300">None yet: the first winner is chosen when this week's voting closes.</p>
        )}
      </section>

      <section className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3">
        <h3 className="mb-1 text-xs font-bold text-white">Your votes</h3>
        {needSignIn ? (
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
            <span>Every player has a vote each week. Sign in to use yours.</span>
            <button type="button" onClick={() => useAccount.getState().ask()} className="shrink-0 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 text-xs font-bold text-white">Sign in</button>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-300" data-testid="votes-left">
              {votes.votesLeft > 0 ? `${votes.votesLeft} vote${votes.votesLeft === 1 ? '' : 's'} left this week.` : 'You have used your votes this week.'} {votes.votedFor.length > 0 && `You voted for ${votes.votedFor.map((id) => byId.get(id)?.title ?? `#${id}`).join(' and ')}.`}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-200/90">
              <Star className="h-3 w-3 shrink-0" />
              {votes.huntWon ? 'Bonus vote earned: you found all three gold stars this week.' : 'Find all three gold stars on any day this week for a bonus vote (clues in Today & quests).'}
            </p>
          </>
        )}
        {notice && <p className={`mt-1 text-[11px] ${notice.ok ? 'text-emerald-300' : 'text-red-300'}`} role="status">{notice.text}</p>}
      </section>

      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">This week so far</h3>
        {votes.leaders.length === 0 && <p className="text-[11px] text-slate-500">No votes yet this week. Open any business's card and vote for it.</p>}
        <ol className="space-y-1.5">
          {votes.leaders.map((l, i) => {
            const p = byId.get(l.plotId);
            const problem = p ? voteProblem(p, { votedFor: votes.votedFor, left: votes.votesLeft, ownPlot: Boolean(p.userClaimed) }) : 'gone';
            const mine = votes.votedFor.includes(l.plotId);
            return (
              <li key={l.plotId} className="rounded-xl border border-sx-alt bg-sx-panel/60 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className={`w-4 text-center text-xs font-bold ${i === 0 ? 'text-yellow-300' : 'text-slate-500'}`}>{i + 1}</span>
                  <button type="button" onClick={() => p && open(p)} className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline">{l.title}</button>
                  <span className="font-mono text-[11px] text-slate-300">{l.votes}</span>
                  {mine ? (
                    <span className="text-[10px] text-yellow-300">Your vote</span>
                  ) : !needSignIn && !problem ? (
                    <button type="button" onClick={() => useCommunity.getState().vote(l.plotId)} className="rounded-lg bg-yellow-400 px-2.5 py-1 text-[11px] font-bold text-yellow-950 hover:brightness-110">Vote</button>
                  ) : null}
                </div>
                <div className="ml-6 mt-1 h-1 overflow-hidden rounded-full bg-sx-alt" aria-hidden="true">
                  <div className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-amber-500" style={{ width: `${(l.votes / most) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[10px] text-slate-500">Any business you can walk into can get votes: open its card to vote for one that is not on this list.</p>
      </section>

      {votes.demo && (
        <p className="flex items-start gap-1 text-[10px] text-slate-500"><Sparkles className="mt-0.5 h-3 w-3 shrink-0" /> Demo: no game server, so your votes are kept in this browser and the city's other votes are made up.</p>
      )}
    </div>
  );
}
