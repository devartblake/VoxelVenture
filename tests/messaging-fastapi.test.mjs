// The messaging contract against the Python messaging service (services/messaging): runs tests/messaging.test.mjs with
// MESSAGING_IMPL=fastapi, then the service's own unit tests. Skipped when the service's Python environment is not set up
// (services/messaging/README.md says how).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './helpers.mjs';

const dir = path.join(root, 'services', 'messaging');
const python = [path.join(dir, '.venv', 'Scripts', 'python.exe'), path.join(dir, '.venv', 'bin', 'python')].find((p) => fs.existsSync(p));
if (!python) {
  console.log('SKIP: no services/messaging/.venv (see services/messaging/README.md)');
  process.exit(0);
}
const contract = spawnSync(process.execPath, [path.join(root, 'tests', 'messaging.test.mjs')], { cwd: root, env: { ...process.env, MESSAGING_IMPL: 'fastapi' }, stdio: 'inherit' });
const unit = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-t', '.'], { cwd: dir, stdio: 'inherit' });
if (contract.status !== 0 || unit.status !== 0) process.exit(1);
console.log('ALL OK');
