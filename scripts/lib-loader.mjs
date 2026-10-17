// Loads the app's lib/ modules into plain Node (used by the tests and the API server).
//
// lib/ is written for the bundler (imports without ".js"). Node needs the suffix, so lib/**/*.js is copied into a temporary folder with
// the suffixes added (and node_modules linked in). `imp('city/cityGenerator.js')` imports one of those copies. Nothing in lib/ is modified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-lib-'));
const src = path.join(root, 'lib');
// A relative import inside lib/ gets its ".js"; one that leaves lib/ (a compatibility adapter re-exporting packages/, see
// docs/architecture/adr/0001-shared-package-boundaries.md) points at the real file by URL, so the server runs the same file the bundler does.
const rewrite = (file, code) =>
  code.replace(/from '(\.{1,2}\/[^']+?)'/g, (all, spec) => {
    const target = path.resolve(path.dirname(file), spec);
    if (path.relative(src, target).startsWith('..')) return `from '${pathToFileURL(target.endsWith('.js') ? target : `${target}.js`).href}'`;
    return spec.endsWith('.js') ? all : `from '${spec}.js'`;
  });
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const file = path.join(from, entry.name);
    if (entry.isDirectory()) copyDir(file, path.join(to, entry.name));
    else if (entry.name.endsWith('.js')) fs.writeFileSync(path.join(to, entry.name), rewrite(file, fs.readFileSync(file, 'utf8')));
  }
};
copyDir(src, out);
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
fs.symlinkSync(path.join(root, 'node_modules'), path.join(out, 'node_modules'), 'junction');
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));

export const imp = (file) => import(pathToFileURL(path.join(out, file)).href);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

