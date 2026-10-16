"use client";

import { quietKnownWarnings } from '@/lib/dev/quietWarnings';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { startNet } from '@/lib/net/multiplayer';

quietKnownWarnings(); // before any 3D code runs (see lib/dev/quietWarnings.js)

// Starts the multiplayer / diagnostics connection for the game's pages, so errors are reported from anywhere in the game, not just the
// city. The plain business pages (Discover, profiles, categories, districts) do not need it: they stay light and fast on a phone.
// Renders nothing.
const PLAIN = /^\/(discover|business|category|district)(\/|$)/;
export default function MultiplayerClient() {
  const pathname = usePathname();
  const plain = PLAIN.test(pathname ?? '');
  useEffect(() => (plain ? undefined : startNet()), [plain]);
  return null;
}
