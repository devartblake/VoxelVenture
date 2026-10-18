"use client";

import { useInteriorFocus } from '@/lib/state/interiorFocus';
import React, { useEffect, useState } from 'react';
import { Check, Coins, Film, Gamepad2, Gift, Pencil, Timer } from 'lucide-react';
import { EMBED_SANDBOX } from '@/lib/content/embeds';
import { businessById, useCityStore } from '@/lib/state/store';
import { apiOn } from '@/lib/data/api';
import LiveStorefront from './LiveStorefront';
import LookAt from './LookAt';

const INPUT = 'w-full rounded border border-sx-stroke bg-sx-alt px-2.5 py-1.5 text-xs text-white focus:border-sx-cyan focus:outline-none';
const Error = ({ children }) => (children ? <p className="mt-0.5 text-[11px] text-rose-400">{children}</p> : null);

// A third-party video or game never loads until the visitor asks for it, and it runs sandboxed.
function Embed({ kind, embed }) {
  const [loaded, setLoaded] = useState(false);
  const Icon = kind === 'game' ? Gamepad2 : Film;
  return (
    <div className="overflow-hidden rounded-lg border border-sx-alt bg-sx-panel">
      {loaded ? (
        <iframe
          src={embed.url}
          title={kind === 'game' ? 'Game demo' : 'Video'}
          sandbox={EMBED_SANDBOX}
          referrerPolicy="no-referrer"
          allow="fullscreen"
          allowFullScreen
          loading="lazy"
          className={`w-full border-0 ${kind === 'game' ? 'aspect-[4/3]' : 'aspect-video'}`}
        />
      ) : (
        <button onClick={() => setLoaded(true)} className="flex w-full flex-col items-center gap-1.5 px-3 py-5 text-xs text-slate-300 hover:bg-sx-alt">
          <Icon className="h-6 w-6 text-violet-400" />
          <span className="font-medium text-white">{kind === 'game' ? 'Play the demo' : 'Watch the video'}</span>
          <span className="text-[11px] text-slate-500">Loads from {embed.service}</span>
        </button>
      )}
    </div>
  );
}

function Offer({ plot }) {
  const claimCoupon = useCityStore((s) => s.claimCoupon);
  const code = useCityStore((s) => s.redeemed[plot.id]);
  const { coupon } = plot.brand;
  const left = coupon.total - coupon.claimed;

  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Gift className="h-3.5 w-3.5 text-amber-400" /> Offer</h4>
      <p className="text-sm text-white">{coupon.text}</p>
      <p className="mb-2 text-[11px] text-slate-500">{coupon.claimed} of {coupon.total} claimed</p>
      {plot.userClaimed ? (
        <p className="text-[11px] text-slate-400">This is your coupon (code <span className="font-mono text-slate-200">{coupon.code}</span>). Visitors claim it here.</p>
      ) : code ? (
        <div className="rounded border border-dashed border-amber-500/60 bg-amber-950/30 px-3 py-1.5 text-center font-mono text-sm text-amber-300">{code}</div>
      ) : left > 0 ? (
        <button onClick={() => claimCoupon(plot.id)} className="w-full rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500">Claim coupon</button>
      ) : (
        <p className="text-xs text-slate-500">All coupons have been claimed.</p>
      )}
    </section>
  );
}

