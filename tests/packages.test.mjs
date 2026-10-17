// The shared packages (packages/*, docs/architecture/adr/0001-shared-package-boundaries.md): each imports only what its package.json allows,
// stays pure (no Node, browser, npm or app code), exports what its package.json says, and the lib/ adapters left at the old paths give the
// web app and the server the very same objects, so the API and the pages cannot disagree on a price or a rule.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { imp, root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const PKG = path.join(root, 'packages');
const rel = (f) => path.relative(root, f).replace(/\\/g, '/');
const filesIn = (d) => fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, f)).filter((f) => f.endsWith('.js'));
const packages = fs.readdirSync(PKG, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
check('the three Phase B packages exist', ['analytics', 'business-core', 'shared-types'].every((p) => packages.includes(p)), packages.join());

// Things a pure module must not touch. Comments are removed first, so prose may name them.
const IMPURE = [/\bprocess\./, /\bwindow\b/, /\bdocument\./, /\blocalStorage\b/, /\bsessionStorage\b/, /\bfetch\(/, /\brequire\(/, /\bimport\.meta\b/, /\bnew Function\b/, /\beval\(/];
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

for (const name of packages) {
  const dir = path.join(PKG, name);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const allowed = meta.voxelventure?.dependsOn ?? [];
  check(`${name}: package.json is a private ES module named @voxelventure/${name}`, meta.name === `@voxelventure/${name}` && meta.private === true && meta.type === 'module' && Array.isArray(meta.voxelventure?.dependsOn));
  check(`${name}: has a README and a CHANGELOG`, fs.existsSync(path.join(dir, 'README.md')) && fs.existsSync(path.join(dir, 'CHANGELOG.md')));
  check(`${name}: its exports point at files that exist`, fs.existsSync(path.join(dir, meta.exports['.'])));
  check(`${name}: depends only on other packages`, allowed.every((d) => packages.includes(d) && d !== name));

  for (const file of filesIn(path.join(dir, 'src'))) {
    const src = code(fs.readFileSync(file, 'utf8'));
    for (const [, spec] of src.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*'([^']+)'/g)) {
      const target = path.resolve(path.dirname(file), spec);
      const inside = path.relative(dir, target);
      const other = path.relative(PKG, target).split(/[\\/]/)[0];
      const ok = spec.startsWith('.') && spec.endsWith('.js') && fs.existsSync(target) && (!inside.startsWith('..') || (path.relative(PKG, target).split(/[\\/]/)[1] === 'src' && allowed.includes(other)));
      check(`${rel(file)} may import ${spec}`, ok, ok ? '' : `allowed: this package, ${allowed.join(', ') || 'nothing else'} (relative, with .js)`);
    }
    const bad = IMPURE.filter((re) => re.test(src));
    check(`${rel(file)} is pure`, bad.length === 0, bad.join(' '));
  }
  // it loads in plain Node exactly as it is, with no bundler and no lib-loader
  const mod = await import(pathToFileURL(path.join(dir, meta.exports['.'])).href).catch((e) => e);
  check(`${name}: loads in plain Node`, !(mod instanceof Error) && Object.keys(mod).length > 0, mod instanceof Error ? mod.message : '');
}

// ---- the compatibility adapters: the old lib/ paths give the same objects as the packages
const ADAPTERS = { 'business/plans.js': 'business-core', 'business/profile.js': 'business-core', 'business/conversions.js': 'analytics' };
for (const [libPath, pkg] of Object.entries(ADAPTERS)) {
  const src = fs.readFileSync(path.join(root, 'lib', libPath), 'utf8');
  check(`lib/${libPath} is only an adapter (one re-export, no rules of its own)`, code(src).trim() === `export * from '../../packages/${pkg}/src/${path.basename(libPath)}';`, code(src).trim());
  const viaLib = await imp(libPath); // what the server and the older tests load
  const direct = await import(pathToFileURL(path.join(PKG, pkg, 'src', path.basename(libPath))).href);
  const index = await import(pathToFileURL(path.join(PKG, pkg, 'src', 'index.js')).href);
  const keys = Object.keys(direct);
  check(`lib/${libPath} exports everything the package does`, JSON.stringify(Object.keys(viaLib).sort()) === JSON.stringify([...keys].sort()) && keys.every((k) => k in index));
  check(`lib/${libPath} gives the very same objects (one copy of the rules)`, keys.every((k) => viaLib[k] === direct[k] && index[k] === direct[k]));
}

// ---- prices: the API charges what the pages show, from the one catalogue
const plans = await import(pathToFileURL(path.join(PKG, 'business-core', 'src', 'index.js')).href);
const billingSrc = fs.readFileSync(path.join(root, 'server', 'api', 'billing.mjs'), 'utf8');
check('the server reads prices from the catalogue, not its own numbers', /imp\('business\/plans\.js'\)/.test(billingSrc) && !/\b(900|1900|9900|2900|4900)\b/.test(code(billingSrc)));
check('the catalogue\'s prices are whole cents', Object.values(plans.PRODUCTS).every((p) => p.cents == null || Number.isInteger(p.cents)) && Object.values(plans.PLACEMENTS).every((p) => Number.isInteger(p.cents)));
for (const f of ['components/business/ManageProfiles.jsx']) check(`${f} takes its prices from the catalogue`, /from '@\/lib\/business\/plans'/.test(fs.readFileSync(path.join(root, f), 'utf8')));

// ---- nothing outside packages/ reaches into a package's private files other than src/
const users = ['lib', 'app', 'components', 'server', 'scripts'].flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true }).filter((f) => /\.(js|jsx|mjs)$/.test(f) && !String(f).includes('node_modules')).map((f) => path.join(root, d, f)));
const reaching = users.filter((f) => /['/]packages\/[\w-]+\/(?!src\/)[^'\s]*'/.test(code(fs.readFileSync(f, 'utf8')))).map(rel);
check('imports of a package go through its src/', reaching.length === 0, reaching.join(', '));

console.log(fails ? `\n${fails} check(s) failed` : '\nall package checks passed');
process.exit(fails ? 1 : 0);
