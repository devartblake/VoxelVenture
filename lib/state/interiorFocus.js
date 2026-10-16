import { create } from 'zustand';

// Which part of the storefront panel an interior hotspot points at ("offer", "video", "game" or "reward"), so the panel can light it up for a moment.
export const useInteriorFocus = create(() => ({ section: null, at: 0 }));
export const focusSection = (section) => useInteriorFocus.setState({ section, at: Date.now() });
