import Link from 'next/link';
import { POLICY_STATUS, policies } from '@/lib/legal/policies';
import { DraftBanner } from '@/components/legal/PolicyBody';

const approved = POLICY_STATUS.status === 'approved';

export const metadata = {
  title: `Policies${approved ? '' : ' (draft)'} | VoxelVenture`,
  description: 'VoxelVenture terms of service, privacy, refunds, advertising, data retention and merchant responsibilities.',
  alternates: { canonical: '/legal' },
  robots: approved ? undefined : { index: false, follow: true },
};

// The list of policies.
export default function LegalIndex() {
  return (
    <section className="max-w-3xl">
      <DraftBanner />
      <h1 className="text-3xl font-bold text-white sm:text-4xl">Policies</h1>
      <p className="mt-2 text-slate-300">How VoxelVenture works, what we expect, and what we do with your information, in plain language.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {policies().map((p) => (
          <li key={p.slug}>
            <Link href={`/legal/${p.slug}`} className="block h-full rounded-2xl border border-sx-stroke bg-sx-panel p-4 hover:border-sx-cyan">
              <span className="block font-semibold text-white">{p.title}</span>
              <span className="mt-1 block text-sm text-slate-400">{p.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
