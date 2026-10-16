import { create } from 'zustand';

// What the avatar can interact with right now: { id, label, action } or null. Set by the avatar
// only when the target changes (never per frame), shown by InteractPrompt, triggered with E.
//
// `focus` asks the camera to glide to a spot in the city ({ x, z, zoom, nonce }); components/city/CameraFocus.jsx
// does it. `zoom` is a request to zoom the map by a factor ({ by, nonce }).
export const useWorld = create((set) => ({
  prompt: null,
  focus: null,
  zoomRequest: null,
  focusOn: (x, z, zoom = null) => set((s) => ({ focus: { x, z, zoom, nonce: (s.focus?.nonce ?? 0) + 1 } })),
  zoomBy: (by) => set((s) => ({ zoomRequest: { by, nonce: (s.zoomRequest?.nonce ?? 0) + 1 } })),
}));
