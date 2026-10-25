// Writes the interior props' manifest: every prop folder in apps/web/public/items/ by id, with its files' object-storage keys, sizes,
// content types and SHA-256 hashes, the catalogue's placement data, and where it came from. The viewer and the editor load the props from
// object storage by these keys when NEXT_PUBLIC_PROPS_BASE_URL is set (lib/content/interiorProps.js); scripts/props/upload.mjs uploads them.
//   npm run props:manifest              write apps/web/public/props/manifest.json and lib/content/interiorPropKeys.js
//   npm run props:manifest -- --check   only check that both are up to date (exit 1 if a prop folder or the catalogue changed since)
// Run it whenever a prop folder is added, removed or changed, or @pascal-app/editor is updated, then upload (scripts/props/upload.mjs).
//
// Keys are content-addressed: props/<id>/<first 16 hex digits of the file's SHA-256>/<file name>. A changed file gets a new key, so a CDN
// or a browser can keep every file for a year (immutable) and never serve a stale one; only the small manifest is cached briefly.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS_DIR, KEYS_FILE, KIT_PROPS, MANIFEST_FILE, PROP_FILES, editorVersion, propFolders, readCatalog, root } from './catalog.mjs';

export const MANIFEST_VERSION = 1;
export const KEY_SCHEME = 'props/<id>/<sha256, first 16 hex digits>/<file name>';
export const CACHE_CONTROL = { files: 'public, max-age=31536000, immutable', manifest: 'public, max-age=300' };
export const MANIFEST_KEY = 'props/manifest.json';
export const keyFor = (id, sha256, file) => `props/${id}/${sha256.slice(0, 16)}/${file}`;

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (abs) => path.relative(root, abs).replace(/\\/g, '/');
const PLACEMENT = ['dimensions', 'offset', 'rotation', 'scale', 'attachTo', 'surface'];

// What can be checked about where the props come from (docs/architecture/external_voxel_repositories_adoption_plan.md, section 9, Track D):
// the folders were copied from Pascal's editor (CREDITS.md), whose package is MIT licensed. The review fields are left empty (null) until
// someone has reviewed the prop: nothing here is guessed.
// The catalogue's address for the model as a path in Pascal's storage ("items/system/<id>/model.glb"): the record of where the copy came
// from, with no address that anything could fetch (no one loads from Pascal's storage).
export function upstreamOf(entry) {
  if (!entry?.src) return null;
  try {
    return `Pascal catalogue: ${new URL(entry.src).pathname.replace(/^\/storage\/v1\/object\/public\//, '')}`;
  } catch {
    return `Pascal catalogue: ${entry.src}`;
  }
}

function provenance(entry, pkg) {
  return {
    source: 'Pascal Editor (Pascal Group Inc.), https://github.com/pascalorg/editor',
    upstream: upstreamOf(entry), // where the catalogue's own copy is, without its host (null: the prop is not in the catalogue)
    license: pkg.license ?? null,
    licenseUrl: pkg.license === 'MIT' ? 'https://opensource.org/license/mit' : null,
    licenseSource: `CREDITS.md; ${pkg.name} ${pkg.version} package.json and LICENSE`,
    attribution: 'CREDITS.md',
    commercialUseApproved: null,
    reviewedBy: null,
    reviewedAt: null,
  };
}

export function buildManifest({ dir = ITEMS_DIR, catalog = readCatalog(), pkg = editorVersion() } = {}) {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const props = {};
  for (const id of propFolders(dir)) {
    const entry = byId.get(id);
    const files = {};
    for (const [kind, { file, contentType }] of Object.entries(PROP_FILES)) {
      const abs = path.join(dir, id, file);
      if (!fs.existsSync(abs)) continue;
      const buf = fs.readFileSync(abs);
      const hash = sha(buf);
      files[kind] = { key: keyFor(id, hash, file), path: `/items/${id}/${file}`, bytes: buf.length, contentType, sha256: hash };
    }
    const placement = entry ? Object.fromEntries(PLACEMENT.filter((k) => entry[k] != null).map((k) => [k, entry[k]])) : {};
    props[id] = { id, name: entry?.name ?? id, category: entry?.category ?? null, inCatalog: Boolean(entry), files, ...placement, provenance: provenance(entry, pkg) };
  }
  const revision = sha(JSON.stringify(props)).slice(0, 16);
  return {
    version: MANIFEST_VERSION,
    generatedAt: null, // filled by write(): kept from the file on disk while nothing changed
    revision,
    generator: 'scripts/props/build-manifest.mjs',
    catalog: { package: pkg.name, version: pkg.version },
    keyScheme: KEY_SCHEME,
    manifestKey: MANIFEST_KEY,
    cacheControl: CACHE_CONTROL,
    props,
  };
}

