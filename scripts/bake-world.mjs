// Bakes the world recipe into chunk files (roadmap task 10; docs/world/world_bake.md).
//   node scripts/bake-world.mjs            write apps/web/public/world/manifest.json and chunks/<cx>_<cz>.json
//   node scripts/bake-world.mjs --check    write nothing; fail if the files on disk differ from a fresh bake (CI: the recipe or the generators changed and the bake was not redone)
//   node scripts/bake-world.mjs --out dir  write somewhere else
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { root, imp } from './lib-loader.mjs';

const { buildWorld } = await imp('world/buildWorld.js');
const { bakeWorld } = await imp('world/bake.js');

const args = process.argv.slice(2);
const check = args.includes('--check');
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? path.resolve(args[outAt + 1]) : path.join(root, 'apps/web/public/world');

const { manifest, chunks } = bakeWorld(buildWorld());
const files = new Map();
for (const [key, chunk] of Object.entries(chunks)) files.set(`chunks/${key}.json`, JSON.stringify(chunk) + '\n');
// the world's fingerprint: every chunk's bytes, in order. A client or a server can compare it to know both hold the same world.
const hash = crypto.createHash('sha256');
for (const [name, text] of files) hash.update(name).update(text);
manifest.hash = hash.digest('hex').slice(0, 16);
files.set('manifest.json', JSON.stringify(manifest, null, 1) + '\n');

if (check) {
  const bad = [];
  for (const [name, text] of files) {
    const f = path.join(out, name);
    if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') !== text) bad.push(name);
  }
  const have = fs.existsSync(path.join(out, 'chunks')) ? fs.readdirSync(path.join(out, 'chunks')).filter((n) => n.endsWith('.json')).map((n) => `chunks/${n}`) : [];
  for (const n of have) if (!files.has(n)) bad.push(`${n} (not in a fresh bake)`);
  if (bad.length) {
    console.error(`bake-world: ${bad.length} file(s) differ from a fresh bake (run: node scripts/bake-world.mjs)`);
    for (const n of bad.slice(0, 12)) console.error(`  ${n}`);
    process.exit(1);
  }
  console.log(`bake-world: ok (${files.size} files, world ${manifest.hash})`);
} else {
  fs.mkdirSync(path.join(out, 'chunks'), { recursive: true });
  for (const n of fs.readdirSync(path.join(out, 'chunks'))) if (n.endsWith('.json')) fs.rmSync(path.join(out, 'chunks', n)); // a chunk that is no longer in the world goes
  for (const [name, text] of files) fs.writeFileSync(path.join(out, name), text);
  const bytes = [...files.values()].reduce((s, t) => s + Buffer.byteLength(t), 0);
  console.log(`bake-world: wrote ${files.size} files (${(bytes / 1024).toFixed(0)} KB) to ${out}, ${manifest.chunk.count} chunks, world ${manifest.hash}`);
}
