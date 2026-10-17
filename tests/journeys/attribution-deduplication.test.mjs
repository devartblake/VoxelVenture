// Journey: one visitor's press and purchase are counted once, however many times the page, the pixel and the business's server report them
// (Track A of docs/architecture/external_voxel_repositories_adoption_plan.md; scenario `attribution-deduplication`). API only, no browser:
// the reports a page, a thank-you pixel and a business's server send, checked against the owner's figures after each.
import { runJourney } from '../agents/scenario.mjs';
import { apiClient, merchantAgent } from '../agents/merchant-agent.mjs';
import { SCENARIOS, visitorId } from '../fixtures/deterministic-pilot-city.mjs';

const scenario = SCENARIOS.attributionDedup;
const VISITOR = visitorId(scenario.seed, 'buyer');
const CLICKS = [`c${scenario.seed}a1`, `c${scenario.seed}b2`]; // click ids the page makes for two presses (10-32 letters and digits)
const ORDER = `J-${scenario.seed}-1`;

await runJourney(scenario, { needs: { api: true } }, async (j) => {
  const owner = await merchantAgent(j, 'cyclist');
  await owner.signUp();
  await owner.createProfile('cycles');
  const key = await owner.conversionKey();
  const page = apiClient(j); // what the visitor's browser sends (no account)
  const event = (body) => page('POST', `/businesses/${owner.slug}/events`, { visitor: VISITOR, source: 'search', ...body });
  const pixel = () => page('GET', `/conversions/pixel.gif?business=${owner.slug}&click=${CLICKS[0]}&value=4500&order=${encodeURIComponent(ORDER)}`);
  const postback = () => apiClient(j, key)('POST', '/conversions', { business: owner.slug, click: CLICKS[0], value: 4500, order: ORDER });
  const stats = async () => (await owner.figures()).stats;

  await j.step('view-once', async () => {
    const first = (await event({ kind: 'view' })).data;
    const again = (await event({ kind: 'view' })).data;
    const s = await stats();
    j.expect(first.counted && first.verified && !again.counted && s.views === 1, 'the same visitor viewing twice is one verified view', JSON.stringify({ first, again, views: s.views }));
  });

  await j.step('press-once', async () => {
    const first = (await event({ kind: 'cta', clickId: CLICKS[0] })).data;
    const again = (await event({ kind: 'cta', clickId: CLICKS[1] })).data; // a second press a moment later, with its own click id
    const s = await stats();
    j.expect(first.counted && first.verified && !again.counted && s.ctaClicks === 1, 'two presses within a minute are one press', JSON.stringify({ first, again, ctaClicks: s.ctaClicks }));
  });

  await j.step('pixel-reported', async () => {
    const r = await pixel();
    const s = await stats();
    j.expect(r.status === 200 && s.revenue.browserCents === 4500 && s.revenue.browserReports === 1 && s.revenue.verifiedCents === 0 && s.purchases === 0, 'the pixel is kept as browser-reported revenue, not a verified purchase', JSON.stringify({ status: r.status, revenue: s.revenue, purchases: s.purchases }));
  });

  await j.step('postback-reconciles', async () => {
    const r = (await postback()).data;
    const s = await stats();
    j.expect(r.recorded && r.attributed && r.reconciled, 'the business\'s server report replaces the pixel\'s and is credited to the press', JSON.stringify(r));
    j.expect(s.revenue.verifiedCents === 4500 && s.revenue.browserCents === 0 && s.revenue.browserReports === 0 && s.purchases === 1, 'the revenue is now verified, once', JSON.stringify({ revenue: s.revenue, purchases: s.purchases }));
  });

  await j.step('postback-repeat', async () => {
    const r = (await postback()).data;
    j.expect(r.recorded === false && r.duplicate === true, 'the same order reported again is a duplicate', JSON.stringify(r));
  });

  await j.step('pixel-after-postback', async () => {
    const r = await pixel();
    const s = await stats();
    j.expect(r.status === 200 && s.revenue.browserCents === 0 && s.revenue.browserReports === 0 && s.revenue.verifiedCents === 4500, 'the pixel firing again changes nothing', JSON.stringify(s.revenue));
  });

  await j.step('figures-once', async () => {
    const s = await stats();
    const purchases = s.outcomes.find((o) => o.id === 'purchases');
    j.expect(s.views === 1 && s.ctaClicks === 1 && s.purchases === 1 && purchases.count === 1 && s.revenue.verifiedCents === 4500 && s.revenue.unattributedCents === 0, 'one view, one press, one purchase and its revenue once', JSON.stringify({ views: s.views, ctaClicks: s.ctaClicks, purchases: s.purchases, outcome: purchases, revenue: s.revenue }));
  });
});
