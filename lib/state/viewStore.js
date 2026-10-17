import { create } from 'zustand';
import { avatarState } from '../sim/avatarState';

// Which camera the city is seen through. A view is a preset; the follow views can then be turned, tilted and zoomed.
//   'first'    first person: the camera sits at the avatar's eyes and looks along the camera heading (azimuth) and up or down by `look`; the avatar is hidden
//   'iso'      the original: a fixed orthographic isometric map you pan and zoom (walk keys are screen-relative)
//   the others a perspective camera that follows the avatar, like an action RPG: set by a tilt (how high above the ground
//              it looks from), a distance, a heading round the avatar (azimuth) and a field of view.
// In the follow views: Q / E turn the camera, R / F tilt it, the wheel or a pinch zooms, dragging with the right mouse
// button turns and tilts, V cycles the presets, Home resets. Walking (keys, joystick) is relative to where the camera looks.
// `?view=<preset>` in the address overrides the saved choice. To go back to the original for good, set DEFAULT_VIEW to 'iso'.
export const PRESETS = {
  iso: { label: 'Original view', hint: 'The original isometric map: drag to pan, wheel to zoom', iso: true },
  diablo: { label: 'Action', hint: 'Fixed angle behind-and-above, like an action RPG', pitch: 0.96, distance: 28, fov: 38 },
  third: { label: 'Third-person', hint: 'Low and close behind the avatar', pitch: 0.5, distance: 13, fov: 55 },
  tactical: { label: 'Tactical', hint: 'Higher and wider: a few blocks around you', pitch: 1.1, distance: 70, fov: 40 },
  overview: { label: 'Overview', hint: 'High up: most of the city', pitch: 1.25, distance: 160, fov: 40 },
  top: { label: 'Top-down', hint: 'Straight down', pitch: 1.5, distance: 55, fov: 45 },
  first: { label: 'First person', hint: 'Through the avatar eyes: right-drag or one finger to look, Q / E turn, R / F look up and down', fp: true, fov: 72 },
};
export const VIEW_IDS = Object.keys(PRESETS);
export const DEFAULT_VIEW = 'diablo';
export const ISO_AZIMUTH = Math.PI / 4; // the isometric camera looks along (-1, -1) on the ground
export const LIMITS = { distance: [6, 180], pitch: [0.25, 1.52], look: [-1.2, 1.2] };
const KEY = 'voxelventure-view';
const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));

