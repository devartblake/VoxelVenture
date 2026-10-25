"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, RotateCcw, RotateCw } from 'lucide-react';
import { avatarState } from '@/lib/sim/avatarState';
import { ISO_AZIMUTH, PRESETS, useView } from '@/lib/state/viewStore';
import { useHudExtrasShown } from '@/lib/state/hudStore';

// The compass, top right: it shows which way the camera is facing and turns the camera. The rose turns as the camera does, so the red N always points
// to the real north of the city. Click a letter to face that way (the camera swings round to it), the arrows turn a quarter at a time, and clicking the
// middle faces north again. In the original isometric view the camera cannot turn, so the compass only shows the heading there.
// Facing north is an azimuth of 0; east is -90 degrees, south 180, west +90 (azimuth is the camera's angle round the avatar from +Z towards +X).
const FACES = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };
const NAMES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const SHORT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// 0..359 degrees clockwise from north that the camera looks towards
export const headingOf = (azimuth) => ((((-azimuth * 180) / Math.PI) % 360) + 360) % 360;
export const compassName = (deg) => ({ short: SHORT[Math.round(deg / 45) % 8], long: NAMES[Math.round(deg / 45) % 8] });

// The way the avatar faces, as degrees clockwise from north (the avatar faces (sin yaw, cos yaw) on the ground).
export const avatarHeading = (yaw) => ((((180 - (yaw * 180) / Math.PI) % 360) + 360) % 360);

export default function Compass() {
  const view = useView((s) => s.view);
  const az = useView((s) => s.azimuth);
  const turnTo = useView((s) => s.turnTo);
  const fixed = Boolean(PRESETS[view]?.iso);
  const live = useView((s) => s.heading);
  // the real camera's heading in world space (from the camera itself); the preset's own angle only until the first frame has been read
  const heading = live ?? headingOf(fixed ? ISO_AZIMUTH : az);
  const azimuth = (-heading * Math.PI) / 180;
  const name = compassName(heading);
  const turnBy = (by) => turnTo(az + by);
  // The yellow arrow on the rose is the avatar: it turns as the avatar does (every frame, straight on the element, not through React) and glows while it walks.
  const marker = useRef(null);
  const here = useRef(null);
  const [facing, setFacing] = useState(avatarHeading(avatarState.yaw));
  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const deg = avatarHeading(avatarState.yaw);
      if (marker.current) {
        marker.current.style.transform = `rotate(${deg}deg)`;
        marker.current.style.opacity = avatarState.moving || avatarState.vehicle ? '1' : '0.7';
      }
      if (here.current) here.current.textContent = `X ${avatarState.x.toFixed(1)}  Z ${avatarState.z.toFixed(1)}`; // the avatar's world position
      const name = compassName(deg).short;
      if (name !== last) {
        last = name;
        setFacing(deg);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const behindMe = () => turnTo(avatarState.yaw + Math.PI); // the camera swings to stand behind the avatar
  const shown = useHudExtrasShown(); // the compact HUD keeps it behind More (lib/state/hudStore.js)
  if (!shown) return null;
  return (
    <div style={{ marginRight: 'env(safe-area-inset-right)' }} className="pointer-events-none fixed right-[84px] top-[88px] z-30 flex flex-col items-center gap-1 pointer-coarse:right-[92px]" data-testid="compass">
      <div className="pointer-events-auto relative h-[68px] w-[68px] rounded-full border border-sx-stroke bg-sx-panel/90 shadow-lg backdrop-blur" role="group" aria-label={`Compass: facing ${name.long}`}>
        <div className="absolute inset-0 transition-transform duration-75" style={{ transform: `rotate(${(azimuth * 180) / Math.PI}deg)` }} data-testid="compass-rose">
          {Object.entries({ N: [50, 12], E: [88, 50], S: [50, 88], W: [12, 50] }).map(([letter, [x, y]]) => (
            <button
              key={letter}
              type="button"
              disabled={fixed}
              onClick={() => turnTo(FACES[letter])}
              title={fixed ? 'The original view cannot turn. Pick another camera to turn.' : `Face ${letter === 'N' ? 'north' : letter === 'E' ? 'east' : letter === 'S' ? 'south' : 'west'}`}
              aria-label={`Face ${letter}`}
              style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${(-azimuth * 180) / Math.PI}deg)` }}
              className={`absolute flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold leading-none ${letter === 'N' ? 'text-red-400' : 'text-slate-200'} ${fixed ? 'cursor-default' : 'hover:bg-white/15'}`}
            >
              {letter}
            </button>
          ))}
          <div ref={marker} className="pointer-events-none absolute inset-0" data-testid="compass-avatar" aria-hidden="true">
            <svg viewBox="0 0 100 100" className="absolute inset-0">
              <polygon points="50,27 57,40 43,40" fill="#facc15" stroke="#422006" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0" aria-hidden="true">
            <polygon points="50,24 56,50 44,50" fill="#f87171" />
            <polygon points="50,76 56,50 44,50" fill="#94a3b8" />
          </svg>
        </div>
        <button type="button" disabled={fixed} onClick={() => turnTo(0)} aria-label="Face north" title={fixed ? 'Facing north-west (fixed)' : 'Face north'} className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-500 bg-sx-page hover:bg-slate-600 disabled:hover:bg-sx-page" />
      </div>
      <div className="pointer-events-none -mb-0.5 text-center text-[10px] text-amber-300" data-testid="compass-you" title="World space: north is -Z, east is +X, south is +Z, west is -X">
        You: {compassName(facing).short}
        <div ref={here} className="font-mono text-[9px] text-slate-400" data-testid="compass-world" />
      </div>
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-sx-stroke bg-sx-panel/90 px-1 py-0.5 text-[10px] text-slate-300 shadow backdrop-blur">
        <button type="button" disabled={fixed} onClick={() => turnBy(Math.PI / 4)} aria-label="Turn the camera left" title="Turn left (Q)" className="rounded-full p-1 hover:bg-white/10 disabled:opacity-30">
          <RotateCcw className="h-3 w-3" />
        </button>
        <span className="min-w-[44px] text-center font-mono" data-testid="compass-heading">
          {name.short} {Math.round(heading)}°
        </span>
        <button type="button" disabled={fixed} onClick={() => turnBy(-Math.PI / 4)} aria-label="Turn the camera right" title="Turn right (E)" className="rounded-full p-1 hover:bg-white/10 disabled:opacity-30">
          <RotateCw className="h-3 w-3" />
        </button>
        <button type="button" disabled={fixed} onClick={behindMe} aria-label="Camera behind me" title="Swing the camera to stand behind your avatar" className="rounded-full p-1 text-amber-300 hover:bg-white/10 disabled:opacity-30">
          <Crosshair className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
