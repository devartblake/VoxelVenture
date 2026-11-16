"use client";

import React, { useEffect, useRef, useState } from 'react';
import { avatarState } from '@/lib/sim/avatarState';
import { apiOn } from '@/lib/data/api';
import { raceLeaderboard, raceLive, racePass } from '@/lib/data/race';
import { createLapTimer, formatLap } from '@/lib/world/lapTimer';

// The racing track's lap clock and leaderboard (docs/world/racing_track.md, "Lap timing"). Shown only with ?world=baked, when the avatar is near the circuit. The clock on the page is for show: with an
// account and a game server each pass (the start line, the seven checkpoints) is reported to the server with where the avatar is, and the SERVER times the lap and keeps the board. A guest or a
// game without a server sees the clock but nothing is recorded.
const NEAR = 330; // the panel appears this close to the track's middle

export default function RaceHud() {
  const [on] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('world') === 'baked');
  const [track, setTrack] = useState(null);
  const [view, setView] = useState({ show: false, running: false, ms: 0, next: 0, last: null, best: null, laps: 0, rank: null, note: '' });
  const [board, setBoard] = useState([]);
  const timer = useRef(null);
  const startedAt = useRef(null);

  useEffect(() => {
    if (!on) return undefined;
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => { if (alive && m.tracks?.length) setTrack(m.tracks[0]); }).catch(() => {});
    return () => { alive = false; };
  }, [on]);

  useEffect(() => {
    if (!track) return undefined;
    const points = [{ x: track.start.x, z: track.start.z }, ...track.checkpoints.map((c) => ({ x: c.x, z: c.z }))];
    timer.current = createLapTimer({ points });
    const mid = { x: (track.bounds.x0 + track.bounds.x1) / 2, z: (track.bounds.z0 + track.bounds.z1) / 2 };
    let alive = true;
    const refresh = () => raceLeaderboard(track.id).then((r) => alive && setBoard(r.board ?? [])).catch(() => {});
    refresh();
    const board30 = setInterval(refresh, 30000);
    const tell = (index) => { if (raceLive()) racePass(track.id, index, avatarState.x, avatarState.z).then((r) => { if (r?.event === 'lap') { setView((v) => ({ ...v, last: r.ms, best: r.best, rank: r.rank, note: r.record ? 'A new best lap.' : '' })); refresh(); } }).catch((e) => setView((v) => ({ ...v, note: e?.message ?? '' }))); };
    const tick = setInterval(() => {
      const t = timer.current;
      const near = Math.hypot(avatarState.x - mid.x, avatarState.z - mid.z) < NEAR;
      const now = performance.now();
      for (const e of t.update(avatarState.x, avatarState.z, now)) {
        tell(e.index);
        if (e.type === 'start') { startedAt.current = now; setView((v) => ({ ...v, running: true, next: 1, note: '' })); }
        else if (e.type === 'checkpoint') setView((v) => ({ ...v, next: e.index + 1 }));
        else if (e.type === 'lap') { startedAt.current = now; setView((v) => ({ ...v, laps: e.lap, last: e.ms, best: v.best == null ? e.ms : Math.min(v.best, e.ms), next: 1 })); }
      }
      setView((v) => ({ ...v, show: near || v.running, ms: startedAt.current == null ? 0 : now - startedAt.current }));
    }, 100);
    return () => { alive = false; clearInterval(tick); clearInterval(board30); };
  }, [track]);

  if (!on || !track || !view.show) return null;
  const live = raceLive();
  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, fontVariantNumeric: 'tabular-nums' };
  return (
    <aside aria-label="Lap timer" style={{ position: 'absolute', left: 12, bottom: 96, zIndex: 30, width: 232, padding: '10px 12px', borderRadius: 10, background: 'rgba(8,12,22,0.82)', color: '#e8ecf4', font: '13px/1.45 system-ui, sans-serif', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)' }}>
      <div style={{ fontWeight: 700, letterSpacing: 0.3, marginBottom: 4 }}>{track.name}</div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }} data-testid="lap-clock">{view.running ? formatLap(view.ms) : 'Drive over the start line'}</div>
      <div style={{ display: 'flex', gap: 4, margin: '6px 0' }} aria-label={`Checkpoint ${Math.max(0, view.next - 1)} of 7`}>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: view.running && view.next > i ? '#4cc3d1' : 'rgba(255,255,255,0.22)' }} />)}
      </div>
      <div style={row}><span>Last lap</span><span>{formatLap(view.last)}</span></div>
      <div style={row}><span>Best lap</span><span>{formatLap(view.best)}</span></div>
      {view.rank ? <div style={row}><span>Your place</span><span>{view.rank}</span></div> : null}
      {view.note ? <div style={{ color: '#f3c46b', marginTop: 4 }}>{view.note}</div> : null}
      <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 6 }}>
        <div style={{ opacity: 0.7, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Leaderboard</div>
        {board.length ? board.slice(0, 5).map((r) => <div key={r.name} style={row}><span>{r.rank}. {r.name}</span><span>{formatLap(r.ms)}</span></div>) : <div style={{ opacity: 0.7 }}>No laps yet.</div>}
      </div>
      {!live ? <div style={{ marginTop: 6, opacity: 0.7, fontSize: 11.5 }}>{apiOn() ? 'Sign in to put your laps on the board.' : 'Laps are timed here but not recorded: no game server.'}</div> : null}
    </aside>
  );
}
