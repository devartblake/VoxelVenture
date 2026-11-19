"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Flag, LogOut, RotateCcw, RotateCw, Users } from 'lucide-react';
import { useGolf } from '@/lib/state/golfStore';
import { golfersNearby } from '@/lib/net/multiplayer';
import { cardTotals, scoreName, toPar } from '@/lib/world/golfScore';

const Box = ({ children }) => <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-sx-line bg-sx-panel/90 px-4 py-2.5 text-xs text-slate-100 shadow-xl backdrop-blur-md">{children}</div>;
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The angle indicator: a small dial with the way to the cup straight up (the green dot) and the aim as the yellow line, so how far off the cup you are aiming reads at a glance, and as degrees.
function AimDial({ off }) {
  const deg = (off * 180) / Math.PI, r = 26;
  return (
    <svg width="64" height="64" viewBox="-32 -32 64 64" aria-label={`Aim ${Math.round(deg)} degrees from the cup`} data-testid="golf-dial">
      <circle r={r} fill="rgba(15,23,42,0.6)" stroke="#475569" />
      <circle cx="0" cy={-r} r="3.2" fill="#4ade80" />
      <line x1="0" y1="0" x2={Math.sin(off) * (r - 4)} y2={-Math.cos(off) * (r - 4)} stroke="#fde047" strokeWidth="3" strokeLinecap="round" />
      <circle r="2.5" fill="#f8fafc" />
    </svg>
  );
}

// The phone's dock (docs/world/minigolf.md, "On a phone"): the controls sit where the thumbs rest, at the bottom corners, and are big (at least 56 px): the aim to the left (a turn each way, held, with the dial and the angle between), the
// putt to the right, one round button held to charge and let go to hit, with the power as a ring that fills round it and as a number. The same actions as the desktop panel and a drag on the world, which still works anywhere.
function PhoneDock({ g, off, hold }) {
  const aiming = g.phase === 'aim', R = 44, C = 2 * Math.PI * R;
  const deg = Math.round((off * 180) / Math.PI);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:hidden" data-testid="golf-dock">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-sx-line bg-sx-panel/90 p-1.5 shadow-xl backdrop-blur-md">
        <button className="flex h-16 w-16 touch-none select-none items-center justify-center rounded-full bg-slate-700/80 active:bg-slate-600" aria-label="Aim left" disabled={!aiming} {...hold(-1)}><RotateCcw className="h-6 w-6" /></button>
        <div className="flex w-14 flex-col items-center"><AimDial off={off} /><span className="text-[11px] tabular-nums text-slate-300">{deg >= 0 ? '+' : ''}{deg}°</span></div>
        <button className="flex h-16 w-16 touch-none select-none items-center justify-center rounded-full bg-slate-700/80 active:bg-slate-600" aria-label="Aim right" disabled={!aiming} {...hold(1)}><RotateCw className="h-6 w-6" /></button>
      </div>
      <button
        className="pointer-events-auto relative flex h-28 w-28 touch-none select-none items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl active:bg-emerald-500 disabled:opacity-50"
        disabled={!aiming}
        onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* (no such active pointer) */ } useGolf.getState().charge(true); }}
        onPointerUp={() => useGolf.getState().release()}
        onPointerCancel={() => useGolf.getState().release()}
        aria-label="Hold to putt"
        data-testid="golf-putt-phone"
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="-50 -50 100 100" aria-hidden="true">
          <circle r={R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="5" />
          <circle r={R} fill="none" stroke="#fde047" strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - g.power)} />
        </svg>
        <span className="relative flex flex-col items-center leading-tight"><b className="text-lg tabular-nums">{g.phase === 'roll' ? '…' : `${Math.round(g.power * 100)}%`}</b><span className="text-[11px] font-semibold">{g.phase === 'roll' ? 'rolling' : 'hold, release'}</span></span>
      </button>
    </div>
  );
}

