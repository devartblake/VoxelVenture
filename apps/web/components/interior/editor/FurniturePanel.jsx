"use client";

import React, { useMemo, useState } from 'react';
import { CATALOG_ITEMS, activateCatalogItem, useEditor, useScene } from '@pascal-app/editor';
import { ChevronDown, Search } from 'lucide-react';
import { groupItems } from '@/lib/content/furnitureGroups';
import { kitFor, menuFor } from '@/lib/content/businessFixtures';
import { FIXTURE_PRICES } from '@/lib/content/fixturePrices';
import { fixturesValue, priceOf, pricesConfigured } from '@/lib/content/fixturePricing';
import { useEditingBusiness } from '@/lib/state/editingBusiness';

// The furniture tab of the interior editor: the catalogue sorted into dropdown groups (Shop & display, Seating, Tables ...), with a short
// "Popular for shops" list open to begin with, and a search that looks through all of them. Click an item, then click in the room to place it.
// The thumbnails are the catalogue's as pascalBootstrap resolved them (lib/content/interiorProps.js): a bucket address, or /items on this site,
// used as they are (Pascal's resolveCdnUrl would send a /items path to Pascal's own CDN).
export default function FurniturePanel() {
  const business = useEditingBusiness();
  const kit = useMemo(() => (business.type ? kitFor(business.type, business.variant) : null), [business.type, business.variant]);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(kit ? 'essentials' : 'popular');
  const [query, setQuery] = useState('');
  const selected = useEditor((s) => s.selectedItem);
  // a business sees what suits its kind of business first (and everything else on request); the stand-alone editor has no business, so it shows the usual groups
  const groups = useMemo(() => (kit ? menuFor(CATALOG_ITEMS, kit, { showAll }) : groupItems(CATALOG_ITEMS)), [kit, showAll]);
  const priced = pricesConfigured();
  const nodes = useScene((s) => s.nodes);
  const worth = useMemo(() => fixturesValue({ nodes }), [nodes]);
  const q = query.trim().toLowerCase();
  const found = useMemo(() => (q ? CATALOG_ITEMS.filter((i) => i.name.toLowerCase().includes(q) || (i.tags ?? []).some((t) => t.includes(q))) : []), [q]);

  const tile = (item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => activateCatalogItem(item)}
      title={item.name}
      className={`group flex flex-col gap-1 rounded-lg p-1 text-left transition hover:bg-white/10 ${selected?.id === item.id ? 'bg-white/10 ring-2 ring-indigo-400' : ''}`}
    >
      <span className="block aspect-square w-full overflow-hidden rounded-md bg-black/20">
        <img src={item.thumbnail || ''} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
      <span className="truncate text-[11px] text-slate-300 group-hover:text-white">{item.name}</span>
      {priced && <span className="text-[10px] font-semibold text-emerald-300">{FIXTURE_PRICES.currency}{priceOf(item).toLocaleString()}</span>}
    </button>
  );
  const grid = (items) => <div className="grid grid-cols-3 gap-1.5 p-2">{items.map(tile)}</div>;

  return (
    <div className="flex h-full flex-col text-slate-200">
      <div className="border-b border-white/10 p-3">
        <h3 className="text-sm font-semibold text-white">{kit ? `Furniture for your ${kit.label}` : 'Furniture'}</h3>
        {kit && (
          <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-300" data-testid="show-all-furniture">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-indigo-400" /> Show all furniture, not only what a {kit.label} needs
          </label>
        )}
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">Pick an item, then click in the room to place it. Press Esc to stop placing.</p>
        <label className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search furniture" className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none" aria-label="Search furniture" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {q ? (
          found.length ? (
            <>
              <p className="px-3 pt-2 text-[11px] text-slate-400">{found.length} found</p>
              {grid(found)}
            </>
          ) : (
            <p className="p-4 text-xs text-slate-400">Nothing called &ldquo;{query}&rdquo;. Try a shorter word, like &ldquo;chair&rdquo; or &ldquo;lamp&rdquo;.</p>
          )
        ) : (
          groups.map((g) => {
            const isOpen = open === g.id;
            return (
              <section key={g.id} className="border-b border-white/5">
                <button type="button" onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/5">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-white">{g.label}</span>
                    <span className="block truncate text-[11px] text-slate-400">{g.hint}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                    {g.items.length}
                    <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {isOpen && grid(g.items)}
              </section>
            );
          })
        )}
      </div>
      {priced && (
        <div className="border-t border-white/10 px-3 py-2 text-[11px] text-slate-300" data-testid="fixtures-worth">
          Fixtures: {worth.count} item{worth.count === 1 ? '' : 's'} worth <span className="font-semibold text-emerald-300">{FIXTURE_PRICES.currency}{worth.value.toLocaleString()}</span>
          {FIXTURE_PRICES.worthFactor !== 1 && <span className="text-slate-500"> (counts {Math.round(FIXTURE_PRICES.worthFactor * 100)}% towards your business's worth)</span>}
        </div>
      )}
    </div>
  );
}