let turning = 0; // the frame of a turn in progress
export const useView = create((set, get) => ({
  view: DEFAULT_VIEW,
  azimuth: ISO_AZIMUTH, // where the follow camera stands round the avatar, as an angle from +Z towards +X
  pitch: PRESETS[DEFAULT_VIEW].pitch,
  distance: PRESETS[DEFAULT_VIEW].distance,
  fov: PRESETS[DEFAULT_VIEW].fov,
  free: null, // look-around: { x, z } is where the follow camera looks instead of at the avatar (null: it follows the avatar)
  look: 0, // first person: looking up (+) or down (-), in radians
  ready: false,
  heading: null, // where the real camera looks, in degrees clockwise from world north (-Z); written every frame by apps/web/components/city/CameraHeading.jsx
  setHeading: (heading) => set({ heading }),

  // after mount, so the server and client markup agree
  hydrate: () => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      /* ignore */
    }
    const asked = new URLSearchParams(window.location.search).get('view');
    const view = VIEW_IDS.includes(asked) ? asked : VIEW_IDS.includes(saved?.view) ? saved.view : DEFAULT_VIEW;
    const base = PRESETS[view];
    const same = saved?.view === view && !(asked && asked !== saved?.view);
    set({
      ready: true,
      view,
      azimuth: same && typeof saved?.azimuth === 'number' ? saved.azimuth : ISO_AZIMUTH,
      pitch: same && typeof saved?.pitch === 'number' ? clamp(saved.pitch, LIMITS.pitch) : base.pitch ?? get().pitch,
      distance: same && typeof saved?.distance === 'number' ? clamp(saved.distance, LIMITS.distance) : base.distance ?? get().distance,
      fov: base.fov ?? get().fov,
      look: 0,
    });
    if (base.iso) avatarState.cameraYaw = ISO_AZIMUTH;
  },
  // Look around: the follow camera lets go of the avatar and can be dragged over the city (to click a building far away, say). Walking, G, Esc or Home
  // brings it back. Not in the original view (it pans already) or in first person.
  startFree: () => {
    const p = PRESETS[get().view];
    if (p?.iso || p?.fp) return false;
    set({ free: { x: avatarState.x, z: avatarState.z } });
    return true;
  },
  endFree: () => get().free && set({ free: null }),
  panFree: (dx, dy, land) => {
    const f = get().free;
    if (!f) return;
    const az = get().azimuth;
    const k = get().distance * 0.0016;
    const right = [Math.cos(az), -Math.sin(az)];
    const fwd = [-Math.sin(az), -Math.cos(az)];
    let x = f.x + (-dx * right[0] + dy * fwd[0]) * k;
    let z = f.z + (-dx * right[1] + dy * fwd[1]) * k;
    if (land) {
      x = Math.min(land.x1, Math.max(land.x0, x));
      z = Math.min(land.z1, Math.max(land.z0, z));
    }
    set({ free: { x, z } });
  },
  // pick a preset: its tilt, distance and field of view (your turn round the avatar is kept)
  setView: (view) => {
    const p = PRESETS[view];
    if (!p) return;
    set({ view, free: null, ...(p.iso ? {} : p.fp ? { fov: p.fov, look: 0 } : { pitch: p.pitch, distance: p.distance, fov: p.fov }) });
    if (p.iso) avatarState.cameraYaw = ISO_AZIMUTH;
    save(get());
  },
  cycle: () => get().setView(VIEW_IDS[(VIEW_IDS.indexOf(get().view) + 1) % VIEW_IDS.length]),
  reset: () => {
    const p = PRESETS[get().view];
    set({ azimuth: ISO_AZIMUTH, look: 0, ...(p.iso || p.fp ? {} : { pitch: p.pitch, distance: p.distance }) });
    save(get());
  },
  // Swings the camera round the avatar to face `target` (an azimuth), the short way, over `ms`. Not in the original view, which cannot turn.
  turnTo: (target, ms = 450) => {
    if (PRESETS[get().view]?.iso) return;
    cancelAnimationFrame(turning);
    const from = get().azimuth;
    const delta = ((((target - from + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      set({ azimuth: from + delta * eased });
      if (t < 1) turning = requestAnimationFrame(step);
      else save(get());
    };
    turning = requestAnimationFrame(step);
  },
  rotate: (by) => {
    cancelAnimationFrame(turning); // turning by hand takes over from a swing in progress
    set({ azimuth: get().azimuth + by });
    save(get());
  },
  tilt: (by) => {
    if (PRESETS[get().view]?.fp) {
      set({ look: clamp(get().look - by, LIMITS.look) }); // the same keys and drag: down tilts the view down
      return;
    }
    set({ pitch: clamp(get().pitch + by, LIMITS.pitch) });
    save(get());
  },
  setPitch: (pitch) => {
    set({ pitch: clamp(pitch, LIMITS.pitch) });
    save(get());
  },
  setAzimuth: (azimuth) => {
    cancelAnimationFrame(turning);
    set({ azimuth });
    save(get());
  },
  setDistance: (distance) => {
    set({ distance: clamp(distance, LIMITS.distance) });
    save(get());
  },
  zoom: (factor) => {
    set({ distance: clamp(get().distance / factor, LIMITS.distance) });
    save(get());
  },
}));

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ view: state.view, azimuth: state.azimuth, pitch: state.pitch, distance: state.distance }));
  } catch {
    /* ignore */
  }
}
