"use client";

import React, { useEffect, useState } from 'react';
import { Moon, Music, Sun, Sunrise, Sunset, Volume2, VolumeX } from 'lucide-react';
import { clockLabel, modeHour, skyAt } from '@/lib/game/dayCycle';
import { useSound, useSoundNow } from '@/lib/state/soundStore';
import { syncClock, useTime } from '@/lib/state/timeStore';
import { apiBase } from '@/lib/data/api';
import { useQuietHud } from '@/lib/state/hudStore';

// Bottom right: the time of day (the city's shared clock; click it for Live / Dawn / Day / Dusk / Night) and the speaker button with its volume.
// On a phone they stack bottom left, clear of the joystick in the middle and the run and interact buttons on the right, and step aside
// while a building card is open (lib/state/hudStore.js).
const MODES = [
  ['live', 'Live (shared clock)'],
  ['dawn', 'Dawn'],
  ['day', 'Day'],
  ['dusk', 'Dusk'],
  ['night', 'Night'],
];
const ICON = { Dawn: Sunrise, Day: Sun, Dusk: Sunset, Night: Moon };

export default function AmbientControls() {
  const mode = useTime((s) => s.mode);
  const offset = useTime((s) => s.offset);
  const ready = useTime((s) => s.hydrated); // the clock is read after mount, so the first render matches the server's
  const on = useSound((s) => s.on);
  const volume = useSound((s) => s.volume);
  const musicOn = useSound((s) => s.musicOn);
  const now = useSoundNow((s) => s.text); // what the listener hears here (lib/game/soundZones.js)
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    useTime.getState().hydrate();
    syncClock(apiBase());
  }, []);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);
  const quiet = useQuietHud();
  const s = skyAt(modeHour(ready ? mode : 'day', Date.now(), offset));
  const Icon = ICON[s.phase] ?? Sun;
  if (quiet) return null;
  return (
    <div
      style={{ '--edge': 'max(0.5rem, env(safe-area-inset-left))' }}
      className="absolute bottom-6 right-3 z-20 flex items-end gap-1 max-sm:bottom-[max(1.25rem,env(safe-area-inset-bottom))] max-sm:left-[var(--edge)] max-sm:right-auto max-sm:flex-col max-sm:items-start short:bottom-[max(1.25rem,env(safe-area-inset-bottom))] short:left-[var(--edge)] short:right-auto short:flex-col short:items-start"
      data-testid="ambient-controls"
    >
      {open && (
        <div className="flex flex-col gap-0.5 rounded-xl border border-sx-stroke bg-sx-page/95 p-1 text-xs shadow-2xl backdrop-blur-md" role="menu" aria-label="Time of day">
          {MODES.map(([id, label]) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={mode === id}
              data-testid={`time-${id}`}
              onClick={() => {
                useTime.getState().setMode(id);
                setOpen(false);
              }}
              className={`rounded-lg px-2 py-1 text-left pointer-coarse:py-2.5 ${mode === id ? 'bg-sx-alt font-bold text-white' : 'text-slate-300 hover:bg-sx-alt'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="time-button"
        title={`Time of day: ${s.phase} ${clockLabel(s.hour)}${mode === 'live' ? ' (shared by every player)' : ''}`}
        aria-label={`Time of day, ${s.phase} ${clockLabel(s.hour)}`}
        className="flex items-center gap-1.5 rounded-xl border border-sx-stroke bg-sx-page/90 px-2.5 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-md hover:bg-sx-alt pointer-coarse:min-h-11"
      >
        <Icon size={14} /> <span data-testid="time-label">{ready ? clockLabel(s.hour) : '--:--'}</span>
      </button>
      <div className="flex items-center gap-1 rounded-xl border border-sx-stroke bg-sx-page/90 p-1 shadow-2xl backdrop-blur-md">
        {on && (
          <input
            type="range" min="0" max="1" step="0.05" value={volume}
            onChange={(e) => useSound.getState().setVolume(e.target.value)}
            aria-label="Volume" data-testid="volume" className="hidden h-1 w-16 accent-sky-400 sm:block"
          />
        )}
        {on && now && <span data-testid="sound-now" className="hidden max-w-[11rem] truncate px-1 text-[10px] text-slate-300 md:block" title="What you hear here">{now}</span>}
        <button
          onClick={() => useSound.getState().toggleMusic()}
          data-testid="music-button"
          aria-pressed={musicOn}
          aria-label={musicOn ? 'Turn the city music off' : 'Turn the city music on'}
          title={musicOn ? 'The city music plays when you zoom out above the map: click to turn it off' : 'Turn the city music on (it plays when you zoom out above the map)'}
          className={`rounded-lg p-1.5 hover:bg-sx-alt pointer-coarse:p-3 ${musicOn ? 'text-white' : 'text-slate-500'}`}
        >
          <Music size={16} />
        </button>
        <button
          onClick={() => useSound.getState().toggle()}
          data-testid="sound-button"
          aria-pressed={on}
          aria-label={on ? 'Mute the city sounds' : 'Turn the city sounds on'}
          title={on ? `Mute the city sounds${now ? ` (you hear: ${now})` : ''}` : 'Turn the city sounds on'}
          className="rounded-lg p-1.5 text-white hover:bg-sx-alt pointer-coarse:p-3"
        >
          {on ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>
    </div>
  );
}
