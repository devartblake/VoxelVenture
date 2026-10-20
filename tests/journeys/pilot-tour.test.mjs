// Journey: the pilot walk-through (docs/product/pilot_tour.md; scenario `pilot-tour`), the guided demo the owner shows prospective pilot
// businesses, run end to end in a real browser against the API: every stop is reached in order with its caption and opens what it shows, the
// controls and the keyboard drive it, reduced motion cuts instead of flying, and nothing that changes data leaves the browser. Same seed, same
// tour: it shows the city's own Combo Cafe and the empty lot next door, so it sets nothing up first.
import { runJourney } from '../agents/scenario.mjs';
import { openBrowser } from '../agents/browser-agent.mjs';
import { SCENARIOS } from '../fixtures/deterministic-pilot-city.mjs';
import { imp, sleep } from '../helpers.mjs';

const scenario = SCENARIOS.pilotTour;
const SAVED = JSON.stringify({ state: { seed: scenario.seed, gold: 4242 }, version: 3 });
const { PILOT_TOUR, TOUR_BUSINESS } = await imp('tour/tours.js');
const caption = (attr) => `document.querySelector('[data-testid="tour-caption"]')?.getAttribute('${attr}')`;
const at = (stop) => `${caption('data-tour-stop')} === ${JSON.stringify(stop.id)} && ${caption('data-tour-arrived')} === '1'`;
const frameText = `(document.querySelector('[data-testid="tour-frame"]')?.contentDocument?.body?.innerText ?? '')`;
// what each kind of stop must show once the camera is there (what a prospect sees, in the page's own words)
const shows = {
  card: [`document.body.innerText.includes('Step inside') && document.body.innerText.includes(${JSON.stringify(TOUR_BUSINESS.name)})`, 'the building card of the business'],
  interior: [`document.body.innerText.includes('(Plot #${TOUR_BUSINESS.plot})')`, 'the room inside the business'],
  dashboard: [`Boolean(document.querySelector('[data-testid="tour-figures"] [data-testid="funnel"]')) && document.body.innerText.includes('Last 30 days, verified')`, 'the owner\'s verified figures (preview)'],
  claim: [`document.querySelectorAll('[data-testid="tour-claim-terms"] li').length === 3 && Boolean(document.querySelector('[data-testid="tour-pro-discount"]'))`, 'the claim form\'s 7, 14 and 30-day prices and the Pro discount (preview)'],
  cart: [`/\\$\\d/.test(document.querySelector('[data-testid="tour-cart-total"]')?.textContent ?? '')`, 'the cart with its total (preview)'],
};
const pageShows = {
  [`/business/${TOUR_BUSINESS.slug}`]: [`${frameText}.includes(${JSON.stringify(TOUR_BUSINESS.name)}) && ${frameText}.includes('Order online')`, 'the business page with its one call to action'],
  '/discover#sponsored': [`${frameText}.includes('Discover businesses') && ${frameText}.includes('Sponsored') && ${frameText}.includes(${JSON.stringify(TOUR_BUSINESS.name)})`, 'Discover, with the business in its Sponsored row'],
};

