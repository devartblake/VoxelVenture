"use client";

import React, { useEffect } from 'react';
import { Globe2 } from 'lucide-react';
import { useStats } from '@/lib/state/statsStore';

// The live top of the Statistics panel: who is online right now, the latest arrivals (country only), and recorded activity by period. The figures come from
// the database through GET /stats/overview (or this browser's own record without a game server) and refresh every five seconds while the panel is open.
const nf = new Intl.NumberFormat('en-US');
const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export default function LiveStats() {
  const data = useStats((s) => s.data);
  const error = useStats((s) => s.error);
  const refresh = useStats((s) => s.refresh);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!data) return <p className="mb-4 text-xs text-slate-400">{error ?? 'Loading the live figures…'}</p>;
  return (
    <div className="mb-5" data-testid="live-stats">
      <div className="mb-3 flex items-center justify-between rounded-xl bg-sx-alt/70 px-4 py-3">
        <div>
          <span className="flex items-center gap-2 text-sm text-slate-100">
            <span className={`h-2 w-2 rounded-full ${data.online > 0 ? 'bg-emerald-400' : 'bg-slate-500'}`} /> Online now
          </span>
          <span className="text-[11px] text-slate-400">Active in the last {data.windowSeconds} seconds</span>
        </div>
        <span className="font-mono text-3xl font-bold text-white" data-testid="online-now">
          {data.online}
        </span>
      </div>

      <div className="mb-1 rounded-xl bg-sx-alt/70 px-4 py-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-100">
          <Globe2 className="h-4 w-4 text-slate-300" /> Latest arrivals
        </h3>
        {data.arrivals.length ? (
          <ul className="space-y-2">
            {data.arrivals.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-3">
                  <span className="w-6 font-mono text-xs font-bold text-slate-400">{a.code === 'ZZ' ? '??' : a.code || '··'}</span>
                  <span className="text-slate-100">{a.country}</span>
                </span>
                <span className={`flex items-center gap-1.5 text-xs ${a.online ? 'text-emerald-300' : 'text-slate-500'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${a.online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  {a.online ? 'Online' : ago(a.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">Nobody has arrived yet.</p>
        )}
      </div>
      <p className="mb-5 mt-2 text-[11px] text-slate-500">Country only · Refreshes every 5 seconds</p>

      <h3 className="mb-2 text-base font-bold text-white">Recorded activity</h3>
      <table className="mb-1 w-full text-xs">
        <thead>
          <tr className="text-slate-400">
            <th className="py-1.5 text-left font-medium">Metric</th>
            <th className="py-1.5 text-right font-medium">Yesterday</th>
            <th className="py-1.5 text-right font-medium">Last 7d</th>
            <th className="py-1.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.activity.map((m) => (
            <tr key={m.label} className="border-t border-sx-stroke/70">
              <td className="py-2.5 font-medium text-slate-100">{m.label}</td>
              <td className="py-2.5 text-right font-mono text-slate-200">{nf.format(m.yesterday)}</td>
              <td className="py-2.5 text-right font-mono text-slate-200">{nf.format(m.last7)}</td>
              <td className="py-2.5 text-right font-mono text-slate-100">{nf.format(m.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-3 text-[11px] text-slate-500">Totals update every 30 seconds.</p>

      <details className="rounded-lg text-xs text-slate-300">
        <summary className="cursor-pointer font-medium text-slate-200">How we count</summary>
        <div className="mt-2 space-y-2 leading-relaxed text-slate-400">
          <p>
            {data.local
              ? 'This is the activity of this browser only: there is no game server connected, so nobody else is counted.'
              : `Real recorded activity. Yesterday is a complete calendar day; last 7 days includes today. All periods use ${data.timezone}.`}
          </p>
          <p>City visits count a person arriving: a first visit, or a return after half an hour away. Building views count entering a building (once a minute per building per visitor). Website clicks count pressing Visit website.</p>
          <p>Online now is everyone the server has heard from in the last {data.windowSeconds} seconds. Only the country is kept, never an address. Known bots are left out.</p>
        </div>
      </details>
    </div>
  );
}
