import Link from 'next/link';

export const metadata = { title: 'Page not found · VoxelVenture' };

// Any address that is not a page, and anything that calls notFound() outside the business pages (those have the public layout's own).
// The root layout stops the page scrolling for the game, so this page scrolls itself.
export default function NotFound() {
  return (
    <main className="flex h-dvh items-center justify-center overflow-y-auto bg-sx-page px-4 text-sx-text">
      <section className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-sx-cyan">404</p>
        <h1 className="mt-2 text-2xl font-bold text-white">There is nothing at this address</h1>
        <p className="mt-3 text-sx-muted">The link may be old, or the business may have moved.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/discover" className="rounded-xl bg-sx-cyan px-5 py-2.5 font-semibold text-slate-950 hover:bg-cyan-300">Discover businesses</Link>
          <Link href="/" className="rounded-xl border border-sx-stroke px-5 py-2.5 text-slate-200 hover:bg-sx-alt">Go to the 3D city</Link>
        </div>
      </section>
    </main>
  );
}
