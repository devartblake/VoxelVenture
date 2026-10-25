"use client";

import React from 'react';
import { Store } from 'lucide-react';
import { usePanel } from '@/lib/state/panelStore';
import { useCompactHud, useQuietHud } from '@/lib/state/hudStore';

// On a phone (the compact HUD): a plainly labelled way into the businesses, top left, for a visitor who has not found the joystick yet.
// It opens the in-game directory, with its search and filters. Hidden while a panel or a card is open (VV-UX-08).
export default function ExploreButton() {
  const compact = useCompactHud();
  const quiet = useQuietHud();
  const view = usePanel((s) => s.view);
  if (!compact || quiet || view) return null;
  return (
    <button
      type="button"
      onClick={() => usePanel.getState().open('directory')}
      style={{ left: 'max(0.5rem, env(safe-area-inset-left))' }}
      className="absolute top-14 z-20 flex min-h-11 items-center gap-2 rounded-full border border-sx-cyan/50 bg-sx-page/90 px-4 text-sm font-semibold text-white shadow-2xl backdrop-blur-md hover:bg-sx-alt short:top-[4.75rem]"
      data-testid="explore-businesses"
    >
      <Store className="h-4 w-4 text-sx-cyan" /> Explore businesses
    </button>
  );
}
