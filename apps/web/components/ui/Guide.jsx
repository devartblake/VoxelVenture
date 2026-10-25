"use client";

import React, { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Compass, Footprints, Store, X } from 'lucide-react';

// The first-visit guide (VV-UX-12): three short steps, walking, looking around and finding a business, worded for touch or for a
// mouse and keyboard. A small card that never blocks the city: Skip or Done closes it for good (kept in this browser), and a returning
// player, a shared building link (?plot= / ?building=) and the demo tour (?tour=) never see it. Automated browsers (navigator.webdriver)
// skip it so tests can tap the city; ?guide=1 shows it anyway. "Show the guide again" in the city guide reopens it (useGuide.open).
const KEY = 'voxelventure-guide';

export const useGuide = create((set) => ({ open: false, step: 0, show: () => set({ open: true, step: 0 }), set: (patch) => set(patch) }));

const seen = () => {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return false;
  }
};
const remember = () => {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    /* it shows again next visit */
  }
};

const STEPS = [
  {
    Icon: Footprints,
    title: 'Walk around the city',
    touch: 'Drag the joystick at the bottom to walk, or tap the ground to walk there. The footsteps button makes you run.',
    mouse: 'Walk with W A S D or the arrow keys (hold Shift to run), or click the ground to walk there.',
  },
  {
    Icon: Compass,
    title: 'Look around',
    touch: 'Pinch to zoom and drag to look around. The camera button changes the view, and the map button shows the whole city.',
    mouse: 'Scroll to zoom and Q / E to turn. The camera button changes the view, and M opens the map of the whole city.',
  },
  {
    Icon: Store,
    title: 'Find a business',
    touch: 'Tap Explore businesses to search shops, food and offices by name, kind or district. Open one to step inside or visit its website.',
    mouse: 'Open the list on the right to search shops, food and offices by name, kind or district. Open one to step inside or visit its website.',
  },
];

export default function Guide() {
  const { open, step, set } = useGuide();
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setTouch(window.matchMedia?.('(pointer: coarse)').matches ?? false);
    const forced = q.get('guide') === '1';
    const linked = q.has('plot') || q.has('building') || q.has('tour') || /^\/b\//.test(window.location.pathname);
    if (forced || (!seen() && !linked && !navigator.webdriver)) set({ open: true, step: 0 });
  }, [set]);
  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const close = () => {
    remember();
    set({ open: false });
  };
  return (
    <section
      role="dialog"
      aria-labelledby="guide-title"
      className="pointer-events-auto absolute left-1/2 top-[7.5rem] z-30 w-[min(22rem,calc(100vw-7rem))] -translate-x-1/2 rounded-2xl border border-sx-cyan/40 bg-sx-page/95 p-4 text-slate-100 shadow-2xl backdrop-blur-md short:top-[5rem] max-sm:left-[max(0.5rem,env(safe-area-inset-left))] max-sm:translate-x-0"
      data-testid="guide"
    >
      <button type="button" onClick={close} aria-label="Close the guide" className="absolute right-2 top-2 rounded-full p-1.5 text-slate-400 hover:bg-sx-alt hover:text-white pointer-coarse:p-2.5">
        <X className="h-4 w-4" />
      </button>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-sx-cyan">Welcome · {step + 1} of {STEPS.length}</p>
      <h2 id="guide-title" className="mt-1 flex items-center gap-2 text-base font-bold text-white">
        <s.Icon className="h-4 w-4 text-sx-cyan" /> {s.title}
      </h2>
      <p className="mt-1.5 text-sm leading-snug text-slate-300" data-testid="guide-text">{touch ? s.touch : s.mouse}</p>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={close} className="text-xs text-slate-400 underline hover:text-white pointer-coarse:min-h-11" data-testid="guide-skip">Skip the guide</button>
        <span className="flex-1" />
        {step > 0 && (
          <button type="button" onClick={() => set({ step: step - 1 })} className="rounded-lg border border-sx-stroke px-3 py-1.5 text-sm text-slate-200 hover:bg-sx-alt pointer-coarse:min-h-11">Back</button>
        )}
        <button type="button" onClick={() => (last ? close() : set({ step: step + 1 }))} className="rounded-lg bg-sx-cyan px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 pointer-coarse:min-h-11" data-testid="guide-next">
          {last ? 'Done' : 'Next'}
        </button>
      </div>
    </section>
  );
}
