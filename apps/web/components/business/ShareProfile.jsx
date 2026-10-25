"use client";

import { useEffect, useState } from 'react';
import { myRefCode, withRef } from '@/lib/business/referral';

// Copy (or, on a phone, share) the address of this profile. A signed-in player's link carries their referral code, so they are credited
// for the visitors it brings (services/api/business.mjs; the code says nothing about whose it is).
export default function ShareProfile({ url: plain, title }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(plain);
  useEffect(() => {
    let live = true;
    myRefCode().then((code) => live && setUrl(withRef(plain, code)));
    return () => {
      live = false;
    };
  }, [plain]);
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
