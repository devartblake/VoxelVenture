// Staging (deploy/STAGING.md, deploy/staging.sh): the settings it writes pass the production check and point only at staging, and its
// services, its Caddy blocks and its settings agree on the ports. It can never email anyone or take real money. The server side
// (systemd, Caddy, the release switch) runs only on the Linode; this checks everything that can be checked here.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkApiEnv, checkWebEnv } from '../services/api/config.mjs';
import { root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const parse = (text) => Object.fromEntries(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

const bash = process.platform === 'win32' ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find((p) => fs.existsSync(p)) ?? 'bash' : 'bash';
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-staging-'));
const r = spawnSync(bash, [path.join('deploy', 'staging.sh'), 'render-env', out.replace(/\\/g, '/')], { cwd: root, encoding: 'utf8' });
if (r.error || r.status !== 0) {
  console.log(`SKIP no bash to run deploy/staging.sh here (${r.error?.message ?? r.stderr})`);
  process.exit(0);
}
const files = Object.fromEntries(['api', 'presence', 'web'].map((f) => [f, fs.readFileSync(path.join(out, `${f}.env`), 'utf8')]));
fs.rmSync(out, { recursive: true, force: true });
const env = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, parse(v)]));

// ---- the settings
const secrets = ['ADMIN_TOKEN', 'IP_SALT', 'MP_NOTIFY_SECRET', 'REFERRAL_SECRET'];
check('the secrets are left for setup to fill (never copied from anywhere)', secrets.every((k) => /CHANGE_ME/.test(env.api[k])));
const filled = { ...env.api, ...Object.fromEntries(secrets.map((k) => [k, crypto.randomBytes(32).toString('hex')])) }; // as setup fills them
const api = checkApiEnv(filled);
check('once setup fills the secrets, the API\'s settings pass the production check', api.errors.length === 0, api.errors.join('; '));
const web = checkWebEnv(env.web);
check('and the web app\'s do', web.errors.length === 0, web.errors.join('; '));
const all = Object.values(files).join('\n');
const live = all.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');
check('nothing points at production\'s addresses', !/(https|wss):\/\/(api\.|play\.)?voxelventure\.app/.test(live), live.match(/(https|wss):\/\/(api\.|play\.)?voxelventure\.app\S*/)?.[0]);
check('nothing uses production\'s folders or settings', !/\/srv\/voxelventure\/|\/etc\/voxelventure\/(?!staging\/)/.test(live));
check('the addresses are staging\'s', env.api.API_ORIGIN === 'https://staging.voxelventure.app' && env.api.PUBLIC_API_URL === 'https://api.staging.voxelventure.app' && env.web.NEXT_PUBLIC_LIVE_API_URL === 'https://api.staging.voxelventure.app' && env.web.NEXT_PUBLIC_MP_URL === 'wss://play.staging.voxelventure.app' && env.presence.MP_ORIGINS === 'https://staging.voxelventure.app');
check('its database and outbox are staging\'s own', env.api.API_DB === '/srv/voxelventure-staging/data/voxelventure.db' && env.api.MAIL_DIR === '/srv/voxelventure-staging/data/outbox' && env.presence.MP_LOG_DIR === '/srv/voxelventure-staging/logs');
check('it never sends email (no mail service, not even commented in)', !env.api.MAIL_WEBHOOK_URL && !/^#\s*MAIL_WEBHOOK_URL=/m.test(files.api));
check('and takes no Stripe key unless one is added, and then only a test key', !env.api.STRIPE_SECRET_KEY && /sk_test_/.test(files.api) && !/sk_live_/.test(files.api));

// ---- the ports agree: settings, services, Caddy
const port = { web: 3100, presence: 3101, api: 3102 };
check('the API and presence listen on staging\'s ports, on this machine only', Number(env.api.API_PORT) === port.api && Number(env.presence.MP_PORT) === port.presence && env.api.API_HOST === '127.0.0.1' && env.presence.MP_HOST === '127.0.0.1');
check('they find each other on those ports', env.api.MP_NOTIFY_URL === `http://127.0.0.1:${port.presence}/notify` && env.presence.MP_API_URL === `http://127.0.0.1:${port.api}` && env.web.API_URL === `http://127.0.0.1:${port.api}`);
const unit = (n) => read('deploy', 'systemd', 'staging', `voxelventure-staging-${n}.service`);
check('the web service listens on its port', unit('web').includes(`-p ${port.web}`));
check('every service runs the live release with staging\'s settings', ['api', 'presence', 'web'].every((n) => unit(n).includes('WorkingDirectory=/srv/voxelventure-staging/current') && unit(n).includes(`EnvironmentFile=/etc/voxelventure/staging/${n}.env`)));
check('and may write only to staging\'s folders', ['api', 'presence', 'web'].every((n) => (unit(n).match(/^ReadWritePaths=(.*)$/m)?.[1] ?? '').split(/\s+/).every((p) => p.replace(/^-/, '').startsWith('/srv/voxelventure-staging/'))));
const caddy = read('deploy', 'Caddyfile.staging');
const block = (host) => caddy.match(new RegExp(`^${host.replace(/\./g, '\\.')} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? '';
check('Caddy sends each staging address to its port', block('staging.voxelventure.app').includes(`127.0.0.1:${port.web}`) && block('api.staging.voxelventure.app').includes(`127.0.0.1:${port.api}`) && block('play.staging.voxelventure.app').includes(`127.0.0.1:${port.presence}`));
check('and never to production\'s', !/127\.0\.0\.1:300[0-3]\b/.test(caddy));
check('search engines are kept out, and the monitor and internal addresses are not public', /noindex/.test(block('staging.voxelventure.app')) && /Disallow: \//.test(caddy) && /handle \/admin\*/.test(caddy) && /@internal path \/internal/.test(block('api.staging.voxelventure.app')) && /\/notify/.test(block('play.staging.voxelventure.app')));
check('production\'s Caddyfile has no staging blocks (setup imports them, so they come and go with staging)', !/staging/.test(read('deploy', 'Caddyfile')));

// ---- the script's guards
const script = read('deploy', 'staging.sh');
check('deploy refuses a live Stripe key and an email service', /sk_live_/.test(script) && /MAIL_WEBHOOK_URL=\.\+/.test(script));
check('deploy runs the settings check, copies the database first, and switches back if the release does not come up', /check-env\.mjs/.test(script) && /snapshot "\$stamp"\s*\n\s*switch_to "\$rel"/.test(script) && /did not come up: switching back/.test(script));
const deployFiles = ['staging.sh', 'push.ps1', 'setup.sh', 'README.md'].map((f) => read('deploy', f)).join('\n');
check('every build goes through build-web.sh, never `sudo -E` (sudo-rs ignores -E: the site would build as a demo)', /build-web\.sh/.test(script) && !/sudo -E -u voxel npm/.test(deployFiles) && /grep -rqF "\$API_URL" apps\/web\/\.next\/static/.test(read('deploy', 'build-web.sh')));
check('reset asks for --yes and keeps a copy', /reset --yes/.test(script) && /snapshot "reset-/.test(script));
check('restore checks the copy is sound before it replaces anything', script.indexOf('integrity_check') < script.indexOf('install -o voxel'));

console.log(fails ? `\n${fails} check(s) failed` : '\nall staging checks passed');
process.exit(fails ? 1 : 0);
