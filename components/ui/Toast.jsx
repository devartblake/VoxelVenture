"use client";

import React, { useEffect } from 'react';
import { useCityStore } from '@/lib/state/store';

// Short reward / feedback messages ("Daily chest: +34 Gold"). One at a time, gone after 3 seconds.
export default function Toast() {
  const toast = useCityStore((s) => s.toast);
  const dismiss = useCityStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(dismiss, 3000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div key={toast.id} className="pointer-events-none absolute left-1/2 top-24 z-40 max-w-[90vw] text-center -translate-x-1/2 rounded-full border border-amber-500/50 bg-sx-panel/95 px-5 py-2 text-sm font-medium text-amber-200 shadow-2xl backdrop-blur-md">
      {toast.text}
    </div>
  );
}
