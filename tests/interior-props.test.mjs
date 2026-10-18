// The interior props from object storage: the manifest (scripts/props/build-manifest.mjs) matches the prop folders in apps/web/public/items
// and Pascal's catalogue, the resolver (lib/content/interiorProps.js) gives the bucket's or the site's own addresses by id and leaves an
// unknown id alone, the upload's dry run (scripts/props/upload.mjs) lists the right keys, content types and cache headers, and the web
// settings check knows NEXT_PUBLIC_PROPS_BASE_URL.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { imp, problemTally, root } from './helpers.mjs';
import { ITEMS_DIR, MANIFEST_FILE, PROP_FILES, propFolders, readCatalog } from '../scripts/props/catalog.mjs';
import { MANIFEST_KEY, buildManifest, staleness } from '../scripts/props/build-manifest.mjs';
import { rcloneCommands, uploadPlan } from '../scripts/props/upload.mjs';
import { checkWebEnv } from '../services/api/config.mjs';

const BASE = 'https://props-bucket.example-region.linodeobjects.com';
process.env.NEXT_PUBLIC_PROPS_BASE_URL = `${BASE}/`; // read when the resolver is imported (a trailing slash is dropped)
const { PROP_KEYS } = await imp('content/interiorPropKeys.js');
const { PROPS_BASE_URL, applyPropUrls, propUrls, resolvePropAsset } = await imp('content/interiorProps.js');
const { bad, total } = problemTally();
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// ---- the manifest matches the files on disk
const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
const stale = staleness(buildManifest());
if (stale.length) bad('the manifest and the keys module are up to date (npm run props:manifest)', stale.join('; '));
if (manifest.version !== 1 || !manifest.generatedAt || !/^[0-9a-f]{16}$/.test(manifest.revision)) bad('the manifest has a version, a date and a revision', JSON.stringify({ v: manifest.version, at: manifest.generatedAt, r: manifest.revision }));
const folders = propFolders();
const ids = Object.keys(manifest.props);
if (folders.length < 140) bad('the prop folders are read', String(folders.length));
for (const id of folders) if (!manifest.props[id]) bad('every prop folder is in the manifest', id);
for (const id of ids) if (!folders.includes(id)) bad('the manifest lists no prop that has no folder', id);
const keys = new Set();
for (const [id, p] of Object.entries(manifest.props)) {
  if (p.id !== id) bad('a prop is listed under its own id', `${id}: ${p.id}`);
  if (!p.files.model) bad('every prop has a model', p.id);
  for (const [kind, f] of Object.entries(p.files)) {
    const local = path.join(ITEMS_DIR, p.id, PROP_FILES[kind].file);
    if (!fs.existsSync(local)) { bad('every listed file exists', `${p.id} ${kind}`); continue; }
    if (f.bytes !== fs.statSync(local).size) bad('a file\'s size is right', `${p.id} ${kind}: ${f.bytes} vs ${fs.statSync(local).size}`);
    if (f.sha256 !== sha(local)) bad('a file\'s hash is right', `${p.id} ${kind}`);
    if (f.key !== `props/${p.id}/${f.sha256.slice(0, 16)}/${PROP_FILES[kind].file}`) bad('a key is props/<id>/<hash>/<file>', f.key);
    if (!/^props\/[a-z0-9][a-z0-9-]*\/[0-9a-f]{16}\/(model\.glb|thumbnail\.webp)$/.test(f.key)) bad('a key is well formed', f.key);
    if (f.contentType !== PROP_FILES[kind].contentType) bad('a file has its content type', `${f.key} ${f.contentType}`);
    if (f.path !== `/items/${p.id}/${PROP_FILES[kind].file}`) bad('a file has its local path', f.path);
    if (keys.has(f.key)) bad('no two files share a key', f.key);
    keys.add(f.key);
  }
  if (fs.existsSync(path.join(ITEMS_DIR, p.id, 'thumbnail.webp')) !== Boolean(p.files.thumbnail)) bad('a thumbnail is listed when there is one', p.id);
  const pv = p.provenance ?? {};
  if (pv.license !== 'MIT' || pv.attribution !== 'CREDITS.md' || !pv.source?.includes('pascalorg/editor')) bad('a prop has its source and licence', p.id);
  if (pv.commercialUseApproved !== null || pv.reviewedBy !== null) bad('the review fields stay empty until a review', p.id);
}
// the bundled keys are the manifest's
for (const id of ids) if (JSON.stringify(PROP_KEYS[id]) !== JSON.stringify([manifest.props[id].files.model.key, manifest.props[id].files.thumbnail?.key ?? null])) bad('the bundled keys are the manifest\'s', id);
if (Object.keys(PROP_KEYS).length !== ids.length) bad('the bundled keys list the same props', `${Object.keys(PROP_KEYS).length} vs ${ids.length}`);

