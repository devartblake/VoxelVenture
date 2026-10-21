// Measures the city at fixed camera spots, at each quality tier, and writes a JSON and a Markdown summary
// (docs/architecture/performance_policy.md, "Budgets" and "Measuring").
//
//   npm run build && node scripts/perf-measure.mjs        this machine's GPU, a local production build, every tier
//   node scripts/perf-measure.mjs --tiers high,low --seconds 8
//   node scripts/perf-measure.mjs --url https://staging.example.com   a running site instead (?diag=1 is added to the address)
//   options: --mobile (a 412x915 phone viewport with touch, pixel ratio 2.625; still this machine's GPU), --width 1600 --height 900,
//            --software (SwiftShader, as the tests draw), --uncapped (no 60 Hz frame limit), --out <dir> (default artifacts/perf/<time>),
//            --query '&lod=off' (more of the address: the level of detail off, to compare)
//
// For each tier it opens /?diag=1&view=iso&quality=<tier>, waits for the city and its models, then calls the page's
// window.__vvMeasure() (lib/performance/runtime.js measureCity), which puts the map camera at each spot of
// lib/performance/measureSpots.js and records frame times (p50, p95), draw calls, triangles, geometries and textures, and the
// scene's depth against the camera's near and far planes. Exit code 0; it measures, it does not judge (the summary marks budgets).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { imp, root, sleep } from './lib-loader.mjs';
import { findBrowser, openPage } from '../tests/browser-driver.mjs';

const { PERF_BUDGETS } = await imp('performance/qualityPolicy.js');

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const tiers = String(opt('tiers', 'auto,high,medium,low')).split(',').map((t) => t.trim()).filter(Boolean);
const seconds = Number(opt('seconds', 6));
const mobile = flag('mobile');
const width = Number(opt('width', mobile ? 412 : 1600));
const height = Number(opt('height', mobile ? 915 : 900));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(opt('out', path.join(root, 'artifacts', 'perf', stamp)));
const remote = opt('url');

if (!findBrowser()) {
  console.log('no Edge or Chrome found (set BROWSER_PATH)');
  process.exit(1);
}

const children = [];
let base = remote ? remote.replace(/\/$/, '') : null;
let mpQuery = '';
if (!base) {
  if (!fs.existsSync(path.join(root, 'apps', 'web', '.next', 'BUILD_ID'))) {
    console.log('no production build: run `npm run build` first (or pass --url)');
    process.exit(1);
  }
  const freePort = () => new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
  const webPort = await freePort();
  const mpPort = await freePort();
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-perf-log-'));
  const start = (cmd, a, env = {}) => children.push(spawn(cmd, a, { cwd: root, env: { ...process.env, ...env }, stdio: 'ignore' }));
  start(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', 'apps/web', '-p', String(webPort)]);
  start(process.execPath, [path.join(root, 'services', 'multiplayer', 'server.mjs')], { MP_PORT: String(mpPort), MP_LOG_DIR: logDir });
  base = `http://localhost:${webPort}`;
  mpQuery = `&mp=${mpPort}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/`)).ok) break;
    } catch {
      /* starting */
    }
    await sleep(500);
  }
  process.on('exit', () => fs.rmSync(logDir, { recursive: true, force: true }));
}

const waitFor = async (page, expression, secondsToWait = 120) => {
  for (let i = 0; i < secondsToWait * 2; i++) {
    try {
      if (await page.eval(expression)) return true;
    } catch {
      /* not ready */
    }
    await sleep(500);
  }
  return false;
};

async function measureTier(tier) {
  const url = `${base}/?diag=1&view=iso&quality=${tier}${mpQuery}${opt('query', '')}`;
  console.log(`\n--- ${tier}: ${url}`);
  const page = await openPage(url, { width, height, mobile, gpu: !flag('software'), uncapped: flag('uncapped') });
  try {
    const up = await waitFor(page, 'Boolean(window.__vvMeasure && window.__vvPerf && window.__vvPerf.calls > 0 && window.__vvQuality.getState().gpuKnown)');
    if (!up) return { tier, error: 'the city did not load', problems: page.problems().slice(0, 5) };
    // the models and textures finish loading: the building and prop models are counted until the count holds for 4 s (a slow
    // load would otherwise measure the box buildings drawn until then)
    const loaded = `(() => { const m = window.__vvModels?.getState(); const p = window.__vvProps?.getState(); return (m?.status ?? '-') + ':' + Object.keys(m?.geometries ?? {}).length + ':' + Object.keys(p?.geometries ?? {}).length; })()`;
    let last = null;
    let steady = 0;
    for (let i = 0; i < 120 && steady < 8; i++) {
      await sleep(500);
      const now = await page.eval(loaded);
      steady = now === last && !now.startsWith('loading') && !now.startsWith('idle') ? steady + 1 : 0;
      last = now;
    }
    await sleep(2000);
    const r = JSON.parse(await page.eval(`window.__vvMeasure({ seconds: ${seconds} }).then((r) => JSON.stringify(r))`));
    for (const s of r.spots) console.log(`${s.id.padEnd(12)} lod ${(s.lod?.level ?? '-').padEnd(4)} p50 ${String(s.frameTime.p50).padStart(6)} ms  p95 ${String(s.frameTime.p95).padStart(6)} ms  ${String(s.drawCalls.mean).padStart(5)} calls  ${String(Math.round(s.triangles.mean / 1000)).padStart(6)}k tris  ground depth on screen ${s.depth?.groundOnScreen?.join('..')}${s.depth?.clipsOnScreen ? ' CLIPPED' : ''} (near ${s.depth?.near}, far ${s.depth?.far})`);
    return { requested: tier, ...r, problems: page.problems().slice(0, 5) };
  } finally {
    await page.close();
  }
}

