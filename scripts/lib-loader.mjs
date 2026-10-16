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
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyDir(path.join(from, entry.name), path.join(to, entry.name));
    else if (entry.name.endsWith('.js')) fs.writeFileSync(path.join(to, entry.name), fs.readFileSync(path.join(from, entry.name), 'utf8').replace(/from '(\.{1,2}\/[^']+?)(?<!\.js)'/g, "from '$1.js'"));
  }
};
copyDir(src, out);
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
fs.symlinkSync(path.join(root, 'node_modules'), path.join(out, 'node_modules'), 'junction');
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));

export const imp = (file) => import(pathToFileURL(path.join(out, file)).href);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

