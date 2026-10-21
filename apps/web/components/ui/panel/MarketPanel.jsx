"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Dices, Lock, Store } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { useAccount } from '@/lib/state/accountStore';
import { useMarket } from '@/lib/state/marketStore';
import { useCart } from '@/lib/state/cartStore';
import { apiOn } from '@/lib/data/api';
import { MARKET_EDIT_PATH, loginHref } from '@/lib/data/admin';
import { HOURS, MARKET_LIMITS, MARKET_STYLES, TIERS, TIER_COLOURS, cleanParams, dollars, planMarket } from '@/lib/market/layout';
import { addWeeks, autoParams, bookingEnd, bookingProblem, earliestStart, weekLabel, weekStartOf, weekWindow } from '@/lib/market/weeks';
import { cleanRates } from '@/lib/market/local';
import PromoField from '../PromoField';

// The pop-up market panel: the plan of the market with every stall coloured by how busy it is, the stall you picked (its price and a booking form for
// 24, 48 or 72 hours), your own bookings, and, for an admin, the weekly layout editor. With a server the editor is shown only to a signed-in
// admin (the session from /admin/login, asked about when the panel opens); a player never sees it. A link for the editor (/?market=edit, as the
// admin Overview gives) shows "Sign in as an admin" instead when no admin is signed in.

const HOUR = 3600000;
const when = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Slider({ label, value, min, max, step = 0.1, onChange, format = (v) => v, disabled }) {
  return (
    <label className="mb-2 block text-xs">
      <span className="flex justify-between text-slate-300">
        {label} <span className="font-mono text-slate-100">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber-400 disabled:opacity-40" />
    </label>
  );
}

