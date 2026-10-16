import { siteUrl } from '@/lib/business/source';

// Search engines may read the public business pages; the game, the owner pages and the development tools are not for them.
export default function robots() {
  return {
    rules: { userAgent: '*', allow: ['/discover', '/business/', '/category/', '/district/'], disallow: ['/business/new', '/business/manage', '/admin', '/editor', '/land', '/curves', '/pricing', '/models', '/viewer', '/reference'] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
