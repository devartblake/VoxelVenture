// The journey runner (Track A of docs/architecture/external_voxel_repositories_adoption_plan.md): runs a scenario (the `test.scenario`
// contract) as business milestones, in order, against a stack it starts here or against a running one (staging), and says plainly how it
// went. A failure names the milestone it stopped at and what kind of failure it was:
//
//   product      the product did something wrong (a figure, a page, an answer): a regression. Exit 1.
//   rendering    the 3D city did not draw (no WebGL, a lost GPU, no first frame in time). Exit 1, labelled, so it is not read as a product bug.
//   environment  this machine cannot run the journey (no browser, a port in use, the build failed). Exit 0 as SKIPPED, unless
//                JOURNEY_STRICT=1 (CI on a machine that must run it).
//
// Every run writes artifacts/journeys/<scenario>/: report.json (each milestone, its time, the verdict), the pages' console logs and a
// screenshot of each open page when it fails. Logs are cleaned first: no session tokens, tickets, conversion keys, emails or passwords.
//
// Where it runs:
//   (default)        starts the API, the presence server and the web app here, on free ports, with an in-memory database. The web app is
//                    built once and reused while nothing that goes into it changes (apps/web/.next/journey-build.json says which).
//   JOURNEY_WEB_URL, JOURNEY_API_URL, JOURNEY_MP_URL   run against a running stack, such as staging. Journeys create accounts and businesses
//                    there, so JOURNEY_ALLOW_WRITES=1 must be set as well; JOURNEY_ADMIN_TOKEN enables the admin's milestones.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { check as fits, TEST_SCENARIO } from '@voxelventure/shared-types';
import { root, sleep } from '../helpers.mjs';

export class ProductFailure extends Error {}
export class RenderingFailure extends Error {}
export class EnvironmentFailure extends Error {}
const kindOf = (err) => (err instanceof EnvironmentFailure ? 'environment' : err instanceof RenderingFailure ? 'rendering' : 'product');

export const ADMIN_TOKEN = 'journey-admin';
const free = () => new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const portFree = (port) => new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, () => s.close(() => resolve(true))); });

// ---- cleaning what goes into the artifacts -------------------------------------------------------------------------------------
export function sanitize(text) {
  return String(text ?? '')
    .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bvvck_[\w-]+/g, 'vvck_[redacted]') // a conversion key
    .replace(/\b[0-9a-f]{32,}\b/gi, '[redacted-hex]') // session tokens (64 hex) and messaging tickets (48 hex)
    .replace(/journey-\d+-[\w-]+-pw/g, '[redacted-password]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted-email]')
    .replace(/("(?:token|password|ticket|key|binding)"\s*:\s*")[^"]*"/gi, '$1[redacted]"');
}

