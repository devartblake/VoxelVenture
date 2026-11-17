// Measures the baked world at a port on the development page (needs `npm run dev` on port 3111): for each profile (desktop, phone) the mounted chunks, their draw calls and triangles, and the frame time over
// a few seconds (a headless browser's software renderer: the numbers compare the profiles, they are not a phone's). Used to decide what the performance work buys (docs/world/ports_models.md).
//   node scripts/world/measure-ports.mjs
import { openPage } from '../../tests/browser-driver.mjs';
import { sleep } from '../../tests/helpers.mjs';

const spots = { kingston: '519,40,185', 'port-royal': '419,40,170', 'george-town': '1631,40,33', mid: '-100,40,0' };
for (const [name, at] of Object.entries(spots)) {
  for (const profile of ['desktop', 'phone']) {
    const page = await openPage(`http://localhost:3111/world/stream?cam=free&at=${at}&pitch=-35&yaw=0&profile=${profile}`, { width: 900, height: 600 });
    await sleep(26000);
    const r = JSON.parse(await page.eval(`(async () => {
      const s = window.__vvStreamedWorld;
      const t0 = performance.now(); let frames = 0;
      await new Promise((done) => { const tick = () => { frames++; if (performance.now() - t0 > 4000) done(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      return JSON.stringify({ mounted: s.mounted, drawCalls: s.drawCalls, triangles: s.triangles, fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1), models: s.portModels, mid: s.portModelsMid });
    })()`));
    console.log(name.padEnd(12), profile.padEnd(8), JSON.stringify(r));
    await page.close();
  }
}
