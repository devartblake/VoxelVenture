'use client';

import Link from 'next/link';

// The business pages when their data could not be loaded (most often the API server is down or restarting): a plain message with a
// retry, inside the public layout, instead of the browser's error page. The 3D city keeps working without these pages.
export default function PublicError({ retry }) {
  return (
    <section className="mx-auto max-w-lg py-16 text-center" role="alert">
      <h1 className="text-2xl font-bold text-white">This page could not be loaded</h1>
      <p className="mt-3 text-sx-muted">The business list is not answering right now. It usually comes back within a minute.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="rounded-xl bg-sx-cyan px-5 py-2.5 font-semibold text-slate-950 hover:bg-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Try again</button>
        <Link href="/" className="rounded-xl border border-sx-stroke px-5 py-2.5 text-slate-200 hover:bg-sx-alt">Go to the 3D city</Link>
      </div>
    </section>
  );
}