// The plan: world coordinates, north up, so it matches the city map.
function Plan({ data, plan, selected, onSelect, bookedIds }) {
  const s = data.site;
  const pad = 2;
  const w = s.x1 - s.x0 + pad * 2;
  const d = s.z1 - s.z0 + pad * 2;
  return (
    <svg viewBox={`${s.x0 - pad} ${s.z0 - pad} ${w} ${d}`} className="mb-3 w-full rounded-lg border border-sx-stroke bg-[#14301c]" role="img" aria-label="Plan of the market">
      <rect x={s.x0} y={s.z0} width={s.x1 - s.x0} height={s.z1 - s.z0} fill="#1b3b24" stroke="#f59e0b" strokeWidth="0.15" strokeDasharray="0.8 0.6" />
      {plan.aisles.map((a, i) => (
        <rect key={`a${i}`} x={a.x0} y={a.z0} width={a.x1 - a.x0} height={a.z1 - a.z0} fill="#475569" opacity="0.55" />
      ))}
      {plan.plaza && <rect x={plan.plaza.x0} y={plan.plaza.z0} width={plan.plaza.x1 - plan.plaza.x0} height={plan.plaza.z1 - plan.plaza.z0} fill="#0f766e" opacity="0.7" rx="0.6" />}
      {plan.stalls.map((st) => {
        const booked = bookedIds.has(st.id);
        const sel = selected === st.id;
        return (
          <g key={st.id} onClick={() => onSelect?.(st.id)} className={onSelect ? 'cursor-pointer' : undefined}>
            <rect x={st.x - st.w / 2} y={st.z - st.d / 2} width={st.w} height={st.d} rx={st.kind === 'booth' ? 0.35 : 0.1} fill={TIER_COLOURS[st.tier]} opacity={booked ? 0.28 : 0.95} stroke={sel ? '#ffffff' : '#0b1020'} strokeWidth={sel ? 0.28 : 0.06} />
            {booked && <rect x={st.x - st.w / 2 + 0.2} y={st.z - st.d / 2 + 0.2} width={st.w - 0.4} height={st.d - 0.4} fill="none" stroke="#e2e8f0" strokeWidth="0.1" strokeDasharray="0.25 0.2" />}
          </g>
        );
      })}
      {plan.gates.map((g, i) => (
        <g key={`g${i}`}>
          <circle cx={g.x} cy={g.z} r="0.9" fill="#f8fafc" />
          <text x={g.x} y={g.z + 0.35} fontSize="1" textAnchor="middle" fill="#0b1020" fontWeight="700">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Legend() {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
      {TIERS.map((t) => (
        <li key={t.id} className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TIER_COLOURS[t.id] }} />
          {t.label} {dollars(t.cents)}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-slate-300 bg-slate-500/40" />
        Booked
      </li>
      <li className="flex items-center gap-1">
        <span className="flex h-3 w-3 items-center justify-center rounded-full bg-white text-[8px] font-bold text-slate-900">1</span>
        Gate
      </li>
    </ul>
  );
}

// What a visitor sees at a stall that is open: the shop's name, what it sells, its offer and website. Looking at it counts as a visit.
function StallShop({ booking, stall, mine }) {
  const recordVisit = useMarket((s) => s.recordVisit);
  useEffect(() => {
    if (!mine) recordVisit(booking.id);
  }, [booking.id, mine, recordVisit]);
  const left = booking.end - Date.now();
  const hoursLeft = Math.max(1, Math.round(left / HOUR));
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-emerald-500/40 bg-emerald-500/5 text-xs">
      <div className="flex items-center justify-between gap-2 bg-emerald-500/15 px-3 py-2">
        <span className="flex items-center gap-1.5 font-bold text-emerald-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Open now
        </span>
        <span className="text-[11px] text-slate-300">closes {when(booking.end)} · about {hoursLeft} h left</span>
      </div>
      <div className="p-3">
        <div className="text-base font-bold text-white">{booking.brand}</div>
        <div className="mb-2 text-slate-400">
          Stall {stall.id}
          {booking.product ? ` · ${booking.product}` : ''} · run by {booking.by}
        </div>
        {booking.offer && <p className="mb-2 inline-block rounded-md bg-amber-400/15 px-2 py-1 font-medium text-amber-200">{booking.offer}</p>}
        {booking.goods?.length ? (
          <ul className="mb-2 divide-y divide-sx-stroke rounded-lg bg-sx-alt">
            {booking.goods.map((g) => (
              <li key={g.name} className="flex justify-between px-2.5 py-1.5">
                <span className="text-slate-100">{g.name}</span>
                <span className="font-mono text-slate-300">{dollars(g.cents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2 text-slate-400">{mine ? 'You have not added any goods yet. Add them below so visitors can see what you sell.' : 'This stallholder has not listed their goods yet.'}</p>
        )}
        <div className="flex items-center gap-2">
          {booking.website && (
            <a href={booking.website} target="_blank" rel="noreferrer" className="rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 font-bold text-white hover:brightness-110">
              Visit website
            </a>
          )}
          <span className="text-[11px] text-slate-500">Buy at the stall or on their website. Prices are set by the stallholder.</span>
        </div>
      </div>
    </div>
  );
}

// The stallholder's own shop details for one of their bookings.
function OwnerEditor({ booking }) {
  const update = useMarket((s) => s.updateStall);
  const [goods, setGoods] = useState(() => (booking.goods?.length ? booking.goods : [{ name: '', cents: 0 }]));
  const [offer, setOffer] = useState(booking.offer ?? '');
  const [website, setWebsite] = useState(booking.website ?? '');
  const [saving, setSaving] = useState(false);
  const setGood = (i, patch) => setGoods((g) => g.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <div className="mb-3 rounded-xl border border-sx-stroke bg-sx-alt p-3 text-xs">
      <h3 className="mb-0.5 text-sm font-bold text-white">Your shop at stall {booking.stallId}</h3>
      <p className="mb-2 text-[11px] text-slate-400">
        {booking.state === 'live' ? 'Open now. Changes show to visitors straight away.' : `Opens ${when(booking.start)}. Set it up now and it is ready when the doors open.`}
        {booking.visits != null ? ` ${booking.visits} visitor${booking.visits === 1 ? '' : 's'} so far.` : ''}
      </p>
      {goods.map((g, i) => (
        <div key={i} className="mb-1 flex gap-1.5">
          <input value={g.name} onChange={(e) => setGood(i, { name: e.target.value })} maxLength={40} placeholder="What you sell" aria-label={`Item ${i + 1} name`} className="min-w-0 flex-1 rounded-md border border-sx-stroke bg-sx-page px-2 py-1 text-slate-100 placeholder:text-slate-500" />
          <input type="number" min="0" step="0.5" value={(g.cents ?? 0) / 100} onChange={(e) => setGood(i, { cents: Math.round(Math.max(0, Number(e.target.value) || 0) * 100) })} aria-label={`Item ${i + 1} price in dollars`} className="w-16 rounded-md border border-sx-stroke bg-sx-page px-1.5 py-1 text-slate-100" />
        </div>
      ))}
      <div className="mb-2 flex gap-3">
        {goods.length < 8 && (
          <button type="button" onClick={() => setGoods((g) => [...g, { name: '', cents: 0 }])} className="text-[11px] text-sky-300 underline">
            + Add an item
          </button>
        )}
      </div>
      <input value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={120} placeholder="An offer for visitors (optional)" aria-label="Offer" className="mb-1.5 w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1.5 text-slate-100 placeholder:text-slate-500" />
      <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} placeholder="Website (https://...)" aria-label="Website" className="mb-2 w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1.5 text-slate-100 placeholder:text-slate-500" />
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await update(booking.id, { goods: goods.filter((g) => g.name.trim()), offer, website });
          setSaving(false);
        }}
        className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-2 font-bold text-white hover:brightness-110 disabled:opacity-40"
      >
        Save my shop
      </button>
    </div>
  );
}

// Everything for the stall that is selected: the open shop (if it is open), your own shop editor (if it is yours), and the price and booking form.
function StallPanel({ data, stall }) {
  const clock = useMarket((s) => s.clock);
  const mine = useMarket((s) => s.mine);
  const bookings = data.bookings.filter((b) => b.stallId === stall.id);
  const live = bookings.find((b) => b.start <= clock && clock < b.end) ?? null;
  const mineIds = new Set(mine.map((b) => b.id));
  const mineHere = bookings.filter((b) => mineIds.has(b.id) && b.end > clock).map((b) => ({ ...b, visits: mine.find((m) => m.id === b.id)?.visits }));
  return (
    <>
      {live && <StallShop booking={live} stall={stall} mine={mineIds.has(live.id)} />}
      {mineHere.map((b) => (
        <OwnerEditor key={`${b.id}-${b.offer}-${b.goods?.length}`} booking={b} />
      ))}
      <StallCard data={data} stall={stall} />
    </>
  );
}

// The booking form for the stall that is selected.
function StallCard({ data, stall }) {
  const account = useAccount((s) => s.account);
  const book = useMarket((s) => s.book);
  const busy = useMarket((s) => s.busy);
  const [hours, setHours] = useState(24);
  const [start, setStart] = useState(null);
  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');
  const bookings = data.bookings.filter((b) => b.stallId === stall.id);
  const existing = bookings.map((b) => ({ start: b.start, end: b.end }));
  // start times every 12 hours that work for this length
  const options = useMemo(() => {
    const out = [];
    for (let t = earliestStart(data.week); t < data.window.end; t += 12 * HOUR) if (!bookingProblem({ week: data.week, stall, startMs: t, hours, existing })) out.push(t);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.week, stall.id, hours, data.bookings]);
  const chosen = options.includes(start) ? start : options[0];
  const submit = () => {
    const go = () => book({ stallId: stall.id, hours, start: chosen, brand, product });
    if (apiOn() && !useAccount.getState().ask(go)) return; // sign in only now, when they book
    go();
  };
  const cartBusy = useCart((s) => s.busy);
  const toCart = async () => {
    const { site, week } = useMarket.getState();
    try {
      const line = await useCart.getState().add({ kind: 'stall', input: { siteCode: site.code, week, stallId: stall.id, hours, start: chosen, brand, product } });
      useMarket.setState({ notice: { ok: true, text: `Added to your cart: ${line?.label ?? 'the stall'}. Open the cart from the top bar.` } });
    } catch (e) {
      useMarket.setState({ notice: { ok: false, text: e.message } });
    }
  };
  return (
    <div className="mb-3 rounded-xl border border-sx-stroke bg-sx-alt p-3 text-xs">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="text-sm font-bold text-white">
            Stall {stall.id} <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: TIER_COLOURS[stall.tier], color: '#0b1020' }}>{stall.tier}</span>
          </div>
          <div className="text-slate-400">{stall.kind === 'booth' ? 'Pop-up booth' : 'Stall'} · faces {({ N: 'north', S: 'south', E: 'east', W: 'west' })[stall.front]} · gate walk {stall.walk.toFixed(0)} m</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-amber-300">{dollars(stall.cents)}</div>
          <div className="text-[10px] text-slate-400">flat, any length</div>
        </div>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded bg-slate-700" title={`Footfall ${Math.round(stall.traffic * 100)} of 100`}>
        <div className="h-full" style={{ width: `${Math.round(stall.traffic * 100)}%`, background: TIER_COLOURS[stall.tier] }} />
      </div>
      <p className="mb-2 text-[11px] text-slate-400">Footfall {Math.round(stall.traffic * 100)} of 100: how many people walk past, from the gates along the aisles.</p>
      {bookings.length > 0 && (
        <ul className="mb-2 space-y-0.5 text-[11px] text-slate-300">
          {bookings.map((b) => (
            <li key={b.id}>
              <span className="text-slate-500">Taken:</span> {b.brand} · {when(b.start)} to {when(b.end)}
            </li>
          ))}
        </ul>
      )}
      {!data.open ? (
        <p className="flex items-center gap-1.5 text-amber-300">
          <Lock className="h-3.5 w-3.5" /> This week is not open for booking yet.
        </p>
      ) : (
        <>
          <div className="mb-2 flex gap-1" role="group" aria-label="How long">
            {HOURS.map((h) => (
              <button key={h} type="button" onClick={() => setHours(h)} aria-pressed={hours === h} className={`flex-1 rounded-md py-1.5 font-medium ${hours === h ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'bg-sx-stroke text-slate-300 hover:bg-slate-600'}`}>
                {h} hours
              </button>
            ))}
          </div>
          {options.length ? (
            <label className="mb-2 block">
              <span className="text-slate-400">Starts</span>
              <select value={chosen} onChange={(e) => setStart(Number(e.target.value))} className="mt-0.5 w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1.5 text-slate-100">
                {options.map((t) => (
                  <option key={t} value={t}>
                    {when(t)} to {when(bookingEnd(t, hours))}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mb-2 text-slate-400">No {hours}-hour slot is free on this stall for the rest of the week.</p>
          )}
          <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} placeholder="Your stall's name" className="mb-1.5 w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1.5 text-slate-100 placeholder:text-slate-500" aria-label="Stall name" />
          <input value={product} onChange={(e) => setProduct(e.target.value)} maxLength={120} placeholder="What you sell (optional)" className="mb-2 w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1.5 text-slate-100 placeholder:text-slate-500" aria-label="What you sell" />
          <div className="mb-2"><PromoField scope="stall" kind="stall" cents={stall.cents} /></div>
          <button type="button" disabled={busy || !chosen || !brand.trim()} onClick={submit} className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40">
            Book for {dollars(stall.cents)}
          </button>
          {/* or into the cart, to pay with other things in one payment (services/api/cart.mjs); it holds nothing until checkout */}
          {account && apiOn() && (
            <button type="button" disabled={cartBusy || !chosen || !brand.trim()} onClick={toCart} className="mt-1.5 min-h-11 w-full rounded-lg border border-sx-stroke bg-sx-page px-3 text-xs font-medium text-slate-100 hover:bg-sx-stroke disabled:opacity-40" data-testid="stall-add-to-cart">
              Add to cart
            </button>
          )}
          {!account && apiOn() && <p className="mt-1.5 text-center text-[11px] text-slate-400">You will be asked to sign in when you book.</p>}
        </>
      )}
    </div>
  );
}

function MyStalls() {
  const mine = useMarket((s) => s.mine);
  const cancel = useMarket((s) => s.cancel);
  const select = useMarket((s) => s.select);
  const week = useMarket((s) => s.week);
  const siteCode = useMarket((s) => s.site?.code);
  if (!mine.length) return null;
  return (
    <section className="mb-3">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Your stalls</h3>
      <ul className="space-y-1">
        {mine.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg bg-sx-alt px-2.5 py-1.5 text-xs">
            <span className="min-w-0">
              <span className="font-medium text-white">{b.stallId}</span> · {b.brand}
              <span className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${b.state === 'live' ? 'bg-emerald-500/20 text-emerald-300' : b.state === 'ended' ? 'bg-slate-600/40 text-slate-300' : 'bg-sky-500/20 text-sky-300'}`}>{b.state === 'live' ? 'open now' : b.state === 'ended' ? 'closed' : 'coming up'}</span>
              <span className="block text-[11px] text-slate-400">
                {when(b.start)} · {b.hours} h · {dollars(b.cents)}
                {b.visits != null && b.state !== 'upcoming' ? ` · ${b.visits} visitor${b.visits === 1 ? '' : 's'}` : ''}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-[11px]">
              {b.state !== 'ended' && b.siteCode === siteCode && b.week === week && (
                <button type="button" onClick={() => select(b.stallId)} className="text-sky-300 underline hover:text-white">
                  set up shop
                </button>
              )}
              {b.state === 'upcoming' && (
                <button type="button" onClick={() => cancel(b.id)} className="text-slate-400 underline hover:text-white">
                  cancel
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// "Open now: 62 of 71 stalls" and when the next one opens: what a visitor wants to know before walking in.
function OpenStrip({ data }) {
  const clock = useMarket((s) => s.clock);
  const live = data.bookings.filter((b) => b.start <= clock && clock < b.end);
  const next = data.bookings.filter((b) => b.start > clock).sort((a, b) => a.start - b.start)[0];
  return (
    <div className={`mb-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs ${live.length ? 'bg-emerald-500/10 text-emerald-200' : 'bg-sx-alt text-slate-300'}`}>
      <span className="flex items-center gap-2 font-medium">
        <span className={`h-2 w-2 rounded-full ${live.length ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
        {live.length ? `Open now: ${live.length} stall${live.length === 1 ? '' : 's'}` : 'No stalls are open right now'}
      </span>
      <span className="text-[11px] text-slate-400">{next ? `next opens ${when(next.start)}` : live.length ? 'walk in through a gate' : ''}</span>
    </div>
  );
}

// ---- the admin's weekly layout editor ------------------------------------------------------------------------------------------------
function AdminEditor({ data, site }) {
  const save = useMarket((s) => s.saveLayout);
  const busy = useMarket((s) => s.busy);
  const admin = useMarket((s) => s.admin);
  const demo = useMarket((s) => s.demo);
  const week = data.week;
  const locked = data.bookings.length > 0; // a booked week cannot be rearranged
  const [params, setParams] = useState(() => cleanParams(data.params));
  const [rates, setRates] = useState(() => ({ ...Object.fromEntries(TIERS.map((t) => [t.id, t.cents])), ...(data.rates ?? {}) }));
  const [note, setNote] = useState(data.note ?? '');
  const [selected, setSelected] = useState(null);
  // start again from what is saved whenever the week changes
  useEffect(() => {
    setParams(cleanParams(data.params));
    setRates({ ...Object.fromEntries(TIERS.map((t) => [t.id, t.cents])), ...(data.rates ?? {}) });
    setNote(data.note ?? '');
  }, [data.week, data.params, data.rates, data.note]);
  const set = (patch) => setParams((p) => cleanParams({ ...p, ...patch }));
  const plan = useMemo(() => {
    const p = planMarket(site, locked ? data.params : params, site.road);
    const r = cleanRates(rates);
    return { ...p, stalls: p.stalls.map((s) => ({ ...s, cents: r?.[s.tier] ?? s.cents })) };
  }, [site, params, rates, locked, data.params]);
  const total = plan.stalls.reduce((n, s) => n + s.cents, 0);
  const byTier = Object.fromEntries(TIERS.map((t) => [t.id, plan.stalls.filter((s) => s.tier === t.id).length]));
  const bookedIds = new Set(data.bookings.map((b) => b.stallId));

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs" data-testid="market-editor">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-amber-200">Layout for {weekLabel(week)}</h3>
        <span className="text-[11px] text-slate-400">{data.source === 'admin' ? (data.open ? 'published' : 'draft') : 'automatic'}</span>
      </div>
      {locked && <p className="mb-2 rounded bg-amber-500/10 p-2 text-[11px] text-amber-200">{data.bookings.length} booking{data.bookings.length === 1 ? '' : 's'} already made: the arrangement is locked. You can still change the prices and the note.</p>}
      <div className="mb-3 grid grid-cols-1 gap-1.5">
        {MARKET_STYLES.map((st) => (
          <button key={st.id} type="button" disabled={locked} onClick={() => set({ style: st.id })} aria-pressed={params.style === st.id} className={`rounded-lg border p-2 text-left disabled:opacity-50 ${params.style === st.id ? 'border-amber-400 bg-amber-400/10' : 'border-sx-stroke hover:bg-sx-stroke/50'}`}>
            <span className="block font-medium text-white">{st.label}</span>
            <span className="block text-[11px] text-slate-400">{st.note}</span>
          </button>
        ))}
      </div>
      {params.style !== 'columns' && <Slider label="Gates on the road side" value={params.entrances} min={MARKET_LIMITS.entrances[0]} max={MARKET_LIMITS.entrances[1]} step={1} disabled={locked} onChange={(v) => set({ entrances: v })} />}
      <Slider label="Stall width" value={params.stallW} min={MARKET_LIMITS.stallW[0]} max={MARKET_LIMITS.stallW[1]} disabled={locked} onChange={(v) => set({ stallW: v })} format={(v) => v.toFixed(1)} />
      <Slider label="Aisle width" value={params.aisle} min={MARKET_LIMITS.aisle[0]} max={MARKET_LIMITS.aisle[1]} disabled={locked} onChange={(v) => set({ aisle: v })} format={(v) => v.toFixed(1)} />
      <Slider label="Pop-up booths among the stalls" value={params.boothShare} min={MARKET_LIMITS.boothShare[0]} max={MARKET_LIMITS.boothShare[1]} step={0.05} disabled={locked} onChange={(v) => set({ boothShare: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <div className="mb-3 flex gap-2">
        <button type="button" disabled={locked} onClick={() => set({ seed: 1 + Math.floor(Math.random() * 99999) })} className="inline-flex items-center gap-1.5 rounded-lg border border-sx-stroke px-3 py-1.5 text-slate-200 hover:bg-sx-stroke/50 disabled:opacity-40">
          <Dices className="h-3.5 w-3.5" /> Reshuffle booths
        </button>
        <button type="button" disabled={locked} onClick={() => setParams(cleanParams(autoParams(site.code, week)))} className="rounded-lg border border-sx-stroke px-3 py-1.5 text-slate-200 hover:bg-sx-stroke/50 disabled:opacity-40">
          Automatic layout
        </button>
      </div>
      <Plan data={data} plan={plan} selected={selected} onSelect={setSelected} bookedIds={bookedIds} />
      <p className="mb-3 text-[11px] text-slate-300">
        <b className="text-white">{plan.stalls.length} spots</b> ({plan.stalls.filter((s) => s.kind === 'stall').length} stalls, {plan.stalls.filter((s) => s.kind === 'booth').length} booths). Prime {byTier.prime}, busy {byTier.busy}, standard {byTier.standard}, quiet {byTier.quiet}. If every spot is let once: <b className="text-amber-300">{dollars(total)}</b>.
      </p>
      {!apiOn() && (
        <div className="mb-3 flex gap-2">
          <button type="button" onClick={() => demo(true)} className="flex-1 rounded-lg border border-emerald-500/50 px-3 py-1.5 font-medium text-emerald-200 hover:bg-emerald-500/10">
            Fill with demo stallholders
          </button>
          <button type="button" onClick={() => demo(false)} className="rounded-lg border border-sx-stroke px-3 py-1.5 text-slate-300 hover:bg-sx-stroke/50">
            Clear demo
          </button>
        </div>
      )}
      <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Prices (flat, $2 to $5)</h4>
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {TIERS.map((t) => (
          <label key={t.id} className="block text-[11px] text-slate-300">
            <span className="mb-0.5 flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: TIER_COLOURS[t.id] }} />
              {t.label}
            </span>
            <input type="number" min="2" max="5" step="0.5" value={(rates[t.id] ?? t.cents) / 100} onChange={(e) => setRates((r) => ({ ...r, [t.id]: Math.round(Math.min(5, Math.max(2, Number(e.target.value) || 2)) * 100) }))} className="w-full rounded-md border border-sx-stroke bg-sx-page px-1.5 py-1 text-slate-100" aria-label={`${t.label} price in dollars`} />
          </label>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="A note for this week (optional): Food week, Craft fair ..." className="mb-3 w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1.5 text-slate-100 placeholder:text-slate-500" aria-label="Note for the week" />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => save({ week, params: locked ? data.params : params, rates, note, publish: false })} className="flex-1 rounded-lg border border-sx-stroke px-3 py-2 font-medium text-slate-100 hover:bg-sx-stroke/50 disabled:opacity-40">
          Save draft
        </button>
        <button type="button" disabled={busy} onClick={() => save({ week, params: locked ? data.params : params, rates, note, publish: true })} className="flex-1 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-2 font-bold text-white hover:brightness-110 disabled:opacity-40">
          Publish
        </button>
      </div>
      {apiOn() && admin && (
        <p className="mt-2 text-[11px] text-slate-500">
          Signed in as admin <b className="text-slate-300">{admin.username}</b> ·{' '}
          <a href="/admin" className="underline hover:text-slate-300">
            admin dashboard
          </a>
        </p>
      )}
    </div>
  );
}

export default function MarketPanel({ site }) {
  const reserved = useCityStore((s) => s.layout.reserved);
  const roads = useCityStore((s) => s.layout.roads);
  const market = useMarket();
  const { data, week, selected, notice, error } = market;
  const full = useMemo(() => ({ ...site, road: roads.find((r) => r.id === site.frontRoad) ?? null }), [site, roads]);
  useEffect(() => {
    market.setSite(full);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full.code]);
  // asked for by a link (/?market=edit): open on the editor, or on "Sign in as an admin"
  const adminOpen = useMarket((s) => s.adminOpen);
  const [wanted, setWanted] = useState(() => useMarket.getState().adminOpen);
  const [tab, setTab] = useState(wanted ? 'admin' : 'market');
  useEffect(() => {
    useMarket.setState({ adminChecked: false });
    market.checkAdmin(); // once per opening: GET /admin/session with the cookie (nothing is kept in the browser)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the link can also come while the panel is already open
  useEffect(() => {
    if (!adminOpen) return;
    useMarket.setState({ adminOpen: false });
    setWanted(true);
    setTab('admin');
  }, [adminOpen]);
  const thisWeek = weekStartOf();
  const isAdmin = market.isAdmin();
  const view = isAdmin ? tab : 'market'; // a player only ever sees the market
  const askSignIn = wanted && apiOn() && market.adminChecked && !market.admin;
  const bookedIds = useMemo(() => new Set((data?.bookings ?? []).filter((b) => b.end > Date.now() || data?.week !== thisWeek).map((b) => b.stallId)), [data, thisWeek]);
  const stall = data?.stalls.find((s) => s.id === selected) ?? null;
  const siblings = reserved.filter((r) => r.market);
  void siblings;

  return (
    <div className="p-4 text-slate-200">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Store className="h-4 w-4 text-amber-300" /> Pop-up market in The Bazaar
            <span className="rounded bg-sx-stroke px-1.5 py-0.5 font-mono text-[10px] text-slate-300" title="This site's ID">{site.code}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {Math.round(site.x1 - site.x0)} × {Math.round(site.z1 - site.z0)} · rent a stall or pop-up booth for 24, 48 or 72 hours
          </p>
        </div>
        {isAdmin && (
          <div className="flex rounded-lg bg-sx-alt p-0.5 text-[11px]" role="tablist" data-testid="market-admin-tabs">
            {[['market', 'Market'], ['admin', 'Set up weeks']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-md px-2.5 py-1 font-medium ${tab === id ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between rounded-lg bg-sx-alt px-2 py-1.5 text-xs">
        <button type="button" aria-label="Previous week" disabled={week <= thisWeek} onClick={() => market.setWeek(addWeeks(week, -1))} className="rounded p-1 hover:bg-sx-stroke disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="font-medium text-white">{weekLabel(week)}</div>
          <div className="text-[10px] text-slate-400">
            {week === thisWeek ? 'This week' : week === addWeeks(thisWeek, 1) ? 'Next week' : `In ${Math.round((weekWindow(week).start - weekWindow(thisWeek).start) / (7 * 86400000))} weeks`}
            {data?.note ? ` · ${data.note}` : ''}
          </div>
        </div>
        <button type="button" aria-label="Next week" disabled={week >= addWeeks(thisWeek, 5)} onClick={() => market.setWeek(addWeeks(week, 1))} className="rounded p-1 hover:bg-sx-stroke disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}
      {notice && <p className={`mb-3 rounded-lg p-2 text-xs ${notice.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`} role="status">{notice.text}</p>}
      {!data && !error && <p className="text-xs text-slate-400">Loading the market…</p>}

      {data && view === 'market' && (
        <>
          {!data.open && <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-200"><Lock className="h-3.5 w-3.5" /> This week is still being set up. Check back soon.</p>}
          <Plan data={data} plan={data} selected={selected} onSelect={market.select} bookedIds={bookedIds} />
          <OpenStrip data={data} />
          {!apiOn() && data.bookings.length === 0 && (
            <button type="button" onClick={() => market.demo(true)} className="mb-3 w-full rounded-lg border border-dashed border-emerald-500/50 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/10">
              The market is empty. See it full: fill it with demo stallholders
            </button>
          )}
          <Legend />
          <p className="mb-3 text-[11px] text-slate-400">
            {data.stats.total} spots ({data.stats.stalls} stalls, {data.stats.booths} booths) · {new Set(data.bookings.map((b) => b.stallId)).size} booked this week. Click a spot for its price and to book it.
          </p>
          {stall ? <StallPanel data={data} stall={stall} /> : <p className="mb-3 rounded-lg border border-dashed border-sx-stroke p-3 text-center text-xs text-slate-400">Pick a spot on the plan. The busiest ones, near the gates, are gold.</p>}
          <MyStalls />
        </>
      )}
      {askSignIn && (
        <div className="mb-3 rounded-xl border border-sx-stroke bg-sx-alt p-3 text-xs" data-testid="market-admin-sign-in">
          <h3 className="mb-1 text-sm font-bold text-white">Set up the market weeks</h3>
          <p className="mb-2 text-slate-400">The weekly layout editor is for admins.</p>
          <a href={loginHref(MARKET_EDIT_PATH)} className="inline-block rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 font-bold text-white hover:brightness-110">
            Sign in as an admin
          </a>
        </div>
      )}
      {data && view === 'admin' && <AdminEditor data={data} site={full} />}
    </div>
  );
}
