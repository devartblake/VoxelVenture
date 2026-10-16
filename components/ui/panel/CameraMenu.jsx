"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { LIMITS, PRESETS, VIEW_IDS, useView } from '@/lib/state/viewStore';

const deg = (rad) => Math.round((rad * 180) / Math.PI);
const norm = (rad) => Math.atan2(Math.sin(rad), Math.cos(rad));

function Slider({ label, value, min, max, step = 1, onChange, text }) {
  return (
    <label className="mb-2 block text-[11px] text-slate-300">
      <span className="flex justify-between">
        {label} <span className="font-mono text-slate-100">{text}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-violet-400" />
    </label>
  );
}

// The camera button: opens a menu of views (like an action RPG's camera options) and, for the follow views, sliders for zoom,
// tilt and turn. The same things are on the keyboard: wheel zoom, Q / E turn, R / F tilt, V next view, Home reset.
export default function CameraMenu({ className }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const { view, azimuth, pitch, distance, setView, setDistance, setPitch, setAzimuth, reset } = useView();
  const iso = Boolean(PRESETS[view].iso);
  const first = Boolean(PRESETS[view].fp);
  const look = useView((s) => s.look);
  const free = useView((s) => Boolean(s.free));

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} title={`Camera: ${PRESETS[view].label}`} aria-label={`Camera: ${PRESETS[view].label}. Choose a view`} aria-expanded={open} className={`${className} ${open ? '!bg-gradient-to-r from-sx-purple to-sx-blue !text-white' : ''}`} data-tool="camera">
        <Camera className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div role="menu" aria-label="Camera views" className="fixed right-16 top-1/2 z-40 max-h-[86dvh] w-64 -translate-y-1/2 overflow-y-auto rounded-xl border border-sx-stroke bg-sx-page/95 p-2 shadow-2xl backdrop-blur-md max-sm:right-14 max-sm:w-60">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Camera</p>
          <ul className="mb-2 space-y-0.5">
            {VIEW_IDS.map((id) => (
              <li key={id}>
                <button role="menuitemradio" aria-checked={view === id} onClick={() => setView(id)} className={`w-full rounded-md px-2 py-1 text-left ${view === id ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-200 hover:bg-sx-alt'}`} data-view={id}>
                  <span className="block text-xs font-medium">{PRESETS[id].label}</span>
                  <span className={`block text-[10px] ${view === id ? 'text-violet-100' : 'text-slate-500'}`}>{PRESETS[id].hint}</span>
                </button>
              </li>
            ))}
          </ul>
          {iso ? (
            <p className="px-1 pb-1 text-[10px] text-slate-500">Drag to pan the map; the wheel or + / − zoom it. Pick another view to follow your avatar.</p>
          ) : first ? (
            <div className="border-t border-sx-alt px-1 pt-2">
              <Slider label="Look up / down" value={deg(look)} min={deg(LIMITS.look[0])} max={deg(LIMITS.look[1])} onChange={(v) => useView.setState({ look: (v * Math.PI) / 180 })} text={`${deg(look)}°`} />
              <Slider label="Turn" value={deg(norm(azimuth))} min={-180} max={180} onChange={(v) => setAzimuth((v * Math.PI) / 180)} text={`${deg(norm(azimuth))}°`} />
              <p className="text-[10px] leading-snug text-slate-500">Right-drag or one finger: look · Q / E: turn · R / F: look up and down · V: next view · Home: reset</p>
            </div>
          ) : (
            <div className="border-t border-sx-alt px-1 pt-2">
              <Slider label="Zoom (distance)" value={Math.log(distance)} min={Math.log(LIMITS.distance[0])} max={Math.log(LIMITS.distance[1])} step={0.01} onChange={(v) => setDistance(Math.exp(v))} text={`${Math.round(distance)}`} />
              <Slider label="Tilt (looking down)" value={deg(pitch)} min={deg(LIMITS.pitch[0])} max={deg(LIMITS.pitch[1])} onChange={(v) => setPitch((v * Math.PI) / 180)} text={`${deg(pitch)}°`} />
              <Slider label="Turn round the avatar" value={deg(norm(azimuth))} min={-180} max={180} onChange={(v) => setAzimuth((v * Math.PI) / 180)} text={`${deg(norm(azimuth))}°`} />
              <button onClick={() => (free ? useView.getState().endFree() : useView.getState().startFree())} aria-pressed={free} className={`mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border py-1 text-[11px] ${free ? 'border-sx-purple bg-sx-purple/30 text-white' : 'border-sx-stroke bg-sx-alt text-slate-200 hover:bg-sx-stroke'}`} data-testid="look-around">
                {free ? 'Back to my avatar (G)' : 'Look around the city (G)'}
              </button>
              <button onClick={reset} className="mb-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-sx-stroke bg-sx-alt py-1 text-[11px] text-slate-200 hover:bg-sx-stroke">
                <RotateCcw className="h-3 w-3" /> Reset this view
              </button>
              <p className="text-[10px] leading-snug text-slate-500">Wheel or pinch: zoom · Q / E: turn · R / F: tilt · right-drag: turn and tilt · V: next view · Home: reset · G: look around (drag to pan)</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