const runs = [];
try {
  for (const tier of tiers) {
    let run = null;
    for (let attempt = 1; attempt <= 2 && !run; attempt++) {
      try {
        run = await measureTier(tier);
      } catch (e) {
        // (the page went away mid-run, for example after the GPU reset it: try once more)
        console.log(`attempt ${attempt} failed: ${e.message}`);
        if (attempt === 2) run = { tier, error: `the page failed: ${e.message}` };
      }
    }
    runs.push(run);
  }
} finally {
  for (const c of children) c.kill();
}

// ---- the summary ------------------------------------------------------------------------------------------------------
const ok = runs.find((r) => r.renderer);
const machine = { os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? '?', cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30), renderer: ok?.renderer ?? '?', vendor: ok?.vendor ?? '?' };
const report = { at: new Date().toISOString(), base: remote ? base : 'local production build', viewport: [width, height], mobile, software: flag('software'), uncapped: flag('uncapped'), seconds, machine, budgets: PERF_BUDGETS, runs };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'perf.json'), JSON.stringify(report, null, 2));

const mark = (value, limit) => (limit == null ? '' : value <= limit ? '' : ' ⚠');
const lines = [
  `# City performance, ${report.at.slice(0, 16).replace('T', ' ')} UTC`,
  '',
  `- Site: ${report.base}; viewport ${width}x${height}${mobile ? ' (phone emulation, touch)' : ''}; ${seconds} s per spot${flag('uncapped') ? '; frame limit lifted' : ''}`,
  `- Machine: ${machine.cpu} (${machine.cores} threads), ${machine.memoryGB} GB, ${machine.os}`,
  `- GPU (WebGL renderer): ${machine.renderer}`,
  '',
  '⚠ marks a figure over the tier\'s budget (docs/architecture/performance_policy.md).',
  '',
];
for (const r of runs) {
  if (r.error) {
    lines.push(`## quality=${r.tier}: ${r.error}`, '');
    continue;
  }
  const b = PERF_BUDGETS[r.tier] ?? {};
  lines.push(`## quality=${r.requested} → tier ${r.tier} (${r.source}; ${r.reasons.join(', ')})`, '');
  lines.push(`Pixel ratio ${r.pixelRatio} (device ${r.devicePixelRatio}), canvas ${r.canvas.join('x')}, shadow map ${r.shadowMap ? 'on' : 'off'}.`, '');
  lines.push('| Spot | Zoom | LOD | Frame p50 (ms) | Frame p95 (ms) | Draw calls | Triangles | Geometries | Textures | Scene depth vs near/far |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of r.spots) {
    const d = s.depth;
    const depth = d ? `on screen ${d.groundOnScreen.join(' to ')}${d.clipsOnScreen ? ' ⚠ clipped' : ''}; land ${d.sceneNearest} to ${d.sceneFarthest} (near ${d.near}, far ${d.far})` : '-';
    const lod = s.lod ? `${s.lod.level}${s.lod.standIns ? `, ${s.lod.standIns} stand-ins` : ''}${s.lod.culled ? `, ${s.lod.culled} off screen` : ''}` : '-';
    lines.push(`| ${s.id} | ${s.zoom} | ${lod} | ${s.frameTime.p50} | ${s.frameTime.p95}${mark(s.frameTime.p95, b.frameP95)} | ${s.drawCalls.mean}${mark(s.drawCalls.mean, b.drawCalls)} | ${Math.round(s.triangles.mean / 1000)}k${mark(s.triangles.mean, b.triangles)} | ${s.geometries}${mark(s.geometries, b.geometries)} | ${s.textures}${mark(s.textures, b.textures)} | ${depth} |`);
  }
  if (r.changes?.length) lines.push('', `Tier changes during the run: ${r.changes.map((c) => `${c.from} → ${c.to} (${c.reason})`).join(', ')}`);
  if (r.problems?.length) lines.push('', `Console problems: ${r.problems.join(' | ')}`);
  lines.push('');
}
fs.writeFileSync(path.join(outDir, 'perf.md'), lines.join('\n'));
console.log(`\nwrote ${path.join(outDir, 'perf.json')} and perf.md`);
process.exit(0);
