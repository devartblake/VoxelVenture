"use client";

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { CREDITS } from '@/lib/content/credits';

const LINK = 'text-sx-cyan hover:underline';

// Who made the game's music, models and data, and the licence each comes under (lib/content/credits.js).
export default function CreditsView() {
  return (
    <div className="space-y-3 text-slate-100" data-testid="credits">
      {CREDITS.map(({ section, entries }) => (
        <section key={section} className="rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white">{section}</h3>
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.name} className="text-xs">
                <p className="font-medium text-white">{e.name}</p>
                <p className="text-[11px] text-slate-300">
                  by{' '}
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                      {e.by} <ExternalLink className="inline h-2.5 w-2.5" />
                    </a>
                  ) : (
                    e.by
                  )}
                  {e.license && (
                    <>
                      {' · '}
                      {e.licenseUrl ? (
                        <a href={e.licenseUrl} target="_blank" rel="noopener noreferrer" className={LINK}>{e.license}</a>
                      ) : (
                        e.license
                      )}
                    </>
                  )}
                </p>
                {e.note && <p className="text-[11px] text-slate-400">{e.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
