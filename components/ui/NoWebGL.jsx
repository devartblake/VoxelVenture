import Link from 'next/link';

// Shown instead of the 3D city when the browser cannot draw it (no WebGL: an old device, a locked-down browser, or graphics switched off).
// Everything a visitor came for is still one link away on the plain business pages (review gap 4: an accessible non-WebGL fallback).
export default function NoWebGL() {
  return (
    <main id="main" className="h-dvh overflow-y-auto bg-sx-page px-4 py-10 text-sx-text">
      <div className="mx-auto max-w-xl">
        <p className="flex items-center gap-2 text-lg font-bold text-white">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded bg-gradient-to-br from-sx-purple to-sx-cyan" />
          VoxelVenture
        </p>
        <h1 className="mt-6 text-3xl font-bold text-white">The 3D city cannot open in this browser</h1>
        <p className="mt-3 text-slate-300">It needs WebGL, which this browser or device has switched off or does not support. You can still find every business, its page and its offers without it.</p>
        <ul className="mt-6 space-y-3">
          <li><Link href="/discover" className="block rounded-xl bg-sx-cyan px-5 py-3 text-center font-semibold text-slate-950 hover:bg-cyan-300">Discover businesses</Link></li>
          <li><Link href="/business/new" className="block rounded-xl border border-sx-stroke px-5 py-3 text-center font-semibold text-slate-100 hover:border-sx-cyan">List your business free</Link></li>
        </ul>
        <p className="mt-6 text-sm text-sx-muted">To see the city, try an up-to-date Chrome, Edge, Firefox or Safari with hardware acceleration switched on.</p>
      </div>
    </main>
  );
}

// Can this browser draw the city? (?webgl=0 in the address shows the fallback, for testing.)
export function canDrawCity() {
  try {
    if (new URLSearchParams(window.location.search).get('webgl') === '0') return false;
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
