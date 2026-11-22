"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useGolf } from '@/lib/state/golfStore';
import { previewPath } from '@/lib/world/golfPhysics';
import { cardTotals, scoreName, toPar } from '@/lib/world/golfScore';
import { golfLeaderboard, golfLive } from '@/lib/data/golf';

// Mini-golf on its own page (docs/world/minigolf.md, "The web version"): the same course, physics, scoring and saved leaderboard as in the world, drawn from above in line art, with nothing else on
// the screen. One input: pull back from the ball and let go (a slingshot): the line shows where the putt goes and how hard. Works with a finger, a mouse or the keyboard (A D aim, hold Space to putt).
const REACH = 150; // pixels of pull for a full putt
const INK = '#1c2b25', FELT = '#e6efe1', ACCENT = '#0e7a4f';
const physics = (h) => ({ cup: h.cup, segments: h.segments.map(([ax, az, bx, bz, nx, nz]) => ({ a: { x: ax, z: az }, b: { x: bx, z: bz }, nx, nz })) });

export default function GolfPage() {
  const canvas = useRef(null);
  const g = useGolf();
  const [board, setBoard] = useState(null);
  const view = useRef({ s: 10, ox: 0, oz: 0, rot: false }); // the world-to-pixel map of the hole on show (turned a quarter when a long hole is on a tall screen)
  const pull = useRef(null);

  // the course: the baked manifest's, as in the world
  useEffect(() => {
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => { if (alive && m.courses?.length) { useGolf.getState().setCourses(m.courses); const want = new URLSearchParams(window.location.search).get('course'); useGolf.getState().start(1, { players: 1, course: m.courses.some((c) => c.id === want) ? want : m.courses[0].id }); } }).catch(() => {});
    return () => { alive = false; useGolf.getState().quit(); useGolf.getState().setCourses([]); };
  }, []);

  // the saved leaderboard when the card comes up
  useEffect(() => {
    if (g.phase !== 'card' || !g.course || !golfLive()) return;
    golfLeaderboard(g.course.id, 5).then(setBoard).catch(() => {});
  }, [g.phase, g.course, g.round?.saved]);

  // the frame: the physics, then the drawing
  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const s = useGolf.getState();
      if (s.active) s.tick(dt);
      draw(canvas.current, useGolf.getState(), view.current, pull.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // the keys
  useEffect(() => {
    let turning = 0, raf = 0, last = performance.now();
    const loop = (t) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (turning) useGolf.getState().turn(turning, dt); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const down = (e) => {
      const s = useGolf.getState();
      if (e.repeat) return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') turning = -1;
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') turning = 1;
      else if (e.code === 'Space') { e.preventDefault(); s.charge(true); }
      else if (e.code === 'Enter' && s.phase === 'done') s.next();
    };
    const up = (e) => { if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') turning = 0; if (e.code === 'Space') useGolf.getState().release(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // the pull: press anywhere, pull back from where you pressed, let go (the screen is the plan of the course: right is +x, down is +z)
  const onDown = (e) => { if (useGolf.getState().phase !== 'aim') return; try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* (a pointer that is not active: nothing to capture) */ } pull.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, dy: 0 }; };
  const onMove = (e) => {
    const p = pull.current; if (!p || e.pointerId !== p.id) return;
    p.dx = e.clientX - p.x; p.dy = e.clientY - p.y;
    const wx = view.current.rot ? p.dy : p.dx, wz = view.current.rot ? p.dx : p.dy; // (turned, the screen's down is the course's +x and its right is +z)
    useGolf.getState().drag(Math.atan2(-wz, -wx), Math.min(1, Math.hypot(p.dx, p.dy) / REACH));
  };
  const onUp = (e) => { const p = pull.current; if (!p || e.pointerId !== p.id) return; pull.current = null; useGolf.getState().dragEnd(); };

  if (!g.course) return <main className="flex h-dvh items-center justify-center text-sm" style={{ background: FELT, color: INK }}>Loading the course…</main>;
  const hole = g.course.holes.find((h) => h.n === g.hole);
  const strokes = g.ball?.strokes ?? 0, done = g.phase === 'done', card = g.phase === 'card';
  const tot = cardTotals(g.card, g.course.holes);

  return (
    <main className="relative h-dvh w-screen select-none overflow-hidden" style={{ background: FELT, color: INK, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }} data-testid="golf-page">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="golf-canvas" />
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-baseline justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] text-sm">
        <span><b className="text-base">Hole {g.hole}</b> <span className="opacity-60">par {hole?.par} · {g.course.holes.length} holes</span></span>
        <span className="tabular-nums"><b>{strokes}</b> <span className="opacity-60">stroke{strokes === 1 ? '' : 's'}{tot.played ? ` · card ${tot.strokes} (${toPar(tot.diff)})` : ''}</span></span>
      </header>
      {!done && !card && (
        <footer className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-md">
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(28,43,37,0.12)' }} aria-label="Power"><div className="h-full rounded-full" style={{ width: `${Math.round(g.power * 100)}%`, background: ACCENT }} /></div>
            <p className="mt-2 text-center text-xs opacity-60">{g.phase === 'roll' ? 'Rolling…' : 'Pull back from the ball, then let go'}</p>
          </div>
        </footer>
      )}
      {done && g.note && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="text-lg font-semibold" data-testid="golf-result">{g.note.sunk ? scoreName(g.note.strokes, g.note.par) : 'Picked up'} ({g.note.strokes})</div>
          <button className="h-12 min-w-44 rounded-full px-6 text-base font-semibold text-white" style={{ background: ACCENT }} onClick={() => useGolf.getState().next()} data-testid="golf-next">{g.hole >= g.course.holes.length ? 'See the card' : 'Next hole'}</button>
        </div>
      )}
      {card && (
        <div className="absolute inset-0 flex items-center justify-center p-5" style={{ background: 'rgba(230,239,225,0.94)' }}>
          <div className="w-full max-w-sm text-center" data-testid="golf-card">
            <div className="text-3xl font-semibold tabular-nums">{tot.strokes} <span className="text-xl opacity-60">({toPar(tot.diff)})</span></div>
            <div className="mt-1 text-sm opacity-60">{g.course.name} · par {g.course.par}</div>
            <div className="mt-4 grid grid-cols-9 gap-1 text-xs tabular-nums">
              {g.course.holes.map((h) => <div key={h.n} className="rounded border py-1" style={{ borderColor: 'rgba(28,43,37,0.2)' }}><div className="opacity-50">{h.n}</div><b>{g.cards[0][h.n - 1] ?? '-'}</b></div>)}
            </div>
            <div className="mt-4 min-h-5 text-sm" style={{ color: ACCENT }}>
              {g.round?.saved && !g.round.saved.error ? `${g.round.saved.record ? 'New best' : 'Saved'} · rank ${g.round.saved.rank}` : g.round?.isBest ? 'A new best on this device' : golfLive() ? '' : 'Sign in on the game to save scores'}
            </div>
            {board?.board?.length > 0 && (
              <ol className="mx-auto mt-2 max-w-60 text-left text-xs tabular-nums">{board.board.map((r) => <li key={r.rank} className="flex justify-between py-0.5"><span>{r.rank}. {r.name}</span><b>{r.strokes} ({toPar(r.diff)})</b></li>)}</ol>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button className="h-12 min-w-44 rounded-full px-6 text-base font-semibold text-white" style={{ background: ACCENT }} onClick={() => { setBoard(null); useGolf.getState().start(1, { players: 1 }); }}>Play again</button>
              {g.courses.filter((c) => c.id !== g.course.id).map((c) => <button key={c.id} className="h-12 rounded-full border px-5 text-sm font-semibold" style={{ borderColor: ACCENT, color: ACCENT }} onClick={() => { setBoard(null); useGolf.getState().start(1, { players: 1, course: c.id }); }} data-testid="golf-other-course">{c.name}</button>)}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/** Draws the hole from above: its walls, the cup, the ball, and while aiming the line of the putt. */
function draw(cv, s, v, pull) {
  if (!cv || !s.course) return;
  const h = s.course.holes.find((x) => x.n === s.hole);
  if (!h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // fit the hole's bounds into the screen with room for the header and the footer; a long hole on a tall screen is turned a quarter so it runs down the screen
  const x0 = h.bounds.x0, z0 = h.bounds.z0, bw = h.bounds.x1 - x0, bh = h.bounds.z1 - z0;
  const padT = 64, padB = 84, padX = 24, aw = W - padX * 2, ah = H - padT - padB;
  const rot = aw < ah && bw > bh * 1.2;
  const sc = rot ? Math.min(aw / (bh || 1), ah / (bw || 1)) : Math.min(aw / (bw || 1), ah / (bh || 1));
  const offX = padX + (aw - (rot ? bh : bw) * sc) / 2, offY = padT + (ah - (rot ? bw : bh) * sc) / 2;
  v.rot = rot;
  const X = (x, z) => (rot ? offX + (z - z0) * sc : offX + (x - x0) * sc), Z = (x, z) => (rot ? offY + (x - x0) * sc : offY + (z - z0) * sc);
  const dirX = (a) => (rot ? Math.sin(a) : Math.cos(a)), dirY = (a) => (rot ? Math.cos(a) : Math.sin(a)); // a world angle as a screen direction
  // the walls
  ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, sc * 0.16);
  ctx.beginPath();
  for (const [ax, az, bx, bz] of h.segments) { ctx.moveTo(X(ax, az), Z(ax, az)); ctx.lineTo(X(bx, bz), Z(bx, bz)); }
  ctx.stroke();
  // the tee and the cup, with a flag
  const cx = X(h.cup.x, h.cup.z), cz = Z(h.cup.x, h.cup.z);
  ctx.fillStyle = 'rgba(28,43,37,0.15)'; ctx.beginPath(); ctx.arc(X(h.tee.x, h.tee.z), Z(h.tee.x, h.tee.z), sc * 0.45, 0, 7); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx, cz, sc * 0.34, 0, 7); ctx.fill();
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cz); ctx.lineTo(cx, cz - sc * 2.2); ctx.stroke();
  ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.moveTo(cx, cz - sc * 2.2); ctx.lineTo(cx + sc * 1.1, cz - sc * 1.8); ctx.lineTo(cx, cz - sc * 1.4); ctx.fill();
  const ball = s.ball;
  if (!ball) return;
  // the line of the putt, with its power
  if (s.phase === 'aim') {
    const pw = s.power > 0.02 ? s.power : 0.55;
    const path = previewPath({ ...ball }, physics(h), s.aim, pw, 1.6, 0.05);
    ctx.strokeStyle = ACCENT; ctx.globalAlpha = s.power > 0.02 ? 1 : 0.35; ctx.lineWidth = 2; ctx.setLineDash([2, 7]);
    ctx.beginPath(); ctx.moveTo(X(ball.x, ball.z), Z(ball.x, ball.z)); for (const p of path) ctx.lineTo(X(p.x, p.z), Z(p.x, p.z)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (pull && s.power > 0.02) { ctx.strokeStyle = 'rgba(28,43,37,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(ball.x, ball.z), Z(ball.x, ball.z)); ctx.lineTo(X(ball.x, ball.z) - dirX(s.aim) * s.power * 70, Z(ball.x, ball.z) - dirY(s.aim) * s.power * 70); ctx.stroke(); }
  }
  // the ball
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(ball.x, ball.z), Z(ball.x, ball.z), Math.max(4, sc * 0.3), 0, 7); ctx.fill(); ctx.stroke();
}
