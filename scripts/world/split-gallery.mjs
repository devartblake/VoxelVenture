// ONE-OFF (2026-11-17): splits the old single page docs/world/gallery.md into one page for each of its sections in docs/world/gallery/, in the order they were in (order 10, 20, ...). Kept so the split can be
// checked against git history; it does nothing once the old page is gone (the index page has no `## ` sections).
import fs from 'node:fs';
import path from 'node:path';
import { galleryDir, indexFile, pageText, slugOf } from './gallery-lib.mjs';

const text = fs.readFileSync(indexFile, 'utf8').replace(/\r\n/g, '\n');
const parts = text.split(/^## /m).slice(1);
if (!parts.length) { console.log('no sections to split'); process.exit(0); }
const fixLinks = (body) => body
  .replace(/\]\(gallery\/([^)]+)\)/g, ']($1)') // pictures: now beside the page
  .replace(/\]\(\.\.\//g, ']($$$$/') // a link already going up (to the repository, to docs): one folder further up (marked, so the next rule leaves it)
  .replace(/\]\((?!https?:|#|\$\$\/|[a-z0-9_-]+\.webp\))([^)]+)\)/g, '](../$1)') // a link to another page of docs/world: one folder up
  .replace(/\]\(\$\$\//g, '](../../'); // (the marked ones)
const used = new Set();
parts.forEach((part, i) => {
  const [head, ...rest] = part.split('\n');
  const title = head.trim();
  let slug = slugOf(title);
  while (used.has(slug)) slug += '-2';
  used.add(slug);
  const body = fixLinks(rest.join('\n')).replace(/^### /gm, '## ');
  fs.writeFileSync(path.join(galleryDir, `${slug}.md`), pageText(title, (i + 1) * 10, body));
});
console.log(`${parts.length} pages written to docs/world/gallery/`);
