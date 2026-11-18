// The world gallery's pages (docs/world/gallery.md and docs/world/gallery/*.md): one page for each feature, in the folder beside its pictures, so a pull request that adds pictures touches its own page and no other
// (the one big page conflicted at every merge). Each page starts `# Title` and carries `<!-- order: N -->` (where it comes in the index: gaps of 10, so a page can be put between two); the index
// (docs/world/gallery.md) is generated from them: `node scripts/world/gallery-index.mjs` writes it, `--check` says whether it is up to date. A conflict in the index is settled by writing it again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const galleryDir = path.join(root, 'docs/world/gallery');
export const indexFile = path.join(root, 'docs/world/gallery.md');

export const slugOf = (title) => title.toLowerCase().replace(/&/g, 'and').replace(/['"`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** A page's text: the title, its order, and the body (the section's description and pictures, paths relative to the gallery folder). */
export const pageText = (title, order, body) => `# ${title}\n\n<!-- order: ${order} -->\n\n${body.trim()}\n`;

/** The pages: [{ file, slug, title, order, summary, pictures }] sorted by order, then title. */
export function readPages() {
  const pages = [];
  for (const file of fs.readdirSync(galleryDir).filter((f) => f.endsWith('.md')).sort()) {
    const text = fs.readFileSync(path.join(galleryDir, file), 'utf8').replace(/\r\n/g, '\n');
    const title = /^# (.+)$/m.exec(text)?.[1];
    const order = Number(/<!-- order: (\d+) -->/.exec(text)?.[1]);
    const pictures = [...text.matchAll(/!\[[^\]]*\]\(([^)]+\.webp)\)/g)].map((m) => m[1]);
    // the summary: the first paragraph after the order line that is not a heading or a picture
    const summary = text.split('\n\n').map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !p.startsWith('<!--') && !p.startsWith('!['));
    pages.push({ file, slug: file.replace(/\.md$/, ''), title, order, summary: (summary ?? '').replace(/\n/g, ' '), pictures, text });
  }
  return pages.sort((a, b) => a.order - b.order || (a.title ?? '').localeCompare(b.title ?? ''));
}

/** The index page's text, from the pages. (A page's summary links are relative to the page's folder, so from the index they go one folder less up.) */
export function indexText(pages) {
  const n = pages.reduce((s, p) => s + p.pictures.length, 0);
  const lines = [
    '# The world gallery', '',
    `Written for: the owner and developers. The screenshots and diagrams kept while the world was built, ${n} pictures on ${pages.length} pages, one page for each feature (the pictures are WebP, 1400 pixels wide at most). This index is generated: \`node scripts/world/gallery-index.mjs\`.`, '',
    'These are working pictures, taken on the development page (`/world/stream`) and in the game with `?world=baked` while each feature was built: many show an earlier stage, and the caption says so where it is known. For what each feature is now, follow the link under its heading on its page.', '',
    '**Adding pictures:** put the WebP files in `docs/world/gallery/`, then add them to a page there (a new page for a new feature: `# Title`, a line `<!-- order: N -->`, a short description, then each picture with its caption) and run the index script. Other pages are not touched, so two pull requests do not conflict; if the index itself conflicts, run the script again.', '',
    '| Page | Pictures | What it shows |', '| :--- | ---: | :--- |',
    ...pages.map((p) => `| [${p.title}](gallery/${p.file}) | ${p.pictures.length} | ${p.summary.replace(/\|/g, '/').replace(/\]\(\.\.\//g, '](') .slice(0, 240)} |`),
    '',
  ];
  return lines.join('\n');
}
