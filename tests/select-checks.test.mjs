// The CI check picker (scripts/select-checks.mjs): a change runs what it can break, and nothing it cannot.
import { libDependents, selectChecks } from '../scripts/select-checks.mjs';
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', n, extra); };
const has = (d, ...names) => d.tests !== 'all' && names.every((n) => d.tests.includes(n));
const lacks = (d, ...names) => d.tests !== 'all' && names.every((n) => !d.tests.includes(n));

const docs = selectChecks(['docs/roadmap/tasks.md', 'README.md', 'services/messaging/README.md', '.github/pull_request_template.md']);
check('a documentation edit runs nothing (no install, lint, freeze check or tests)', !docs.install && !docs.lint && !docs.freeze && !docs.python && docs.tests.length === 0, JSON.stringify(docs));
const credits = selectChecks(['CREDITS.md']);
check('CREDITS.md is not just documentation: its test runs', has(credits, 'credits.test.mjs') && credits.tests.length < 10);
const model = selectChecks(['apps/web/public/models/kenney/shop-new.glb']);
check('a new model runs the model, credits and world tests and the freeze check, not the API or chat tests', has(model, 'models.test.mjs', 'kenney-models.test.mjs', 'credits.test.mjs') && lacks(model, 'api.test.mjs', 'messaging.test.mjs', 'live-browser.test.mjs') && model.freeze && !model.lint, model.tests.join(' '));
const catalogue = selectChecks(['apps/web/public/models/kenney/shop-new.glb', 'lib/content/modelCatalog.js']);
check('with its catalogue entry: the modules built on the catalogue, and the server (it checks building setups with it), not everything', catalogue.tests !== 'all' && has(catalogue, 'models.test.mjs', 'exterior.test.mjs', 'api.test.mjs', 'live-browser.test.mjs') && lacks(catalogue, 'traffic.test.mjs', 'business-profile.test.mjs'), `${catalogue.tests.length} tests`);
check('lib/ dependents follow imports backwards', libDependents('content/modelCatalog').includes('game/exterior') && libDependents('content/modelCatalog').includes('content/models') && !libDependents('game/exterior').includes('content/modelCatalog'));
const server = selectChecks(['services/api/social.mjs']);
check('a server change runs the tests that start the server, not the world-generation tests', has(server, 'api.test.mjs', 'social.test.mjs', 'migration.test.mjs') && lacks(server, 'traffic.test.mjs', 'models.test.mjs') && server.lint);
const ui = selectChecks(['apps/web/components/ui/Header.jsx']);
check('a game or page change runs the end-to-end browser test (it builds the app) and lint', has(ui, 'live-browser.test.mjs') && ui.lint && lacks(ui, 'traffic.test.mjs'));
const py = selectChecks(['services/messaging/app/main.py']);
check('a messaging service change runs the Python tests and the messaging tests against it', py.python && has(py, 'messaging-fastapi.test.mjs') && lacks(py, 'models.test.mjs'));
check('a changed test runs itself', JSON.stringify(selectChecks(['tests/api.test.mjs']).tests) === '["api.test.mjs"]');
check('a script runs the tests that use it', has(selectChecks(['scripts/verify-live.mjs']), 'authoritative.test.mjs') && selectChecks(['scripts/verify-live.mjs']).tests.length < 5);
const props = selectChecks(['scripts/props/upload.mjs', 'scripts/props/cors.xml']);
check('a change to the props scripts runs the props test, not everything', has(props, 'interior-props.test.mjs') && props.tests.length < 5, JSON.stringify(props.tests));
check('and so do the props manifest and the prop folders', has(selectChecks(['apps/web/public/props/manifest.json']), 'interior-props.test.mjs') && has(selectChecks(['apps/web/public/items/door/model.glb']), 'interior-props.test.mjs') && has(selectChecks(['lib/content/interiorPropKeys.js']), 'interior-props.test.mjs', 'live-browser.test.mjs'));
for (const f of ['package.json', 'package-lock.json', 'tests/helpers.mjs', 'scripts/lib-loader.mjs', '.github/workflows/ci.yml', 'patches/x.patch', 'next.config.mjs'])
  check(`${f} runs everything`, selectChecks([f]).tests === 'all');
check('a file no rule knows runs everything', selectChecks(['somewhere/new-thing.yaml']).tests === 'all' && selectChecks(['somewhere/new-thing.yaml']).python);
check('docs mixed with code: the code decides', has(selectChecks(['docs/a.md', 'services/api/core.mjs']), 'api.test.mjs'));

// the business journeys (tests/journeys/, Track A of the adoption plan)
const JOURNEYS = ['journeys/attribution-deduplication.test.mjs', 'journeys/merchant-onboarding.test.mjs', 'journeys/reconnect-and-recovery.test.mjs', 'journeys/visitor-discovery-to-storefront.test.mjs'];
check('a changed journey runs itself', JSON.stringify(selectChecks(['tests/journeys/merchant-onboarding.test.mjs']).tests) === '["journeys/merchant-onboarding.test.mjs"]');
check('a change to the agents or the scenarios runs every journey and the runner test, not everything', ['tests/agents/presence-agent.mjs', 'tests/fixtures/deterministic-pilot-city.mjs'].every((f) => [...JOURNEYS, 'journey-runner.test.mjs'].every((t) => has(selectChecks([f]), t))));
check('a change to the pages or a server runs the journeys', JOURNEYS.every((t) => has(selectChecks(['apps/web/components/ui/Header.jsx']), t) && has(selectChecks(['services/multiplayer/server.mjs']), t)));
check('a change to a test or the docs does not', lacks(selectChecks(['tests/api.test.mjs']), ...JOURNEYS) && JSON.stringify(selectChecks(['docs/a.md']).tests) === '[]');

// the shared packages (docs/architecture/adr/0001-shared-package-boundaries.md)
check('dependents follow a package file to its workspace name and the lib/ modules that import it', libDependents('../packages/business-core/src/plans').includes('@voxelventure/business-core') && libDependents('../packages/business-core/src/plans').includes('legal/facts') && !libDependents('../packages/shared-types/src/enums').includes('legal/facts'));
const prices = selectChecks(['packages/business-core/src/plans.js']);
check('a package module runs what its lib/ adapter would, the server\'s tests and the package rules', ['billing.test.mjs', 'business-profile.test.mjs', 'live-browser.test.mjs', 'packages.test.mjs', 'contracts.test.mjs', 'api.test.mjs'].every((t) => has(prices, t)), JSON.stringify(prices.tests));
const contract = selectChecks(['packages/shared-types/src/contracts/business.js']);
check('a contract runs the contract and package tests, not everything', contract.tests !== 'all' && has(contract, 'contracts.test.mjs') && has(contract, 'packages.test.mjs') && contract.lint);
check('a package\'s package.json runs everything', selectChecks(['packages/analytics/package.json']).tests === 'all');
check('a package nothing uses yet runs everything', selectChecks(['packages/world-core/src/index.js'], []).tests === 'all'); // (no tests: this file names it)
check('a package\'s README and CHANGELOG run nothing', JSON.stringify(selectChecks(['packages/analytics/README.md', 'packages/shared-types/CHANGELOG.md', 'packages/README.md']).tests) === '[]');

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
