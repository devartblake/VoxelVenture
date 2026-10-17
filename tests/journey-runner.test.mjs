// The journey runner (tests/agents/scenario.mjs, Track A of docs/architecture/external_voxel_repositories_adoption_plan.md): the scenarios fit
// their contract and carry no secrets, the artifacts are cleaned, and a failure is reported by business milestone and by kind, so CI can tell
// a product regression from a rendering failure and an environment limitation. Runs tiny journeys that need no servers.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEST_SCENARIO, check as fits } from '@voxelventure/shared-types';
import { root } from './helpers.mjs';
import { SCENARIOS, testPassword, visitorId } from './fixtures/deterministic-pilot-city.mjs';
import { sanitize } from './agents/scenario.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// ---- the scenarios
for (const [name, s] of Object.entries(SCENARIOS)) {
  const r = fits(TEST_SCENARIO, s);
  check(`scenario ${name} fits the test.scenario contract`, r.ok, r.errors.join('; '));
}
check('every scenario has a journey file, and every journey file a scenario', Object.values(SCENARIOS).map((s) => `${s.id}.test.mjs`).sort().join() === fs.readdirSync(path.join(root, 'tests', 'journeys')).filter((f) => f.endsWith('.test.mjs')).sort().join());
const base = SCENARIOS.attributionDedup;
check('a scenario cannot carry a password or a token', !fits(TEST_SCENARIO, { ...base, accounts: [{ ref: 'x', username: 'Xavier', password: 'secret1' }] }).ok && !fits(TEST_SCENARIO, { ...base, token: 'abc' }).ok);
check('a business\'s links must be example domains, never a real site', !fits(TEST_SCENARIO, { ...base, businesses: [{ ...base.businesses[0], website: 'https://www.realbakery.com' }] }).ok && fits(TEST_SCENARIO, { ...base, businesses: [{ ...base.businesses[0], website: 'https://shop.example.org' }] }).ok);
check('the same seed gives the same visitors and passwords', visitorId(5, 'a') === visitorId(5, 'a') && visitorId(5, 'a') !== visitorId(6, 'a') && /^[A-Za-z0-9_-]{4,40}$/.test(visitorId(20260101, 'buyer')) && testPassword(1, 'a') === testPassword(1, 'a'));

// ---- cleaning the artifacts
const dirty = 'token 3f'.padEnd(70, 'a') + ' Bearer abc.def key vvck_AbC-123 ticket 9'.padEnd(60, '0') + ' mail amy@cafe.test pw journey-20260101-baker-pw {"token":"x1","password":"y2"}';
const clean = sanitize(dirty);
check('logs are cleaned of tokens, keys, tickets, emails and passwords', !/aaaaaaaaaa|abc\.def|vvck_AbC|amy@cafe|journey-20260101-baker-pw|"x1"|"y2"/.test(clean), clean);
check('what is not secret is kept', /\[redacted-email\]/.test(clean) && /Bearer \[redacted\]/.test(clean) && sanitize('a view counted for visitor v1xyz-buyer') === 'a view counted for visitor v1xyz-buyer');

// ---- a failure names its milestone and its kind (tiny journeys in a child process: runJourney ends the process with its verdict)
const scenarioUrl = pathToFileURL(path.join(root, 'tests', 'agents', 'scenario.mjs')).href;
const tiny = (id) => ({ id, schemaVersion: 1, seed: 7, device: { profile: 'none' }, participants: [{ role: 'visitor', ref: 'v' }], milestones: [{ id: 'first-step', title: 'The first thing happens' }, { id: 'second-step', title: 'The second thing happens' }], timeoutMs: 20000 });
const run = (id, failWith, env = {}) => {
  const body = failWith
    ? `await j.step('first-step', async () => {}); await j.step('second-step', async () => { throw new m.${failWith}('it did not happen'); });`
    : `await j.step('first-step', async () => {}); await j.step('second-step', async () => {});`;
  const code = `const m = await import(${JSON.stringify(scenarioUrl)}); await m.runJourney(${JSON.stringify(tiny(id))}, { needs: {} }, async (j) => { ${body} });`;
  // JOURNEY_STRICT cleared unless a check sets it: CI sets it for the whole test step
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', env: { ...process.env, JOURNEY_STRICT: '', ...env } });
  const report = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'journeys', id, 'report.json'), 'utf8'));
  fs.rmSync(path.join(root, 'artifacts', 'journeys', id), { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, report };
};
const pass = run('runner-check-pass');
check('a journey that reaches every milestone passes (exit 0)', pass.status === 0 && /passed, 2 of 2 milestones/.test(pass.out) && pass.report.result === 'pass', pass.out.slice(-200));
const product = run('runner-check-product', 'ProductFailure');
check('a product failure exits 1 and names the milestone in business words', product.status === 1 && /PRODUCT REGRESSION at "The second thing happens" \(second-step\)/.test(product.out) && /it did not happen/.test(product.out), product.out.slice(-300));
check('its report says which milestones passed, which failed', JSON.stringify(product.report.milestones.map((m) => m.status)) === '["pass","fail"]' && product.report.failure.kind === 'product' && product.report.failure.milestone === 'second-step');
const rendering = run('runner-check-rendering', 'RenderingFailure');
check('a rendering failure exits 1 and is labelled as such, not as a product regression', rendering.status === 1 && /RENDERING FAILURE at/.test(rendering.out) && rendering.report.result === 'rendering', rendering.out.slice(-200));
const env = run('runner-check-env', 'EnvironmentFailure');
check('a machine that cannot run the journey skips it (exit 0), saying why', env.status === 0 && /SKIPPED \(environment\)/.test(env.out) && env.report.result === 'environment', env.out.slice(-200));
const strict = run('runner-check-strict', 'EnvironmentFailure', { JOURNEY_STRICT: '1' });
check('unless JOURNEY_STRICT=1 (a CI machine that must run it): then it fails', strict.status === 1, strict.out.slice(-200));
const remote = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(scenarioUrl)}); await m.runJourney(${JSON.stringify(tiny('runner-check-remote'))}, { needs: {} }, async () => {});`], { cwd: root, encoding: 'utf8', env: { ...process.env, JOURNEY_STRICT: '', JOURNEY_API_URL: 'http://staging.example.com', JOURNEY_ALLOW_WRITES: '' } });
fs.rmSync(path.join(root, 'artifacts', 'journeys', 'runner-check-remote'), { recursive: true, force: true });
check('a run against another stack needs JOURNEY_ALLOW_WRITES=1 (journeys create accounts there)', /SKIPPED \(environment\)/.test(remote.stdout) && /JOURNEY_ALLOW_WRITES=1/.test(remote.stdout), remote.stdout.slice(-200));

console.log(fails ? `\n${fails} check(s) failed` : '\nall journey runner checks passed');
process.exit(fails ? 1 : 0);
