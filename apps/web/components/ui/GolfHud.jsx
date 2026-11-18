"use client";

import React, { useEffect, useRef } from 'react';
import { Flag, LogOut, RotateCcw, RotateCw } from 'lucide-react';
import { useGolf } from '@/lib/state/golfStore';
import { cardTotals, scoreName, toPar } from '@/lib/world/golfScore';

const Box = ({ children }) => <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-sx-line bg-sx-panel/90 px-4 py-2.5 text-xs text-slate-100 shadow-xl backdrop-blur-md">{children}</div>;

// The mini-golf panel (lib/state/golfStore.js): the hole, the strokes, the aim and power controls (keys, and buttons for touch and mouse), the result of a hole and the card at the end.
export default function GolfHud() {
  const g = useGolf();
  const turning = useRef(0);
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (t) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (turning.current) useGolf.getState().turn(turning.current, dt); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!g.active || !g.course) return null;
  const hole = g.course.holes.find((h) => h.n === g.hole);
  const strokes = g.ball?.strokes ?? 0;
  const done = g.phase === 'done', card = g.phase === 'card';
  const tot = cardTotals(g.card, g.course.holes);
  const hold = (dir) => ({ onPointerDown: (e) => { e.preventDefault(); turning.current = dir; }, onPointerUp: () => { turning.current = 0; }, onPointerLeave: () => { turning.current = 0; }, onPointerCancel: () => { turning.current = 0; } });
  return (
    <div className="pointer-events-none absolute left-1/2 top-[8.2rem] z-20 flex -translate-x-1/2 flex-col items-center gap-1.5 max-sm:top-14" data-testid="golf-hud">
      {card ? (
        <Box>
          <div className="flex items-center gap-2 text-sm font-semibold"><Flag className="h-4 w-4 text-emerald-300" /> {g.course.name}: round complete</div>
          <table className="text-[11px] tabular-nums">
            <thead><tr className="text-slate-400"><th className="px-1.5 text-left">Hole</th>{g.course.holes.map((h) => <th key={h.n} className="px-1.5">{h.n}</th>)}<th className="px-1.5">Total</th></tr></thead>
            <tbody>
              <tr><td className="px-1.5 text-slate-400">Par</td>{g.course.holes.map((h) => <td key={h.n} className="px-1.5 text-center">{h.par}</td>)}<td className="px-1.5 text-center">{g.course.par}</td></tr>
              <tr><td className="px-1.5 text-slate-400">You</td>{g.course.holes.map((h) => <td key={h.n} className="px-1.5 text-center font-semibold">{g.card[h.n - 1] ?? '-'}</td>)}<td className="px-1.5 text-center font-semibold">{g.round?.strokes} ({toPar(g.round?.diff ?? 0)})</td></tr>
            </tbody>
          </table>
          <div className="text-slate-300">{g.round?.isBest ? 'A new best round on this device!' : g.round?.best ? `Your best on this device: ${g.round.best.strokes} (${toPar(g.round.best.strokes - g.round.best.par)})` : ''}</div>
          <div className="flex gap-2">
            <button className="rounded-full border border-sx-line px-3 py-1 hover:bg-sx-alt" onClick={() => useGolf.getState().start(1)}>Play again</button>
            <button className="flex items-center gap-1 rounded-full border border-sx-line px-3 py-1 hover:bg-sx-alt" onClick={() => useGolf.getState().quit()}><LogOut className="h-3 w-3" /> Done</button>
          </div>
        </Box>
      ) : (
        <Box>
          <div className="flex items-center gap-3 text-sm">
            <Flag className="h-4 w-4 text-emerald-300" />
            <span className="font-semibold">Hole {g.hole}</span><span className="text-slate-400">par {hole.par}</span>
            <span>Strokes <b className="tabular-nums">{strokes}</b></span>
            {tot.played > 0 && <span className="text-slate-400">Card {tot.strokes} ({toPar(tot.diff)})</span>}
          </div>
          {done ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="text-base font-semibold text-emerald-300" data-testid="golf-result">{g.note.sunk ? scoreName(g.note.strokes, g.note.par) : 'Picked up'} ({g.note.strokes})</div>
              <button className="rounded-full bg-emerald-600 px-4 py-1 font-semibold text-white hover:bg-emerald-500" onClick={() => useGolf.getState().next()} data-testid="golf-next">{g.hole >= g.course.holes.length ? 'See the card' : 'Next hole'} (Enter)</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button className="rounded-full border border-sx-line p-1.5 hover:bg-sx-alt" aria-label="Aim left" {...hold(-1)}><RotateCcw className="h-4 w-4" /></button>
                <button
                  className="min-w-[8.5rem] touch-none select-none rounded-full bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  disabled={g.phase !== 'aim'}
                  onPointerDown={(e) => { e.preventDefault(); useGolf.getState().charge(true); }}
                  onPointerUp={() => useGolf.getState().release()}
                  onPointerLeave={() => useGolf.getState().release()}
                  data-testid="golf-putt"
                >{g.phase === 'roll' ? 'Rolling…' : 'Hold to putt'}</button>
                <button className="rounded-full border border-sx-line p-1.5 hover:bg-sx-alt" aria-label="Aim right" {...hold(1)}><RotateCw className="h-4 w-4" /></button>
              </div>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-700" aria-label="Power"><div className="h-full" style={{ width: `${Math.round(g.power * 100)}%`, background: `hsl(${Math.round(130 - g.power * 120)} 80% 50%)` }} /></div>
              <div className="text-[11px] text-slate-400 max-sm:hidden">A D or arrows: aim · hold Space: power, let go to putt · Esc: put the club away</div>
            </>
          )}
          <button className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200" onClick={() => useGolf.getState().quit()}><LogOut className="h-3 w-3" /> Put the club away</button>
        </Box>
      )}
    </div>
  );
}
