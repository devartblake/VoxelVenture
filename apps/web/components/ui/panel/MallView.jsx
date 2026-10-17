"use client";

import React, { useState } from 'react';
import { Coins, Compass, Film, Footprints, Gamepad2, Gift, Store } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { usePanel } from '@/lib/state/panelStore';
import { useWorld } from '@/lib/state/worldStore';
import { avatarState } from '@/lib/sim/avatarState';
import { generatedSpec } from '@/lib/game/logos';

const LAYOUT = { boutique: 'Boutique', market: 'Market', diner: 'Diner', cafe: 'Cafe', openplan: 'Open-plan office', meetings: 'Meeting rooms' };
const TYPE = { shop: 'Shop', restaurant: 'Restaurant', office: 'Office' };

// A little form to rent a store: its new name and an optional website. The store keeps its kind and its interior (you can redesign the inside after).
function RentForm({ store, onDone }) {
  const rentStore = useCityStore((s) => s.rentStore);
  const [title, setTitle] = useState(store.title);
  const [website, setWebsite] = useState('');
  const price = Math.round((store.value ?? 100) * 1.25);
  const submit = (e) => {
    e.preventDefault();
    if (rentStore(store.id, 'You', title.trim() || store.title, website.trim() || 'https://example.com', { kind: 'generated' }) != null) onDone();
  };
  return (
    <form onSubmit={submit} className="mt-2 space-y-1.5 rounded-lg border border-sx-line bg-sx-alt/60 p-2" data-testid="rent-form">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} aria-label="Store name" className="w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1 text-xs text-white" />
      <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://your-site.com (optional)" aria-label="Website" className="w-full rounded-md border border-sx-stroke bg-sx-page px-2 py-1 text-xs text-white" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400">Rent for ${price.toLocaleString()}</span>
        <span className="flex gap-1.5">
          <button type="button" onClick={onDone} className="rounded-md px-2 py-1 text-[11px] text-slate-300 hover:bg-sx-stroke">Cancel</button>
          <button type="submit" className="rounded-md bg-gradient-to-r from-sx-purple to-sx-blue px-2.5 py-1 text-[11px] font-bold text-white hover:brightness-110">Rent it</button>
        </span>
      </div>
    </form>
  );
}

// The directory of a mega mall: every store, with what it offers, and a button to go inside it.
export default function MallView() {
  const id = usePanel((s) => s.mallId);
  const layout = useCityStore((s) => s.layout);
  const openInterior = useCityStore((s) => s.openInterior);
  const mall = layout.malls?.find((m) => m.id === id) ?? layout.malls?.[0];
  const [renting, setRenting] = useState(null);
  const canRent = !process.env.NEXT_PUBLIC_LIVE_API_URL; // the stores are not on the game server (yet): only in the local game
  if (!mall) return <p className="text-xs text-slate-400">No mall here.</p>;

  return (
    <div className="text-slate-100">
      <div className="mb-3 rounded-lg border border-violet-800/60 bg-violet-950/40 p-3">
        <h3 className="text-sm font-bold text-white">{mall.name}</h3>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {mall.stores.length} stores at the {mall.end} end of the streets. Walk in through the door and along the hall to a store's door, or go inside from here. Rent a store to make it your own.
        </p>
        <div className="mt-2 flex gap-2">
          <button onClick={() => useWorld.getState().focusOn(mall.door.x, mall.door.z, 28)} className="rounded-md border border-sx-line bg-sx-alt px-2.5 py-1 text-[11px] hover:bg-sx-stroke">
            Show on the map
          </button>
          <button onClick={() => (avatarState.target = { x: mall.door.x, z: mall.door.z })} className="flex items-center gap-1 rounded-md border border-sx-line bg-sx-alt px-2.5 py-1 text-[11px] hover:bg-sx-stroke">
            <Footprints className="h-3 w-3" /> Walk to the door
          </button>
        </div>
      </div>
      <ul className="space-y-1.5">
        {mall.stores.map((st) => {
          const spec = generatedSpec(st);
          const brand = st.brand;
          return (
            <li key={st.id} className="rounded-lg border border-sx-alt bg-sx-panel/60 p-2">
             <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold" style={{ background: spec.bg, color: spec.fg, boxShadow: `inset 0 0 0 2px ${spec.fg}` }}>
                {spec.letters}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-white">{st.title}</span>
                <span className="block truncate text-[10px] text-slate-400">
                  {TYPE[st.buildingType]} · {LAYOUT[st.interiorData.variant] ?? st.interiorData.variant}
                </span>
                <span className="mt-0.5 flex gap-1.5 text-amber-300">
                  {brand?.coupon && <Gift className="h-3 w-3" title="Coupon" />}
                  {brand?.quest && <Coins className="h-3 w-3" title={`${brand.quest.gold} Gold visit reward`} />}
                  {brand?.video && <Film className="h-3 w-3" title="Video" />}
                  {brand?.game && <Gamepad2 className="h-3 w-3" title="Game demo" />}
                </span>
              </span>
              <button onClick={() => openInterior(st)} className="flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-r from-sx-purple to-sx-blue px-2.5 py-1.5 text-[11px] font-medium text-white hover:brightness-110">
                <Compass className="h-3.5 w-3.5" /> Go inside
              </button>
             </div>
             {st.userClaimed ? (
               <p className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-300"><Store className="h-3 w-3" /> You rent this store: go inside and press Redesign inside to change it.</p>
             ) : canRent && renting !== st.id ? (
               <button type="button" onClick={() => setRenting(st.id)} className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"><Store className="h-3 w-3" /> Rent this store</button>
             ) : canRent ? (
               <RentForm store={st} onDone={() => setRenting(null)} />
             ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
