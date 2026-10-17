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

// ---- the workspace (Phase C step 1, docs/architecture/adr/0002-workspaces.md): every package is reached by its name, and the name gives
// the very same module as the package's own file, so the server, the pages and the tests share one copy of each rule
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
check('the root package.json declares packages/* as workspaces', JSON.stringify(rootPkg.workspaces) === JSON.stringify(['packages/*']));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
for (const name of packages) {
  const meta = JSON.parse(fs.readFileSync(path.join(PKG, name, 'package.json'), 'utf8'));
  check(`${meta.name} is in the lockfile as a link to packages/${name}`, lock.packages?.[`node_modules/${meta.name}`]?.link === true && lock.packages?.[`node_modules/${meta.name}`]?.resolved === `packages/${name}`);
  const byName = await import(meta.name).catch((e) => e);
  const byFile = await import(pathToFileURL(path.join(PKG, name, meta.exports['.'])).href);
  check(`${meta.name} resolves by name`, !(byName instanceof Error), byName instanceof Error ? `${byName.message} (run npm install)` : '');
  if (!(byName instanceof Error)) check(`${meta.name} by name is the very same module as its file (one copy of the rules)`, Object.keys(byFile).every((k) => byName[k] === byFile[k]));
}
const LIB = imp;
const facts = await LIB('legal/facts.js'); // a lib/ module loaded the server's way (the lib-loader), which imports the package by name
const direct = await import('@voxelventure/business-core');
check('a lib/ module loaded through the lib-loader reads the same catalogue', facts.MONEY.launch.name === direct.PRODUCTS.launch.name && facts.MONEY.placements.length === Object.keys(direct.PLACEMENTS).length);
check('the old lib/ adapters are gone', ['plans', 'conversions', 'profile'].every((m) => !fs.existsSync(path.join(root, 'lib', 'business', `${m}.js`))));

// ---- prices: the API charges what the pages show, from the one catalogue
const billingSrc = fs.readFileSync(path.join(root, 'server', 'api', 'billing.mjs'), 'utf8');
check('the server reads prices from the catalogue, not its own numbers', /from '@voxelventure\/business-core'/.test(billingSrc) && !/\b(900|1900|9900|2900|4900)\b/.test(code(billingSrc)));
check('the catalogue\'s prices are whole cents', Object.values(direct.PRODUCTS).every((p) => p.cents == null || Number.isInteger(p.cents)) && Object.values(direct.PLACEMENTS).every((p) => Number.isInteger(p.cents)));
for (const f of ['components/business/ManageProfiles.jsx']) check(`${f} takes its prices from the catalogue`, /from '@voxelventure\/business-core'/.test(fs.readFileSync(path.join(root, f), 'utf8')));

// ---- outside packages/, a package is imported by its name only: no relative paths into packages/, no old lib/ paths
const users = ['lib', 'app', 'components', 'server', 'scripts', 'tests'].flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true }).filter((f) => /\.(js|jsx|mjs)$/.test(f) && !String(f).includes('node_modules')).map((f) => path.join(root, d, f)));
const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*'([^']+)'/g;
const relative = [];
const old = [];
for (const f of users) {
  for (const [, spec] of code(fs.readFileSync(f, 'utf8')).matchAll(IMPORT)) {
    if (/(^|\/)packages\//.test(spec)) relative.push(`${rel(f)}: ${spec}`);
    if (/lib\/business\/(plans|conversions|profile)|^\.{1,2}\/(business\/)?(plans|conversions|profile)$/.test(spec)) old.push(`${rel(f)}: ${spec}`);
  }
  if (/imp\('business\/(plans|conversions|profile)\.js'\)/.test(code(fs.readFileSync(f, 'utf8')))) old.push(`${rel(f)}: imp()`);
}
check('no import reaches into packages/ by a relative path', relative.length === 0, relative.join(', '));
check('nothing imports the old lib/business paths', old.length === 0, old.join(', '));

console.log(fails ? `\n${fails} check(s) failed` : '\nall package checks passed');
process.exit(fails ? 1 : 0);
