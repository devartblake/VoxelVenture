# Poly Haven provenance: Venice Sunset

**File:** `apps/web/public/hdri/venice_sunset_1k.hdr` (the interior editor's and viewer's environment light map), copied with the Pascal Editor's `public/` folder in the repository's first commit (2026-10-16).

**Source:** "Venice Sunset" by **Greg Zaal**, Poly Haven, https://polyhaven.com/a/venice_sunset (published 2018-02-28, `date_published` 1519789049; taken in Venice, 45.4303, 12.3541). **Licence:** **CC0** ("CC0 1.0 Universal - public domain dedication, no attribution required", the asset page); every Poly Haven asset is CC0 (https://polyhaven.com/license). The CC0 legal text is [`../texts/CC0-1.0.txt`](../texts/CC0-1.0.txt).

**Recorded on 2026-10-24:**

- [`venice_sunset.html`](venice_sunset.html): the asset page, saved as HTML.
- [`license.html`](license.html): Poly Haven's licence page, saved as HTML.
- [`venice_sunset.info.json`](venice_sunset.info.json) and [`venice_sunset.files.json`](venice_sunset.files.json): the asset's record from Poly Haven's public API (https://api.polyhaven.com/info/venice_sunset and /files/venice_sunset): name, author ("Greg Zaal": "All"), dates and the download files with their sizes and MD5.

## How the file was matched

Poly Haven's 1k HDR (https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr, 1,440,400 bytes, MD5 `a5ec4d30fc3421c214a17b208fb66d5f`) was downloaded into a scratch folder outside the repository (not committed) and compared with ours (1,397,783 bytes, SHA-256 `0e72ed46b5316cb5fb67fc81ff85b024a09146fd89ef3811a8d2299647ada118`):

- The bytes differ: ours was re-saved in Adobe Photoshop (its header says `# Made with Adobe Photoshop`, `GAMMA=1`), Poly Haven's has the plain Radiance header.
- Both are Radiance RGBE images of the same size, 1024 x 512 (`-Y 512 +X 1024`).
- Decoded pixel by pixel, the two images are the same picture: the correlation of their log luminance is 1.0000 (0.76 when one is mirrored), and ours is 0.6 % brighter on the median pixel (0.4 % to 0.9 % for 80 % of pixels), the rounding of a re-save.

So the file is Poly Haven's Venice Sunset 1k, re-saved without visible change. It is credited to Greg Zaal (Poly Haven) under CC0 in `CREDITS.md` and the in-game credits, and registered as the `polyhaven` source in `lib/content/assetSources.js`.

## Not recorded

- Who re-saved it in Photoshop (upstream, in the Pascal repository) and when; the original download date.
- Approval by a code owner (`approvedBy` in the register).
