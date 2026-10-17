import Link from 'next/link';
import { notFound } from 'next/navigation';
import { breadcrumbJsonLd, categoryOf, districtOf, isSlug, profileJsonLd } from '@/lib/business/profile';
import { getBuildingOfWeek, getBusiness, isDemo, siteUrl } from '@/lib/business/source';
import VoteButton from '@/components/business/VoteButton';
import CtaButton from '@/components/business/CtaButton';
import ProfileTracker from '@/components/business/ProfileTracker';
import ShareProfile from '@/components/business/ShareProfile';
import ReportProfile from '@/components/business/ReportProfile';

async function load(params) {
  const { slug } = await params;
  return isSlug(slug) ? getBusiness(slug) : null;
}

export async function generateMetadata({ params }) {
  const p = await load(params);
  if (!p) return { title: 'Business not found | VoxelVenture', robots: { index: false } };
  const description = (p.tagline || p.description || `${p.name} on VoxelVenture.`).slice(0, 160);
  return {
    title: `${p.name} | VoxelVenture`,
    description,
    alternates: { canonical: `/business/${p.slug}` },
    openGraph: { title: p.name, description, url: `/business/${p.slug}`, type: 'website', siteName: 'VoxelVenture' },
    twitter: { card: 'summary_large_image', title: p.name, description },
    robots: isDemo() ? { index: false, follow: true } : undefined,
  };
}

// A business's public page: what it is, one call to action, and (if it has one) its 3D storefront in the city.
export default async function BusinessPage({ params }) {
  const p = await load(params);
  if (!p) notFound();
  const category = categoryOf(p.category);
  const district = districtOf(p.district);
  const url = `${siteUrl()}/business/${p.slug}`;
  // Building of the Week: a badge for the winner, the rank of a building in this week's top 5 (only a business with a building takes votes)
  const week = p.plotId != null ? await getBuildingOfWeek() : null;
  const isWinner = week?.winner?.plotId === p.plotId;
  const rank = week ? week.leaders.findIndex((l) => l.plotId === p.plotId) : -1;
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: profileJsonLd(p, url) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd([{ name: 'Discover', url: `${siteUrl()}/discover` }, ...(category ? [{ name: category.label, url: `${siteUrl()}/category/${category.id}` }] : []), { name: p.name, url }]) }} />
      <ProfileTracker slug={p.slug} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-sx-muted">
        <Link href="/discover" className="hover:text-white">Discover</Link>
        {category && <> / <Link href={`/category/${category.id}`} className="hover:text-white">{category.label}</Link></>}
      </nav>
      <header className="rounded-2xl border border-sx-stroke bg-gradient-to-br from-[#15104a] to-sx-panel p-6 sm:p-8">
        <p className="flex flex-wrap items-center gap-3 text-sm text-sx-muted">
          {category && <span>{category.label}</span>}
          {district && (
            <Link href={`/district/${district.id}`} className="inline-flex items-center gap-1.5 hover:text-white">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: district.color }} />
              {district.name}
            </Link>
          )}
        </p>
        {p.launch && <p className="mt-3 inline-block rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">New this week</p>}
        {(isWinner || rank >= 0) && (
          <p className="mt-3 flex flex-wrap gap-2" data-testid="week-badges">
            {isWinner && <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-950">Building of the Week</span>}
            {rank >= 0 && <Link href="/discover#botw" className="rounded-full border border-yellow-400/50 px-3 py-1 text-xs font-semibold text-yellow-200 hover:bg-yellow-400/10">#{rank + 1} in this week's vote · {week.leaders[rank].votes} vote{week.leaders[rank].votes === 1 ? '' : 's'}</Link>}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{p.name}</h1>
        {p.tagline && <p className="mt-2 text-lg text-slate-200">{p.tagline}</p>}
        {p.offer && (
          <p className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100" data-testid="offer">
            <span className="font-semibold text-emerald-300">Offer: </span>{p.offer.text}
            {p.offer.until && <span className="text-emerald-200/80"> · until {new Date(p.offer.until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <CtaButton slug={p.slug} cta={p.cta} />
          {p.plotId != null && (
            <Link href={`/b/${p.plotId}`} className="rounded-xl border border-sx-stroke px-5 py-3 font-semibold text-slate-100 hover:border-sx-cyan">Step inside the 3D storefront</Link>
          )}
          {p.plotId != null && <VoteButton plotId={p.plotId} name={p.name} />}
        </div>
      </header>
      {p.description && (
        <section className="mt-6 max-w-3xl">
          <h2 className="mb-2 text-lg font-semibold text-white">About</h2>
          <p className="whitespace-pre-line text-slate-300">{p.description}</p>
        </section>
      )}
      {p.xHandle && (
        <p className="mt-4 text-sm text-slate-400">On X: <a href={`https://x.com/${p.xHandle}`} target="_blank" rel="noopener nofollow ugc" className="text-sx-cyan underline">@{p.xHandle}</a></p>
      )}
      {p.website && p.cta?.kind !== 'website' && (
        <p className="mt-4 text-sm text-slate-400">Website: <a href={p.website} target="_blank" rel="noopener nofollow ugc" className="text-sx-cyan underline">{p.website.replace(/^https?:\/\//, '')}</a></p>
      )}
      <footer className="mt-8 flex flex-wrap items-center gap-3 border-t border-sx-stroke pt-4">
        <ShareProfile url={url} title={p.name} />
        {!p.demo && <ReportProfile slug={p.slug} />}
        <Link href="/business/new" className="ml-auto text-sm text-sx-muted hover:text-white">List your own business free →</Link>
      </footer>
    </article>
  );
}
