"use client";

import React, { useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { CROWNS, PALETTES, applyExterior, cleanExterior, floorRange, paletteById, tierName, tierNote, wallColorOf } from '@/lib/game/exterior';
import { modelOptions } from '@/lib/content/models';
import { BACKS, MIN_ROOM, backRoom } from '@/lib/content/backyards';
import { useCityStore } from '@/lib/state/store';
import { choiceCost, outsideCost } from '@/lib/game/claimPrice';

// "free", or what a choice adds a year ("+$1.20 a year"), from the same prices the server charges (lib/game/claimPrice.js)
const priceTag = (amount) => (amount > 0 ? `+$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a year` : 'free');

// The outside of a building: floors, shape, colours and a rooftop feature (lib/game/exterior.js). It only edits a configuration; the caller decides what to do
// with it: the claim form keeps it until the player claims (the lot shows the building meanwhile), the owner's editor saves a free change at once and asks
// for a payment for a priced one. Beside each choice it says whether it is free (the basic outside) or what it adds a year (lib/content/exteriorPrices.js).
//   plot    the lot or the building       type   the kind of business       value   the current configuration       onChange(config)
export default function ExteriorBuilder({ plot, type, value, onChange }) {
  const config = useMemo(() => cleanExterior(value, plot, type), [value, plot, type]);
  const range = useMemo(() => floorRange(plot, type), [plot, type]);
  const shaped = useMemo(() => ({ ...plot, owner: plot.owner ?? 'draft', buildingType: type, ...applyExterior(plot, config, type) }), [plot, type, config]);
  const shapes = useMemo(() => modelOptions(shaped), [shaped]);
  const allPlots = useCityStore((s) => s.plots);
  const room = useMemo(() => backRoom(plot, allPlots) - 0.08, [plot, allPlots]); // free ground behind the building
  const set = (patch) => onChange(cleanExterior({ ...config, ...patch }, plot, type));
  const wall = wallColorOf(config);
  const btn = 'rounded-full border px-2.5 py-1 text-[11px] transition';
  const yearly = useMemo(() => outsideCost(config, plot, type), [config, plot, type]);
  const nextFloor = config.floors < range.max ? choiceCost(config, { floors: config.floors + 1 }, plot, type) : 0;

  return (
    <div className="space-y-3 rounded-xl border border-sx-stroke bg-sx-alt/40 p-3 text-xs text-slate-200" data-testid="exterior-builder">
      {/* what this outside costs a year, on top of the land */}
      <p className="rounded-lg border border-sx-stroke bg-sx-page/60 px-2 py-1 text-[11px] text-slate-300" data-testid="outside-yearly">
        {yearly.total > 0 ? <>This outside: <b className="text-white">${yearly.total.toLocaleString()} a year</b> on top of the land ({yearly.lines.map((l) => l.label.toLowerCase()).join(', ')}).</> : <>This outside is the basic one: <b className="text-white">free</b>.</>}
      </p>

      {/* floors */}
      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Height</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => set({ floors: config.floors - 1, model: null })} disabled={config.floors <= range.min} aria-label="One floor fewer" className="rounded-lg border border-sx-stroke p-1.5 hover:bg-sx-alt disabled:opacity-30" data-testid="floors-down"><Minus className="h-3.5 w-3.5" /></button>
          <span className="min-w-[4.5rem] text-center"><span className="font-mono text-lg font-bold text-white" data-testid="floors-count">{config.floors}</span> <span className="text-slate-400">floor{config.floors === 1 ? '' : 's'}</span></span>
          <button type="button" onClick={() => set({ floors: config.floors + 1, model: null })} disabled={config.floors >= range.max} aria-label="One floor more" className="rounded-lg border border-sx-stroke p-1.5 hover:bg-sx-alt disabled:opacity-30" data-testid="floors-up"><Plus className="h-3.5 w-3.5" /></button>
          <span className="ml-1 text-[11px] text-slate-400"><b className="text-slate-200">{tierName(config.floors)}</b>: {tierNote(config.floors).split(': ')[1]}</span>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">This plot allows up to {range.max} floors; up to {range.typical} {range.typical === 1 ? 'is' : 'are'} free.{range.max >= 10 ? " From 10 floors the shapes are skyscrapers." : ""}{config.floors < range.max ? <> The next floor: <span data-testid="floor-price">{priceTag(nextFloor)}</span>.</> : null}</p>
      </div>

      {/* shape */}
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Shape <span className="font-normal normal-case text-slate-500">(free)</span></span>
        <select value={config.model ?? ''} onChange={(e) => set({ model: e.target.value || null })} className="w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1.5 text-xs text-white" data-testid="shape-select">
          <option value="">Let the city pick one that fits</option>
          {shapes.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.kit}, {m.minFloors === m.maxFloors ? `${m.maxFloors}` : `${m.minFloors} to ${m.maxFloors}`} floors)</option>
          ))}
        </select>
      </label>

      {/* colours */}
      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Colours <span className="font-normal normal-case text-slate-500">(free)</span></span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colour styles">
          {PALETTES.map((p) => (
            <button key={p.id} type="button" onClick={() => set({ palette: p.id, wallColor: null, crownColor: p.accent })} aria-pressed={config.palette === p.id && !config.wallColor} className={`${btn} flex items-center gap-1.5 ${config.palette === p.id && !config.wallColor ? 'border-sx-cyan bg-sx-cyan/15 text-white' : 'border-sx-stroke hover:bg-sx-alt'}`} data-testid={`palette-${p.id}`}>
              <span className="flex"><span className="h-3 w-3 rounded-l-full border border-black/30" style={{ background: p.wall ?? plot.color ?? '#10b981' }} /><span className="h-3 w-3 rounded-r-full border border-black/30" style={{ background: p.accent }} /></span>
              {p.label}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
          Walls
          <input type="color" value={wall ?? plot.color ?? '#10b981'} onChange={(e) => set({ wallColor: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-sx-stroke bg-transparent p-0.5" aria-label="Wall colour" data-testid="wall-color" />
          {config.wallColor && <button type="button" onClick={() => set({ wallColor: null })} className="text-[11px] text-slate-400 underline hover:text-white">use the style's</button>}
        </label>
      </div>

      {/* behind the building */}
      <div data-testid="back-options">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Behind the building</span>
        {room < MIN_ROOM ? (
          <p className="text-[11px] text-slate-500">There is no room behind this lot: another building stands right against it.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Behind the building">
              {BACKS.map((b) => (
                <button key={b.id} type="button" title={b.hint} onClick={() => set({ back: b.id })} aria-pressed={config.back === b.id} className={`${btn} ${config.back === b.id ? 'border-sx-cyan bg-sx-cyan/15 text-white' : 'border-sx-stroke hover:bg-sx-alt'}`} data-testid={`back-${b.id}`}>
                  {b.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{room.toFixed(1)} units of free ground behind this lot; the items are fitted to it.</p>
          </>
        )}
      </div>

      {/* rooftop */}
      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">On the roof</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roof feature">
          {CROWNS.map((c) => (
            <button key={c.id} type="button" title={c.hint} onClick={() => set({ crown: c.id })} aria-pressed={config.crown === c.id} className={`${btn} ${config.crown === c.id ? 'border-sx-cyan bg-sx-cyan/15 text-white' : 'border-sx-stroke hover:bg-sx-alt'}`} data-testid={`crown-${c.id}`}>
              {c.label}
              {c.id !== 'none' && <span className="ml-1 text-[10px] opacity-70" data-testid={`crown-price-${c.id}`}>{priceTag(choiceCost({ ...config, crown: 'none' }, { crown: c.id }, plot, type))}</span>}
            </button>
          ))}
        </div>
        {config.crown !== 'none' && (
          <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
            Its colour
            <input type="color" value={config.crownColor ?? paletteById(config.palette).accent} onChange={(e) => set({ crownColor: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-sx-stroke bg-transparent p-0.5" aria-label="Roof feature colour" />
          </label>
        )}
      </div>
    </div>
  );
}
