import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useCityStore } from './store';

// How much of the game's on-screen controls (the HUD) shows: the tool bar, the round map, the compass, the sound and weather buttons.
//
//   auto      compact on a phone or a short landscape screen, full elsewhere (the default)
//   full      everything, on any screen
//   compact   the four most used tools, the camera and a More button; the round map and the compass wait behind More (the clock and
//             sound buttons stay: on a phone they sit bottom left, components/ui/AmbientControls.jsx)
//
// The choice is kept in this browser (a convenience: it falls back to auto when storage is blocked). Whatever the mode, while a building,
// park or billboard card is open on a small screen the HUD steps aside (`quiet`), so the card and its buttons are never covered.
const KEY = 'voxelventure-hud';
export const HUD_MODES = ['auto', 'full', 'compact'];
const SMALL = '(max-width: 639px), (max-height: 500px)';

const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return HUD_MODES.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
};

export const useHud = create((set) => ({
  mode: 'auto',
  more: false, // compact mode's More panel is open
  hydrate: () => set({ mode: read() }),
  setMode: (mode) => {
    if (!HUD_MODES.includes(mode)) return;
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* kept for this visit only */
    }
    set({ mode, more: false });
  },
  reset: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing kept */
    }
    set({ mode: 'auto', more: false });
  },
  toggleMore: () => set((s) => ({ more: !s.more })),
  closeMore: () => set({ more: false }),
}));

// Whether the screen is small (a phone, or a short landscape screen), following rotations and resizes.
export function useSmallScreen() {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const q = window.matchMedia(SMALL);
    const on = () => setSmall(q.matches);
    on();
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return small;
}

// The mode in effect: compact or full (auto resolved for this screen).
export const compactFor = (mode, small) => mode === 'compact' || (mode === 'auto' && small);
export function useCompactHud() {
  const mode = useHud((s) => s.mode);
  const small = useSmallScreen();
  useEffect(() => {
    useHud.getState().hydrate();
  }, []);
  return compactFor(mode, small);
}

// Whether a building, park or billboard card is open on a small screen: the HUD then steps aside so the card is never covered.
export function useQuietHud() {
  const small = useSmallScreen();
  const card = useCityStore((s) => Boolean(s.selectedPlot || s.selectedPark || s.selectedBillboardId));
  return small && card;
}

// For the round map and the compass: hidden in the compact HUD until More is opened, and while a card is open on a small screen.
export function useHudExtrasShown() {
  const compact = useCompactHud();
  const quiet = useQuietHud();
  const more = useHud((s) => s.more);
  return !quiet && (!compact || more);
}
