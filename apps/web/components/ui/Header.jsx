"use client";

import React from 'react';
import Link from 'next/link';
import { Shirt, Sparkles, Store } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { usePanel } from '@/lib/state/panelStore';
import { useAccount } from '@/lib/state/accountStore';
import CartButton from './CartButton';

export default function Header() {
  const plots = useCityStore((state) => state.plots);
  const gold = useCityStore((state) => state.gold);
  const account = useAccount((s) => s.account);
  const totalValuation = plots.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 border-b border-sx-alt bg-sx-panel/60 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md sm:p-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="hidden sm:block p-2 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue/20 text-violet-400 border border-violet-500/30">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h1 className="truncate text-sm font-bold tracking-tight text-white sm:text-base">VOXELVENTURE</h1>
          <p className="hidden text-xs text-slate-400 sm:block">Interactive Digital Commercial City</p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        <div className="text-right">
          <span className="block text-[10px] tracking-wider text-slate-400 uppercase font-semibold">Your Gold</span>
          <span className="font-mono text-sm font-bold text-amber-400">{gold.toLocaleString()}</span>
        </div>
        {account && (
          <button onClick={() => usePanel.getState().open('account')} title="Your account, email notices and Gold wallet" className="max-sm:hidden rounded-full border border-sx-stroke bg-sx-panel/70 px-3 py-1 text-xs text-slate-200 hover:border-sx-line">
            {account.username} · {account.gold} Credits
          </button>
        )}
        <button
          onClick={() => usePanel.getState().open('wardrobe')}
          className="flex items-center gap-1.5 rounded-lg border border-sx-stroke bg-sx-alt px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-sx-stroke"
        >
          <Shirt className="h-3.5 w-3.5 text-violet-400" /> <span className="max-sm:sr-only">Wardrobe</span>
        </button>
        {/* the business-first pages: every business's plain page, and listing one for free (no plot needed) */}
        <Link href="/discover" title="Find businesses on their own pages" className="flex items-center gap-1.5 rounded-lg border border-sx-stroke bg-sx-alt px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-sx-stroke">
          <Store className="h-3.5 w-3.5 text-sx-cyan" /> <span className="max-sm:sr-only">Businesses</span>
        </Link>
        {/* the cart (services/api/cart.mjs): several purchases, one payment */}
        <CartButton />
        <Link href="/business/new" className="hidden rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 text-xs font-bold text-white hover:brightness-110 lg:block">
          List your business free
        </Link>
        <div className="hidden text-right md:block">
          <span className="block text-[10px] tracking-wider text-slate-400 uppercase font-semibold">City Market Cap</span>
          <span className="font-mono text-sm font-bold text-green-400">${totalValuation.toLocaleString()}</span>
        </div>
        <div className="text-right">
          <span className="block text-[10px] tracking-wider text-slate-400 uppercase font-semibold">Occupied Plots</span>
          <span className="font-mono text-sm font-bold text-white">
            {plots.filter((p) => p.owner).length} / {plots.length}
          </span>
        </div>
      </div>
    </header>
  );
}