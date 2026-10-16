// The credits: CREDITS.md names everyone (and every licence) the in-game Credits panel lists, and the panel can be opened.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from './helpers.mjs';

const { CREDITS } = await imp('content/credits.js');
const { VIEWS } = await imp('state/panelStore.js');
const md = fs.readFileSync(path.join(root, 'CREDITS.md'), 'utf8');
let failed = 0;
const bad = (m) => { failed++; console.error('FAIL', m); };

const entries = CREDITS.flatMap((s) => s.entries);
if (!entries.length) bad('no credits listed');
for (const s of CREDITS) if (!md.includes(`## ${s.section}`)) bad(`CREDITS.md has no "${s.section}" section`);
for (const e of entries) {
  if (!e.name || !e.by) bad(`an entry without a name or maker: ${JSON.stringify(e)}`);
  if (!md.includes(e.by)) bad(`CREDITS.md does not name "${e.by}"`);
  for (const l of (e.license ?? '').split(' / ').filter(Boolean)) if (!md.includes(l)) bad(`CREDITS.md does not give the ${l} licence of "${e.name}"`);
  for (const u of [e.url, e.licenseUrl].filter(Boolean)) if (!/^https:\/\//.test(u)) bad(`not an https link: ${u}`);
}
if (!VIEWS.credits) bad('the side panel has no Credits view');
console.log(`credits: ${entries.length} entries in ${CREDITS.length} sections`);
if (failed) process.exit(1);
console.log('ALL OK');
