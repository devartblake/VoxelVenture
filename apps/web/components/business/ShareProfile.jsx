"use client";

import { useState } from 'react';

// Copy (or, on a phone, share) the address of this profile.
export default function ShareProfile({ url, title }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) return await navigator.share({ url, title });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* cancelled or not allowed */
    }
  };
  return (
    <button type="button" onClick={share} className="rounded-lg border border-sx-stroke px-3 py-2 text-sm text-slate-200 hover:border-sx-line hover:bg-sx-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-sx-cyan">
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
