// The Python messaging service (services/messaging, docs/architecture/node_fastapi_architecture_plan.md).
//   npm run messaging:setup    make its Python environment (services/messaging/.venv) and install the pinned packages
//   npm run messaging          run it (port 3003; settings from the environment, see services/messaging/README.md)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'services', 'messaging');
const venvPython = () => [path.join(dir, '.venv', 'Scripts', 'python.exe'), path.join(dir, '.venv', 'bin', 'python')].find((p) => fs.existsSync(p));

if (process.argv.includes('--setup')) {
  // Python 3.11 or newer on PATH: `py -3` on Windows, `python3` elsewhere
  const candidates = process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]];
  const found = candidates.find(([cmd, pre]) => spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8' }).status === 0);
  if (!found) {
    console.error('Python 3 was not found. Install Python 3.13 (python.org, or `winget install Python.Python.3.13` on Windows) and try again.');
    process.exit(1);
  }
  const [cmd, pre] = found;
  if (!venvPython()) spawnSync(cmd, [...pre, '-m', 'venv', path.join(dir, '.venv')], { stdio: 'inherit' });
  const py = venvPython();
  const r = spawnSync(py, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(dir, 'requirements.txt')], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const py = venvPython();
if (!py) {
  console.error('The messaging service has no Python environment yet: run `npm run messaging:setup` first.');
  process.exit(1);
}
const child = spawn(py, ['-m', 'app'], { cwd: dir, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
