// The structured data every page carries (the site's own, not a business's: those are in packages/business-core/src/profile.js): who the site is and its logo,
// which is what search engines read for the name and logo they show. Pure, so it is tested in Node (tests/seo.test.mjs).
//
// The parent company is left out on purpose: its registered name and the wording of the endorsement are still to be confirmed (docs/brand/README.md, "Not done yet").

const NAME = 'VoxelVenture';
const DESCRIPTION = 'Explore a 3D voxel city of real businesses. Find independent shops, studios, software and creators, and step inside their storefronts.';

// a script block must not be able to close itself or start a comment: < > & are escaped
export const safeJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const httpsOnly = (list) => String(list ?? '').split(',').map((s) => s.trim()).filter((u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } });

/**
 * @param {string} site     the site's address, without a trailing slash
 * @param {string} [socials] comma-separated https:// addresses of the official accounts (NEXT_PUBLIC_SOCIAL_URLS); anything else is ignored
 * @returns {string} one JSON-LD block (an Organization and a WebSite)
 */
export function siteJsonLd(site, socials = '') {
  const sameAs = httpsOnly(socials);
  return safeJson({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${site}/#organization`,
        name: NAME,
        url: `${site}/`,
        logo: { '@type': 'ImageObject', url: `${site}/brand/voxel-venture-icon-512.png`, width: 512, height: 512 },
        description: DESCRIPTION,
        ...(sameAs.length ? { sameAs } : {}),
      },
      { '@type': 'WebSite', '@id': `${site}/#website`, name: NAME, url: `${site}/`, description: DESCRIPTION, publisher: { '@id': `${site}/#organization` }, inLanguage: 'en' },
    ],
  });
}

export const SITE_NAME = NAME;
export const SITE_DESCRIPTION = DESCRIPTION;
