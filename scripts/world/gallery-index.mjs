// Writes docs/world/gallery.md from the pages in docs/world/gallery/ (scripts/world/gallery-lib.mjs). `--check`: exit 1 if the index is not what the pages would make.
import fs from 'node:fs';
import { indexFile, indexText, readPages } from './gallery-lib.mjs';

const text = indexText(readPages());
if (process.argv.includes('--check')) {
  const have = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8').replace(/\r\n/g, '\n') : '';
  if (have !== text) { console.error('gallery.md is not up to date: run node scripts/world/gallery-index.mjs'); process.exit(1); }
  console.log('gallery index: ok');
} else {
  fs.writeFileSync(indexFile, text);
  console.log('wrote docs/world/gallery.md');
}
