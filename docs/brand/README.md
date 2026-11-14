# Brand

[All documentation](../README.md)

The Voxel Venture logos and how to use them. **Voxel Venture** is a game by Theoretical Minds Technologies; the endorsement reads exactly "A Theoretical Minds Technologies Game".

- **[logo_usage_guide.md](logo_usage_guide.md)** is the usage guide (version 1.0, 2026-10-18). It covers the three logos, which to use where, clear space, minimum sizes, backgrounds, colours, accessibility, icons, co-branding, taglines, what not to do, and the production checklist.
- **[admin_dashboard.md](admin_dashboard.md)**: how the staff pages under `/admin` use the SynaptixPlay palette and the mark. It covers the layout, the shared components and the tokens.

## The asset files

The guide's `public/brand/` is **`apps/web/public/brand/`** in this repository, because the web app lives in `apps/web/`. Files there are served at `/brand/<file>`.

| File | Logo (guide section 2) | Use it for | Size | Bytes |
| --- | --- | --- | --- | ---: |
| [`voxel-venture-logo-horizontal.png`](../../apps/web/public/brand/voxel-venture-logo-horizontal.png) | **Horizontal corporate lockup**: the official full logo | Website header (desktop), About, Credits, Legal, merchant and press material, the README | 1983 × 793 | 1.6 MB |
| [`voxel-venture-mark.png`](../../apps/web/public/brand/voxel-venture-mark.png) | **Double-V monogram**: the compact mark | Favicon and app icons (once exported, below), mobile navigation, avatars, loading states, watermark | 1254 × 1254 | 0.9 MB |
| [`voxel-venture-logo-promotional.png`](../../apps/web/public/brand/voxel-venture-logo-promotional.png) | **City Gateway badge**: promotional artwork | Loading and welcome screen, launch and store artwork, posters, press-kit covers. **Never** at small sizes | 1254 × 1254 | 1.3 MB |
| [`voxel-venture-mark-64.png`](../../apps/web/public/brand/voxel-venture-mark-64.png), [`voxel-venture-mark-192.png`](../../apps/web/public/brand/voxel-venture-mark-192.png) | The Double-V monogram, resized from the master (sharp, Lanczos) | The admin pages: 28–34 px in the sidebar and the top bar, 72 px on the sign-in card | 64 × 64, 192 × 192 | 6 KB, 41 KB |

All three are transparent PNGs (RGBA): the archival masters the guide asks to keep (section 11).

**Provenance:** the owner supplied all three on 2026-10-18 as generated artwork, under the file names "Voxel Venture corporate endorsement lockup-3", "Double-V Voxel Gateway-2" and "Voxel Venture City Emblem-1". The generation tool and the ownership record are still to be written down (guide section 15, "Record generation and ownership provenance"). Add them here when known.

## Exports made from the masters (2026-11-14)

`node scripts/brand/make-brand-images.mjs` makes all of these from the three masters above (it only reads them), with the guide's palette (section 8), so they match. Run it again if a master changes.

| File | What it is | Where it is used |
| --- | --- | --- |
| `apps/web/app/favicon.ico` | 16, 32 and 48 px, the Double-V mark on its navy tile (the small sizes give the mark more of the tile) | every browser tab |
| `apps/web/app/icon.png`, `apple-icon.png` | 192 px tab icon, 180 px full-bleed Apple touch icon | the home screen, shortcuts |
| `apps/web/public/brand/voxel-venture-icon-192.png`, `-512.png`, `-maskable-512.png` | the web manifest's icons; the 512 is also the logo in the structured data. The maskable one keeps the mark inside the 80% safe circle | `apps/web/app/manifest.js`, `lib/seo/siteJsonLd.js` |
| `apps/web/app/opengraph-image.jpg`, `twitter-image.jpg` (+ `.alt.txt`) | 1200 x 630, the horizontal lockup and the primary tagline on the brand gradient, 80 KB | the picture a shared link and a search result show, on every page without its own (Discover, a category, a district and a business have theirs) |
| `docs/brand/social/avatar-400.png` | the mark, square, for the accounts' profile picture | social accounts (not served) |
| `docs/brand/social/banner-x-1500x500.png`, `banner-linkedin-1584x396.png` | the lockup and the tagline, off-centre so the avatar's overlap and the mobile crop do not cover them | social accounts (not served) |

- **Wired in:** the root layout's Open Graph and Twitter text and a site-wide `Organization` and `WebSite` block (`lib/seo/siteJsonLd.js`, `tests/seo.test.mjs`). `NEXT_PUBLIC_SOCIAL_URLS` (comma-separated https addresses, in `web.env`) lists the official accounts there once they exist; anything that is not https is ignored.
- **Left out on purpose:** the parent company is not named in the structured data until its registered name is confirmed (below).
- **Limits:** the tagline font is the first of Segoe UI, Arial or the machine's sans, so regenerating on another machine can change its look a little. The 16 px favicon is the mark scaled down, not a redrawn small version.
- **Checked:** `tests/seo.test.mjs` (sizes, the manifest, the structured data and that the masters are untouched) and the asset-admission checks.

## Not done yet

The logos are stored. So far only the admin pages use them, through the two small exports of the mark ([admin_dashboard.md](admin_dashboard.md)); the game and the public site do not yet. Following the guide's implementation order (section 16), these are still to do:

1. **Confirm the endorsement wording** and the registered company name (section 3).
2. **A trademark search, and refined vector masters** (SVG), so the generated raster is not traced and treated as final (sections 11 and 15).
3. **Exports:**
   - ~~the mark at 512 px, `favicon.ico`, the 180 px Apple touch icon and the maskable 512 px icon (section 10)~~ done above; a separate 32 px PNG is not needed (the favicon holds it);
   - a dark-background version of the horizontal lockup;
   - optimised WebP or AVIF for the website, because the masters are 0.9–1.6 MB, too large to serve as they are.
4. **The rest of the branding:** the metadata, Open Graph images, favicon and manifest are done (above). Still to do: the website header, the Credits and About screens, and the root README. Test it for contrast, mobile layout and page weight (section 16, steps 8 and 9).

Keep the masters exactly as they are: don't recompress or replace them (section 15).
