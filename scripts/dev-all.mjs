// Starts the Next.js dev server (open to the LAN) and the multiplayer server together.
//   npm run dev:all
// Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';

// Both servers run under this same Node binary, so no shell (or npx.cmd) is needed on Windows.
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');

const run = (name, args) => {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[${name}] exited (${code})`);
    stopAll();
  });
  return child;
};

const children = [run('web', [nextBin, 'dev', 'apps/web', '-H', '0.0.0.0']), run('mp', ['services/multiplayer/server.mjs'])];
let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);
console.log('\nOpen on this PC:   http://localhost:3000');
for (const a of addresses) console.log(`Open on a phone:   http://${a}:3000   (same Wi-Fi)`);
console.log('Client monitor:    http://localhost:3000/admin\n');
