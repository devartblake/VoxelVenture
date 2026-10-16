"use client";

import React, { useState } from 'react';
import { Check, Coins, Dices, Shirt } from 'lucide-react';
import { COSMETICS, RAFFLE_COST, RAFFLE_PRIZES } from '@/lib/game/cosmetics';
import { useCityStore } from '@/lib/state/store';

const TABS = [
  { id: 'outfit', label: 'Outfit', slots: ['shirt', 'pants', 'hat'] },
  { id: 'emotes', label: 'Emotes', slots: ['emote'] },
  { id: 'raffle', label: 'Raffle' },
];
const SLOT_LABELS = { shirt: 'Tops', pants: 'Pants', hat: 'Hats', emote: 'Emotes' };

function Swatch({ item }) {
  if (item.slot === 'emote') return <span className="flex h-8 w-8 items-center justify-center rounded bg-sx-alt font-mono text-xs text-amber-300">{item.key}</span>;
  if (!item.color) return <span className="h-8 w-8 rounded border border-dashed border-sx-line" />;
  return <span className="h-8 w-8 rounded border border-sx-line" style={{ background: item.color }} />;
}

function ItemRow({ item }) {
  const { gold, owned, appearance, buyCosmetic, equipCosmetic } = useCityStore();
  const have = Boolean(owned[item.id]);
  const worn = appearance[item.slot] === item.id;
  const affordable = gold >= item.price;

  return (
    <li className="flex items-center gap-3 rounded-lg bg-sx-alt/50 px-2 py-1.5">
      <Swatch item={item} />
      <span className="flex-1 text-sm text-slate-100">{item.name}</span>
      {have ? (
        item.slot === 'emote' ? (
          <span className="flex items-center gap-1 text-xs text-green-400"><Check className="h-3.5 w-3.5" /> Owned · press {item.key}</span>
        ) : worn ? (
          <span className="flex items-center gap-1 text-xs text-green-400"><Check className="h-3.5 w-3.5" /> Wearing</span>
        ) : (
          <button onClick={() => equipCosmetic(item.id)} className="rounded border border-sx-line px-2.5 py-1 text-xs text-slate-100 hover:bg-sx-stroke">Wear</button>
        )
      ) : (
        <button
          onClick={() => buyCosmetic(item.id)}
          disabled={!affordable}
          className="flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-sx-stroke disabled:text-slate-500"
        >
          <Coins className="h-3.5 w-3.5" /> {item.price}
        </button>
      )}
    </li>
  );
}

function Raffle() {
  const { gold, enterRaffle, billboards } = useCityStore();
  const [result, setResult] = useState(null);
  const sponsor = billboards.find((b) => b.ad)?.ad.advertiser;

  return (
    <div className="space-y-3 text-sm text-slate-200">
      <p>
        {sponsor ? <>Sponsored by <strong className="text-white">{sponsor}</strong>. </> : null}
        A ticket costs <strong className="text-amber-300">{RAFFLE_COST} Gold</strong>. Most tickets pay less than they cost, so play for fun.
      </p>
      <ul className="grid grid-cols-5 gap-1.5 text-center text-[11px]">
        {RAFFLE_PRIZES.map((p) => (
          <li key={p.gold} className="rounded bg-sx-alt/60 py-1.5">
            <span className="block font-mono text-sm text-amber-300">{p.gold || '–'}</span>
            <span className="text-slate-400">{Math.round(p.chance * 100)}%</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => setResult(enterRaffle())}
        disabled={gold < RAFFLE_COST}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue py-2 font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-sx-stroke disabled:text-slate-500"
      >
        <Dices className="h-4 w-4" /> Buy a ticket ({RAFFLE_COST} Gold)
      </button>
      {result !== null && (
        <p className={`text-center font-medium ${result ? 'text-green-400' : 'text-slate-400'}`}>
          {result ? `You won ${result} Gold!` : 'No prize this time.'}
        </p>
      )}
    </div>
  );
}

// Opens from the header. Gold is earned from billboard quests, the daily chest and the Plot of the Day.
export default function Wardrobe() {
  const gold = useCityStore((s) => s.gold);
  const [tab, setTab] = useState('outfit');
  const current = TABS.find((t) => t.id === tab);

  return (
    <div>
      <div className="text-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Shirt className="h-5 w-5 text-violet-400" /> Wardrobe</h2>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-amber-400"><Coins className="h-4 w-4" /> {gold.toLocaleString()}</span>
          </div>
        </div>

        <div className="mb-4 flex gap-1 rounded-lg bg-sx-alt p-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 rounded-md py-1.5 text-xs font-medium ${tab === t.id ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:bg-sx-stroke'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {current.slots ? (
          <div className="space-y-4">
            {current.slots.map((slot) => (
              <section key={slot}>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{SLOT_LABELS[slot]}</h3>
                <ul className="space-y-1.5">
                  {COSMETICS.filter((c) => c.slot === slot).map((item) => <ItemRow key={item.id} item={item} />)}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <Raffle />
        )}

        <p className="mt-4 text-[11px] text-slate-500">Earn Gold from billboard quests, the daily chest and the Plot of the Day.</p>
      </div>
    </div>
  );
}