// The small module the pages bundle (lib/content/interiorPropKeys.js): only the two keys per id, not the whole manifest.
export function keysModule(manifest) {
  const keys = Object.fromEntries(Object.values(manifest.props).map((p) => [p.id, [p.files.model.key, p.files.thumbnail?.key ?? null]]));
  return `// GENERATED by scripts/props/build-manifest.mjs from apps/web/public/props/manifest.json: do not edit by hand (npm run props:manifest).
// Each interior prop's object-storage keys by id: [model, thumbnail (null: it has none)]. Resolved against NEXT_PUBLIC_PROPS_BASE_URL in
// lib/content/interiorProps.js; the files themselves are apps/web/public/items/<id>/model.glb and thumbnail.webp.
export const PROP_MANIFEST_REVISION = '${manifest.revision}';
export const PROP_KEYS = {
${Object.entries(keys).map(([id, k]) => `  ${JSON.stringify(id)}: ${JSON.stringify(k)},`).join('\n')}
};
`;
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

export function write(manifest, { now = new Date() } = {}) {
  const old = readJson(MANIFEST_FILE);
  const out = { ...manifest, generatedAt: old?.revision === manifest.revision && old.generatedAt ? old.generatedAt : now.toISOString() };
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  // number lists (dimensions, offset, rotation, scale) on one line each
  const json = JSON.stringify(out, null, 2).replace(/\[\s+(-?[\d.e-]+(?:,\s+-?[\d.e-]+)*)\s+\]/g, (all, list) => `[${list.split(/,\s+/).join(', ')}]`);
  fs.writeFileSync(MANIFEST_FILE, `${json}\n`);
  fs.writeFileSync(KEYS_FILE, keysModule(out));
  return out;
}

// Whether the files on disk match what would be written now: [] when they do, or what is out of date.
export function staleness(manifest) {
  const problems = [];
  const old = readJson(MANIFEST_FILE);
  if (!old) problems.push(`${rel(MANIFEST_FILE)} is missing`);
  else if (JSON.stringify({ ...old, generatedAt: null }) !== JSON.stringify(manifest)) problems.push(`${rel(MANIFEST_FILE)} is out of date (revision ${old.revision}, now ${manifest.revision})`);
  const keys = fs.existsSync(KEYS_FILE) ? fs.readFileSync(KEYS_FILE, 'utf8').replace(/\r\n/g, '\n') : null;
  if (keys !== keysModule(manifest)) problems.push(`${rel(KEYS_FILE)} is ${keys == null ? 'missing' : 'out of date'}`);
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = buildManifest();
  const props = Object.values(manifest.props);
  if (process.argv.includes('--check')) {
    const problems = staleness(manifest);
    for (const p of problems) console.log(`  x ${p}`);
    console.log(problems.length ? 'Run npm run props:manifest to update them.' : `props manifest: up to date (${props.length} props, revision ${manifest.revision})`);
    process.exit(problems.length ? 1 : 0);
  }
  const out = write(manifest);
  const bytes = props.reduce((n, p) => n + p.files.model.bytes + (p.files.thumbnail?.bytes ?? 0), 0);
  console.log(`${rel(MANIFEST_FILE)}: ${props.length} props (${props.filter((p) => p.inCatalog).length} in the catalogue), ${(bytes / 1048576).toFixed(1)} MB, revision ${out.revision}`);
  console.log(`${rel(KEYS_FILE)}: written`);
  const missing = readCatalog().filter((c) => !out.props[c.id] && !Object.hasOwn(KIT_PROPS, c.id)).map((c) => c.id);
  if (missing.length) console.log(`Not on disk, so they keep the catalogue's own address: ${missing.join(', ')}`);
}
