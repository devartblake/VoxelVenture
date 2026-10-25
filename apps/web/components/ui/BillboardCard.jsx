"use client";

import React, { useEffect, useState } from 'react';
import { Eye, MousePointerClick, TrendingUp, Gift, Mail, Coins, Trophy, ExternalLink, Repeat, X } from 'lucide-react';
import { MAX_SHARERS, ROTATE_MS, SHARE_PRICE, textContrast, textOn } from '@/lib/game/adRotation';
import { BILLBOARD_BUYOUT_MULTIPLIER } from '@/lib/city/cityGenerator';
import { apiOn } from '@/lib/data/api';
import { cityPlotOf } from '@/lib/game/shareLink';
import { useWorld } from '@/lib/state/worldStore';
import ReportButton from './ReportButton';
import { buyAdRemote, subscribeRemote } from '@/lib/data/sync';
import { useAccount } from '@/lib/state/accountStore';
import { BILLBOARD_QUEST_GOLD, BILLBOARD_QUEST_SECONDS, useCityStore } from '@/lib/state/store';

// A short, stable offer code per campaign (there is no backend to issue real ones yet).
function offerCode(ad) {
  let h = 0;
  for (const ch of `${ad.advertiser}|${ad.headline}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `VV-${h.toString(36).toUpperCase().padStart(5, '0').slice(-5)}`;
}

const INPUT = 'w-full px-3 py-1.5 text-xs bg-sx-alt border border-sx-stroke rounded text-white focus:outline-none focus:border-sx-cyan';

// The ad's in-world calls to action: visit, subscribe, reveal an offer code (blueprint: micro-cards
// with in-world CTAs for lead capture instead of a plain redirect).
function AdActions({ billboard }) {
  const recordClick = useCityStore((s) => s.recordBillboardClick);
  const { ad } = billboard;
  const plotId = cityPlotOf(ad.url);
  const plot = useCityStore((s) => (plotId == null ? null : s.plots.find((p) => String(p.id) === plotId && p.owner)));
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [codeShown, setCodeShown] = useState(false);

  return (
    <div className="space-y-2 rounded-lg border border-sx-alt bg-sx-page/40 p-3">
      <span className="flex items-center justify-between text-[10px] uppercase text-slate-400">
        From {ad.advertiser}
        {apiOn() && <ReportButton kind="ad" id={billboard.id} label="Report" />}
      </span>

      {subscribed ? (
        <p className="text-xs text-green-400">{typeof subscribed === 'string' ? subscribed : `Subscribed. Watch your inbox for ${ad.headline} news.`}</p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            recordClick(billboard.id);
            if (apiOn()) {
              // a real sign-up: we email a confirmation first, and the advertiser only gets confirmed addresses
              subscribeRemote({ kind: 'ad', id: billboard.id }, email, 'billboard').then((r) => setSubscribed(r.status === 'confirmed' ? 'You are already signed up.' : 'Check your inbox to confirm.')).catch((err) => setSubscribed(err.message));
              return;
            }
            setSubscribed(true);
          }}
        >
          <input type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          <button type="submit" className="flex shrink-0 items-center gap-1 rounded bg-gradient-to-r from-sx-purple to-sx-blue px-3 text-xs font-medium text-white hover:brightness-110">
            <Mail className="h-3.5 w-3.5" /> Join
          </button>
        </form>
      )}

      <div className="flex gap-2">
        {codeShown ? (
          <div className="flex flex-1 items-center justify-center gap-2 rounded border border-dashed border-amber-500/60 bg-amber-950/30 px-3 py-1.5 font-mono text-xs text-amber-300">
            <Gift className="h-3.5 w-3.5" /> {offerCode(ad)}
          </div>
        ) : (
          <button
            onClick={() => {
              recordClick(billboard.id);
              setCodeShown(true);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded border border-sx-stroke bg-sx-alt px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-sx-stroke"
          >
            <Gift className="h-3.5 w-3.5" /> Reveal offer code
          </button>
        )}
        <a
          href={ad.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => recordClick(billboard.id)}
          className="flex items-center justify-center rounded border border-sx-stroke bg-sx-alt px-3 text-slate-200 hover:bg-sx-stroke"
          title="Visit website"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      {plot && (
        <button
          data-testid="ad-go-to-building"
          onClick={() => {
            recordClick(billboard.id);
            useWorld.getState().focusOn(plot.x, plot.z, 26);
            // the visit and website click that follow count for this billboard or banner in the owner's sources
            useCityStore.getState().setSelectedPlot(plot, billboard.kind === 'banner' ? 'banner' : 'billboard');
          }}
          className="flex w-full items-center justify-center gap-2 rounded border border-sx-stroke bg-sx-alt px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-sx-stroke"
        >
          Go to {plot.title} in the city
        </button>
      )}
    </div>
  );
}

// Looking at an ad for a while pays Gold, once per billboard (blueprint: quest and bounty economy).
function LookQuest({ billboardId }) {
  const done = useCityStore((s) => Boolean(s.completedQuests[billboardId]));
  const complete = useCityStore((s) => s.completeBillboardQuest);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (done) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [done]);

  useEffect(() => {
    if (!done && seconds >= BILLBOARD_QUEST_SECONDS) complete(billboardId);
  }, [seconds, done, complete, billboardId]);

  return (
    <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-amber-300">
          <Coins className="h-3.5 w-3.5" /> Quest: watch this ad
        </span>
        <span className="font-mono text-amber-400">{done ? 'Done' : `+${BILLBOARD_QUEST_GOLD} Gold`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sx-alt">
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${done ? 100 : Math.min(100, (seconds / BILLBOARD_QUEST_SECONDS) * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        {done ? `You earned ${BILLBOARD_QUEST_GOLD} Gold from this billboard.` : `Keep this open for ${BILLBOARD_QUEST_SECONDS} seconds (${Math.max(0, BILLBOARD_QUEST_SECONDS - seconds)}s left).`}
      </p>
    </div>
  );
}

// Take the slot over: pay 1.25x, the previous advertiser is cashed out at a 25% profit (hot potato).
function TakeOver({ billboard }) {
  const buy = useCityStore((s) => s.buyBillboard);
  const [form, setForm] = useState({ advertiser: '', headline: '', tagline: '', url: '', color: '#6366f1' });
  const price = Math.round(billboard.value * BILLBOARD_BUYOUT_MULTIPLIER);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.advertiser || !form.headline) return;
    const ad = { ...form, tagline: form.tagline || 'Now on the big screen.', url: form.url || 'https://example.com' };
    const done = () => setForm({ advertiser: '', headline: '', tagline: '', url: '', color: form.color });
    if (!apiOn()) {
      buy(billboard.id, ad);
      return done();
    }
    // with a server: sign in only now, when buying
    const go = () => buyAdRemote(billboard.id, ad, price).then(done, () => {});
    if (useAccount.getState().ask(go)) go();
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <span className="block text-[10px] uppercase text-slate-400">
        {billboard.ad ? `Take over this slot (previous advertiser is paid out +25%)` : 'Book this empty slot'}
      </span>
      <input type="text" required placeholder="Brand name" value={form.advertiser} onChange={set('advertiser')} className={INPUT} />
      <input type="text" required placeholder="Headline" maxLength={28} value={form.headline} onChange={set('headline')} className={INPUT} />
      <input type="text" placeholder="Tagline" maxLength={48} value={form.tagline} onChange={set('tagline')} className={INPUT} />
      <div className="flex gap-2">
        <input type="url" placeholder="https://your-site.com" value={form.url} onChange={set('url')} className={INPUT} />
        <input type="color" value={form.color} onChange={set('color')} className="h-8 w-10 shrink-0 cursor-pointer rounded border border-sx-stroke bg-sx-alt" title="Brand colour" />
      </div>
      <Preview form={form} />
      <button type="submit" className="w-full rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-green-500">
        {billboard.ad ? 'Take over' : 'Book'} for ${price.toLocaleString()}
      </button>
    </form>
  );
}

// How the ad will read: its text is white or near-black, whichever has the better contrast on the brand colour (shown as the WCAG ratio).
function Preview({ form }) {
  const fg = textOn(form.color);
  const ratio = textContrast(form.color);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5" style={{ background: form.color, color: fg }} data-testid="ad-preview">
      <span className="truncate text-xs font-extrabold uppercase">{form.headline || 'Your headline'}</span>
      <span className="shrink-0 text-[10px] font-semibold opacity-90" title="Contrast of the text on the brand colour (4.5 or more reads well)">{ratio.toFixed(1)}:1</span>
    </div>
  );
}

// Share the slot's screen time: your ad joins the rotation (the owner's ad gets twice the time). Only in the local game (the server's slots hold one ad).
function ShareSlot({ billboard }) {
  const share = useCityStore((s) => s.shareBillboard);
  const unshare = useCityStore((s) => s.unshareBillboard);
  const [form, setForm] = useState({ advertiser: '', headline: '', tagline: '', url: '', color: '#f59e0b' });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const sharers = billboard.ads ?? [];
  const price = Math.round(billboard.value * SHARE_PRICE);
  const full = sharers.length >= MAX_SHARERS;
  return (
    <div className="space-y-2 rounded-lg border border-sx-alt bg-sx-page/40 p-3" data-testid="share-slot">
      <span className="flex items-center gap-1.5 text-[10px] uppercase text-slate-400">
        <Repeat className="h-3.5 w-3.5" /> Rotation: the screen changes every {ROTATE_MS / 1000} seconds
      </span>
      {sharers.length > 0 && (
        <ul className="space-y-1 text-xs">
          {sharers.map((a, i) => (
            <li key={`${a.advertiser}-${i}`} className="flex items-center justify-between rounded bg-sx-alt/60 px-2 py-1">
              <span className="truncate text-slate-200">{a.advertiser} · {a.headline}</span>
              <button type="button" onClick={() => unshare(billboard.id, i)} aria-label={`Remove ${a.advertiser}`} className="text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-[11px] text-slate-400">This slot is shared as much as it can be ({MAX_SHARERS} extra ads).</p>
      ) : (
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.advertiser || !form.headline) return;
            share(billboard.id, { ...form, tagline: form.tagline || 'Now on the big screen.', url: form.url || 'https://example.com' });
            setForm({ advertiser: '', headline: '', tagline: '', url: '', color: form.color });
          }}
        >
          <input type="text" required placeholder="Brand name" value={form.advertiser} onChange={set('advertiser')} className={INPUT} />
          <div className="flex gap-2">
            <input type="text" required placeholder="Headline" maxLength={28} value={form.headline} onChange={set('headline')} className={INPUT} />
            <input type="color" value={form.color} onChange={set('color')} className="h-8 w-10 shrink-0 cursor-pointer rounded border border-sx-stroke bg-sx-alt" title="Brand colour" />
          </div>
          <Preview form={form} />
          <button type="submit" className="w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-sx-stroke">Share this slot for ${price.toLocaleString()}</button>
        </form>
      )}
    </div>
  );
}

export default function BillboardCard() {
  const billboard = useCityStore((s) => s.billboards.find((b) => b.id === s.selectedBillboardId));
  const recordView = useCityStore((s) => s.recordBillboardView);
  const id = billboard?.id;

  // One view per time the billboard is opened (and per new campaign).
  const campaign = billboard?.ad ? `${billboard.ad.advertiser}|${billboard.ad.headline}` : '';
  useEffect(() => {
    if (id && campaign) recordView(id);
  }, [id, campaign, recordView]);

  if (!billboard) return null;
  const { ad } = billboard;
  const ctr = billboard.views ? ((billboard.clicks / billboard.views) * 100).toFixed(1) : '0.0';

  return (
    <div className="text-slate-100">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <span className="mb-1 inline-block rounded border border-violet-800 bg-violet-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            {billboard.kind === 'banner' ? 'Aerial banner' : 'Billboard'} • {billboard.roadName}
          </span>
          <h2 className="text-lg font-bold text-white">{ad ? ad.headline : 'Ad space available'}</h2>
          {ad && <p className="text-xs text-slate-400">{ad.tagline}</p>}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 border-y border-sx-alt py-3">
        <div>
          <span className="block text-[10px] uppercase text-slate-400">Views</span>
          <div className="flex items-center gap-1 font-mono text-sm font-semibold text-slate-200">
            <Eye className="h-3.5 w-3.5 text-slate-400" />
            {billboard.views.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="block text-[10px] uppercase text-slate-400">Clicks</span>
          <div className="flex items-center gap-1 font-mono text-sm font-semibold text-slate-200">
            <MousePointerClick className="h-3.5 w-3.5 text-slate-400" />
            {billboard.clicks.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="block text-[10px] uppercase text-slate-400">CTR</span>
          <div className="flex items-center gap-1 font-mono text-sm font-semibold text-green-400">
            <TrendingUp className="h-3.5 w-3.5" />
            {ctr}%
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {ad && <AdActions key={`actions-${billboard.id}|${campaign}`} billboard={billboard} />}
        {ad && <LookQuest key={`quest-${billboard.id}`} billboardId={billboard.id} />}
        <TakeOver key={`takeover-${billboard.id}`} billboard={billboard} />
        {ad && !apiOn() && <ShareSlot key={`share-${billboard.id}`} billboard={billboard} />}

        {billboard.history.length > 0 && (
          <div>
            <span className="mb-1 flex items-center gap-1.5 text-[10px] uppercase text-slate-400">
              <Trophy className="h-3.5 w-3.5 text-amber-400" /> Hall of Fame (past advertisers)
            </span>
            <ul className="space-y-1 text-xs">
              {billboard.history.map((h, i) => (
                <li key={i} className="flex justify-between rounded bg-sx-alt/60 px-2 py-1">
                  <span className="text-slate-200">{h.advertiser} · {h.headline}</span>
                  <span className="font-mono text-green-400">+${h.paidOut.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
