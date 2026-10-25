"use client";

import React from 'react';
import { Anchor, Car, Fish, LogOut } from 'lucide-react';
import { useFleet } from '@/lib/state/fleetStore';
import { useCityStore } from '@/lib/state/store';

// Shown while you are driving or sailing: the speed, the controls, a way to get out (for touch and mouse), and the
// state of the fishing line.
export default function VehicleHud() {
  const hud = useFleet((s) => s.hud);
  if (!hud) return null;
  const leave = () => {
    const r = useFleet.getState().exit();
    const notify = useCityStore.getState().notify;
    if (r === 'docking') notify('Heading for the nearest pier. Take the wheel (W A S D) to stop.');
    else if (!r) notify(hud.kind === 'boat' ? 'There is no pier on this water: steer closer to the shore to get out.' : 'No room to get out here.');
  };
  const boat = hud.kind === 'boat';
  const status = hud.docking ? 'Sailing to the nearest pier: steer to take the wheel' : hud.phase === 'bite' ? 'Bite! Reel it in!' : hud.phase === 'waiting' ? 'Line out… waiting for a bite' : 'Line in';
  return (
    <div className="pointer-events-none absolute left-1/2 top-[8.2rem] z-20 flex -translate-x-1/2 flex-col items-center gap-1.5 max-sm:top-14">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-sx-line bg-sx-panel/90 px-4 py-1.5 text-xs text-slate-100 shadow-xl backdrop-blur-md">
        {boat ? <Anchor className="h-4 w-4 text-sky-300" /> : <Car className="h-4 w-4 text-amber-300" />}
        <span className="font-mono tabular-nums">{(hud.speed * 3.6).toFixed(0)} km/h</span>
        <span className="max-sm:hidden pointer-coarse:hidden text-slate-400">{boat ? 'W / S power · A / D steer · Space cast and reel · X leave (it sails you to a pier if you are far out)' : 'W / S gas and brake · A / D steer · E or X get out'}</span>
        {/* on a touch screen: the same, with the on-screen controls */}
        <span className="hidden text-slate-400 pointer-coarse:inline" data-testid="vehicle-touch-hint">{boat ? 'Joystick: power and steer · Leave takes you to a pier' : 'Joystick: drive and steer · Get out to walk'}</span>
        <button onClick={leave} className="flex items-center gap-1 rounded-full border border-sx-line px-2 py-0.5 hover:bg-sx-alt" aria-label={boat ? 'Leave the boat' : 'Get out of the car'}>
          <LogOut className="h-3 w-3" /> {boat ? 'Leave' : 'Get out'}
        </button>
      </div>
      {boat && (
        <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] shadow-lg backdrop-blur-md ${hud.phase === 'bite' ? 'animate-pulse border-amber-400 bg-amber-950/90 text-amber-200' : 'border-sx-stroke bg-sx-panel/80 text-slate-300'}`}>
          <Fish className="h-3.5 w-3.5" /> {status}
        </div>
      )}
    </div>
  );
}