// ---- ...and the catalogue
const catalog = readCatalog();
const inCatalog = catalog.filter((c) => folders.includes(c.id));
if (inCatalog.length < 90) bad('most of the catalogue has local files', String(inCatalog.length));
for (const c of inCatalog) {
  const p = manifest.props[c.id];
  if (!p.inCatalog || p.name !== c.name || p.category !== c.category) bad('a catalogue prop has its name and category', c.id);
  for (const k of ['dimensions', 'offset', 'rotation', 'scale', 'attachTo', 'surface']) if (JSON.stringify(p[k]) !== JSON.stringify(c[k])) bad('a catalogue prop has its placement data', `${c.id}.${k}`);
  if (p.provenance.upstream !== c.src) bad('a catalogue prop names its upstream address', c.id);
}
for (const p of Object.values(manifest.props)) if (p.inCatalog !== catalog.some((c) => c.id === p.id)) bad('inCatalog is right', p.id);
for (const id of ['door', 'window-large']) if (!manifest.props[id]) bad('the generated rooms\' door and window are in the manifest', id);

// ---- the resolver
const door = manifest.props.door.files;
if (PROPS_BASE_URL !== BASE) bad('the base address is read from NEXT_PUBLIC_PROPS_BASE_URL, without its trailing slash', PROPS_BASE_URL);
const remote = propUrls('door');
if (remote?.src !== `${BASE}/${door.model.key}` || remote?.thumbnail !== `${BASE}/${door.thumbnail.key}`) bad('with the base address, a prop loads from the bucket by its key', JSON.stringify(remote));
const local = propUrls('door', { base: '', origin: 'http://localhost:3000' });
if (local?.src !== 'http://localhost:3000/items/door/model.glb' || local?.thumbnail !== '/items/door/thumbnail.webp') bad('without it, from the site\'s own /items (the model absolute, the thumbnail relative)', JSON.stringify(local));
if (propUrls('door', { base: `${BASE}//` })?.src !== `${BASE}/${door.model.key}`) bad('a base with trailing slashes still makes one slash', '');
if (propUrls('no-such-prop') !== null || propUrls('constructor') !== null || propUrls(undefined) !== null) bad('an unknown id resolves to nothing', '');
const asset = { id: 'shower', name: 'Shower', src: 'https://elsewhere.example/shower.glb', thumbnail: 'https://elsewhere.example/shower.png', dimensions: [1, 2, 1] };
const shower = resolvePropAsset(asset);
if (shower.src !== `${BASE}/${manifest.props.shower.files.model.key}` || shower.thumbnail !== asset.thumbnail || shower.dimensions !== asset.dimensions || asset.src.startsWith(BASE)) bad('a prop without a thumbnail keeps its own, and the asset is copied, not changed', JSON.stringify(shower));
const unknown = { id: 'my-leather-couch-modp80ha', src: 'https://catalogue.example/couch.glb', thumbnail: 'https://catalogue.example/couch.png' };
if (resolvePropAsset(unknown) !== unknown || resolvePropAsset(null) !== null) bad('an asset the manifest does not have is left as it is', '');
const warnings = [];
const warn = console.warn;
console.warn = (...a) => warnings.push(a.join(' '));
const items = [{ ...unknown }, { id: 'door', src: 'https://catalogue.example/door.glb', thumbnail: 'x' }];
const missing = applyPropUrls(items);
applyPropUrls(items); // again (HMR): the same result, no second warning
console.warn = warn;
if (JSON.stringify(missing) !== JSON.stringify([unknown.id]) || items[0].src !== unknown.src) bad('rewriting the catalogue leaves a missing prop on its catalogue address', JSON.stringify(missing));
if (items[1].src !== remote.src || items[1].thumbnail !== remote.thumbnail) bad('and rewrites the others in place, by id', JSON.stringify(items[1]));
if (warnings.length !== 1 || !warnings[0].includes(unknown.id)) bad('a missing prop is warned about once', JSON.stringify(warnings));
// the pages use it in one place each: the bootstrap for Pascal's catalogue, the scene builder for its door and window
const bootstrap = fs.readFileSync(path.join(root, 'lib', 'content', 'pascalBootstrap.js'), 'utf8');
const scenes = fs.readFileSync(path.join(root, 'lib', 'content', 'interiorScenes.js'), 'utf8');
if (!/applyPropUrls\(CATALOG_ITEMS/.test(bootstrap)) bad('the bootstrap rewrites Pascal\'s catalogue', '');
if (!/resolvePropAsset\(DOOR_ASSET\)/.test(scenes) || !/resolvePropAsset\(WINDOW_ASSET\)/.test(scenes) || !/resolvePropAsset\(entry\)/.test(scenes)) bad('the generated rooms resolve their door, windows and furniture', '');
for (const f of ['InteriorViewer.jsx', 'InteriorEditor.jsx']) if (!fs.readFileSync(path.join(root, 'apps', 'web', 'components', 'interior', f), 'utf8').includes("'@/lib/content/pascalBootstrap'")) bad('the viewer and the editor load the bootstrap', f);

// ---- next/image takes the bucket's thumbnails
const config = (await import(`${pathToFileURL(path.join(root, 'apps', 'web', 'next.config.mjs')).href}?props`)).default;
const pattern = config.images.remotePatterns.find((p) => p.hostname === new URL(BASE).hostname);
if (!pattern || pattern.protocol !== 'https' || pattern.pathname !== '/props/**') bad('next.config allows the bucket\'s host for next/image', JSON.stringify(config.images.remotePatterns));

// ---- the upload's dry run
const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'props', 'upload.mjs'), '--dry-run'], { cwd: root, encoding: 'utf8', env: { ...process.env, PROPS_REMOTE: 'linode:voxelventure-props' } });
const listed = new Map([...out.matchAll(/^ {2}(props\/\S+) {2}(\S+) {2}(\d+) {2}(.+)$/gm)].map((m) => [m[1], { contentType: m[2], bytes: Number(m[3]), cacheControl: m[4] }]));
const files = Object.values(manifest.props).flatMap((p) => Object.values(p.files));
if (listed.size !== files.length + 1) bad('the dry run lists every file and the manifest', `${listed.size} vs ${files.length + 1}`);
for (const f of files) {
  const l = listed.get(f.key);
  if (!l || l.contentType !== f.contentType || l.bytes !== f.bytes || l.cacheControl !== 'public, max-age=31536000, immutable') bad('a file is uploaded with its key, content type and a long cache', `${f.key} ${JSON.stringify(l)}`);
}
const m = listed.get(MANIFEST_KEY);
if (!m || m.contentType !== 'application/json' || m.cacheControl !== 'public, max-age=300') bad('the manifest is uploaded with a short cache', JSON.stringify(m));
if ([...listed.keys()].at(-1) !== MANIFEST_KEY) bad('the manifest goes last', [...listed.keys()].at(-1));
if (!/Nothing is uploaded/.test(out) || !/to linode:voxelventure-props/.test(out)) bad('the dry run says it uploads nothing, and where it would', out.split('\n')[0]);
for (const [type, ext] of [['model/gltf-binary', 'glb'], ['image/webp', 'webp']]) if (!new RegExp(`rclone copy .*--include "\\*\\.${ext}" --header-upload "Content-Type: ${type.replace('/', '\\/')}" --header-upload "Cache-Control: public, max-age=31536000, immutable" --s3-acl public-read`).test(out)) bad('one rclone copy per content type, with its headers', type);
if (/secret|access_key|password/i.test(out)) bad('no secret appears in the commands', '');
const plan = uploadPlan(manifest);
const cmds = rcloneCommands(plan, { remote: 'linode:bucket/', stage: '/tmp/stage', acl: 'private' });
if (cmds.length !== 3 || cmds.some((c) => c.includes('--s3-acl')) || cmds[2][0] !== 'copyto' || cmds[2][2] !== 'linode:bucket/props/manifest.json' || cmds[0][2] !== 'linode:bucket/props') bad('PROPS_ACL=private leaves public read to a bucket policy; the targets are under props/', JSON.stringify(cmds.map((c) => c.slice(0, 3))));
const upload = fs.readFileSync(path.join(root, 'scripts', 'props', 'upload.mjs'), 'utf8');
if (!/https:\/\/voxelventure\.app/.test(upload) || !/https:\/\/staging\.voxelventure\.app/.test(upload) || !/public-read/.test(upload) || !/RCLONE_CONFIG/.test(upload)) bad('the upload script documents CORS, public read and the rclone settings', '');
const cors = fs.readFileSync(path.join(root, 'scripts', 'props', 'cors.xml'), 'utf8');
if (!['https://voxelventure.app', 'https://staging.voxelventure.app'].every((o) => cors.includes(`<AllowedOrigin>${o}</AllowedOrigin>`)) || !cors.includes('<AllowedMethod>GET</AllowedMethod>')) bad('the CORS rules allow GET from the site and staging', '');

