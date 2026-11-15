"use client";

import React, { useEffect, useState } from 'react';
import { Check, Coins, Flame, ListChecks } from 'lucide-react';
import { apiOn } from '@/lib/data/api';
import { collectTask, loadHistory, loadTasks } from '@/lib/data/tasks';
import { useAccount } from '@/lib/state/accountStore';
import { useCityStore } from '@/lib/state/store';
import { useTasks } from '@/lib/state/taskStore';

const TIER = { easy: 'text-green-300 border-green-900/60', medium: 'text-amber-300 border-amber-900/60', hard: 'text-rose-300 border-rose-900/60' };
const CATEGORY = { BIZ: 'Businesses', EXP: 'Explore', PLC: 'Places', RDS: 'Roads', CHL: 'Challenges', WRD: 'Wardrobe', TIM: 'Time of day', FSH: 'Fishing', VOT: 'Community', SND: 'Sound', SOC: 'Players', DST: 'Distance', HNT: 'Daily finds', OWN: 'Owners', STR: 'Streaks', EST: 'Estates', COL: 'Collections', AIR: 'Air', FUN: 'Fun park', CTY: 'Countryside' };
const when = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Task({ task, signedIn }) {
  const busy = useTasks((s) => s.busy);
  const ask = useAccount((s) => s.ask);
  const { have, need, done } = task.progress;
  const collected = Boolean(task.collected);
  return (
    <li className={`rounded-xl border bg-sx-alt/40 p-3 ${collected ? 'border-green-900/50' : 'border-sx-stroke'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100">{task.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{task.text}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${TIER[task.tier]}`}>{task.tier}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sx-alt" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={have} aria-label={`${task.title}: ${have} of ${need}`}>
        <div className={`h-full transition-all ${done ? 'bg-green-400' : 'bg-sx-cyan'}`} style={{ width: `${Math.round((have / need) * 100)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="font-mono text-slate-400">{collected ? 'Collected' : `${have} of ${need}`}</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 font-mono text-amber-300"><Coins className="h-3 w-3" /> {task.gold}</span>
          {collected ? (
            <span className="flex items-center gap-1 text-green-400"><Check className="h-3.5 w-3.5" /> done</span>
          ) : signedIn ? (
            <button onClick={() => collectTask(task.id)} disabled={!done || busy === task.id} className="rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1 text-[11px] font-medium text-white enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
              {busy === task.id ? 'Collecting…' : 'Collect'}
            </button>
          ) : (
            <button onClick={() => ask()} className="rounded-lg border border-sx-stroke px-3 py-1 text-[11px] text-slate-200 hover:border-sx-line">Sign in to collect</button>
          )}
        </span>
      </div>
    </li>
  );
}

function List({ title, tasks, signedIn, note }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span>{title}</span><span className="normal-case tracking-normal text-slate-500">{note}</span></h3>
      <ul className="space-y-2">{tasks.map((t) => <Task key={`${t.id}@${t.period}`} task={t} signedIn={signedIn} />)}</ul>
    </section>
  );
}

// What has been collected: the totals and the list. Used in the Tasks panel and (a shorter one) in the profile.
export function Collected({ limit = 20 }) {
  const history = useTasks((s) => s.history);
  useEffect(() => { if (!history) loadHistory(); }, [history]);
  if (!history) return <p className="text-xs text-slate-400">Loading what you have collected…</p>;
  const { totals, claims } = history;
  const categories = Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[['Collected', totals.collected], ['Gold earned', totals.gold], ['Best streak', `${totals.bestStreak} d`]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-sx-stroke bg-sx-alt/40 py-2"><dd className="font-mono text-base font-bold text-amber-300">{value}</dd><dt className="text-[10px] text-slate-400">{label}</dt></div>
        ))}
      </dl>
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Flame className="h-3.5 w-3.5 text-orange-400" /> Current streak: {totals.currentStreak} day{totals.currentStreak === 1 ? '' : 's'} (a daily task on each day in a row)</p>
      {categories.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 text-[10px]">
          {categories.map(([c, n]) => <li key={c} className="rounded-full border border-sx-stroke px-2 py-0.5 text-slate-300">{CATEGORY[c] ?? c} {n}</li>)}
        </ul>
      )}
      {claims.length === 0 ? <p className="text-xs text-slate-400">Nothing collected yet. Finish a task and collect it.</p> : (
        <ul className="space-y-1 text-[11px]">
          {claims.slice(0, limit).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-slate-300"><span className="min-w-0 truncate">{c.title}</span><span className="shrink-0 font-mono"><span className="text-slate-500">{when(c.claimedAt)}</span> <span className="text-green-400">+{c.gold}</span></span></li>
          ))}
        </ul>
      )}
      {history.next && claims.length >= limit && <button onClick={() => loadHistory(history.next)} className="rounded-full border border-sx-stroke px-3 py-1 text-[11px] text-slate-200 hover:border-sx-line">Show more</button>}
    </div>
  );
}

// The tasks panel: today's three, this week's five, and what you have collected. Everything shown is the server's: progress is worked out by the server from its own records.
export default function TasksView() {
  const data = useTasks((s) => s.data);
  const error = useTasks((s) => s.error);
  const gameSignedIn = useCityStore((s) => s.gameSignedIn);
  const account = useAccount((s) => s.account);
  const [tab, setTab] = useState('today');
  useEffect(() => {
    loadTasks();
    const t = setInterval(loadTasks, 15000);
    return () => clearInterval(t);
  }, [account?.id]);

  if (!apiOn()) return <p className="text-xs text-slate-400">Tasks need the game server, which keeps your Gold and checks every task. This copy of the game runs on its own.</p>;
  if (!data) return <p className="text-xs text-slate-400">{error ?? 'Loading your tasks…'}</p>;
  const signedIn = data.signedIn && (gameSignedIn || Boolean(account));
  return (
    <div className="text-slate-100">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><ListChecks className="h-5 w-5 text-violet-400" /> Tasks</h2>
      <p className="mb-3 text-[11px] text-slate-400">{signedIn ? 'The game server checks every task itself and pays the Gold: finish one, then collect it.' : 'Sign in to collect: guests can see the tasks but earn nothing.'}</p>
      <div className="mb-3 flex gap-1 rounded-lg bg-sx-alt p-1" role="tablist">
        {[['today', 'Today'], ['week', 'This week'], ['collected', 'Collected']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-md py-1.5 text-xs font-medium ${tab === id ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:text-white'}`}>{label}</button>
        ))}
      </div>
      {tab === 'today' && <List title="Today" tasks={data.daily} signedIn={signedIn} note={data.day} />}
      {tab === 'week' && <List title="This week" tasks={data.weekly} signedIn={signedIn} note={`from ${data.week}`} />}
      {tab === 'collected' && (signedIn ? <Collected /> : <p className="text-xs text-slate-400">Sign in to keep what you collect.</p>)}
      {tab !== 'collected' && data.summary.collected > 0 && <p className="mt-3 text-[11px] text-slate-400">{data.summary.collected} of {data.summary.offered} collected, +{data.summary.gold} Gold so far.</p>}
    </div>
  );
}
