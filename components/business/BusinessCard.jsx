import Link from 'next/link';
import { categoryOf, districtOf } from '@/lib/business/profile';

// One business in a list (Discover, a category or a district page).
export default function BusinessCard({ profile }) {
  const district = districtOf(profile.district);
  return (
    <li className="rounded-2xl border border-sx-stroke bg-sx-panel transition hover:border-sx-line">
      <Link href={`/business/${profile.slug}`} className="block h-full p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-sx-cyan rounded-2xl">
        <h3 className="text-base font-semibold text-white">{profile.name}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-sx-muted">
          <span>{categoryOf(profile.category)?.label ?? 'Business'}</span>
          {district && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: district.color }} />
              {district.name}
            </span>
          )}
        </p>
        {(profile.tagline || profile.description) && <p className="mt-2 line-clamp-2 text-sm text-slate-300">{profile.tagline || profile.description}</p>}
      </Link>
    </li>
  );
}

export function BusinessList({ profiles, empty = 'No businesses here yet.' }) {
  if (!profiles.length) return <p className="rounded-2xl border border-dashed border-sx-stroke p-6 text-center text-sx-muted">{empty}</p>;
  return <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{profiles.map((p) => <BusinessCard key={p.slug} profile={p} />)}</ul>;
}
