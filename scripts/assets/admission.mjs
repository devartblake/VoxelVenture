// The automated part of the asset admission process (docs/operations/asset_admission.md): checks the admission register
// (lib/content/assetSources.js) against the shipped files, the credits, the music and props manifests and the npm dependencies.
//   npm run check:assets          print every problem (exit 1 if there is one), then the recorded gaps and notes
// tests/asset-admission.test.mjs runs the same checks, plus cases that must fail.
//
// Each check returns a list of problems, each naming the asset (a file, a source id, a release, a prop or a package) and what is
// missing or wrong, so that a failing run says exactly what to fix.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glbInfo, imageSize, sniff, svgHazard, walk } from './inspect.mjs';

// A glob (* within a folder, ** across folders, {a,b} either) as a regular expression over forward-slash paths.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const extOf = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  return { jpeg: 'jpg', md: 'text', txt: 'text' }[ext] ?? ext;
};

// Why a licence identifier may not be used for this kind of asset, or null when it may.
export function licenseProblem(id, kind, { ASSET_LICENSES, REFUSED_LICENSES }) {
  for (const [re, why] of REFUSED_LICENSES) if (re.test(id ?? '')) return `licence "${id ?? ''}" is refused: ${why}`;
  const lic = ASSET_LICENSES[id];
  if (!lic) return `licence "${id}" is not on the allow-list (lib/content/assetSources.js ASSET_LICENSES)`;
  if (kind && !lic.kinds.includes(kind)) return `licence "${id}" is not allowed for ${kind} assets (only ${lic.kinds.join(', ')})`;
  return null;
}

// The register's sources: licence, provenance, stored licence text and evidence, approval, and credits. `gaps` (fields the register
// says are missing, with the reason) come back separately: they are reported, not failures, but a gap for a field that is present
// is a problem (remove it), and a new source cannot hide a missing field without saying so in `gaps`.
export function checkSources(reg, { root, credits, creditsMd }) {
  const problems = [];
  const gaps = [];
  const ids = new Set();
  const entries = credits.flatMap((s) => s.entries);
  const exists = (rel) => rel && fs.existsSync(path.join(root, rel));
  for (const s of reg.ASSET_SOURCES) {
    const at = `asset source "${s.id}"`;
    if (ids.has(s.id)) problems.push(`${at} is listed twice`);
    ids.add(s.id);
    for (const f of ['kind', 'name', 'by']) if (!s[f]) problems.push(`${at} has no ${f}`);
    if (!Array.isArray(s.files) || !s.files.length) problems.push(`${at} lists no files`);
    for (const f of s.files ?? []) if (f.budget != null && !reg.ASSET_BUDGETS[f.budget]) problems.push(`${at}: unknown budget class "${f.budget}" for ${f.glob}`);
    const lp = licenseProblem(s.license, s.kind, reg);
    if (lp) {
      problems.push(`${at}: ${lp}`);
      continue;
    }
    const lic = reg.ASSET_LICENSES[s.license];
    if (lic.own) continue; // made for VoxelVenture: no outside provenance to record
    const want = {
      url: () => /^https:\/\//.test(s.url ?? '') || 'needs an https source address (url)',
      licenseText: () => exists(s.licenseText) || (s.licenseText ? `its licence text ${s.licenseText} is not in the repository` : 'needs a stored copy of its licence (licenseText, under docs/licences/)'),
      evidence: () => exists(s.evidence) || (s.evidence ? `its evidence ${s.evidence} is not in the repository` : 'needs stored evidence of the licence (evidence: the saved source page or notice, under docs/licences/)'),
      version: () => Boolean(s.version) || 'needs the version or release it was taken from (version)',
      obtained: () => DATE.test(s.obtained ?? '') || 'needs the date it was downloaded (obtained, YYYY-MM-DD)',
      approvedBy: () => Boolean(s.approvedBy) || 'needs the code owner who approved it (approvedBy)',
    };
    for (const [field, test] of Object.entries(want)) {
      const ok = test();
      const gap = s.gaps?.[field];
      if (ok === true && gap) problems.push(`${at}: ${field} is present, so remove its entry from gaps`);
      else if (ok !== true && gap) gaps.push(`${s.id}: ${field}: ${gap}`);
      else if (ok !== true) problems.push(`${at} ${ok}`);
    }
    for (const field of Object.keys(s.gaps ?? {})) if (!want[field]) problems.push(`${at}: gaps names "${field}", which is not a provenance field`);
    // credits: the in-product panel (lib/content/credits.js) and CREDITS.md
    if (s.credit === null && s.manifest) continue; // credited per release (checkMusic)
    const entry = entries.find((e) => e.by === s.credit);
    if (!s.credit || !entry) problems.push(`${at} has no entry in the in-product credits (lib/content/credits.js) with by: "${s.credit ?? s.by}"`);
    else if (!(entry.license ?? '').split(' / ').includes(lic.credit)) problems.push(`${at}: its in-product credit "${entry.name}" does not give the licence ${lic.credit}`);
    if (!creditsMd.includes(s.by)) problems.push(`${at}: CREDITS.md does not name "${s.by}"`);
    if (!creditsMd.includes(lic.credit)) problems.push(`${at}: CREDITS.md does not give the licence ${lic.credit}`);
  }
  for (const [file, ex] of Object.entries(reg.ASSET_EXCEPTIONS)) if (!ex.reason) problems.push(`the exception for ${file} gives no reason`);
  return { problems, gaps };
}

