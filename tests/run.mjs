// Runs the test files one after another and prints a summary.
//
//   npm test                  everything except the browser test (a few minutes: live-browser rebuilds the app; `npm run build` after it)
//   npm run test:browser      the browser test (needs `npm run build` first and Edge or Chrome)
//   npm run test:all          both
//   node tests/run.mjs lots   only the tests whose file name contains "lots"
//   node tests/run.mjs api.test.mjs market-api.test.mjs   exactly these files (a full file name matches only itself; CI picks them, scripts/select-checks.mjs)
//   npm run test:journeys     the business journeys only (tests/journeys/, run by tests/agents/scenario.mjs; they are part of npm test too)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const withBrowser = args.includes('--browser');
const only = args.includes('--only-browser');
const filters = args.filter((a) => !a.startsWith('--'));

// the suites in tests/, then the journeys in tests/journeys/ (named journeys/<file>)
const journeys = fs.existsSync(path.join(here, 'journeys')) ? fs.readdirSync(path.join(here, 'journeys')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `journeys/${f}`) : [];
let files = [...fs.readdirSync(here).filter((f) => f.endsWith('.test.mjs')).sort(), ...journeys];
files = files.filter((f) => (only ? f.startsWith('browser') : withBrowser || !f.startsWith('browser')));
if (filters.length) files = files.filter((f) => filters.some((x) => (x.endsWith('.test.mjs') ? f === x : f.includes(x))));

const results = [];
for (const file of files) {
  const t0 = Date.now();
  console.log(`\n=== ${file}`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], { stdio: 'inherit' });
    child.on('exit', (c) => resolve(c ?? 1));
  });
  results.push({ file, code, seconds: Math.round((Date.now() - t0) / 1000) });
}

console.log('\n--- summary');
for (const r of results) console.log(`${r.code === 0 ? 'pass' : 'FAIL'}  ${r.file}  (${r.seconds}s)`);
const failed = results.filter((r) => r.code !== 0).length;
console.log(failed ? `${failed} of ${results.length} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
