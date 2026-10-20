// The presence load test in its quick mode (scripts/load-test-presence.mjs --quick; docs/architecture/presence_scale.md): 60 pretend players,
// 20 of them signed in through the API, for 20 s, against an API and a presence server ('services', 'multiplayer') it starts itself. It checks
// the composition still runs (guests and signed-in players, chat, churn and reconnects, slow and frozen clients, the abuse mix) and that the
// run is within its budgets. The full, certified run (500 players) is by hand: npm run load:presence -- --full. (About 35 seconds.)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(ok ? 'ok  ' : 'FAIL', name, extra);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-load-test-'));
const out = path.join(dir, 'report.json');
const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'load-test-presence.mjs'), '--quick', '--json', out], { cwd: root, encoding: 'utf8', timeout: 180000 });
console.log((run.stdout ?? '').split('\n').map((l) => `   ${l}`).join('\n'));
if (run.stderr) console.log(run.stderr);
const r = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
fs.rmSync(dir, { recursive: true, force: true });

check('the quick load test ran and is within its budgets (exit 0)', run.status === 0 && r?.passed === true, `exit ${run.status}${r ? `; over budget: ${r.gates.filter((g) => g.ok === false).map((g) => `${g.name} ${g.value}`).join(', ')}` : ''}`);
if (r) {
  const c = r.composition;
  check('guests and signed-in players: every one connected, the signed-in ones through a ticket', c.connected === r.clients && r.signedIn > 0 && r.auth.ok === r.auth.attempts && r.auth.ok >= r.signedIn);
  check('players came into and left each other\'s view', c.enters > 0 && c.exits > 0, `${c.enters} in, ${c.exits} out`);
  check('nearby chat was said and heard', c.chatLines > 0 && c.chatHeard > 0, `${c.chatLines} lines, heard ${c.chatHeard} times`);
  check('connections dropped and closed cleanly, and came back', c.reconnectKinds.drop > 0 && c.reconnectKinds.close > 0 && r.reconnect.failed === 0, JSON.stringify(c.reconnectKinds));
  check('nobody was seen twice, no ghost stayed, no line was heard twice', Object.values(r.duplicates).every((n) => n === 0), JSON.stringify(r.duplicates));
  check('slow readers were kept and caught up; a frozen client was dropped', r.slow.filter((s) => s.kind === 'slow reader').every((s) => s.connected && s.fresh) && r.slow.some((s) => s.kind === 'frozen' && s.dropped));
  const ran = c.abuse.filter((a) => !a.skipped);
  check('the abuse mix got its documented answers', ran.length >= 7 && ran.every((a) => a.ok), ran.filter((a) => !a.ok).map((a) => `${a.name}: ${a.detail}`).join('; '));
  check('the server\'s own figures were read', r.load && r.load.clients > 0 && r.load.tickMsP95 > 0);
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
