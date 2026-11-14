import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo/siteJsonLd';

// The web app manifest: what a phone shows when the site is added to the home screen. The icons are made by scripts/brand/make-brand-images.mjs.
export default function manifest() {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#071A3D',
    theme_color: '#090d16',
    icons: [
      { src: '/brand/voxel-venture-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/voxel-venture-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/voxel-venture-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