// ---- the settings check
const site = { NEXT_PUBLIC_LIVE_API_URL: 'https://api.voxel.test', NEXT_PUBLIC_SITE_URL: 'https://voxel.test', NEXT_PUBLIC_MP_URL: 'wss://play.voxel.test' };
const unset = checkWebEnv(site);
if (unset.errors.length || !unset.warnings.some((w) => w.includes('NEXT_PUBLIC_PROPS_BASE_URL'))) bad('an unset props address is a warning, not an error', JSON.stringify(unset));
const set = checkWebEnv({ ...site, NEXT_PUBLIC_PROPS_BASE_URL: 'https://voxelventure-props.us-ord-1.linodeobjects.com' });
if (set.errors.length || set.warnings.some((w) => w.includes('NEXT_PUBLIC_PROPS_BASE_URL'))) bad('a real https props address passes', JSON.stringify(set));
for (const v of ['http://voxelventure-props.us-ord-1.linodeobjects.com', 'voxelventure-props.us-ord-1.linodeobjects.com', 'https://props.example.com', 'https://bucket.test/?x=1']) if (!checkWebEnv({ ...site, NEXT_PUBLIC_PROPS_BASE_URL: v }).errors.some((e) => e.includes('NEXT_PUBLIC_PROPS_BASE_URL'))) bad('a props address that is not real https is an error', v);
const example = fs.readFileSync(path.join(root, 'deploy', 'env', 'web.env.example'), 'utf8');
if (!/^# NEXT_PUBLIC_PROPS_BASE_URL=https:\/\//m.test(example)) bad('web.env.example shows the setting (commented out until the bucket is live)', '');

console.log(`${ids.length} props (${inCatalog.length} of the catalogue's ${catalog.length}), ${files.length} files, revision ${manifest.revision}`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