await runJourney(scenario, { needs: { web: true, api: true, presence: true } }, async (j) => {
  const apiOrigin = new URL(j.stack.apiUrl).origin;
  const writes = [];
  const sockets = [];
  const b = await openBrowser(j, 'prospect', `/?tour=${PILOT_TOUR.id}&tourSpeed=4`);
  // every request from here on (the page is loaded again so its first requests are seen too), in the page and in the frames it opens
  b.page.on((m) => {
    if (m.method === 'Network.requestWillBeSent' && !['GET', 'HEAD', 'OPTIONS'].includes(m.params.request.method)) writes.push(`${m.params.request.method} ${m.params.request.url}`);
    if (m.method === 'Network.webSocketCreated') sockets.push(m.params.url);
  });
  await b.page.cdp('Network.enable');
  // a returning player's saved game, which the tour must neither load nor overwrite
  await b.until('document.readyState === "complete"', 30);
  await b.eval(`localStorage.setItem('voxelventure-save', ${JSON.stringify(SAVED)}); 1`);
  await b.page.cdp('Page.reload');
  await sleep(1000);

  await j.step('tour-starts', async () => {
    await b.cityReady();
    await b.expect(at(PILOT_TOUR.stops[0]), 'the first stop, with the camera there', 60);
    j.expect((await b.eval(`document.querySelector('[data-testid="tour-title"]').textContent`)) === PILOT_TOUR.stops[0].title, 'the first caption');
    j.expect((await b.eval(`document.querySelector('[data-testid="tour-step"]').textContent`)) === `1 / ${PILOT_TOUR.stops.length}`, 'step 1 of n');
  });

  await j.step('every-stop', async () => {
    await b.eval(`document.querySelector('[data-testid="tour-pause"]').click(); 1`); // the journey moves on itself
    for (const [i, stop] of PILOT_TOUR.stops.entries()) {
      await b.expect(at(stop), `stop ${i + 1} "${stop.id}" reached, the camera there`, 30);
      const shown = await b.eval(`[document.querySelector('[data-testid="tour-title"]').textContent, document.querySelector('[data-testid="tour-text"]').textContent, document.querySelector('[data-testid="tour-step"]').textContent]`);
      j.expect(shown[0] === stop.title && shown[1] === stop.text && shown[2] === `${i + 1} / ${PILOT_TOUR.stops.length}`, `the caption of stop ${i + 1}`, JSON.stringify(shown));
      const kind = stop.action?.kind;
      const [expr, what] = kind === 'page' ? pageShows[stop.action.path] : kind ? shows[kind] : [null, null];
      if (expr) await b.expect(expr, `stop ${i + 1} shows ${what}`, 30);
      j.log(`stop ${i + 1}/${PILOT_TOUR.stops.length} ${stop.id}: ${stop.title}`);
      if (i < PILOT_TOUR.stops.length - 1) await b.page.key('ArrowRight');
    }
    j.expect((await b.eval(`document.querySelector('[data-testid="tour-next"]').textContent.trim()`)) === 'Finish', 'the last stop offers Finish');
  });

  await j.step('controls', async () => {
    const n = PILOT_TOUR.stops.length;
    await b.eval(`document.querySelector('[data-testid="tour-back"]').click(); 1`);
    await b.expect(at(PILOT_TOUR.stops[n - 2]), 'Back goes to the stop before');
    await b.page.key('ArrowLeft');
    await b.expect(at(PILOT_TOUR.stops[n - 3]), '← goes back too');
    await b.page.key('PageDown'); // a presentation clicker
    await b.expect(at(PILOT_TOUR.stops[n - 2]), 'Page Down (a clicker) goes on');
    j.expect((await b.eval(caption('data-tour-paused'))) === '1', 'still paused');
    await b.page.key(' ');
    await b.expect(`${caption('data-tour-paused')} === '0'`, 'Space plays');
    await b.expect(at(PILOT_TOUR.stops[n - 1]), 'playing, the tour moves on by itself after the stop\'s time', Math.ceil(PILOT_TOUR.stops[n - 2].durationMs / 4000) + 20);
    await sleep(Math.ceil(PILOT_TOUR.stops[n - 1].durationMs / 4) + 1500);
    j.expect((await b.eval(caption('data-tour-step'))) === String(n), 'it stays on the last stop (it does not leave by itself)');
  });

  await j.step('reduced-motion', async () => {
    await b.page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await b.page.key('ArrowLeft');
    await b.expect(`${caption('data-tour-motion')} === 'cut'`, 'the tour knows motion is reduced', 5);
    const t0 = Date.now();
    await b.expect(at(PILOT_TOUR.stops[PILOT_TOUR.stops.length - 2]), 'the stop reached', 10);
    const cut = Date.now() - t0;
    j.expect(cut < 1500, 'the camera cuts (no 600 ms flight at this speed, no 2.4 s one live)', `${cut} ms`);
    await b.page.cdp('Emulation.setEmulatedMedia', { features: [] });
  });

  await j.step('nothing-written', async () => {
    j.expect(writes.length === 0, `no request that changes anything (POST, PUT, PATCH, DELETE) to the API (${apiOrigin}) or anywhere`, writes.slice(0, 5).join(' | '));
    j.expect(!sockets.some((u) => u.includes(String(j.stack.mpPort))), 'no presence connection: a tour is not a player', sockets.join(' | '));
    j.expect((await b.eval(`localStorage.getItem('voxelventure-save')`)) === SAVED, 'the player\'s saved game in this browser is untouched');
    j.expect(!/4,?242/.test(await b.eval(`document.querySelector('header')?.innerText ?? ''`)), 'and it was not loaded: the tour shows the seeded city (the save\'s 4,242 Gold is not shown)');
    j.log(`${writes.length} writes, ${sockets.length} sockets during the tour`);
  });

  await j.step('exit', async () => {
    await b.page.key('Escape');
    await b.expect(`!document.querySelector('[data-testid="tour-caption"]') && !/[?&]tour=/.test(location.search) && document.readyState === 'complete'`, 'Esc leaves the tour: the caption goes and the address has no ?tour=', 30);
    await b.cityReady();
    await sleep(3000);
    j.expect(!(await b.eval(`Boolean(document.querySelector('[data-testid="tour-caption"]'))`)), 'the city is an ordinary visit (no tour)');
    // an ordinary visit is counted again, which also shows the request watch above sees writes when there are some
    for (let i = 0; i < 40 && !writes.some((w) => w.startsWith('POST') && w.includes('/presence/ping')); i++) await sleep(500);
    j.expect(writes.some((w) => w.includes('/presence/ping')), 'the visit after the tour sends its presence ping (so the watch on writes works)', writes.slice(0, 3).join(' | '));  });
});
