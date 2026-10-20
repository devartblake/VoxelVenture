// Admin accounts from the command line (services/api/admin.mjs), straight on the database: the way to add an admin without the web page, and
// the recovery path when the owner has forgotten their password. On the server, as the voxel user, in the current release:
//
//   API_DB=/srv/voxelventure/shared/data/voxelventure.db npm run admin:create -- <username>
//   API_DB=/srv/voxelventure/shared/data/voxelventure.db npm run admin:reset-password -- <username>
//
// It asks for the password twice without showing it (or reads it from the first line of stdin, when that is not a terminal), and prints only
// "created" or "password changed". A reset ends every session of that admin and enables the account again if it was disabled. Each is in the
// audit trail. The API may keep running meanwhile (SQLite in WAL mode lets both write).
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { openDb } from '../services/api/db.mjs';
import * as admin from '../services/api/admin.mjs';
import { audit, SYSTEM } from '../services/api/audit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [cmd, username, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const dbFile = opt('db') || process.env.API_DB || path.join(here, '..', 'services', 'api', 'data', 'voxelventure.db');
const stop = (message) => { console.error(message); process.exit(1); };

if (!['create', 'reset-password'].includes(cmd) || !username) stop('usage: npm run admin:create -- <username>   |   npm run admin:reset-password -- <username>   (the database: API_DB, or --db <file>)');

// one line typed without echo
function askHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const muted = new Writable({ write: (_c, _e, cb) => cb() });
    const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}
async function readPassword() {
  if (process.stdin.isTTY) {
    const first = await askHidden('New password (8+ characters, 3 of: lowercase, capital, number, symbol): ');
    const again = await askHidden('The same password again: ');
    if (first !== again) stop('The two passwords are not the same. Nothing was changed.');
    return first;
  }
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
  if (lines[1] && lines[1] !== lines[0]) stop('The two passwords are not the same. Nothing was changed.');
  return lines[0] ?? '';
}

const db = openDb(dbFile);
try {
  if (cmd === 'create') {
    admin.checkUsername(username);
    if (admin.byUsername(db, username)) stop('There is already an admin with that username (npm run admin:reset-password to change its password).');
    const password = await readPassword();
    await admin.createAdmin(db, { username, password }, { audit: (a) => audit(db, SYSTEM, 'admin.create', { kind: 'admin', id: a.id }, { username: a.username, via: 'command line' }) });
    console.log('created');
  } else {
    const a = admin.byUsername(db, username);
    if (!a) stop('There is no admin with that username (npm run admin:create to add one).');
    const password = await readPassword();
    await admin.setPassword(db, a.id, password, { enable: true, audit: ({ ended }) => audit(db, SYSTEM, 'admin.password_reset', { kind: 'admin', id: a.id }, { username: a.username, via: 'command line', endedSessions: Number(ended), enabled: Boolean(a.disabled) }) });
    console.log('password changed');
  }
} catch (e) {
  stop(e.code && e.status ? e.message : `Failed: ${e.message}`);
} finally {
  db.close();
}
