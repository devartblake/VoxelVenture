import Link from 'next/link';
import { isDemo } from '@/lib/business/source';
import RefCapture from '@/components/business/RefCapture';
import PublicNav from '@/components/business/PublicNav';

// The business-first pages (Discover, business profiles, categories, districts, listing a business): plain, fast HTML that works without
// WebGL, with the 3D city one link away. The root layout stops the page scrolling (for the game), so this one scrolls itself.
export default function PublicLayout({ children }) {
  return (
    <div className="h-dvh overflow-y-auto bg-sx-page text-sx-text">
      <RefCapture />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-sx-cyan focus:px-3 focus:py-2 focus:text-slate-950">Skip to content</a>
      <header className="border-b border-sx-stroke bg-sx-panel/80">
        <PublicNav />
      </header>
      {isDemo() && (
        <p className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          Demo: these are the sample businesses of the generated city, not real ones. Connect the API server to list real profiles.
        </p>
      )}
      <main id="main" className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="border-t border-sx-stroke px-4 py-6 text-center text-xs text-sx-muted">
        Figures shown to business owners are verified visits only. <Link href="/discover" className="underline hover:text-white">Discover businesses</Link>
      </footer>
    </div>
  );
}