// Spend a little time in the building for Gold (blueprint: "enter our store, test our product for 30 seconds").
function VisitQuest({ plot }) {
  const done = useCityStore((s) => Boolean(s.brandQuests[plot.id]));
  const complete = useCityStore((s) => s.completeBrandQuest);
  const [seconds, setSeconds] = useState(0);
  const { quest } = plot.brand;
  const own = plot.userClaimed;

  useEffect(() => {
    if (done || own) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [done, own]);

  useEffect(() => {
    if (!done && !own && seconds >= quest.seconds) complete(plot.id);
  }, [seconds, done, own, quest.seconds, complete, plot.id]);

  return (
    <section className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-amber-300"><Timer className="h-3.5 w-3.5" /> {quest.label}</span>
        <span className="flex items-center gap-1 font-mono text-amber-400"><Coins className="h-3.5 w-3.5" />{quest.gold}</span>
      </div>
      {own ? (
        <p className="text-[11px] text-slate-400">Visitors earn {quest.gold} Gold for staying {quest.seconds} s. You can't earn it from your own business.</p>
      ) : (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-sx-alt">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${done ? 100 : Math.min(100, (seconds / quest.seconds) * 100)}%` }} />
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
            {done ? <><Check className="h-3 w-3 text-green-400" /> Done: you earned {quest.gold} Gold here.</> : `Stay ${quest.seconds} seconds (${Math.max(0, quest.seconds - seconds)} s left).`}
          </p>
        </>
      )}
    </section>
  );
}

function Editor({ plot }) {
  const setBrand = useCityStore((s) => s.setBrand);
  const b = plot.brand ?? {};
  const [form, setForm] = useState({
    videoUrl: b.video?.url ?? '',
    gameUrl: b.game?.url ?? '',
    couponText: b.coupon?.text ?? '',
    couponCode: b.coupon?.code ?? '',
    couponTotal: b.coupon?.total ?? 10,
    questOn: Boolean(b.quest),
    questSeconds: b.quest?.seconds ?? 30,
    questGold: b.quest?.gold ?? 10,
  });
  const [errors, setErrors] = useState({});
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const result = setBrand(plot.id, form);
    setErrors(result.ok ? {} : result.errors);
  };

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <label className="block text-[11px] text-slate-400">Video (YouTube or Vimeo link)
        <input className={INPUT} value={form.videoUrl} onChange={set('videoUrl')} placeholder="https://youtu.be/…" />
        <Error>{errors.videoUrl}</Error>
      </label>
      <label className="block text-[11px] text-slate-400">Game demo (itch.io embed link)
        <input className={INPUT} value={form.gameUrl} onChange={set('gameUrl')} placeholder="https://itch.io/embed-upload/…" />
        <Error>{errors.gameUrl}</Error>
      </label>
      <div className="space-y-1.5 rounded-lg border border-sx-alt p-2.5">
        <span className="text-[11px] font-medium text-slate-300">Coupon</span>
        <input className={INPUT} value={form.couponText} onChange={set('couponText')} placeholder="What visitors get (blank = no coupon)" />
        <Error>{errors.couponText}</Error>
        <div className="flex gap-2">
          <input className={INPUT} value={form.couponCode} onChange={set('couponCode')} placeholder="Code (optional)" />
          <input className={INPUT} type="number" min="1" max="500" value={form.couponTotal} onChange={set('couponTotal')} title="How many coupons" />
        </div>
        <Error>{errors.couponCode || errors.couponTotal}</Error>
      </div>
      <div className="space-y-1.5 rounded-lg border border-sx-alt p-2.5">
        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <input type="checkbox" checked={form.questOn} onChange={set('questOn')} /> Pay visitors Gold to look around
        </label>
        {form.questOn && (
          <div className="flex gap-2">
            <label className="flex-1 text-[11px] text-slate-400">Seconds<input className={INPUT} type="number" min="10" max="120" value={form.questSeconds} onChange={set('questSeconds')} /></label>
            <label className="flex-1 text-[11px] text-slate-400">Gold<input className={INPUT} type="number" min="1" max="50" value={form.questGold} onChange={set('questGold')} /></label>
          </div>
        )}
        <Error>{errors.questSeconds || errors.questGold}</Error>
      </div>
      <Error>{errors.form}</Error>
      <button type="submit" className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue py-1.5 text-xs font-medium text-white hover:brightness-110">Save storefront</button>
    </form>
  );
}

// The panel beside the 3D interior: what this business offers visitors. Owners can edit it.
export default function StorefrontPanel({ plotId }) {
  // with a game server, a plot's storefront comes from the server (coupons, quests with budgets, feedback board, sign-ups)
  if (apiOn() && typeof plotId === 'number') return <LiveStorefront plotId={plotId} />;
  return <LocalStorefront plotId={plotId} />;
}

// A part of the panel an interior hotspot can point at: it lights up for a moment when the visitor jumps to that spot in the room.
function Spot({ id, children }) {
  const lit = useInteriorFocus((s) => (s.section === id ? s.at : 0));
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!lit) return undefined;
    setOn(true);
    const t = setTimeout(() => setOn(false), 2200);
    return () => clearTimeout(t);
  }, [lit]);
  return <div className={`rounded-lg transition ${on ? 'ring-2 ring-amber-400/80 ring-offset-2 ring-offset-slate-950' : ''}`}>{children}</div>;
}

function LocalStorefront({ plotId }) {
  const plot = useCityStore((s) => businessById(s, plotId));
  const [editing, setEditing] = useState(false);
  if (!plot) return null;
  const brand = plot.brand;
  const hasAnything = brand && (brand.coupon || brand.quest || brand.video || brand.game);

  return (
    <aside className="flex max-h-[45%] w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-sx-alt bg-sx-page/60 p-4 sm:max-h-none sm:w-72 sm:border-l sm:border-t-0">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Storefront</h3>
        {plot.userClaimed && (
          <button onClick={() => setEditing((e) => !e)} className="flex items-center gap-1 rounded border border-sx-stroke px-2 py-0.5 text-[11px] text-slate-200 hover:bg-sx-alt">
            <Pencil className="h-3 w-3" /> {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {editing ? (
        <Editor key={plot.id} plot={plot} />
      ) : hasAnything ? (
        <>
          {brand.coupon && <Spot id="offer"><Offer plot={plot} /></Spot>}
          {brand.quest && <Spot id="reward"><VisitQuest key={plot.id} plot={plot} /></Spot>}
          {brand.video && <Spot id="video"><Embed kind="video" embed={brand.video} /></Spot>}
          {brand.game && <Spot id="game"><Embed kind="game" embed={brand.game} /></Spot>}
        </>
      ) : (
        <p className="text-xs text-slate-500">{plot.userClaimed ? 'Nothing here yet. Press Edit to add a coupon, a video, a game demo or a visit reward.' : 'This business has no offers right now.'}</p>
      )}
      {/* a phone's "Look at" menu: here rather than over the room (no feedback board without a game server, so it goes last) */}
      {!editing && <div className="sm:hidden"><LookAt layout="inline" /></div>}
    </aside>
  );
}
