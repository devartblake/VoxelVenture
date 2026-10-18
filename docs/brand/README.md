# Brand

[All documentation](../README.md)

The Voxel Venture logos and how to use them. **Voxel Venture** is a game by Theoretical Minds Technologies; the endorsement reads exactly "A Theoretical Minds Technologies Game".

- **[logo_usage_guide.md](logo_usage_guide.md)** is the usage guide (version 1.0, 2026-10-18). It covers the three logos, which to use where, clear space, minimum sizes, backgrounds, colours, accessibility, icons, co-branding, taglines, what not to do, and the production checklist.

## The asset files

The guide's `public/brand/` is **`apps/web/public/brand/`** in this repository, because the web app lives in `apps/web/`. Files there are served at `/brand/<file>`.

| File | Logo (guide section 2) | Use it for | Size | Bytes |
| --- | --- | --- | --- | ---: |
| [`voxel-venture-logo-horizontal.png`](../../apps/web/public/brand/voxel-venture-logo-horizontal.png) | **Horizontal corporate lockup**: the official full logo | Website header (desktop), About, Credits, Legal, merchant and press material, the README | 1983 × 793 | 1.6 MB |
| [`voxel-venture-mark.png`](../../apps/web/public/brand/voxel-venture-mark.png) | **Double-V monogram**: the compact mark | Favicon and app icons (once exported, below), mobile navigation, avatars, loading states, watermark | 1254 × 1254 | 0.9 MB |
| [`voxel-venture-logo-promotional.png`](../../apps/web/public/brand/voxel-venture-logo-promotional.png) | **City Gateway badge**: promotional artwork | Loading and welcome screen, launch and store artwork, posters, press-kit covers. **Never** at small sizes | 1254 × 1254 | 1.3 MB |

All three are transparent PNGs (RGBA): the archival masters the guide asks to keep (section 11).

**Provenance:** the owner supplied all three on 2026-10-18 as generated artwork, under the file names "Voxel Venture corporate endorsement lockup-3", "Double-V Voxel Gateway-2" and "Voxel Venture City Emblem-1". The generation tool and the ownership record are still to be written down (guide section 15, "Record generation and ownership provenance"). Add them here when known.

## Not done yet

The logos are stored, but nothing in the game or the site uses them yet. Following the guide's implementation order (section 16), these are still to do:

1. **Confirm the endorsement wording** and the registered company name (section 3).
2. **A trademark search, and refined vector masters** (SVG), so the generated raster is not traced and treated as final (sections 11 and 15).
3. **Exports:**
   - the mark at 512, 192, 64 and 32 px;
   - `favicon.ico` (16, 32 and 48 px), a 180 px Apple touch icon, and a maskable 512 px icon (section 10);
   - a dark-background version of the horizontal lockup;
   - optimised WebP or AVIF for the website, because the masters are 0.9–1.6 MB, too large to serve as they are.
4. **One branding PR** that updates the website header, metadata and Open Graph images, the favicon, the PWA manifest, the Credits and About screens, and the root README. Test it for contrast, mobile layout and page weight (section 16, steps 8 and 9).

Keep the masters exactly as they are: don't recompress or replace them (section 15).
