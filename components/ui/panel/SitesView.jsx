"use client";

import React from 'react';
import { Store } from 'lucide-react';
import { devToolsOn } from '@/lib/dev/devTools';
import { usePanel } from '@/lib/state/panelStore';
import { useCityStore } from '@/lib/state/store';
import MarketPanel from './MarketPanel';
import ReservedEditor from './ReservedEditor';

// Sites & market: every reserved site with its ID code (SD-0001 ...). The market site opens the pop-up market; the others keep the road-and-plot
// designer, which is a development tool.
export default function SitesView() {
  const id = usePanel((s) => s.reservedId);
  const reserved = useCityStore((s) => s.layout.reserved);
  const site = reserved.find((a) => a.id === id) ?? reserved.find((a) => a.market) ?? reserved[0];
  if (!site) return <p className="text-xs text-slate-400">There are no reserved sites in this city.</p>;
  return (
    <div>
      <div className="mb-3 flex gap-1" role="tablist" aria-label="Sites">
        {reserved.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={a.id === site.id} onClick={() => usePanel.getState().editReserved(a.id)} title={`${a.code}${a.market ? ' · pop-up market' : ''}`} className={`flex flex-1 flex-col items-center rounded-md py-1 text-[11px] font-medium ${a.id === site.id ? 'bg-amber-500 text-slate-950' : 'bg-sx-alt text-slate-300 hover:bg-sx-stroke'}`}>
            <span className="flex items-center gap-1">
              {a.market && <Store className="h-3 w-3" />}Site {a.number}
            </span>
            <span className="font-mono text-[9px] opacity-70">{a.code}</span>
          </button>
        ))}
      </div>
      {site.market ? (
        <MarketPanel site={site} />
      ) : devToolsOn() ? (
        <ReservedEditor siteId={site.id} hideTabs />
      ) : (
        <p className="rounded-lg border border-dashed border-sx-stroke p-3 text-xs text-slate-400">
          <span className="font-mono text-slate-300">{site.code}</span> is kept for a road and plot of its own. Nothing to do here yet.
        </p>
      )}
    </div>
  );
}
