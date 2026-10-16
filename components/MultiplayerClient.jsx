"use client";

import { quietKnownWarnings } from '@/lib/dev/quietWarnings';
import { useEffect } from 'react';
import { startNet } from '@/lib/net/multiplayer';

quietKnownWarnings(); // before any 3D code runs (see lib/dev/quietWarnings.js)

// Starts the multiplayer / diagnostics connection for every page, so errors are reported from anywhere in
// the app, not just the city. Renders nothing.
export default function MultiplayerClient() {
  useEffect(() => startNet(), []);
  return null;
}
