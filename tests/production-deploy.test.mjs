// Production on releases (deploy/production.sh, deploy/README.md "Updating"): the service files run the live release and write only to
// shared/, the settings point there, and the script's order of work keeps the site safe. A deploy backs up before it switches and switches
// back when the new release does not answer. The one-time move checks first (read-only), builds while the site serves, backs up, and puts
// the old layout back by itself when the new one does not come up, deleting nothing. The server side runs only on the Linode; this checks
// what can be checked here, and runs the settings helper for real.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
const script = read('deploy', 'production.sh');
const unit = (n) => read('deploy', 'systemd', `voxelventure-${n}.service`);
const env = (n) => Object.fromEntries(read('deploy', 'env', `${n}.env.example`).split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const at = (s) => script.indexOf(s);
const migrate = script.slice(at('cmd_migrate() {'), at('cmd_deploy() {'));
const deploy = script.slice(at('cmd_deploy() {'), at('cmd_rollback() {'));
const inMigrate = (s) => migrate.indexOf(s);
// where the services stop and start again for the switch (the undo, earlier in the function, has its own stop and start)
const SWITCH = inMigrate('say "the switch');
const stopAt = migrate.indexOf('systemctl stop "${UNITS[@]}"', SWITCH);
const startAt = migrate.indexOf('systemctl start "${UNITS[@]}"', SWITCH);

// ---- the services and the settings
check('every service runs the live release, with production\'s settings', ['api', 'presence', 'web'].every((n) => unit(n).includes('WorkingDirectory=/srv/voxelventure/current') && unit(n).includes(`EnvironmentFile=/etc/voxelventure/${n}.env`)));
check('and may write only to shared/ (or the live release\'s page cache)', ['api', 'presence', 'web'].every((n) => (unit(n).match(/^ReadWritePaths=(.*)$/m)?.[1] ?? '').split(/\s+/).every((p) => /^-?\/srv\/voxelventure\/(shared\/|current\/apps\/web\/\.next\/cache$)/.test(p))));
check('the database, the outbox and the error log are in shared/, outside every release', env('api').API_DB === '/srv/voxelventure/shared/data/voxelventure.db' && env('api').MAIL_DIR === '/srv/voxelventure/shared/data/outbox' && env('presence').MP_LOG_DIR === '/srv/voxelventure/shared/logs');
check('the health check asks the ports the services and Caddy use', /127\.0\.0\.1:3002\/health/.test(script) && /127\.0\.0\.1:3001\/health/.test(script) && /127\.0\.0\.1:3000\/legal/.test(script) && unit('web').includes('-p 3000') && env('api').API_PORT === '3002' && env('presence').MP_PORT === '3001' && ['127.0.0.1:3000', '127.0.0.1:3001', '127.0.0.1:3002'].every((p) => read('deploy', 'Caddyfile').includes(p)));
check('the nightly backup finds the database in shared/ once production is on releases', /\/srv\/voxelventure\/shared\/data\/voxelventure\.db/.test(read('deploy', 'backup.sh')));

// ---- what never goes into a release
const excludes = [...script.matchAll(/--exclude (\S+)/g)].map((m) => m[1]);
check('a release never copies the layout\'s own folders, the database, logs, packages or builds', ['/releases', '/shared', '/incoming', '/current', '/repo', '/services/api/data', '/services/multiplayer/logs', 'node_modules', '/apps/web/.next', '.git'].every((e) => excludes.includes(e)), excludes.join(' '));

// ---- the one-time move
check('migrate --check returns before anything is created or changed', inMigrate('"--check" ]') > 0 && inMigrate('return 0') < inMigrate('mkdir -p "$BASE/releases"') && inMigrate('return 0') < stopAt && SWITCH > 0);
check('it refuses to run twice, or with service files still for the old layout', /migrated && die/.test(migrate) && /WorkingDirectory=\$BASE\/current" "\$HERE\/deploy\/systemd\/voxelventure-api\.service" \|\| die/.test(migrate));
check('the first release is built while the site keeps serving, before anything stops', inMigrate('build_release "$BASE" "$rel"') > 0 && inMigrate('build_release "$BASE" "$rel"') < stopAt);
check('a backup, and copies of every file it changes, come before the services stop', inMigrate('voxelventure-backup') < stopAt && inMigrate('cp -p "$ETC/api.env" "$ETC/presence.env" "$keep/"') < stopAt);
check('the undo is armed before the services stop, and covers helper functions (set -E)', inMigrate('trap revert ERR') > 0 && inMigrate('trap revert ERR') < stopAt && /^set -Eeuo pipefail/m.test(script));
check('the undo puts the old settings, services and backup script back, and starts the old layout', /revert\(\) \{[\s\S]*cp -p "\$keep\/api\.env" "\$keep\/presence\.env" "\$ETC\/"[\s\S]*\$keep\/\$u\.service[\s\S]*rm -f "\$BASE\/current"[\s\S]*systemctl start/.test(migrate));
check('the moved database is checked: sound, with the same plots and accounts', /PRAGMA integrity_check/.test(migrate) && /COUNT\(\*\) FROM plots/.test(migrate) && /COUNT\(\*\) FROM accounts/.test(migrate) && stopAt < inMigrate('integrity_check') && inMigrate('integrity_check') < startAt);
check('the new layout must answer, or the move is undone', /healthy \|\| false\n {2}trap - ERR/.test(migrate));
check('nothing is deleted: the old clone is moved to repo/, its database folder renamed', /mv "\$entry" "\$BASE\/repo\/"/.test(migrate) && /data\.before-releases/.test(migrate) && !/rm -rf "\$BASE/.test(migrate) && !/rm -rf "\$OLD/.test(script));

// ---- each deploy
check('a deploy backs up (off the machine too) and snapshots the database before it switches', deploy.indexOf('voxelventure-backup') < deploy.indexOf('switch_to "$rel"') && deploy.indexOf('snapshot "$stamp"') < deploy.indexOf('switch_to "$rel"'));
check('and switches back to the previous release when the new one does not answer', /did not come up: switching back/.test(deploy) && /switch_to "\$prev"/.test(deploy));
check('old releases are pruned, never the live one or the one before it', /\[ "\$r" = "\$live" \] \|\| \[ "\$r" = "\$prev" \] \|\| \{ rm -rf "\$r"/.test(deploy));
check('the switch is one rename: never a moment without a live release', /mv -Tf "\$BASE\/current\.next" "\$BASE\/current"/.test(script));
// the first move stopped at its backup: started from root's home, which the voxel user cannot enter. Each script now leaves it, after
// working out where the project is (HERE), and reads a folder given on the command line from where it was started (abs)
const leaves = (f) => /^cd \/$/m.test(read('deploy', f));
const afterHere = (f) => read('deploy', f).indexOf('HERE=') < read('deploy', f).search(/^cd \/$/m);
check('each deploy script leaves the folder it was started from, after finding the project', ['production.sh', 'staging.sh', 'backup.sh'].every(leaves) && ['production.sh', 'staging.sh'].every(afterHere));
check('and reads a folder given on the command line from where it was started', /src="\$\(abs "\$\{2:-\}"\)"/.test(script) && /render_env "\$\(abs "\$2"\)"/.test(read('deploy', 'staging.sh')));
check('push.ps1 asks the server which layout production is on, and deploys releases with production.sh', /test -L \/srv\/voxelventure\/current/.test(read('deploy', 'push.ps1')) && /production\.sh deploy/.test(read('deploy', 'push.ps1')));

// ---- the settings helper, run for real
const bash = process.platform === 'win32' ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find((p) => fs.existsSync(p)) ?? 'bash' : 'bash';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-prod-'));
const file = path.join(dir, 'api.env').replace(/\\/g, '/');
fs.writeFileSync(file, 'NODE_ENV=production\nAPI_DB=/srv/voxelventure/services/api/data/voxelventure.db\n# MAIL_DIR=/old/outbox\nOTHER=kept\n');
const helper = script.slice(at('set_setting() {'), script.indexOf('\n}\n', at('set_setting() {')) + 3);
const r = spawnSync(bash, ['-c', `${helper}\nset_setting "${file}" API_DB /srv/voxelventure/shared/data/voxelventure.db\nset_setting "${file}" MAIL_DIR /srv/voxelventure/shared/data/outbox\nset_setting "${file}" MP_LOG_DIR /srv/voxelventure/shared/logs`], { encoding: 'utf8' });
if (r.error || r.status !== 0) {
  console.log(`SKIP the settings helper: no bash here (${r.error?.message ?? r.stderr})`);
} else {
  const out = fs.readFileSync(file, 'utf8');
  check('the settings helper replaces a setting, switches on a commented one, and adds a missing one, once each', /^API_DB=\/srv\/voxelventure\/shared\/data\/voxelventure\.db$/m.test(out) && /^MAIL_DIR=\/srv\/voxelventure\/shared\/data\/outbox$/m.test(out) && /^MP_LOG_DIR=\/srv\/voxelventure\/shared\/logs$/m.test(out) && (out.match(/^API_DB=/gm) ?? []).length === 1 && (out.match(/MAIL_DIR=/g) ?? []).length === 1, out);
  check('and leaves everything else as it was', /^NODE_ENV=production$/m.test(out) && /^OTHER=kept$/m.test(out));
}
fs.rmSync(dir, { recursive: true, force: true });

const syntax = spawnSync(bash, ['-n', path.join(root, 'deploy', 'production.sh')], { encoding: 'utf8' });
if (!syntax.error) check('production.sh parses', syntax.status === 0, syntax.stderr);

console.log(fails ? `\n${fails} check(s) failed` : '\nall production deploy checks passed');
process.exit(fails ? 1 : 0);
