"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { X, ExternalLink, Paintbrush } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { interiorSummaryFor } from '@/lib/content/interiorScenes';
import StorefrontPanel from './StorefrontPanel';
import { openSiteLink } from '@/lib/data/sync';
import { leaseState } from '@/lib/game/leases';

// The Pascal viewer is WebGL/WebGPU only, so load it on demand, in the browser.
const InteriorViewer = dynamic(() => import('./InteriorViewer'), {
  ssr: false,
  loading: () => <p className="text-xs text-slate-400">Loading interior…</p>,
});

// The Pascal editor (the same one as /editor) to redesign the inside of a building. Loaded only when the player asks for it.
const InteriorEditor = dynamic(() => import('./InteriorEditor'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-[60] flex items-center justify-center bg-sx-page text-sm text-slate-300">Opening the editor…</div>,
});

// Whose building can be redesigned: the player's own. (With no server, the whole city is the player's playground.)
const canDesign = (plot) => (plot.mall ? Boolean(plot.userClaimed) : Boolean(plot.userClaimed) || !process.env.NEXT_PUBLIC_LIVE_API_URL);
// the server refuses changes to the inside once the lease has ended (the grace week and after), until it is renewed
const leaseEnded = (plot) => !plot.mall && Boolean(plot.lease?.end) && ['grace', 'open'].includes(leaseState(plot.lease.end));

export default function InteriorModal() {
  const { activeInteriorPlot, closeInterior, setPlotWallColor } = useCityStore();
  const [designing, setDesigning] = useState(false);

  // Once opened, the viewer stays mounted (just hidden) and swaps scenes inside. Tearing its
  // canvas down mid-commit trips drei's <Html> cleanup, which Pascal's viewer uses internally and
  // which unmounts a React root synchronously ("Attempted to synchronously unmount a root...").
  const [shownPlot, setShownPlot] = useState(null);
  if (activeInteriorPlot && activeInteriorPlot !== shownPlot) setShownPlot(activeInteriorPlot);

  if (!shownPlot) return null;

  const isOpen = Boolean(activeInteriorPlot);
  if (!isOpen && designing) setDesigning(false);
  const summary = interiorSummaryFor(shownPlot);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 ${isOpen ? '' : 'hidden'}`}
    >
      <div className="relative w-full max-w-[min(96vw,1500px)] h-[94dvh] flex flex-col rounded-2xl bg-sx-panel border border-sx-stroke shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-sx-alt bg-sx-page/40">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {shownPlot.title}
              <span className="text-xs font-normal text-slate-400">
                {shownPlot.mall ? `(Store ${shownPlot.unit + 1} · ${shownPlot.owner})` : `(Plot #${shownPlot.id})`}
              </span>
            </h2>
            <p className="text-xs text-slate-400">{shownPlot.mall ? `In ${shownPlot.owner}` : `Created by ${shownPlot.owner}`}</p>
          </div>
          <div className="ml-auto mr-3 flex items-center gap-2">
            {canDesign(shownPlot) && (
              <>
                <label className="hidden items-center gap-1.5 text-xs text-slate-300 sm:inline-flex" title="The colour of the building's outside walls">
                  Outside walls
                  <input
                    type="color"
                    value={shownPlot.wallColor ?? shownPlot.color ?? '#94a3b8'}
                    onChange={(e) => setPlotWallColor(shownPlot.id, e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border border-sx-stroke bg-transparent p-0.5"
                    aria-label="Outside wall colour"
                  />
                  {shownPlot.wallColor && (
                    <button onClick={() => setPlotWallColor(shownPlot.id, null)} className="text-[11px] text-slate-400 underline hover:text-white">
                      reset
                    </button>
                  )}
                </label>
                {leaseEnded(shownPlot) ? (
                  <span className="text-xs text-amber-300" title="The lease has ended. Renew it to change the inside again.">
                    Lease ended: renew to redesign
                  </span>
                ) : (
                  <button
                    onClick={() => setDesigning(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 text-xs font-bold text-white hover:brightness-110"
                  >
                    <Paintbrush className="h-3.5 w-3.5" /> Redesign inside
                  </button>
                )}
              </>
            )}
          </div>
          <button
            onClick={closeInterior}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-sx-alt transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3D interior (Pascal viewer) beside the storefront panel */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="relative min-h-[40%] flex-1 bg-sx-page flex items-center justify-center">
          <InteriorViewer plot={activeInteriorPlot} />
          {shownPlot.website && (
            <a
              href={shownPlot.website}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => openSiteLink(e, shownPlot)}
              className="absolute bottom-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sx-panel/90 hover:bg-sx-alt text-xs font-medium text-white transition border border-sx-stroke"
            >
              Visit Official Website <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        {isOpen && <StorefrontPanel plotId={shownPlot.id} />}
        </div>

        {/* Footer info */}
        <div className="hidden px-6 py-3 border-t border-sx-alt bg-sx-page/40 justify-between text-xs text-slate-400 sm:flex">
          <span>
            {summary.label} · {summary.floors} floor{summary.floors === 1 ? '' : 's'} · {summary.width}×{summary.depth} m · drag to orbit, scroll to zoom, click the floor to walk
          </span>
          <span>Close to return to City View</span>
        </div>
      </div>
      {designing && isOpen && canDesign(shownPlot) && !leaseEnded(shownPlot) && <InteriorEditor key={shownPlot.id} plot={shownPlot} onClose={() => setDesigning(false)} />}
    </div>
  );
}
