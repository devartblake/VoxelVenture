import Link from 'next/link';
import { notFound } from 'next/navigation';
import { breadcrumbJsonLd, districtOf, listJsonLd } from '@/lib/business/profile';
import { getFeatured, isDemo, listBusinesses, siteUrl } from '@/lib/business/source';
import { BusinessList, FeaturedList } from '@/components/business/BusinessCard';


export async function generateMetadata({ params }) {
  const district = districtOf((await params).slug);
  if (!district) return {};
  const description = `The businesses of ${district.name}, a district of the VoxelVenture city.`;
  return {
    title: `${district.name} | VoxelVenture`,
    description,
    alternates: { canonical: `/district/${district.id}` },
    openGraph: { title: `${district.name} on VoxelVenture`, description, url: `/district/${district.id}`, type: 'website', siteName: 'VoxelVenture' },
    twitter: { card: 'summary_large_image', title: `${district.name} on VoxelVenture`, description },
    robots: isDemo() ? { index: false, follow: true } : undefined,
  };
}

export default async function DistrictPage({ params }) {
  const district = districtOf((await params).slug);
  if (!district) notFound();
  const [{ total, profiles }, featured] = await Promise.all([listBusinesses({ district: district.id, limit: 60 }), getFeatured(`district:${district.id}`)]);
  const url = `${siteUrl()}/district/${district.id}`;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listJsonLd({ name: `${district.name}, a district of VoxelVenture`, url }, profiles, siteUrl()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd([{ name: 'Discover', url: `${siteUrl()}/discover` }, { name: district.name, url }]) }} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-sx-muted"><Link href="/discover" className="hover:text-white">Discover</Link> / District</nav>
      <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
        <span aria-hidden="true" className="h-4 w-4 rounded-full" style={{ background: district.color }} />
        {district.name}
      </h1>
      <p className="mb-6 mt-1 text-slate-300">{total} business{total === 1 ? '' : 'es'} · <Link href="/" className="underline hover:text-white">walk the district in 3D</Link></p>
      <FeaturedList title="Sponsored" profiles={featured.sponsored} badge="Sponsored" />
      <BusinessList profiles={profiles} empty={`No businesses in ${district.name} yet.`} />
    </>
  );
}
