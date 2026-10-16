// Which CI checks a change needs, from the files it touches (.github/workflows/ci.yml). A documentation edit needs nothing; a new model
// needs the model and credits tests and the freeze check; a server change needs the tests that start the server; a change to lib/ (shared
// by the game, the pages and the server) or to the test tooling needs everything. Anything these rules do not know runs everything:
// the rules can make CI slower, never skip a test a change could break.
//
//   node scripts/select-checks.mjs --base origin/main     compare HEAD with a branch (a pull request)
//   node scripts/select-checks.mjs --base <sha>           compare with a commit (a push: the commit before it)
//   node scripts/select-checks.mjs a.js docs/b.md         or name the files
// Prints the decision; under GitHub Actions it also writes it to $GITHUB_OUTPUT (lint, freeze, python, install, tests).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Files whose change means nothing to test: documentation and repository paperwork. (CREDITS.md is not one: a test checks it.)
const DOCS = [/^docs\//, /^(?!CREDITS\.md$)[^/]*\.md$/i, /\/[^/]*\.md$/i, /^LICENSE/, /^\.github\/(pull_request_template\.md|dependabot\.yml)$/, /^\.gitignore$/, /^AGENTS\.md$/];
// Files every test depends on: any change runs everything.
const EVERYTHING = [/^package(-lock)?\.json$/, /^tests\/(helpers|run|browser-driver)\.mjs$/, /^tests\/fixtures\//, /^scripts\/lib-loader\.mjs$/, /^patches\//, /^vendor\//, /^next\.config\.mjs$/, /^jsconfig\.json$/, /^postcss\.config\.mjs$/, /^\.github\/workflows\//, /^scripts\/select-checks\.mjs$/];
const CODE = /\.(js|jsx|mjs|cjs)$/;

// Which tests read what: from each test file's own source, so a new test is covered without editing this file.
function testIndex(dir = path.join(root, 'tests')) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).map((f) => ({ file: f, src: fs.readFileSync(path.join(dir, f), 'utf8') }));
}
const mentioning = (tests, re) => tests.filter((t) => re.test(t.src)).map((t) => t.file);

