// Journey: a visitor finds a business on Discover, becomes a qualified visit, presses its button and walks into its 3D storefront (Track A of
// docs/architecture/external_voxel_repositories_adoption_plan.md; scenario `visitor-discovery-to-storefront`). A real browser, a fresh
// visitor; the business is set up by the merchant agent first. Each milestone is checked against the owner's verified figures.
import { CATEGORIES } from '@voxelventure/business-core';
import { runJourney } from '../agents/scenario.mjs';
import { merchantAgent } from '../agents/merchant-agent.mjs';
import { openBrowser } from '../agents/browser-agent.mjs';
import { SCENARIOS } from '../fixtures/deterministic-pilot-city.mjs';
import { sleep } from '../helpers.mjs';

const scenario = SCENARIOS.visitorDiscovery;
const business = scenario.businesses[0];
const categoryLabel = CATEGORIES.find((c) => c.id === business.category).label;

await runJourney(scenario, { needs: { web: true, api: true, presence: true } }, async (j) => {
  // the business, as its owner would set it up: a profile, a building claimed and linked
  const owner = await merchantAgent(j, 'baker');
  await owner.signUp();
  await owner.createProfile('bakery');
  await owner.claimLot(business.name);
  await owner.linkBuilding();
  const figures = async () => (await owner.figures()).stats;
  // waits until the owner's figures pass `test`
  const counted = async (test, what, seconds = 30) => {
    let last = null;
    for (let i = 0; i < seconds * 2; i++) {
      last = await figures();
      if (test(last)) return last;
      await sleep(500);
    }
    j.expect(false, what, JSON.stringify(last && { impressions: last.impressions, views: last.views, qualified: last.qualified, ctaClicks: last.ctaClicks, storeEntries: last.storeEntries }));
  };

  const visitor = await openBrowser(j, 'visitor', '/discover');
  await j.step('discover-lists-business', async () => {
    await visitor.expect(`document.body.innerText.includes(${JSON.stringify(business.name)})`, `Discover lists ${business.name}`, 60);
    await counted((s) => s.impressions >= 1, 'its card on screen counts an impression');
  });

  await j.step('category-filter', async () => {
    j.expect(await visitor.clickText('a', categoryLabel), `Discover links the "${categoryLabel}" category`);
    await visitor.expect(`location.pathname === '/category/${business.category}' && document.body.innerText.includes(${JSON.stringify(business.name)})`, `the ${categoryLabel} page lists ${business.name}`, 30);
  });

  await j.step('profile-visit', async () => {
    j.expect(await visitor.clickText('a', new RegExp(business.name)), `the category page links to ${business.name}'s profile`);
    await visitor.expect(`location.pathname === '/business/${owner.slug}'`, 'its profile opens', 30);
    await counted((s) => s.views >= 1, 'opening the profile counts a verified visit');
  });

  await j.step('qualified-visit', async () => {
    await counted((s) => s.qualified >= 1, 'staying on the profile for 15 seconds makes it a qualified visit', 45);
  });

  let pressed;
  await j.step('cta-press', async () => {
    pressed = await visitor.pressLink(/Order online/);
    j.expect(pressed && new URL(pressed).hostname === new URL(business.cta.url).hostname && /[?&]vv_click=[A-Za-z0-9]{10,32}$/.test(pressed), 'the button\'s link goes to the business\'s own site with a click id', pressed);
    j.expect(scenario.allowedExternalLinks.includes(new URL(pressed).hostname), 'the link is one the scenario allows', pressed);
    await counted((s) => s.ctaClicks >= 1, 'pressing the button counts a press');
  });

  await j.step('deep-link-to-city', async () => {
    j.expect(await visitor.clickText('a', 'Step inside the 3D storefront'), 'the profile offers "Step inside the 3D storefront"');
    await visitor.expect(`location.pathname === '/'`, 'the link opens the city', 30);
    await visitor.cityReady(); // a city that does not draw is a rendering failure, not a product one
  });

  await j.step('plot-focused', async () => {
    // what the visitor sees: the building's card, linking to this business's own page
    await visitor.expect(`Boolean([...document.querySelectorAll('[data-testid="business-page-link"]')].find((a) => a.getAttribute('href').endsWith('/business/${owner.slug}')))`, `the city opens on the business's own building (#${owner.plotId}), its card linking to its page`, 60);
  });

  await j.step('storefront-entered', async () => {
    j.expect(await visitor.clickText('button', /Step inside/), 'its card offers Step inside');
    await visitor.expect(`Boolean([...document.querySelectorAll('a')].find((a) => /Visit Official Website/.test(a.textContent)))`, "the storefront opens, with the business's website link", 30);
    await counted((s) => s.storeEntries >= 1, 'stepping inside counts a store entry for the profile');
  });

  await j.step('attribution-once', async () => {
    await sleep(2000); // anything counted late would show by now
    const s = await figures();
    j.expect(s.impressions === 1 && s.views === 1 && s.qualified === 1 && s.ctaClicks === 1 && s.storeEntries === 1, 'one impression, one visit, one qualified visit, one press and one store entry: nothing counted twice', JSON.stringify({ impressions: s.impressions, views: s.views, qualified: s.qualified, ctaClicks: s.ctaClicks, storeEntries: s.storeEntries }));
  });
});