// ---- the web app's build, reused while nothing it is made from changes -----------------------------------------------------------
const WEB_DIR = path.join(root, 'apps', 'web');
const MARKER = path.join(WEB_DIR, '.next', 'journey-build.json');
function sourceKey() {
  try {
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const dirs = ['apps/web', 'lib', 'packages', 'styles', 'package.json', 'package-lock.json'];
    const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...dirs).split('\n').filter(Boolean);
    const h = crypto.createHash('sha256').update(git('rev-parse', 'HEAD')).update(git('diff', 'HEAD', '--', ...dirs));
    for (const f of untracked.sort()) h.update(f).update(fs.readFileSync(path.join(root, f)));
    return h.digest('hex');
  } catch {
    return null; // no git: build every time
  }
}
const buildId = () => (fs.existsSync(path.join(WEB_DIR, '.next', 'BUILD_ID')) ? fs.readFileSync(path.join(WEB_DIR, '.next', 'BUILD_ID'), 'utf8').trim() : null);
// The API's and the presence server's ports are built into the app (NEXT_PUBLIC_LIVE_API_URL, NEXT_PUBLIC_MP_URL: a deep link like /b/12
// redirects and drops ?mp=), so a reused build keeps its ports.
async function ensureWebBuild(log) {
  const key = sourceKey();
  const marker = fs.existsSync(MARKER) ? JSON.parse(fs.readFileSync(MARKER, 'utf8')) : null;
  if (key && marker && marker.key === key && marker.buildId && marker.buildId === buildId() && marker.mpPort && (await portFree(marker.apiPort)) && (await portFree(marker.mpPort))) {
    log(`reusing the web build (API on :${marker.apiPort}, presence on :${marker.mpPort})`);
    return { apiPort: marker.apiPort, mpPort: marker.mpPort };
  }
  const apiPort = await free();
  const mpPort = await free();
  log(`building the web app for the API on :${apiPort} and presence on :${mpPort} (a minute or two; reused next time)`);
  const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const build = spawnSync(process.execPath, [next, 'build', 'apps/web'], { cwd: root, env: { ...process.env, NEXT_PUBLIC_LIVE_API_URL: `http://localhost:${apiPort}`, NEXT_PUBLIC_MP_URL: `ws://localhost:${mpPort}` }, encoding: 'utf8' });
  if (build.status !== 0) {
    const lines = `${build.stdout ?? ''}\n${build.stderr ?? ''}`.trim().split('\n');
    if (/Another next build process is already running/.test(lines.join('\n'))) throw new EnvironmentFailure('another Next build is running on this machine');
    throw new EnvironmentFailure(`the web app did not build:\n${lines.slice(-30).join('\n')}`);
  }
  fs.writeFileSync(MARKER, JSON.stringify({ key, buildId: buildId(), apiPort, mpPort, at: new Date().toISOString() }, null, 1));
  return { apiPort, mpPort };
}

