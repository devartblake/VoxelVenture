// Journey: a merchant lists a business, links a building, sets an offer and a coupon, sees the figures and answers the pilot check-in (Track A
// of docs/architecture/external_voxel_repositories_adoption_plan.md; scenario `merchant-onboarding`). The set-up goes through the API as the
// dashboard sends it; the dashboard itself and the check-in are used in a real browser, signed in as the merchant.
import { runJourney } from '../agents/scenario.mjs';
import { apiClient, merchantAgent, operatorAgent } from '../agents/merchant-agent.mjs';
import { openBrowser } from '../agents/browser-agent.mjs';
import { SCENARIOS } from '../fixtures/deterministic-pilot-city.mjs';

const scenario = SCENARIOS.merchantOnboarding;
const business = scenario.businesses[0];

await runJourney(scenario, { needs: { web: true, api: true } }, async (j) => {
  const florist = await merchantAgent(j, 'florist');
  const operator = operatorAgent(j);
  const anon = apiClient(j);
  let browser;

  await j.step('sign-up', async () => {
    const out = await florist.signUp();
    j.expect(out.token && out.account?.username === florist.username, 'a new account, signed in', JSON.stringify(out.account));
  });

  await j.step('create-profile', async () => {
    await florist.createProfile('flowers');
    const pub = await florist.public();
    j.expect(pub.name === business.name && pub.category === business.category && pub.cta?.kind === business.cta.kind, 'the profile is public with its name, category and call to action', JSON.stringify({ name: pub.name, category: pub.category, cta: pub.cta }));
  });

  await j.step('claim-building', async () => {
    const id = await florist.claimLot(business.name);
    const plot = (await anon('GET', `/plots/${id}`)).data;
    j.expect(plot.owner === florist.username && plot.title === business.name, `lot #${id} is the merchant's, with the business's name`, JSON.stringify({ owner: plot.owner, title: plot.title }));
  });

  await j.step('link-building', async () => {
    await florist.linkBuilding();
    const pub = await florist.public();
    const plot = (await anon('GET', `/plots/${florist.plotId}`)).data;
    j.expect(pub.plotId === florist.plotId && plot.profileSlug === florist.slug, 'the profile and the building point at each other', JSON.stringify({ plotId: pub.plotId, profileSlug: plot.profileSlug }));
  });

  await j.step('set-cta', async () => {
    await florist.update({ cta: { kind: 'order', url: 'https://flowers.example.com/shop' } });
    const pub = await florist.public();
    j.expect(pub.cta?.kind === 'order' && pub.cta.url === 'https://flowers.example.com/shop', 'the new call to action is what visitors see', JSON.stringify(pub.cta));
  });

  await j.step('set-offer-and-coupon', async () => {
    // offers are a Pro feature: on the free plan the API says so, and nothing is set
    const offer = await florist.call('PUT', `/businesses/${florist.slug}/offer`, { text: 'A free card with every bouquet this week' });
    j.expect(offer.status === 402 && offer.data?.code === 'needs_pro', 'an offer on the free plan asks for Pro', JSON.stringify(offer));
    await florist.setCoupon(business.coupon);
    const pub = await florist.public();
    const storefront = (await anon('GET', `/plots/${florist.plotId}/storefront`)).data;
    const coupon = storefront.brand?.coupon;
    j.expect(!pub.offer && coupon?.text === business.coupon.text && coupon.total === business.coupon.total && coupon.code === undefined, 'the coupon is in the storefront (its code shown only to a visitor who claims it), and no offer was set', JSON.stringify({ offer: pub.offer, coupon }));
  });

  await j.step('dashboard-figures', async () => {
    browser = await openBrowser(j, 'merchant', '/legal');
    await browser.eval(`localStorage.setItem('voxelventure-token', ${JSON.stringify(florist.token)}); 1`); // signed in, as after the sign-up form
    await browser.go('/business/manage');
    await browser.expect(`document.body.innerText.includes(${JSON.stringify(business.name)}) && /Getting started/.test(document.body.innerText)`, 'the dashboard lists the business with its set-up steps', 45);
    await browser.expect(`/views|visits/i.test(document.body.innerText)`, 'and its figures', 10);
  });

  if (!operator.available) {
    j.skip('join-pilot', 'no admin token for this stack (JOURNEY_ADMIN_TOKEN)');
    j.skip('pilot-check-in', 'the business is not in the pilot');
    j.skip('check-in-recorded', 'the business is not in the pilot');
    return;
  }

  await j.step('join-pilot', async () => {
    await operator.addToPilot(florist.slug);
    const mine = await florist.figures();
    j.expect(mine.pilot && mine.pilot.feedback === null, 'the merchant\'s dashboard knows the business is in the pilot', JSON.stringify(mine.pilot));
  });

  await j.step('pilot-check-in', async () => {
    await browser.go('/business/manage');
    const card = '[data-testid="pilot-checkin"]';
    await browser.expect(`Boolean(document.querySelector('${card}'))`, 'the dashboard shows the weekly check-in', 45);
    j.expect(await browser.clickText(`${card} label`, '4'), 'the check-in asks how useful it was (1 to 5)');
    j.expect(await browser.clickText(`${card} label`, 'Maybe'), 'and whether they would pay');
    await browser.type(`${card} textarea`, 'Two bouquet orders from the city this week');
    j.expect(await browser.clickText(`${card} button`, "Send this week's answers"), 'the answers can be sent');
    await browser.expect(`/answers are in \\(4 of 5\\)/.test(document.querySelector('${card}')?.innerText ?? '')`, 'the dashboard thanks the merchant, with the rating', 20);
  });

  await j.step('check-in-recorded', async () => {
    const pilot = await operator.pilot();
    const b = pilot.businesses.find((x) => x.slug === florist.slug);
    const f = b?.feedback?.at(-1);
    j.expect(f && f.rating === 4 && f.wouldPay === 'maybe' && /bouquet orders/.test(f.result ?? ''), 'the pilot dashboard has this week\'s answers', JSON.stringify(f));
  });
});
