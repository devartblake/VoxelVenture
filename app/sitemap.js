import { BUSINESS_DISTRICTS, CATEGORIES } from '@/lib/business/profile';
import { isDemo, siteUrl, sitemapSlugs } from '@/lib/business/source';

// The pages search engines should know about: Discover, the category and district pages, and every published business profile.
// Without the API server (demo mode) nothing is listed: the demo businesses are samples, not real ones.
export const revalidate = 600;

export default async function sitemap() {
  if (isDemo()) return [];
  const base = siteUrl();
  const profiles = await sitemapSlugs().catch(() => []);
  return [
    { url: `${base}/discover`, changeFrequency: 'daily', priority: 1 },
    ...CATEGORIES.map((c) => ({ url: `${base}/category/${c.id}`, changeFrequency: 'daily', priority: 0.7 })),
    ...BUSINESS_DISTRICTS.map((d) => ({ url: `${base}/district/${d.id}`, changeFrequency: 'daily', priority: 0.7 })),
    ...profiles.map((p) => ({ url: `${base}/business/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: 'weekly', priority: 0.8 })),
  ];
}
