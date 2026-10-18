"use client";

import React from 'react';
import { useInteriorSpots } from '@/lib/state/interiorFocus';

// The interior's "Look at" menu: the spots in the room the camera can jump to. Two layouts of the same buttons:
//   overlay  a column floating over the room (wider screens)
//   inline   a row of chips that wraps, inside the storefront panel (phones, where the column covered half the room)
export default function LookAt({ layout = 'overlay', className = '' }) {
  const { spots, active, look } = useInteriorSpots();
  if (!spots.length || !look) return null;
  const overlay = layout === 'overlay';
  return (
    <div
      className={overlay
        ? `flex max-w-[11rem] flex-col gap-1 rounded-xl border border-slate-700 bg-slate-900/90 p-1.5 text-xs text-slate-200 shadow-lg ${className}`
        : `rounded-xl border border-sx-stroke bg-sx-alt/40 p-2 text-xs text-slate-200 ${className}`}
      role="group"
      aria-label="Look at"
      data-testid={overlay ? 'hotspots' : 'hotspots-inline'}
    >
      <span className={`px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${overlay ? '' : 'mb-1.5 block'}`}>Look at</span>
      <div className={overlay ? 'contents' : 'flex flex-wrap gap-1.5'}>
        {spots.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => look(h)}
            aria-pressed={active === h.id}
            className={`rounded-lg font-medium ${overlay ? 'px-2 py-1 text-left' : 'border border-sx-stroke px-2.5 py-1'} ${active === h.id ? 'border-indigo-500 bg-indigo-600 text-white' : h.offer ? 'text-amber-200 hover:bg-slate-800' : 'hover:bg-slate-800'}`}
          >
            {h.label}
          </button>
        ))}
      </div>
    </div>
  );
}
