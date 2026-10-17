// Checks a settings file before a deploy (docs/architecture/authoritative_data.md, services/api/config.mjs).
//   npm run check:env -- /etc/voxelventure/api.env      the API's settings (the API also refuses to start in production with these errors)
//   npm run check:env -- /etc/voxelventure/web.env      the web app's (run it before `npm run build`)
// The kind is told by the file's contents (NEXT_PUBLIC_* means the web app). Exits 1 if there is anything to fix.
import fs from 'node:fs';
import { checkApiEnv, checkWebEnv } from '../services/api/config.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: npm run check:env -- <settings file> [more files]');
  process.exit(2);
}
// KEY=value lines, as systemd's EnvironmentFile reads them (comments and blank lines skipped, optional quotes removed)
export const parseEnvFile = (text) => Object.fromEntries(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]; }));

let failed = false;
for (const file of files) {
  const env = parseEnvFile(fs.readFileSync(file, 'utf8'));
  const web = Object.keys(env).some((k) => k.startsWith('NEXT_PUBLIC_'));
  const { errors, warnings } = web ? checkWebEnv(env) : checkApiEnv(env);
  console.log(`${file} (${web ? 'web app' : 'API'}): ${errors.length ? `${errors.length} to fix` : 'ok'}`);
  for (const e of errors) console.log(`  x ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  failed ||= errors.length > 0;
}
process.exit(failed ? 1 : 0);
