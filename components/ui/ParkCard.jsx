"use client";

import React from 'react';
import { Trees, Users, TrendingUp, Landmark } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';

export default function ParkCard() {
  const { selectedPark, plots, setSelectedPlot } = useCityStore();

  if (!selectedPark) return null;

  const neighbors = plots.filter((p) => selectedPark.neighborIds.includes(p.id));
  const claimedNeighbors = neighbors.filter((p) => p.owner);

  return (
    <div className="text-slate-100">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-green-950 text-green-300 border border-green-800 mb-1">
            Public Park
          </span>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Trees className="w-5 h-5 text-green-400" />
            {selectedPark.name}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 py-3 border-y border-sx-alt mb-3">
        <div>
          <span className="block text-[10px] text-slate-400 uppercase">Daily visitors</span>
          <div className="flex items-center gap-1 font-mono font-semibold text-slate-200 text-base">
            <Users className="w-4 h-4 text-slate-400" />
            {selectedPark.visits.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="block text-[10px] text-slate-400 uppercase">Neighbor boost</span>
          <div className="flex items-center gap-1 font-mono font-semibold text-green-400 text-base">
            <TrendingUp className="w-4 h-4" />
            +{selectedPark.boostPercent}%
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-slate-300">
        <Landmark className="w-4 h-4 text-amber-400" />
        Landmarks: {selectedPark.landmarks.join(', ')}
      </div>

      <div className="text-xs">
        <span className="block mb-1 text-[10px] uppercase text-slate-400">
          Neighboring plots ({claimedNeighbors.length} claimed / {neighbors.length})
        </span>
        <ul className="max-h-32 space-y-1 overflow-y-auto">
          {neighbors.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedPlot(p)}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-sx-alt"
              >
                <span className={p.owner ? 'text-slate-200' : 'text-slate-500'}>{p.title}</span>
                <span className="font-mono text-slate-400">{p.visits}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
