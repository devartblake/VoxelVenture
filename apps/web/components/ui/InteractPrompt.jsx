"use client";

import React from 'react';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';

// "[E] Enter Quant Boutique": what the avatar can do where it stands. Clickable for mouse users.
// Underneath, a one-line reminder of the controls.
// What a vehicle prompt costs and needs, said once beside it: nothing to buy, no sign-in (VV-UX-12).
const NOTE = { car: 'Free to drive · no sign-in needed', parked: 'Your car, where you left it', boat: 'Free to sail · fishing earns Gold' };
const noteOf = (id) => NOTE[String(id ?? '').split('-')[0]] ?? null;

export default function InteractPrompt() {
  const prompt = useWorld((s) => s.prompt);
  const modalOpen = useCityStore((s) => Boolean(s.activeInteriorPlot));
  if (modalOpen) return null;

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2 pointer-coarse:bottom-auto pointer-coarse:top-14 max-sm:top-14 max-sm:bottom-auto">
      {prompt && (
        <button
          onClick={prompt.action}
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/60 bg-sx-panel/95 px-4 py-2 text-sm font-medium text-white shadow-xl backdrop-blur-md transition hover:bg-sx-alt"
        >
          <kbd className="pointer-coarse:hidden rounded border border-slate-500 bg-sx-alt px-1.5 py-0.5 font-mono text-xs text-amber-300">E</kbd>
          {prompt.label}
        </button>
      )}
      {prompt && noteOf(prompt.id) && <span className="rounded-full bg-sx-panel/80 px-2.5 py-0.5 text-[11px] text-slate-300 backdrop-blur-sm" data-testid="prompt-note">{noteOf(prompt.id)}</span>}
      <p className="pointer-coarse:hidden max-sm:hidden rounded-full bg-sx-panel/70 px-3 py-1 text-[11px] text-slate-400 backdrop-blur-sm">
        WASD / arrows move · Shift run · click the ground to walk · E interact · 1 2 3 emotes
      </p>
    </div>
  );
}
