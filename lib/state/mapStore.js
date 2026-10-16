import { create } from 'zustand';
import { graphFor, findRoute, routeSeconds } from '../city/routing';
import { avatarState } from '../sim/avatarState';
import { useCityStore } from './store';

// The world map (M): whether it is open, where it is looking, which layers are on, and the waypoint with its road-following route.
// The map never pauses the game: the world, the traffic and the server clock keep running behind it.
const KEY = 'voxelventure-map';
export const LAYERS = [
  { id: 'districts', label: 'District names' },
  { id: 'roads', label: 'Road names' },
  { id: 'landmarks', label: 'Landmarks' },
  { id: 'buildings', label: 'Building names' },
  { id: 'mine', label: 'Your plots' },
  { id: 'players', label: 'Other players' },
  { id: 'planes', label: 'Planes' },
  { id: 'fields', label: 'Fields and woods' },
];
const DEFAULT_LAYERS = Object.fromEntries(LAYERS.map((l) => [l.id, true]));
const read = () => {
  try {
    return { ...DEFAULT_LAYERS, ...(JSON.parse(localStorage.getItem(KEY) || '{}').layers ?? {}) };
  } catch {
    return DEFAULT_LAYERS;
  }
};

export const useMap = create((set, get) => ({
  open: false,
  view: { cx: 0, cz: 0, scale: 2 }, // the centre in world units, and pixels per world unit
  layers: DEFAULT_LAYERS,
  waypoint: null, // { x, z }
  route: null, // { points, length, onRoad }
  autoWalk: false,
  hydrate: () => set({ layers: read() }),
  toggleLayer: (id) => {
    const layers = { ...get().layers, [id]: !get().layers[id] };
    set({ layers });
    try {
      localStorage.setItem(KEY, JSON.stringify({ layers }));
    } catch {
      /* not remembered */
    }
  },
  setView: (view) => set({ view }),
  openMap: () => {
    // it opens on you, close enough to read the streets
    const { layout } = useCityStore.getState();
    const me = avatarState.ready ? { cx: avatarState.x, cz: avatarState.z } : { cx: layout.center.x, cz: layout.center.z };
    set({ open: true, view: { ...me, scale: get().view.scale > 0.5 ? Math.min(6, Math.max(1.2, get().view.scale)) : 3 } });
  },
  close: () => set({ open: false }),
  toggle: () => (get().open ? get().close() : get().openMap()),
  // a waypoint: the way there along the roads from where you stand
  setWaypoint: (x, z) => {
    const { layout } = useCityStore.getState();
    const route = findRoute(graphFor(layout), { x: avatarState.x, z: avatarState.z }, { x, z });
    set({ waypoint: { x, z }, route, autoWalk: false });
  },
  clearWaypoint: () => set({ waypoint: null, route: null, autoWalk: false }),
  go: () => set({ autoWalk: Boolean(get().route) }),
  stop: () => set({ autoWalk: false }),
}));

export const etaOf = (route) => (route ? routeSeconds(route.length) : 0);

if (typeof window !== 'undefined' && /[?&]diag=1/.test(window.location.search)) window.__vvMapStore = useMap;
