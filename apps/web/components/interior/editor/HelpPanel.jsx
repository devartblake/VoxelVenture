"use client";

import React from 'react';

// The first tab of the interior editor: what to do, in the order people do it.
const STEPS = [
  ['Furniture', 'Open the Furniture tab, pick an item and click in the room to put it down. Drag to move it, R turns it, Delete removes it.'],
  ['Colours', 'The Colours tab paints the inside walls, the outside walls and the floor in one click.'],
  ['Walls and doors', 'The tools along the bottom draw new walls, doors and windows. Select a wall to change it.'],
  ['Floors', 'The level chips at the top left switch between floors. Add a floor with the + there.'],
  ['Done', 'Press Done (top right) to save and walk around your new design. "Original" goes back to the first design.'],
];

export default function HelpPanel() {
  return (
    <div className="h-full overflow-y-auto text-slate-200">
      <div className="border-b border-white/10 p-3">
        <h3 className="text-sm font-semibold text-white">How this works</h3>
        <p className="mt-0.5 text-[11px] text-slate-400">Five things, in this order.</p>
      </div>
      <ol className="space-y-3 p-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">{i + 1}</span>
            <span>
              <span className="block text-[13px] font-medium text-white">{title}</span>
              <span className="block text-[12px] leading-snug text-slate-400">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
