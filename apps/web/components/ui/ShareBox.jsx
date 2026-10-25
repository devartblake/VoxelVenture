"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { myRefCode, withRef } from '@/lib/business/referral';
import { Clipboard, Link2 } from 'lucide-react';
import { badgeHtml, badgeLabel, badgeMarkdown, buildingUrl } from '@/lib/game/shareLink';
import { useCityStore } from '@/lib/state/store';

// Copy text to the clipboard: the modern way, and a hidden textarea where that is not allowed (an insecure page, an old browser).
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = Object.assign(document.createElement('textarea'), { value: text });
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// The link to a building and the badge for the owner's own website. Anyone can copy the link; the badge is for putting on a site.
// A building linked to a business page shares that page: it loads fast anywhere, search engines and social sites can read it, and its
// "Step inside" button leads into the city. The link straight into the city is offered beside it.
export default function ShareBox({ plot }) {
  const seed = useCityStore((s) => s.layout.seed);
  const notify = useCityStore((s) => s.notify);
  // a signed-in player's links carry their referral code (not the badge: that stays on a website for good)
  const [code, setCode] = useState(null);
  useEffect(() => {
    let live = true;
    myRefCode().then((c) => live && setCode(c));
    return () => {
      live = false;
    };
  }, []);
  const cityUrl = useMemo(() => (typeof window === 'undefined' ? '' : buildingUrl(window.location.origin, plot, seed)), [plot, seed]);
  const url = plot.profileSlug && typeof window !== 'undefined' ? `${window.location.origin}/business/${plot.profileSlug}` : cityUrl;
  const shared = withRef(url, code);
  const copy = async (text, what) => notify((await copyText(text)) ? `${what} copied.` : 'Copying is blocked here: select the text and copy it yourself.');

  return (
    <div className="space-y-2 rounded-xl border border-sx-stroke bg-sx-alt/40 p-3 text-xs text-slate-200" data-testid="share-box">
      <label className="block">
        <span className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400"><Link2 className="h-3 w-3" /> {plot.profileSlug ? 'Link to this business' : 'Link to this building'}</span>
        <input readOnly value={shared} onFocus={(e) => e.target.select()} className="w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1 font-mono text-[11px] text-slate-200" data-testid="share-url" aria-label={plot.profileSlug ? 'Link to this business' : 'Link to this building'} />
      </label>
      {plot.profileSlug && (
        <button type="button" onClick={() => copy(withRef(cityUrl, code), 'Link into the 3D city')} className="text-[11px] text-sx-cyan underline" data-testid="copy-city-link">Copy the link straight into the 3D city instead</button>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => copy(shared, 'Link')} className="flex items-center gap-1 rounded-full border border-sx-stroke px-2.5 py-1 hover:bg-sx-alt" data-testid="copy-link"><Clipboard className="h-3 w-3" /> Copy link</button>
        <button type="button" onClick={() => copy(badgeHtml(url, plot), 'Badge code')} className="flex items-center gap-1 rounded-full border border-sx-stroke px-2.5 py-1 hover:bg-sx-alt" data-testid="copy-badge"><Clipboard className="h-3 w-3" /> Copy badge for your website</button>
        <button type="button" onClick={() => copy(badgeMarkdown(url, plot), 'Markdown')} className="rounded-full border border-sx-stroke px-2.5 py-1 hover:bg-sx-alt">Markdown</button>
      </div>
      <div>
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">The badge looks like this</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-indigo-500 bg-[#0b1020] px-3.5 py-2 text-[13px] font-semibold text-white no-underline" data-testid="badge-preview">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-gradient-to-br from-violet-500 to-cyan-400" />
          {badgeLabel(plot)}
        </a>
      </div>
      <p className="text-[10px] text-slate-500">{plot.profileSlug ? 'Anyone who clicks it lands on your business page, with a button to step inside your 3D storefront.' : 'Anyone who clicks it lands in the city with the camera on your building and its card open.'}</p>
    </div>
  );
}
