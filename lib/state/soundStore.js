import { create } from 'zustand';

// The player's sound settings: sound on or off (the speaker button), the volume, and the city's music on or off (the music button: it plays high above the map, see
// lib/game/soundZones.js). Remembered in this browser. ?sound=0 starts muted and ?sound=1 starts on; ?music=0 starts without the music. Automated browsers start muted so
// a test run is silent.
const KEY = 'voxelventure-sound';

export function readSound() {
  const base = { on: true, volume: 0.6, musicOn: true };
  if (typeof window === 'undefined') return { ...base, on: false };
  const params = new URLSearchParams(window.location.search);
  const q = params.get('sound');
  const quiet = navigator.webdriver || params.has('diag'); // test browsers start muted
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  const volume = Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : base.volume;
  let on = typeof saved.on === 'boolean' ? saved.on : quiet ? false : base.on;
  if (q === '0') on = false;
  if (q === '1') on = true;
  let musicOn = typeof saved.musicOn === 'boolean' ? saved.musicOn : base.musicOn;
  if (params.get('music') === '0') musicOn = false;
  if (params.get('music') === '1') musicOn = true;
  return { on, volume, musicOn };
}

const save = (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ on: s.on, volume: s.volume, musicOn: s.musicOn }));
  } catch {
    /* not remembered */
  }
};

export const useSound = create((set, get) => ({
  on: false, // until hydrated
  volume: 0.6,
  musicOn: true,
  hydrated: false,
  hydrate: () => set({ ...readSound(), hydrated: true }),
  toggle: () => {
    set({ on: !get().on });
    save(get());
  },
  toggleMusic: () => {
    set({ musicOn: !get().musicOn });
    save(get());
  },
  setVolume: (v) => {
    set({ volume: Math.max(0, Math.min(1, Number(v) || 0)) });
    save(get());
  },
}));

// What the listener is hearing right now, in words (set by components/SoundEngine.jsx about twice a second): shown beside the speaker button.
export const useSoundNow = create(() => ({ text: '', far: 0 }));