// lib/ is shared by the game, the pages and the server, so a change there reaches whatever imports it, directly or not. This follows the
// imports inside lib/ backwards from the changed file and returns every module that depends on it, itself included, as lib-relative paths
// without the extension ('content/models', 'city/cityGenerator').
const LIB = path.join(root, 'lib');
function libGraph() {
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|jsx)$/.test(e.name) && files.push(path.join(d, e.name))));
  walk(LIB);
  const id = (abs) => path.relative(LIB, abs).replace(/\\/g, '/').replace(/\.(js|jsx)$/, '');
  const users = new Map(); // module -> the modules that import it
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
      const dep = id(path.resolve(path.dirname(f), m[1]));
      if (!users.has(dep)) users.set(dep, new Set());
      users.get(dep).add(id(f));
    }
  }
  return users;
}
export function libDependents(changed, users = libGraph()) {
  const seen = new Set([changed]);
  const queue = [changed];
  while (queue.length) for (const u of users.get(queue.shift()) ?? []) if (!seen.has(u)) (seen.add(u), queue.push(u));
  return [...seen];
}
const serverUses = (mods) => {
  const dir = path.join(root, 'server');
  const src = fs.readdirSync(dir, { recursive: true }).filter((f) => /\.mjs$/.test(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  return mods.some((m) => src.includes(`${m}.js`) || src.includes(`lib/${m}`));
};

// The decision for a list of changed files. `tests` is 'all', or a list of test file names (empty: no tests).
export function selectChecks(files, tests = testIndex()) {
  const out = { lint: false, freeze: false, python: false, tests: new Set(), all: false, reasons: [] };
  const all = (why) => {
    if (!out.all) out.reasons.push(`everything: ${why}`);
    out.all = true;
  };
  const add = (list, why) => {
    for (const t of list) out.tests.add(t);
    if (list.length) out.reasons.push(`${list.length} test(s): ${why}`);
  };
  for (const f of files.map((x) => x.replace(/\\/g, '/'))) {
    if (DOCS.some((re) => re.test(f))) continue;
    out.freeze = true; // anything that is not documentation could add to the frozen world
    if (CODE.test(f) || /^eslint\.config\.mjs$/.test(f)) out.lint = true;
    if (EVERYTHING.some((re) => re.test(f))) all(f);
    else if (/^tests\/[^/]+\.test\.mjs$/.test(f)) add([path.basename(f)], f);
    else if (/^lib\/.+\.(js|jsx)$/.test(f)) {
      // the tests that load the changed module or anything built on it; the server's tests if the server loads any of them; and the
      // end-to-end browser test (the game and the pages are built on lib/)
      const mods = libDependents(f.replace(/^lib\//, '').replace(/\.(js|jsx)$/, ''));
      const re = new RegExp(mods.map((m) => `(['"/]${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.js)?['"])`).join('|'));
      add(['live-browser.test.mjs', ...mentioning(tests, re)], `${f} (and ${mods.length - 1} module(s) built on it)`);
      if (serverUses(mods)) add(mentioning(tests, /server\/api|['"]server['"]|server\.mjs|multiplayer\.mjs/), `${f}: the server loads it`);
    }
    else if (f === 'CREDITS.md') add(mentioning(tests, /CREDITS/), f);
    else if (/^(app|components|styles)\//.test(f)) {
      // the pages and the 3D city: the end-to-end browser test (it builds the app) and any test that reads these folders
      add(['live-browser.test.mjs', ...mentioning(tests, /['"/](app|components|styles)\//)], f);
    } else if (/^server\//.test(f)) add(mentioning(tests, /server\/api|['"]server['"]|server\.mjs|multiplayer\.mjs/), f);
    else if (/^services\/messaging\//.test(f)) {
      out.python = true;
      add(mentioning(tests, /services\/messaging|['"]services['"]|MESSAGING_IMPL/), f);
    } else if (/^public\//.test(f) || /^scripts\/(models|streets)\//.test(f)) {
      // models, textures, sounds and the scripts that make them: the catalogue, model, credits and world tests
      add(mentioning(tests, /public\/|['"]public['"]|models|\.glb|\.vox|CREDITS|credits|streetNames|streets/), f);
    } else if (/^scripts\/[^/]+\.mjs$/.test(f)) add(mentioning(tests, new RegExp(path.basename(f).replace(/\./g, '\\.'))), f);
    else if (/^deploy\//.test(f)) add(mentioning(tests, /deploy\//), f);
    else all(`${f} (no rule for it)`);
  }
  const install = out.all || out.lint || out.tests.size > 0;
  return { lint: out.lint || out.all, freeze: out.freeze, python: out.python || out.all, install, tests: out.all ? 'all' : [...out.tests].sort(), reasons: out.reasons };
}

// ---- the command line ------------------------------------------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--base');
  let files;
  if (at >= 0) {
    const base = args[at + 1];
    try {
      // the base is gone or unrelated (a new branch, a force push): check everything
      if (!base || /^0+$/.test(base)) throw new Error('no base');
      const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
      files = execFileSync('git', ['diff', '--name-only', mergeBase, 'HEAD'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch {
      files = null;
    }
  } else files = args;
  const d = files ? selectChecks(files) : { lint: true, freeze: true, python: true, install: true, tests: 'all', reasons: ['everything: the base commit could not be compared'] };
  const tests = d.tests === 'all' ? 'all' : d.tests.join(' ');
  console.log(`changed: ${files ? files.length : '?'} file(s)`);
  for (const r of d.reasons) console.log(`  ${r}`);
  console.log(`lint: ${d.lint}  freeze: ${d.freeze}  python: ${d.python}  tests: ${tests || 'none'}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `lint=${d.lint}\nfreeze=${d.freeze}\npython=${d.python}\ninstall=${d.install}\ntests=${tests}\n`);
}
