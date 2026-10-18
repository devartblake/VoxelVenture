// Uploads the interior props (apps/web/public/items/<id>/model.glb and thumbnail.webp) and their manifest to the props bucket in object storage
// (Linode Object Storage, S3-compatible), with rclone, under the manifest's content-addressed keys (scripts/props/build-manifest.mjs).
//   npm run props:upload -- --dry-run                           list what would be uploaded, with content types and cache headers (no rclone needed)
//   PROPS_REMOTE=linode:voxelventure-props npm run props:upload  upload (or --remote linode:voxelventure-props)
// No secret goes on the command line: the bucket's keys are in rclone's settings file, RCLONE_CONFIG (default /etc/voxelventure/rclone.conf
// when it exists, the file deploy/backup.sh uses too), under the remote's name. PROPS_REMOTE is only "<remote name>:<bucket>".
// It only adds: files are copied (rclone copy --checksum skips one already there), nothing in the bucket is deleted, so a design saved with
// an older key keeps loading. The manifest goes last, so it never lists a file that is not there yet.
//
// The bucket (once, in Linode Cloud Manager or with s3cmd; the owner's runbook has the steps):
//   - a bucket of its own for the props, e.g. voxelventure-props, in the region the server is in (not the backups bucket: this one is public)
//   - public read for the props: each file is uploaded with the public-read ACL (PROPS_ACL=private to leave that to a bucket policy instead).
//     Its public address, https://<bucket>.<region>.linodeobjects.com, is NEXT_PUBLIC_PROPS_BASE_URL in /etc/voxelventure/web.env.
//   - CORS: the browser fetches the .glb models from the page, so GET (and HEAD) must be allowed from https://voxelventure.app and
//     https://staging.voxelventure.app: scripts/props/cors.xml, applied with  s3cmd setcors scripts/props/cors.xml s3://voxelventure-props
//   - the rclone remote, in /etc/voxelventure/rclone.conf (chmod 640, root:voxel), e.g.
//       [linode]
//       type = s3
//       provider = Linode
//       endpoint = us-ord-1.linodeobjects.com
//       access_key_id = ...      (an access key limited to the props bucket, read/write)
//       secret_access_key = ...
// Every file is sent with Cache-Control "public, max-age=31536000, immutable" (its key changes when it does) and its content type
// (model/gltf-binary, image/webp); the manifest (props/manifest.json) with "public, max-age=300" and application/json.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS_DIR, MANIFEST_FILE } from './catalog.mjs';
import { CACHE_CONTROL, MANIFEST_KEY, buildManifest, staleness } from './build-manifest.mjs';

// Every object to upload, in order: the files, grouped by content type, then the manifest.
export function uploadPlan(manifest, { dir = ITEMS_DIR, manifestFile = MANIFEST_FILE } = {}) {
  const files = Object.values(manifest.props).flatMap((p) =>
    Object.values(p.files).map((f) => ({ key: f.key, local: path.join(dir, p.id, path.basename(f.path)), contentType: f.contentType, cacheControl: CACHE_CONTROL.files, bytes: f.bytes }))
  );
  files.sort((a, b) => a.contentType.localeCompare(b.contentType) || a.key.localeCompare(b.key));
  return [...files, { key: MANIFEST_KEY, local: manifestFile, contentType: 'application/json', cacheControl: CACHE_CONTROL.manifest, bytes: fs.statSync(manifestFile).size }];
}

// The rclone commands for a plan: one `copy` per content type from a staging folder laid out by key, then `copyto` for the manifest.
export function rcloneCommands(plan, { remote, stage, acl = 'public-read' }) {
  const target = remote.replace(/\/+$/, '');
  const common = (o) => ['--header-upload', `Content-Type: ${o.contentType}`, '--header-upload', `Cache-Control: ${o.cacheControl}`, ...(acl && acl !== 'private' ? ['--s3-acl', acl] : [])];
  const files = plan.filter((o) => o.key !== MANIFEST_KEY);
  const manifest = plan.find((o) => o.key === MANIFEST_KEY);
  const byType = new Map();
  for (const o of files) (byType.get(o.contentType) ?? byType.set(o.contentType, []).get(o.contentType)).push(o);
  const commands = [...byType.values()].map((group) => {
    const exts = [...new Set(group.map((o) => path.extname(o.key)))];
    return ['copy', path.join(stage, 'props'), `${target}/props`, '--checksum', ...exts.flatMap((e) => ['--include', `*${e}`]), ...common(group[0])];
  });
  if (manifest) commands.push(['copyto', manifest.local, `${target}/${manifest.key}`, ...common(manifest)]);
  return commands;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const at = args.indexOf('--remote');
  const remote = at >= 0 ? args[at + 1] : process.env.PROPS_REMOTE;
  const acl = process.env.PROPS_ACL || 'public-read';

  // the manifest on disk must be the one the files make, or the pages would ask for keys that were never uploaded
  const problems = staleness(buildManifest());
  if (problems.length) {
    for (const p of problems) console.error(`  x ${p}`);
    console.error('Run npm run props:manifest first (and commit it: the build bundles the keys).');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  const plan = uploadPlan(manifest);
  for (const o of plan) if (!fs.existsSync(o.local)) (console.error(`Missing: ${o.local}`), process.exit(1));

  if (dry) {
    console.log(`Dry run: ${plan.length} objects, ${mb(plan.reduce((n, o) => n + o.bytes, 0))}, revision ${manifest.revision}${remote ? `, to ${remote}` : ''}. Nothing is uploaded.`);
    for (const o of plan) console.log(`  ${o.key}  ${o.contentType}  ${o.bytes}  ${o.cacheControl}`);
    for (const c of rcloneCommands(plan, { remote: remote || '<remote>:<bucket>', stage: '<staging folder>', acl })) console.log(`  rclone ${c.map((a) => (/[\s*:<]/.test(a) && !a.startsWith('--') ? `"${a}"` : a)).join(' ')}`);
    process.exit(0);
  }

  if (!remote || !/^[\w.-]+:[\w.-]+/.test(remote)) {
    console.error('Name the bucket as an rclone remote: PROPS_REMOTE=linode:voxelventure-props (or --remote). See this script\'s header for setting it up.');
    process.exit(2);
  }
  if (!process.env.RCLONE_CONFIG && fs.existsSync('/etc/voxelventure/rclone.conf')) process.env.RCLONE_CONFIG = '/etc/voxelventure/rclone.conf';
  const rclone = process.env.RCLONE || 'rclone';
  try {
    execFileSync(rclone, ['version'], { stdio: 'ignore' });
  } catch {
    console.error('rclone is not installed (apt install rclone), or set RCLONE to its path.');
    process.exit(2);
  }

  // a staging folder laid out by key, so one rclone copy per content type sends them all
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-props-'));
  try {
    for (const o of plan) {
      if (o.key === MANIFEST_KEY) continue;
      fs.mkdirSync(path.join(stage, path.dirname(o.key)), { recursive: true });
      fs.copyFileSync(o.local, path.join(stage, o.key));
    }
    for (const c of rcloneCommands(plan, { remote, stage, acl })) {
      console.log(`rclone ${c.slice(0, 3).join(' ')} ...`);
      execFileSync(rclone, c, { stdio: 'inherit' });
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  console.log(`Uploaded ${plan.length} objects (revision ${manifest.revision}) to ${remote}.`);
  console.log(`Check one: curl -sI <NEXT_PUBLIC_PROPS_BASE_URL>/${plan[0].key}  (200, content-type ${plan[0].contentType}, cache-control ${plan[0].cacheControl})`);
}