// The mini-golf panel (lib/state/golfStore.js): the hole, who is playing, the strokes, the aim and power indicators and controls (keys, a drag on the world, a gamepad, and buttons for touch and mouse), the result of a hole and
// the card at the end.
export default function GolfHud() {
  const g = useGolf();
  const turning = useRef(0);
  const [others, setOthers] = useState([]);
  useEffect(() => { const t = setInterval(() => setOthers((o) => { const n = golfersNearby(); return JSON.stringify(n) === JSON.stringify(o) ? o : n; }), 1000); return () => clearInterval(t); }, []);
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
  const two = g.players === 2;
  const hold = (dir) => ({ onPointerDown: (e) => { e.preventDefault(); turning.current = dir; }, onPointerUp: () => { turning.current = 0; }, onPointerLeave: () => { turning.current = 0; }, onPointerCancel: () => { turning.current = 0; } });
  const off = g.ball && hole ? norm(g.aim - Math.atan2(hole.cup.z - g.ball.z, hole.cup.x - g.ball.x)) : 0;
  const total = (i) => cardTotals(g.cards[i], g.course.holes);
  const canAddPlayer = g.phase === 'aim' && g.hole === 1 && strokes === 0 && g.player === 0 && !g.cards[0].length;
  return (
    <>
    <div className="pointer-events-none absolute left-1/2 top-[8.2rem] z-20 flex -translate-x-1/2 flex-col items-center gap-1.5 max-sm:top-14" data-testid="golf-hud">
      {card ? (
        <Box>
          <div className="flex items-center gap-2 text-sm font-semibold"><Flag className="h-4 w-4 text-emerald-300" /> {g.course.name}: round complete{two && g.round?.winner >= 0 ? ` · ${g.names[g.round.winner]} wins` : two ? ' · a tie' : ''}</div>
          <table className="text-[11px] tabular-nums">
            <thead><tr className="text-slate-400"><th className="px-1.5 text-left">Hole</th>{g.course.holes.map((h) => <th key={h.n} className="px-1.5">{h.n}</th>)}<th className="px-1.5">Total</th></tr></thead>
            <tbody>
              <tr><td className="px-1.5 text-slate-400">Par</td>{g.course.holes.map((h) => <td key={h.n} className="px-1.5 text-center">{h.par}</td>)}<td className="px-1.5 text-center">{g.course.par}</td></tr>
              {Array.from({ length: g.players }, (_, i) => (
                <tr key={i}><td className="px-1.5 text-slate-300">{g.names[i]}</td>{g.course.holes.map((h) => <td key={h.n} className="px-1.5 text-center font-semibold">{g.cards[i][h.n - 1] ?? '-'}</td>)}<td className="px-1.5 text-center font-semibold">{total(i).strokes} ({toPar(total(i).diff)})</td></tr>
              ))}
            </tbody>
          </table>
          {!two && g.round?.saved && !g.round.saved.error && <div className="text-sky-300" data-testid="golf-saved">{g.round.saved.record ? 'New best on the leaderboard' : 'Saved to the leaderboard'}: rank {g.round.saved.rank} ({g.round.saved.best} strokes best)</div>}
          {!two && g.round?.saved?.error && <div className="text-slate-400">The leaderboard could not be reached; your round is not saved.</div>}
          <div className="text-slate-300">{!two && (g.round?.isBest ? 'A new best round on this device!' : g.round?.best ? `Your best on this device: ${g.round.best.strokes} (${toPar(g.round.best.strokes - g.round.best.par)})` : '')}</div>
          <div className="flex gap-2">
            <button className="rounded-full border border-sx-line px-3 py-1 hover:bg-sx-alt" onClick={() => useGolf.getState().start(1, { players: g.players, names: g.names })}>Play again</button>
            <button className="flex items-center gap-1 rounded-full border border-sx-line px-3 py-1 hover:bg-sx-alt" onClick={() => useGolf.getState().quit()}><LogOut className="h-3 w-3" /> Done</button>
          </div>
        </Box>
      ) : (
        <Box>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm max-sm:gap-x-2 max-sm:text-xs">
            <Flag className="h-4 w-4 text-emerald-300" />
            <span className="font-semibold">Hole {g.hole}</span><span className="text-slate-400">par {hole.par}</span>
            {two && <span className="rounded-full bg-sky-600/70 px-2 py-0.5 font-semibold" data-testid="golf-player">{g.names[g.player]}</span>}
            <span>Strokes <b className="tabular-nums">{strokes}</b></span>
            {tot.played > 0 && <span className="text-slate-400">Card {tot.strokes} ({toPar(tot.diff)})</span>}
          </div>
          {done ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="text-base font-semibold text-emerald-300" data-testid="golf-result">{g.note.sunk ? scoreName(g.note.strokes, g.note.par) : 'Picked up'} ({g.note.strokes})</div>
              <button className="rounded-full bg-emerald-600 px-4 py-1 font-semibold text-white hover:bg-emerald-500" onClick={() => useGolf.getState().next()} data-testid="golf-next">{two && g.player === 0 ? `${g.names[1]}'s turn` : g.hole >= g.course.holes.length ? 'See the card' : 'Next hole'} (Enter)</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 max-sm:hidden">
                <div className="flex flex-col items-center"><AimDial off={off} /><span className="tabular-nums text-[11px] text-slate-300" data-testid="golf-angle">{off >= 0 ? '+' : ''}{Math.round((off * 180) / Math.PI)}° off the cup</span></div>
                <div className="flex flex-col items-center gap-1.5">
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
                  <div className="flex w-52 items-center gap-2" aria-label="Power">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-700"><div className="h-full" style={{ width: `${Math.round(g.power * 100)}%`, background: `hsl(${Math.round(130 - g.power * 120)} 80% 50%)` }} /></div>
                    <span className="w-9 text-right tabular-nums text-[11px] text-slate-300" data-testid="golf-power">{Math.round(g.power * 100)}%</span>
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 max-sm:hidden">Drag back from the ball to aim and set the power · A D or arrows: aim · hold Space: power · gamepad: stick, hold A · Esc: put the club away</div>
              {others.length > 0 && (
                <div className="w-full border-t border-sx-line pt-1.5 text-[11px] max-sm:hidden" data-testid="golf-others">
                  <div className="mb-0.5 text-slate-400">Playing here now</div>
                  {others.slice(0, 4).map((o) => <div key={o.id} className="flex justify-between gap-4"><span className="font-semibold">{o.name}</span><span className="tabular-nums text-slate-300">hole {o.hole} · {o.strokes} stroke{o.strokes === 1 ? '' : 's'} · card {o.card} ({toPar(o.diff)})</span></div>)}
                </div>
              )}
              {canAddPlayer && (
                <button className="flex items-center gap-1 rounded-full border border-sx-line px-3 py-0.5 text-[11px] hover:bg-sx-alt" onClick={() => useGolf.getState().start(1, { players: two ? 1 : 2, names: ['Player 1', 'Player 2'] })} data-testid="golf-players">
                  <Users className="h-3 w-3" /> {two ? 'Play alone' : 'Play with a friend (turns, one device)'}
                </button>
              )}
            </>
          )}
          <button className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200" onClick={() => useGolf.getState().quit()}><LogOut className="h-3 w-3" /> Put the club away</button>
        </Box>
      )}
    </div>
    {!card && !done && <PhoneDock g={g} off={off} hold={hold} />}
    </>
  );
}
