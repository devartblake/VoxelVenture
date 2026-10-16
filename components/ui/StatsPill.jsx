"use client";

import React, { useEffect } from 'react';
import { Eye } from 'lucide-react';
import { usePanel } from '@/lib/state/panelStore';
import { useStats } from '@/lib/state/statsStore';

// The pill at the top of the screen: how many people are online and how many visits the city has had in all. Click it for the Statistics panel.
export default function StatsPill() {
  const data = useStats((s) => s.data);
  const refresh = useStats((s) => s.refresh);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);
  const visits = data?.activity?.find((a) => a.label === 'City visits')?.total ?? 0;
  return (
    <button
      type="button"
      onClick={() => usePanel.getState().open('stats')}
      className="fixed left-1/2 top-[84px] z-30 hidden -translate-x-1/2 flex-col items-center sm:flex"
      aria-label="Open the statistics"
      data-testid="stats-pill"
    >
      <span className="flex items-center gap-3 rounded-xl border border-sx-stroke bg-sx-panel/90 px-3 py-1.5 text-sm font-bold text-white shadow-lg backdrop-blur hover:bg-sx-alt">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${data?.online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          {data?.online ?? 0}
        </span>
        <span className="h-4 w-px bg-sx-stroke" />
        <span className="flex items-center gap-1.5 font-mono">
          <Eye className="h-3.5 w-3.5 text-slate-300" />
          {new Intl.NumberFormat('en-US').format(visits)}
        </span>
      </span>
      <span className="mt-0.5 text-[10px] text-slate-400">click to view stats</span>
    </button>
  );
}
