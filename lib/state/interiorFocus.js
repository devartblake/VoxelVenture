import { create } from 'zustand';

// Which part of the storefront panel an interior hotspot points at ("offer", "video", "game" or "reward"), so the panel can light it up for a moment.
export const useInteriorFocus = create(() => ({ section: null, at: 0 }));
export const focusSection = (section) => useInteriorFocus.setState({ section, at: Date.now() });

// The "Look at" spots of the room on screen, published by the interior viewer: on a phone the menu sits in the storefront panel (above the
// feedback board) instead of over the room, and choosing a spot there moves the viewer's camera the same way. `look` is set by the viewer.
export const useInteriorSpots = create(() => ({ spots: [], active: null, look: null }));
