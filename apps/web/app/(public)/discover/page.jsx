import Link from 'next/link';
import { BUSINESS_DISTRICTS, CATEGORIES, listJsonLd } from '@voxelventure/business-core';
import { getBuildingOfWeek, getFeatured, getSampleBusiness, isDemo, listBusinesses, siteUrl } from '@/lib/business/source';
import { TOUR_BUSINESS } from '@/lib/tour/tours';
import { BusinessList, FeaturedList } from '@/components/business/BusinessCard';
import WeekFeature from '@/components/business/WeekFeature';

export async function generateMetadata({ searchParams }) {
  const { q } = await searchParams;
  return {
    title: q ? `“${String(q).slice(0, 40)}” businesses | VoxelVenture` : 'Discover businesses | VoxelVenture',
    description: 'Find independent businesses, creators and digital projects by category and district, then step inside their 3D storefronts.',
    alternates: { canonical: '/discover' },
    openGraph: { title: 'Discover businesses on VoxelVenture', description: 'Independent businesses, creators and digital projects, with free pages and 3D storefronts.', url: '/discover', type: 'website', siteName: 'VoxelVenture' },
    twitter: { card: 'summary_large_image', title: 'Discover businesses on VoxelVenture' },
    robots: isDemo() || q ? { index: false, follow: true } : undefined,
  };
}

// The discovery landing page: search, categories, districts and the newest businesses.
// In a demo tour (?tour=, docs/product/pilot_tour.md) with no sponsored business yet, the tour's own business shows in the Sponsored row as a sample.
export default async function Discover({ searchParams }) {
  const { q: raw, tour } = await searchParams;
  const q = String(raw ?? '').slice(0, 60).trim();
  const [{ total, profiles }, live, week] = await Promise.all([listBusinesses({ q, limit: 30 }), q ? { sponsored: [], launches: [] } : getFeatured('discover'), q ? null : getBuildingOfWeek()]);
  const sample = tour && !q && !live.sponsored.length ? await getSampleBusiness(TOUR_BUSINESS.slug) : null;
  const featured = sample ? { ...live, sponsored: [sample] } : live;
  return (
    <>
      {!q && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listJsonLd({ name: 'Discover businesses on VoxelVenture', description: 'Independent shops, studios, software and creators, with free pages and 3D storefronts.', url: `${siteUrl()}/discover` }, profiles, siteUrl()) }} />}
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Discover businesses</h1>
        <p className="mt-2 max-w-2xl text-slate-300">Independent shops, studios, software and creators. Every business has a free page; many have a 3D storefront you can step inside.</p>
        <form action="/discover" method="get" role="search" className="mt-5 flex max-w-xl gap-2">
          <label htmlFor="q" className="sr-only">Search businesses</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Coffee, game studio, SaaS…" className="min-w-0 flex-1 rounded-xl border border-sx-stroke bg-sx-alt px-4 py-3 text-white placeholder:text-slate-500 focus:border-sx-cyan focus:outline-none" />
          <button type="submit" className="rounded-xl bg-sx-cyan px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300">Search</button>
        </form>
      </section>

      {!q && <WeekFeature week={week} />}
      <FeaturedList surface="discover" id="sponsored" title={sample ? 'Sponsored (a sample for the tour)' : 'Sponsored'} profiles={featured.sponsored} badge="Sponsored" />
      <FeaturedList surface="discover" title="New this week" profiles={featured.launches} badge="New this week" />

      {!q && (
        <section aria-labelledby="cats" className="mb-8">
          <h2 id="cats" className="mb-3 text-lg font-semibold text-white">Browse by category</h2>
          <ul className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <li key={c.id}><Link href={`/category/${c.id}`} className="inline-block rounded-full border border-sx-stroke px-3 py-1.5 text-sm text-slate-200 hover:border-sx-cyan hover:text-white">{c.label}</Link></li>
            ))}
          </ul>
          <h2 className="mb-3 mt-6 text-lg font-semibold text-white">Browse by district</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {BUSINESS_DISTRICTS.map((d) => (
              <li key={d.id}>
                <Link href={`/district/${d.id}`} className="flex items-center gap-2 rounded-xl border border-sx-stroke bg-sx-panel px-3 py-3 text-sm text-slate-100 hover:border-sx-line">
                  <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="list">
        <h2 id="list" className="mb-3 text-lg font-semibold text-white">{q ? `${total} result${total === 1 ? '' : 's'} for “${q}”` : 'Newest businesses'}</h2>
        <BusinessList surface="discover" profiles={profiles} empty={q ? 'Nothing matches that yet. Try another word.' : 'No businesses yet. Be the first to list yours.'} />
      </section>

      <section className="mt-10 rounded-2xl border border-sx-stroke bg-gradient-to-br from-[#15104a] to-sx-panel p-6">
        <h2 className="text-xl font-semibold text-white">Own a business?</h2>
        <p className="mt-1 text-slate-300">Get a free page with one clear call to action, a link you can share and verified figures on who visits.</p>
        <Link href="/business/new" className="mt-4 inline-block rounded-xl bg-sx-purple px-5 py-3 font-semibold text-white hover:bg-violet-400">List your business free</Link>
      </section>
    </>
  );
}
