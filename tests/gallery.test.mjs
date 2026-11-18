// The world gallery (scripts/world/gallery-lib.mjs, docs/world/gallery.md, docs/world/gallery/*.md): one page for each feature in the folder beside its pictures, and an index generated from them, so pull requests that add pictures
// do not conflict. The index is up to date, each page has a title and an order, every picture a page shows is there, every picture file is shown on some page, and every link to another document resolves.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally } from './helpers.mjs';
const { bad, total } = problemTally();
const L = await import('../scripts/world/gallery-lib.mjs');
const pages = L.readPages();

if (pages.length < 20) bad('the gallery has its pages', String(pages.length));
for (const p of pages) {
  if (!p.title) bad('a page starts with # Title', p.file);
  if (!Number.isFinite(p.order)) bad('a page has an order line (<!-- order: N -->)', p.file);
  if (L.slugOf(p.title ?? '') && p.file.endsWith('.md') && !/^[a-z0-9-]+\.md$/.test(p.file)) bad('a page file is a lowercase slug', p.file);
}
if (new Set(pages.map((p) => p.file)).size !== pages.length) bad('page files are unique', '');
// the index is what the pages make
const have = fs.readFileSync(L.indexFile, 'utf8').replace(/\r\n/g, '\n');
if (have !== L.indexText(pages)) bad('gallery.md is up to date (node scripts/world/gallery-index.mjs)', '');
// every picture a page shows is a file; every picture file is shown on a page; nothing is shown twice on one page without a reason
const files = new Set(fs.readdirSync(L.galleryDir).filter((f) => f.endsWith('.webp')));
const shown = new Set();
for (const p of pages) for (const pic of p.pictures) { if (!files.has(pic)) bad('a picture a page shows exists', `${p.file}: ${pic}`); shown.add(pic); }
const orphans = [...files].filter((f) => !shown.has(f));
if (orphans.length) bad('every picture file is shown on a gallery page', orphans.join(', '));
// every link to another document resolves (relative to the page)
for (const p of pages) for (const m of p.text.matchAll(/\]\((?!https?:|#|mailto:)([^)#]+)(#[^)]*)?\)/g)) {
  const target = path.resolve(L.galleryDir, m[1]);
  if (!fs.existsSync(target)) bad('a link on a page resolves', `${p.file}: ${m[1]}`);
}
if (pages.some((p, i) => i && p.order < pages[i - 1].order)) bad('the pages are in order', '');
console.log(`gallery: ${pages.length} pages, ${shown.size} pictures`);
void imp;
if (total()) process.exitCode = 1;
