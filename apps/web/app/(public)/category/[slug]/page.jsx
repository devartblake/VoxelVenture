import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATEGORIES, breadcrumbJsonLd, categoryOf, listJsonLd } from '@voxelventure/business-core';
import { getFeatured, isDemo, listBusinesses, siteUrl } from '@/lib/business/source';
import { BusinessList, FeaturedList } from '@/components/business/BusinessCard';


export async function generateMetadata({ params }) {
  const category = categoryOf((await params).slug);
  if (!category) return {};
  const description = `${category.label} on VoxelVenture: independent businesses with free pages and 3D storefronts.`;
  return {
    title: `${category.label} | VoxelVenture`,
    description,
    alternates: { canonical: `/category/${category.id}` },
    openGraph: { title: `${category.label} on VoxelVenture`, description, url: `/category/${category.id}`, type: 'website', siteName: 'VoxelVenture' },
    twitter: { card: 'summary_large_image', title: `${category.label} on VoxelVenture`, description },
    robots: isDemo() ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params }) {
  const category = categoryOf((await params).slug);
  if (!category) notFound();
  const [{ total, profiles }, featured] = await Promise.all([listBusinesses({ category: category.id, limit: 60 }), getFeatured(`category:${category.id}`)]);
  const url = `${siteUrl()}/category/${category.id}`;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listJsonLd({ name: `${category.label} on VoxelVenture`, url }, profiles, siteUrl()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd([{ name: 'Discover', url: `${siteUrl()}/discover` }, { name: category.label, url }]) }} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-sx-muted"><Link href="/discover" className="hover:text-white">Discover</Link> / Category</nav>
      <h1 className="text-3xl font-bold text-white">{category.label}</h1>
      <p className="mb-6 mt-1 text-slate-300">{total} business{total === 1 ? '' : 'es'}</p>
      <FeaturedList surface="category" title="Sponsored" profiles={featured.sponsored} badge="Sponsored" />
      <BusinessList surface="category" profiles={profiles} empty={`No ${category.label.toLowerCase()} listed yet.`} />
      <ul className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="Other categories">
        {CATEGORIES.filter((c) => c.id !== category.id).map((c) => (
          <li key={c.id}><Link href={`/category/${c.id}`} className="inline-block rounded-full border border-sx-stroke px-3 py-1.5 text-slate-300 hover:text-white">{c.label}</Link></li>
        ))}
      </ul>
    </>
  );
}
