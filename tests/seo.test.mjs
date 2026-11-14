// What search engines and link previews read (docs/brand/README.md, lib/seo/siteJsonLd.js): the site's structured data, the web manifest, and the icons and share
// images the brand script makes (scripts/brand/make-brand-images.mjs), at the sizes the guide and the platforms ask for.
import fs from 'node:fs';
import path from 'node:path';
import { imageSize, sniff } from '../scripts/assets/inspect.mjs';
import { imp, root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const { siteJsonLd, safeJson, SITE_DESCRIPTION } = await imp('seo/siteJsonLd.js');

// ---- the structured data
const site = 'https://voxelventure.app';
const ld = JSON.parse(siteJsonLd(site, 'https://x.com/VoxelVenture, https://www.linkedin.com/company/voxelventure, javascript:alert(1), http://insecure.test, not a url'));
const org = ld['@graph'].find((n) => n['@type'] === 'Organization');
const web = ld['@graph'].find((n) => n['@type'] === 'WebSite');
check('it is schema.org with an Organization and a WebSite', ld['@context'] === 'https://schema.org' && org && web);
check('the logo is a crawlable square PNG on the site, at least 112 px (what search engines ask of a logo)', org.logo.url === `${site}/brand/voxel-venture-icon-512.png` && org.logo.width >= 112 && org.logo.height >= 112);
check('the site and the organisation point at each other', web.publisher['@id'] === org['@id'] && org.url === `${site}/` && web.url === `${site}/`);
check('only https accounts are listed as the official ones (no script, no http, no rubbish)', JSON.stringify(org.sameAs) === JSON.stringify(['https://x.com/VoxelVenture', 'https://www.linkedin.com/company/voxelventure']));
check('no accounts means no sameAs', !('sameAs' in JSON.parse(siteJsonLd(site))['@graph'][0]));
check('the parent company is not asserted (its registered name is still to be confirmed)', !/Theoretical|Technologies/.test(siteJsonLd(site)));
check('the description fits a search result (under 160 characters)', SITE_DESCRIPTION.length > 60 && SITE_DESCRIPTION.length < 160, String(SITE_DESCRIPTION.length));
check('a script block cannot be closed from inside the data', !safeJson({ x: '</script><script>alert(1)</script> & <!--' }).match(/[<>&]/) && JSON.parse(safeJson({ x: '</script>' })).x === '</script>');

// ---- the files
const read = (rel) => fs.readFileSync(path.join(root, rel));
const dims = (rel) => { const b = read(rel); return { kind: sniff(b), ...imageSize(b) }; };
const is = (rel, kind, w, h) => { const d = dims(rel); return d.kind === kind && d.width === w && d.height === h; };
check('the share image is 1200 x 630, a JPEG, and under 300 KB', is('apps/web/app/opengraph-image.jpg', 'jpg', 1200, 630) && read('apps/web/app/opengraph-image.jpg').length < 300 * 1024);
check('the Twitter card image is the same picture', read('apps/web/app/twitter-image.jpg').equals(read('apps/web/app/opengraph-image.jpg')));
check('both have a description for people who cannot see them', ['opengraph-image', 'twitter-image'].every((n) => /VoxelVenture/.test(read(`apps/web/app/${n}.alt.txt`).toString()) && /Theoretical Minds Technologies Game/.test(read(`apps/web/app/${n}.alt.txt`).toString())));
check('the tab icon is 192 x 192 and the Apple touch icon 180 x 180', is('apps/web/app/icon.png', 'png', 192, 192) && is('apps/web/app/apple-icon.png', 'png', 180, 180));
check('the manifest icons are 192, 512 and a 512 maskable', is('apps/web/public/brand/voxel-venture-icon-192.png', 'png', 192, 192) && is('apps/web/public/brand/voxel-venture-icon-512.png', 'png', 512, 512) && is('apps/web/public/brand/voxel-venture-icon-maskable-512.png', 'png', 512, 512));
const ico = read('apps/web/app/favicon.ico');
const entries = [...Array(ico.readUInt16LE(4))].map((_, i) => ico[6 + i * 16]);
check('favicon.ico holds 16, 32 and 48 px (guide section 10), each a PNG', ico.readUInt16LE(2) === 1 && entries.join() === '16,32,48' && entries.every((_, i) => sniff(ico.subarray(ico.readUInt32LE(6 + i * 16 + 12), ico.readUInt32LE(6 + i * 16 + 12) + 8)) === 'png'));
check('the avatar is square and the banners are the platforms\' sizes', is('docs/brand/social/avatar-400.png', 'png', 400, 400) && is('docs/brand/social/banner-x-1500x500.png', 'png', 1500, 500) && is('docs/brand/social/banner-linkedin-1584x396.png', 'png', 1584, 396));
check('the logo masters are untouched (the script only reads them)', ['voxel-venture-mark.png', 'voxel-venture-logo-horizontal.png', 'voxel-venture-logo-promotional.png'].every((f) => fs.statSync(path.join(root, 'apps/web/public/brand', f)).size > 800 * 1024));

// ---- the pages say so
const layout = read('apps/web/app/layout.jsx').toString();
check('the layout sets the share text, the card type and the structured data', /openGraph:/.test(layout) && /summary_large_image/.test(layout) && /application\/ld\+json/.test(layout));
const manifest = (await import(new URL('../apps/web/app/manifest.js', import.meta.url).href).catch(() => null));
check('the manifest names the app and lists the three icons', !manifest || (() => { const m = manifest.default(); return m.name === 'VoxelVenture' && m.icons.length === 3 && m.icons.some((i) => i.purpose === 'maskable') && m.display === 'standalone'; })());

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