// One shipped file against its class: what its bytes are, its size, and for a model or an image its triangles and texture size.
export function checkFile(rel, buf, budgetName, reg, { publicDir } = {}) {
  const problems = [];
  const budget = reg.ASSET_BUDGETS[budgetName];
  const allow = reg.ASSET_EXCEPTIONS[rel]?.allow ?? {};
  const kind = sniff(buf);
  const ext = extOf(rel);
  if (!kind) problems.push(`${rel}: the file's contents are not a recognised asset format`);
  else if (kind !== ext && allow.format !== kind) problems.push(`${rel}: the file is ${kind} but is named .${path.extname(rel).slice(1)}`);
  if (kind && !budget.formats.includes(kind) && allow.format !== kind) problems.push(`${rel}: ${kind} is not an allowed format for ${budgetName} (${budget.formats.join(', ')})`);
  const maxBytes = allow.maxBytes ?? budget.maxBytes;
  if (maxBytes && buf.length > maxBytes) problems.push(`${rel}: ${(buf.length / 1024).toFixed(0)} KB is over the ${budgetName} budget of ${(maxBytes / 1024).toFixed(0)} KB`);
  const maxTexture = allow.maxTexture ?? budget.maxTexture;
  if (kind === 'glb') {
    let info;
    try {
      info = glbInfo(buf);
    } catch (e) {
      problems.push(`${rel}: the .glb cannot be read (${e.message})`);
    }
    if (info) {
      const maxTriangles = allow.maxTriangles ?? budget.maxTriangles;
      if (maxTriangles && info.triangles > maxTriangles) problems.push(`${rel}: ${info.triangles} triangles is over the ${budgetName} budget of ${maxTriangles}`);
      for (const img of info.images) {
        if (!img.width) problems.push(`${rel}: an embedded texture (${img.kind ?? 'unknown format'}) cannot be read`);
        else if (maxTexture && Math.max(img.width, img.height) > maxTexture) problems.push(`${rel}: an embedded ${img.width} x ${img.height} texture is over the ${budgetName} budget of ${maxTexture} px`);
      }
      for (const uri of info.external) {
        if (/^[a-z][a-z0-9+.-]*:|^\/\/|^\//i.test(uri) || uri.split('/').includes('..')) problems.push(`${rel}: refers to a texture outside its folder (${uri})`);
        else if (publicDir && !fs.existsSync(path.join(publicDir, path.dirname(rel.replace(/^apps\/web\/public\//, '')), decodeURIComponent(uri)))) problems.push(`${rel}: its texture ${uri} is missing`);
      }
    }
  } else if (kind && maxTexture) {
    const size = imageSize(buf, kind);
    if (['png', 'jpg', 'webp', 'ktx2', 'hdr'].includes(kind) && !size) problems.push(`${rel}: the image's size cannot be read`);
    else if (size && Math.max(size.width, size.height) > maxTexture) problems.push(`${rel}: ${size.width} x ${size.height} is over the ${budgetName} budget of ${maxTexture} px`);
  }
  if (kind === 'svg') {
    const hazard = svgHazard(buf.toString('utf8'));
    if (hazard) problems.push(`${rel}: the SVG contains ${hazard}`);
  }
  return problems;
}

// Every file under apps/web/public/ belongs to exactly one source and keeps its class's budget; every source's globs match a file.
export function checkFiles(reg, { root }) {
  const problems = [];
  const publicDir = path.join(root, 'apps', 'web', 'public');
  const rules = reg.ASSET_SOURCES.flatMap((s) => (s.files ?? []).map((f) => ({ ...f, source: s.id, re: globToRegExp(f.glob), hits: 0 })));
  const files = walk(publicDir.replace(/\\/g, '/')).map((f) => `apps/web/public/${f}`);
  for (const rel of files) {
    const hits = rules.filter((r) => r.re.test(rel));
    if (!hits.length) {
      problems.push(`${rel} is not in the asset register: add it to a source in lib/content/assetSources.js (docs/operations/asset_admission.md)`);
      continue;
    }
    if (hits.length > 1) problems.push(`${rel} is claimed by more than one source (${hits.map((h) => `${h.source}: ${h.glob}`).join('; ')})`);
    hits.forEach((h) => h.hits++);
    if (hits[0].budget) problems.push(...checkFile(rel, fs.readFileSync(path.join(root, rel)), hits[0].budget, reg, { publicDir }));
  }
  for (const r of rules) {
    if (r.glob.startsWith('apps/web/public/')) {
      if (!r.hits) problems.push(`asset source "${r.source}": ${r.glob} matches no file`);
    } else {
      const base = r.glob.split(/[*{]/)[0];
      const dir = base.endsWith('/') ? base : path.posix.dirname(base);
      const found = fs.existsSync(path.join(root, dir)) && walk(path.join(root, dir).replace(/\\/g, '/')).some((f) => r.re.test(`${dir.replace(/\/$/, '')}/${f}`));
      if (!found) problems.push(`asset source "${r.source}": ${r.glob} matches no file`);
    }
  }
  for (const file of Object.keys(reg.ASSET_EXCEPTIONS)) if (!files.includes(file)) problems.push(`the exception for ${file} names a file that is not shipped: remove it`);
  return { problems, files: files.length };
}

// The recorded music: every release in the manifest is allowed, sourced, evidenced and credited in both lists, and every recording
// on disk belongs to a release.
export function checkMusic(reg, { root, credits, creditsMd }) {
  const problems = [];
  const src = reg.ASSET_SOURCES.find((s) => s.manifest);
  if (!src) return { problems: ['no music source with a manifest in the asset register'], releases: 0 };
  const manifest = JSON.parse(fs.readFileSync(path.join(root, src.manifest), 'utf8'));
  const entries = credits.flatMap((s) => s.entries);
  const listed = new Set();
  for (const r of manifest) {
    const at = `music release "${r.id ?? r.title}"`;
    for (const f of ['id', 'title', 'artist', 'download', 'sha256']) if (!r[f]) problems.push(`${at} has no ${f}`);
    if (!/^https:\/\//.test(r.source ?? '')) problems.push(`${at} needs an https source page (source)`);
    const lp = licenseProblem(r.license, 'music', reg);
    if (lp) problems.push(`${at}: ${lp}`);
    if (r.licenseUrl !== reg.ASSET_LICENSES[r.license]?.url) problems.push(`${at}: licenseUrl should be ${reg.ASSET_LICENSES[r.license]?.url}`);
    const evidence = `docs/licences/music/${r.id}.html`;
    if (!fs.existsSync(path.join(root, evidence))) problems.push(`${at}: its saved source page ${evidence} is missing`);
    const entry = entries.find((e) => e.name === r.title && e.by === r.artist);
    if (!entry) problems.push(`${at}: no in-product credit (lib/content/credits.js) names "${r.title}" by "${r.artist}"`);
    if (!creditsMd.includes(r.title) || !creditsMd.includes(r.artist)) problems.push(`${at}: CREDITS.md does not name "${r.title}" by "${r.artist}"`);
    for (const f of r.files ?? []) {
      listed.add(`apps/web/public${f}`);
      if (!fs.existsSync(path.join(root, 'apps/web/public', f))) problems.push(`${at}: ${f} is missing`);
    }
  }
  const dir = path.join(root, 'apps/web/public/audio/music').replace(/\\/g, '/');
  for (const f of walk(dir)) {
    const rel = `apps/web/public/audio/music/${f}`;
    if (/\.(mp3|ogg|wav)$/i.test(f) && !listed.has(rel)) problems.push(`${rel} is not listed in any release of ${src.manifest}`);
  }
  return { problems, releases: manifest.length };
}

// The interior props manifest: each prop's provenance is an allowed licence with a source and attribution, and every id the API
// accepts (and every retired id's replacement) resolves to a prop.
export function checkProps(reg, { root, acceptedIds = [], kitProps = {} }) {
  const problems = [];
  const notes = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/props/manifest.json'), 'utf8'));
  const props = manifest.props ?? {};
  let unreviewed = 0;
  for (const p of Object.values(props)) {
    const at = `prop "${p.id}"`;
    const pr = p.provenance;
    if (!pr) {
      problems.push(`${at} has no provenance in the props manifest`);
      continue;
    }
    const lp = licenseProblem(pr.license, 'model', reg);
    if (lp) problems.push(`${at}: ${lp}`);
    if (!pr.source) problems.push(`${at} has no provenance source`);
    if (!/^https:\/\//.test(pr.licenseUrl ?? '')) problems.push(`${at} has no licence address (licenseUrl)`);
    if (pr.attribution !== 'CREDITS.md') problems.push(`${at}: its attribution should be "CREDITS.md"`);
    const src = reg.ASSET_SOURCES.find((s) => pr.source?.startsWith(s.by));
    if (!src) problems.push(`${at}: its source "${pr.source}" is not a source in the asset register`);
    else if (src.license !== pr.license) problems.push(`${at}: licence ${pr.license} differs from its source's ${src.license}`);
    for (const [kind, f] of Object.entries(p.files ?? {})) if (!fs.existsSync(path.join(root, 'apps/web/public', f.path))) problems.push(`${at}: its ${kind} ${f.path} is missing`);
    if (pr.commercialUseApproved == null) unreviewed++;
  }
  // items whose model is a city model (KIT_PROPS in lib/content/catalogCuration.js): served by the site, so both files must be shipped,
  // under a source of the register (checkFiles checks the source and the budget)
  const kit = {};
  for (const [id, k] of Object.entries(kitProps)) {
    if (props[id]) problems.push(`kit prop "${id}" also has a prop folder: keep one`);
    for (const f of [k.model, k.thumbnail]) if (!f || !fs.existsSync(path.join(root, 'apps/web/public', f))) problems.push(`kit prop "${id}": ${f} is missing`);
    kit[id] = true;
  }
  const remote = new Set(reg.REMOTE_CATALOG_ITEMS?.ids ?? []);
  for (const id of acceptedIds) {
    if (kit[id]) continue;
    if (props[id] && remote.has(id)) problems.push(`interior asset id "${id}" now has local files: remove it from REMOTE_CATALOG_ITEMS`);
    else if (!props[id] && !remote.has(id) && !reg.RETIRED_ASSETS[id]) problems.push(`interior asset id "${id}" is accepted by the API but is not in the props manifest: copy its files in (npm run props:manifest), list it in REMOTE_CATALOG_ITEMS, or retire it through RETIRED_ASSETS (never just delete it)`);
  }
  for (const id of remote) if (!acceptedIds.includes(id)) problems.push(`REMOTE_CATALOG_ITEMS lists "${id}", which the API no longer accepts: remove it (or retire it)`);
  if (remote.size) notes.push(`${remote.size} catalogue items load from Pascal’s storage, not ours: ${[...remote].join(', ')}`);
  // a retired id is { to, why }: `to` the id that stands in for it, or null when it was removed (a saved design then leaves the item out)
  for (const [oldId, retired] of Object.entries(reg.RETIRED_ASSETS)) {
    const newId = retired?.to;
    if (props[oldId]) problems.push(`retired asset "${oldId}" is still in the props manifest: list it in RETIRED_ASSETS when its files are removed`);
    if (acceptedIds.includes(oldId)) problems.push(`retired asset "${oldId}" is still in the catalogue the API accepts (lib/content/catalogCuration.js should remove it)`);
    if (!retired?.why) problems.push(`retired asset "${oldId}" gives no reason (why)`);
    if (newId !== null && !props[newId] && !kit[newId]) problems.push(`retired asset "${oldId}" is replaced by "${newId}", which is not in the props manifest`);
  }
  if (unreviewed) notes.push(`${unreviewed} of ${Object.keys(props).length} props have no commercial-use review yet (commercialUseApproved, reviewedBy and reviewedAt are null in the props manifest)`);
  return { problems, notes, props: Object.keys(props).length };
}

// npm packages: an allowed licence for each package in package-lock.json. Unmodified packages may also be under the weak-copyleft
// licences listed here (file-level MPL; LGPL only as sharp's prebuilt image library, loaded as a separate binary); never GPL or AGPL.
export const DEPENDENCY_LICENSES = ['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'BlueOak-1.0.0', 'CC0-1.0', 'CC-BY-4.0', 'Python-2.0', 'Zlib', 'MPL-2.0', 'LGPL-3.0-or-later'];
// Packages whose lockfile entry has no SPDX licence, with what their own files say.
export const DEPENDENCY_LICENSE_NOTES = {
  'node_modules/blob': 'MIT (README, "Licence: MIT")',
  'node_modules/png-js': 'MIT (LICENSE)',
  'node_modules/webgl-constants': 'MIT (LICENSE)',
  'node_modules/jsonify': 'Public Domain (a development tool only)',
};
export function checkDependencies(lock) {
  const problems = [];
  let count = 0;
  for (const [name, p] of Object.entries(lock.packages ?? {})) {
    if (!name || p.link || !name.includes('node_modules/')) continue;
    count++;
    if (DEPENDENCY_LICENSE_NOTES[name]) continue;
    const lic = p.license;
    if (!lic) {
      problems.push(`npm package ${name.replace(/^.*node_modules\//, '')} has no licence in package-lock.json: check its files and add it to DEPENDENCY_LICENSE_NOTES (scripts/assets/admission.mjs)`);
      continue;
    }
    // an SPDX expression: allowed when one of its OR alternatives has every AND part on the list ("GPL-2.0 OR MIT" may be used as MIT)
    const anyOf = lic.replace(/[()]/g, ' ').split(/\s+OR\s+/);
    const ok = anyOf.some((alt) => alt.split(/\s+AND\s+/).map((t) => t.trim()).filter(Boolean).every((t) => DEPENDENCY_LICENSES.includes(t)));
    const pkg = name.replace(/^.*node_modules\//, '');
    if (!ok && /GPL/i.test(lic.replace(/LGPL[\w.+-]*/gi, ''))) problems.push(`npm package ${pkg} is ${lic}: GPL and AGPL code may not ship`);
    else if (!ok) problems.push(`npm package ${pkg} is ${lic}, which is not on the dependency allow-list (scripts/assets/admission.mjs DEPENDENCY_LICENSES)`);
  }
  return { problems, packages: count };
}

// Everything at once, for the command line and the test.
export async function runAll({ root, imp }) {
  const reg = await imp('content/assetSources.js');
  const { CREDITS } = await imp('content/credits.js');
  const { CATALOG_ITEM_IDS } = await imp('content/interiorAssetIds.js');
  const { OWN_ASSET_IDS } = await imp('content/interiorOwnAssets.js');
  const creditsMd = fs.readFileSync(path.join(root, 'CREDITS.md'), 'utf8');
  const ctx = { root, credits: CREDITS, creditsMd };
  const sources = checkSources(reg, ctx);
  const files = checkFiles(reg, ctx);
  const music = checkMusic(reg, ctx);
  const { KIT_PROPS } = await imp('content/catalogCuration.js');
  const props = checkProps(reg, { root, acceptedIds: [...CATALOG_ITEM_IDS, ...OWN_ASSET_IDS], kitProps: KIT_PROPS });
  const deps = checkDependencies(JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')));
  const notes = [...reg.ASSET_SOURCES.flatMap((s) => (s.notes ?? []).map((n) => `${s.id}: ${n}`)), ...Object.entries(reg.ASSET_EXCEPTIONS).map(([f, e]) => `exception ${f}: ${e.reason}`), ...props.notes];
  return {
    reg,
    problems: [...sources.problems, ...files.problems, ...music.problems, ...props.problems, ...deps.problems],
    gaps: sources.gaps,
    notes,
    counts: { sources: reg.ASSET_SOURCES.length, files: files.files, releases: music.releases, props: props.props, packages: deps.packages },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { root, imp } = await import('../lib-loader.mjs');
  const r = await runAll({ root, imp });
  for (const p of r.problems) console.log(`FAIL ${p}`);
  if (r.gaps.length) console.log(`\nRecorded gaps (assets admitted before the process; to close):\n${r.gaps.map((g) => `  - ${g}`).join('\n')}`);
  if (r.notes.length) console.log(`\nNotes:\n${r.notes.map((n) => `  - ${n}`).join('\n')}`);
  const c = r.counts;
  console.log(`\nasset admission: ${c.files} shipped files in ${c.sources} sources, ${c.releases} music releases, ${c.props} props, ${c.packages} npm packages: ${r.problems.length ? `${r.problems.length} problems` : 'ok'}`);
  if (r.problems.length) process.exitCode = 1;
}