// ---- the stack -------------------------------------------------------------------------------------------------------------------
async function waitUp(url, seconds = 60) {
  for (let i = 0; i < seconds * 4; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* starting */
    }
    await sleep(250);
  }
  return false;
}
// needs: { web, api, presence } (what the journey uses). Returns { webUrl, apiUrl, mpUrl, mpPort, remote, adminToken, stop }.
async function startStack(scenario, needs, log) {
  const remote = process.env.JOURNEY_WEB_URL || process.env.JOURNEY_API_URL || process.env.JOURNEY_MP_URL;
  if (remote) {
    if (process.env.JOURNEY_ALLOW_WRITES !== '1') throw new EnvironmentFailure('a remote run creates accounts and businesses there: set JOURNEY_ALLOW_WRITES=1 to allow it');
    const mpUrl = process.env.JOURNEY_MP_URL ?? null;
    return { remote: true, webUrl: process.env.JOURNEY_WEB_URL ?? null, apiUrl: process.env.JOURNEY_API_URL ?? null, mpUrl, mpPort: mpUrl ? Number(new URL(mpUrl).port) || null : null, adminToken: process.env.JOURNEY_ADMIN_TOKEN ?? null, stop: async () => {} };
  }
  const children = [];
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-journey-'));
  const stop = async () => {
    for (const c of children) c.kill();
    await sleep(300);
    fs.rmSync(logDir, { recursive: true, force: true });
  };
  try {
    const { apiPort, mpPort } = needs.web ? await ensureWebBuild(log) : { apiPort: await free(), mpPort: await free() };
    const webPort = await free();
    const common = { ...process.env, MP_NOTIFY_SECRET: 'journey-notify', INTERNAL_SECRET: 'journey-inside', ADMIN_TOKEN, REFERRAL_SECRET: 'journey-referrals' };
    const apiUrl = `http://localhost:${apiPort}`;
    if (needs.api || needs.web || needs.presence) {
      children.push(spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { cwd: root, env: { ...common, API_PORT: String(apiPort), API_DB: ':memory:', API_SEED: String(scenario.seed), MP_NOTIFY_URL: `http://localhost:${mpPort}/notify` }, stdio: 'ignore' }));
      if (!(await waitUp(`${apiUrl}/health`))) throw new EnvironmentFailure(`the API did not start on :${apiPort}`);
    }
    if (needs.presence || needs.web) {
      children.push(spawn(process.execPath, [path.join(root, 'services', 'multiplayer', 'server.mjs')], { cwd: root, env: { ...common, MP_PORT: String(mpPort), MP_LOG_DIR: logDir, MP_API_URL: apiUrl, MP_RECHECK_MS: '1000' }, stdio: 'ignore' }));
      if (!(await waitUp(`http://localhost:${mpPort}/health`))) throw new EnvironmentFailure(`the presence server did not start on :${mpPort}`);
    }
    let webUrl = null;
    if (needs.web) {
      // Next keeps the data its pages fetched (Discover: 60 s) between runs; a fresh database needs fresh pages
      fs.rmSync(path.join(WEB_DIR, '.next', 'cache', 'fetch-cache'), { recursive: true, force: true });
      const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
      children.push(spawn(process.execPath, [next, 'start', 'apps/web', '-p', String(webPort)], { cwd: root, env: common, stdio: 'ignore' }));
      webUrl = `http://localhost:${webPort}`;
      // (a static page: probing a page that lists businesses would cache an empty list before the journey makes any)
      if (!(await waitUp(`${webUrl}/legal`, 90))) throw new EnvironmentFailure(`the web app did not start on :${webPort}`);
    }
    return { remote: false, webUrl, apiUrl, mpUrl: `ws://localhost:${mpPort}`, mpPort, adminToken: ADMIN_TOKEN, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}

// ---- running a journey -------------------------------------------------------------------------------------------------------------
// runJourney(scenario, { needs }, async (j) => { await j.step('milestone-id', async () => { ... }); ... })
//   j.stack                      { webUrl, apiUrl, mpUrl, mpPort, remote, adminToken }
//   j.step(id, fn)               runs the next milestone of the scenario (in order); fn throws (or j.expect fails) to fail it
//   j.expect(ok, what, detail)   fails the milestone as a product failure, saying what was expected
//   j.skip(id, why)              the milestone cannot run here (an admin step without an admin token, remotely)
//   j.track(name, page)          a browser page whose console and screenshot go into the artifacts
//   j.log(...)                   a line in the run's log (cleaned)
export async function runJourney(scenario, { needs = {} } = {}, body) {
  const valid = fits(TEST_SCENARIO, scenario);
  const outDir = path.join(root, 'artifacts', 'journeys', scenario.id ?? 'unnamed');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const lines = [];
  const log = (...a) => {
    const line = sanitize(a.join(' '));
    lines.push(line);
    console.log(`  ${line}`);
  };
  const report = { scenario: scenario.id, title: scenario.title, seed: scenario.seed, startedAt: new Date().toISOString(), result: 'pass', milestones: [] };
  const pages = new Map();
  let next = 0;
  let stack = null;
  const finish = async (err) => {
    if (err) {
      const kind = kindOf(err);
      report.result = kind;
      const failed = report.milestones.find((m) => m.status === 'fail' || m.status === 'running');
      if (failed) failed.status = 'fail';
      report.failure = { kind, milestone: failed?.id ?? null, after: !failed && next > 0 ? scenario.milestones[next - 1].id : null, message: sanitize(err.message) };
      for (const m of scenario.milestones.slice(next)) report.milestones.push({ id: m.id, title: m.title, status: 'not reached' });
      for (const [name, page] of pages) {
        try {
          await page.screenshot(path.join(outDir, `${name}.png`));
        } catch {
          /* the page is gone */
        }
      }
    }
    for (const [name, page] of pages) fs.writeFileSync(path.join(outDir, `console-${name}.txt`), (page.consoleLines ?? []).map(sanitize).join('\n'));
    for (const page of pages.values()) await page.close?.().catch(() => {});
    await stack?.stop();
    report.endedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
    fs.writeFileSync(path.join(outDir, 'run.log'), lines.join('\n'));
    const passed = report.milestones.filter((m) => m.status === 'pass').length;
    if (!err) {
      console.log(`\nJOURNEY ${scenario.id}: passed, ${passed} of ${scenario.milestones.length} milestones (${report.milestones.filter((m) => m.status === 'skipped').length} skipped)`);
      process.exit(0);
    }
    const titleOf = (id) => scenario.milestones.find((m) => m.id === id)?.title;
    const at = report.failure.milestone
      ? `at "${titleOf(report.failure.milestone)}" (${report.failure.milestone})`
      : report.failure.after
        ? `after the last milestone, "${titleOf(report.failure.after)}"`
        : 'before the first milestone';
    const label = { product: 'PRODUCT REGRESSION', rendering: 'RENDERING FAILURE', environment: 'SKIPPED (environment)' }[report.result];
    console.log(`\nJOURNEY ${scenario.id}: ${label} ${at}\n  ${report.failure.message.split('\n').join('\n  ')}\n  artifacts: ${path.relative(root, outDir)}`);
    process.exit(report.result === 'environment' && process.env.JOURNEY_STRICT !== '1' ? 0 : 1);
  };
  if (!valid.ok) return finish(new ProductFailure(`the scenario does not fit the test.scenario contract: ${valid.errors.join('; ')}`));
  const deadline = setTimeout(() => finish(new ProductFailure(`the journey ran past its ${scenario.timeoutMs} ms budget`)), scenario.timeoutMs);
  deadline.unref();
  try {
    stack = await startStack(scenario, needs, log);
    const j = {
      stack,
      scenario,
      log,
      track: (name, page) => (pages.set(name, page), page),
      expect: (ok, what, detail = '') => {
        if (!ok) throw new ProductFailure(`expected: ${what}${detail ? `\n  got: ${detail}` : ''}`);
      },
      skip: (id, why) => {
        const m = scenario.milestones[next];
        if (!m || m.id !== id) throw new ProductFailure(`journey bug: skipped "${id}" out of order (next is "${m?.id}")`);
        next++;
        report.milestones.push({ id, title: m.title, status: 'skipped', why });
        log(`- ${m.title}: skipped (${why})`);
      },
      step: async (id, fn) => {
        const m = scenario.milestones[next];
        if (!m || m.id !== id) throw new ProductFailure(`journey bug: milestone "${id}" out of order (next is "${m?.id}")`);
        next++;
        const t0 = Date.now();
        report.milestones.push({ id, title: m.title, status: 'running' });
        const entry = report.milestones.at(-1);
        try {
          await fn();
        } catch (err) {
          entry.status = 'fail';
          entry.ms = Date.now() - t0;
          throw err;
        }
        entry.ms = Date.now() - t0;
        entry.status = 'pass';
        const budget = scenario.budgets?.milestoneMs;
        if (budget && entry.ms > budget) {
          entry.status = 'fail';
          throw new ProductFailure(`"${m.title}" took ${entry.ms} ms, over its ${budget} ms budget`);
        }
        log(`ok ${m.title} (${entry.ms} ms)`);
      },
    };
    await body(j);
    if (next < scenario.milestones.length) throw new ProductFailure(`journey bug: it ended before "${scenario.milestones[next].id}"`);
    // the pages' console errors, against the scenario's budget
    const allowed = scenario.budgets?.consoleErrors;
    if (allowed != null) {
      const errors = [...pages.values()].flatMap((p) => p.problems?.() ?? []);
      if (errors.length > allowed) throw new ProductFailure(`${errors.length} console error(s) on the pages, the budget is ${allowed}: ${sanitize(errors.slice(0, 3).join(' | '))}`);
    }
    clearTimeout(deadline);
    await finish(null);
  } catch (err) {
    clearTimeout(deadline);
    await finish(err);
  }
}
