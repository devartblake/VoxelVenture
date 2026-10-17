import Link from 'next/link';
import { notFound } from 'next/navigation';
import { POLICY_STATUS, policies, policyBySlug } from '@/lib/legal/policies';
import PolicyBody, { DraftBanner } from '@/components/legal/PolicyBody';

// One policy (lib/legal/policies.js). Every policy is built at build time; any other address is a 404.
export const dynamicParams = false;
export function generateStaticParams() {
  return policies().map((p) => ({ slug: p.slug }));
}

const approved = POLICY_STATUS.status === 'approved';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = policyBySlug(slug);
  if (!p) return { title: 'Not found | VoxelVenture' };
  return {
    title: `${p.title}${approved ? '' : ' (draft)'} | VoxelVenture`,
    description: p.summary,
    alternates: { canonical: `/legal/${p.slug}` },
    robots: approved ? undefined : { index: false, follow: true }, // drafts stay out of search engines
  };
}

export default async function PolicyPage({ params }) {
  const { slug } = await params;
  const p = policyBySlug(slug);
  if (!p) notFound();
  const others = policies().filter((x) => x.slug !== p.slug);
  return (
    <article className="max-w-3xl" data-testid="policy">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-sx-muted">
        <Link href="/legal" className="hover:text-white">Policies</Link> / <span className="text-slate-300">{p.title}</span>
      </nav>
      <DraftBanner />
      <h1 className="text-3xl font-bold text-white sm:text-4xl">{p.title}</h1>
      <p className="mt-2 text-slate-300">{p.summary}</p>
      <p className="mt-2 text-xs text-sx-muted">
        Version {POLICY_STATUS.version} · {approved ? `In force from ${POLICY_STATUS.effective}` : `Drafted ${POLICY_STATUS.drafted}`}
      </p>
      <div className="mt-8">
        <PolicyBody policy={p} />
      </div>
      <footer className="mt-10 border-t border-sx-stroke pt-4 text-sm">
        <p className="mb-2 text-sx-muted">Our other policies</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {others.map((x) => <li key={x.slug}><Link href={`/legal/${x.slug}`} className="text-sx-cyan hover:underline">{x.title}</Link></li>)}
        </ul>
      </footer>
    </article>
  );
}
