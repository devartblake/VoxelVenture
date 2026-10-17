"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Compass, Plus, UserRound } from 'lucide-react';

// The main menu of the business pages. On a phone: the name and "List your business" on one row, then the three places as a full-width
// row of tabs big enough for a thumb (44 px). From a tablet up: one row. The page you are on is marked (aria-current).
const LINKS = [
  { href: '/discover', label: 'Discover', short: 'Discover', Icon: Compass, current: (p) => p === '/discover' || /^\/(category|district)\//.test(p) || (/^\/business\/[^/]+$/.test(p) && !['/business/manage', '/business/new'].includes(p)) },
  { href: '/', label: 'Explore the 3D city', short: '3D city', Icon: Box, current: () => false },
  { href: '/business/manage', label: 'My profiles', short: 'My profiles', Icon: UserRound, current: (p) => p === '/business/manage' },
];

export default function PublicNav() {
  const pathname = usePathname() ?? '';
  const listing = pathname === '/business/new';
  return (
    <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5 text-sm sm:py-3">
      <Link href="/discover" className="mr-auto flex min-h-11 items-center gap-2 text-base font-bold text-white">
        <span aria-hidden="true" className="inline-block h-3 w-3 rounded bg-gradient-to-br from-sx-purple to-sx-cyan" />
        VoxelVenture
      </Link>
      {/* on a phone this row moves under the name and the button, as three equal tabs */}
      <ul className="order-last grid w-full grid-cols-3 gap-1 rounded-xl bg-sx-alt/60 p-1 sm:order-none sm:flex sm:w-auto sm:gap-1 sm:bg-transparent sm:p-0">
        {LINKS.map(({ href, label, short, Icon, current }) => {
          const here = current(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={here ? 'page' : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-center text-xs font-medium transition sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm ${here ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white sm:bg-none sm:bg-sx-alt sm:shadow-[inset_0_-2px_0_var(--color-sx-cyan)]' : 'text-slate-300 hover:bg-sx-alt hover:text-white'}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 sm:hidden" />
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/business/new"
        aria-current={listing ? 'page' : undefined}
        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-sx-purple px-3 font-semibold text-white hover:bg-violet-400 sm:ml-2"
      >
        <Plus aria-hidden="true" className="h-4 w-4 sm:hidden" />
        <span className="sm:hidden">List your business</span>
        <span className="hidden sm:inline">List your business free</span>
      </Link>
    </nav>
  );
}
