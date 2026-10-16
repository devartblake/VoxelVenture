"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Footprints, Hand } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';
import { usePanel } from '@/lib/state/panelStore';
import { avatarState } from '@/lib/sim/avatarState';

const RADIUS = 48; // how far the thumb can push the knob

// On-screen controls for phones and tablets: a joystick (bottom-left) that walks the avatar, a run
// toggle and an interact button (bottom-right). They feed the same movement code as the keyboard
// (see lib/sim/avatarState.js) and hide while a card, the wardrobe or an interior is open.
export default function TouchControls() {
  const [show, setShow] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [run, setRun] = useState(false);
  const base = useRef(null);
  const pointer = useRef(null);

  const prompt = useWorld((s) => s.prompt);
  const panelOpen = usePanel((s) => Boolean(s.view));
  const busy = useCityStore((s) => Boolean(s.activeInteriorPlot || s.wardrobeOpen || s.selectedPlot || s.selectedPark || s.selectedBillboardId)) || panelOpen;

  useEffect(() => {
    const q = window.matchMedia('(pointer: coarse), (max-width: 639px)');
    const update = () => setShow(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);

  // never leave the avatar walking when the controls disappear
  useEffect(() => {
    if (!show || busy) {
      avatarState.joy = null;
      pointer.current = null;
      setKnob({ x: 0, y: 0 });
    }
  }, [show, busy]);
  useEffect(() => () => {
    avatarState.joy = null;
    avatarState.run = false;
  }, []);

  if (!show || busy) return null;

  const move = (e) => {
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    avatarState.joy = { x: dx / RADIUS, y: -dy / RADIUS };
  };
  const release = () => {
    pointer.current = null;
    avatarState.joy = null;
    setKnob({ x: 0, y: 0 });
  };

  const toggleRun = () => {
    avatarState.run = !avatarState.run;
    setRun(avatarState.run);
  };

  return (
    <>
      <div
        ref={base}
        className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 h-32 w-32 -translate-x-1/2 touch-none select-none rounded-full border border-sx-line/70 bg-sx-panel/50 backdrop-blur-sm"
        onPointerDown={(e) => {
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          avatarState.target = null;
          move(e);
        }}
        onPointerMove={(e) => pointer.current === e.pointerId && move(e)}
        onPointerUp={release}
        onPointerCancel={release}
        role="application"
        aria-label="Walk joystick"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/60 bg-violet-500/60 shadow-lg"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-20 flex flex-col items-center gap-3">
        {prompt && (
          <button
            onClick={prompt.action}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/70 bg-amber-500/80 text-slate-950 shadow-xl active:scale-95"
            aria-label={prompt.label}
          >
            <Hand className="h-7 w-7" />
          </button>
        )}
        <button
          onClick={toggleRun}
          className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg active:scale-95 ${run ? 'border-violet-300 bg-violet-500 text-white' : 'border-sx-line bg-sx-panel/70 text-slate-300'}`}
          aria-label="Run"
          aria-pressed={run}
        >
          <Footprints className="h-5 w-5" />
        </button>
      </div>
    </>
  );
}
