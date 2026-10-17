// A browser in a journey (tests/agents/scenario.mjs): a page of headless Edge or Chrome (tests/browser-driver.mjs) with the actions a
// journey needs, each failing as a business problem rather than a bare selector. Pages are tracked by the journey, so their console and a
// screenshot go into the artifacts. A city that does not draw is a RenderingFailure, a machine without a browser an EnvironmentFailure.
import { findBrowser, openPage } from '../browser-driver.mjs';
import { sleep } from '../helpers.mjs';
import { EnvironmentFailure, ProductFailure, RenderingFailure } from './scenario.mjs';

// An ordinary browser's user agent: the API rightly does not count headless Chrome as a human visitor.
export const ORDINARY_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function openBrowser(j, name, pathOrUrl, { device = j.scenario.device, human = true } = {}) {
  if (!findBrowser()) throw new EnvironmentFailure('no Edge or Chrome on this machine (set BROWSER_PATH)');
  if (!j.stack.webUrl) throw new EnvironmentFailure('this run has no web app (JOURNEY_WEB_URL)');
  const url = /^https?:/.test(pathOrUrl) ? pathOrUrl : `${j.stack.webUrl}${pathOrUrl}`;
  let page;
  try {
    page = await openPage(url, { width: device.width ?? 1300, height: device.height ?? 900, mobile: device.profile === 'phone', userAgent: human && device.profile !== 'phone' ? ORDINARY_UA : null });
  } catch (err) {
    throw new EnvironmentFailure(`the browser did not start: ${err.message}`);
  }
  j.track(name, page);
  const b = {
    page,
    eval: (expr) => page.eval(expr),
    // waits until `expr` is true in the page; false after `seconds`
    until: async (expr, seconds = 20) => {
      for (let i = 0; i < seconds * 4; i++) {
        if (await page.eval(expr).catch(() => false)) return true;
        await sleep(250);
      }
      return false;
    },
    // the same, failing the milestone with `what` (in business words) when it does not happen
    expect: async (expr, what, seconds = 20) => {
      if (!(await b.until(expr, seconds))) throw new ProductFailure(`expected within ${seconds} s: ${what}`);
    },
    // the same for a page the site caches (Discover and the category pages are rebuilt at most once a minute): reloads every
    // `every` seconds while it waits, as a visitor would. Locally the cache starts empty, so the first look passes.
    expectFresh: async (expr, what, seconds = 90, every = 10) => {
      for (let waited = 0; waited < seconds; waited += every) {
        if (await b.until(expr, Math.min(every, seconds - waited))) return;
        await page.eval('location.reload(); 1').catch(() => {});
        await sleep(1000);
      }
      throw new ProductFailure(`expected within ${seconds} s, reloading every ${every} s: ${what}`);
    },
    go: (p) => page.eval(`location.href = ${JSON.stringify(/^https?:/.test(p) ? p : `${j.stack.webUrl}${p}`)}; 1`),
    text: () => page.eval('document.body.innerText'),
    // types into an input the way React notices
    type: (selector, value) => page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`),
    // clicks the first element in `scope` whose text matches `text` (a string is matched exactly, trimmed; a RegExp anywhere); true if found
    clickText: (scope, text) => page.eval(`(() => { const want = ${text instanceof RegExp ? text.toString() : JSON.stringify(text)}; const el = [...document.querySelectorAll(${JSON.stringify(scope)})].find((x) => typeof want === 'string' ? x.textContent.trim() === want : want.test(x.textContent)); el?.click(); return Boolean(el); })()`),
    // the href of the first link whose text matches, clicked (the journey keeps the href: a press's click id is in it)
    pressLink: (text) => page.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => ${text instanceof RegExp ? text.toString() : JSON.stringify(text)}${text instanceof RegExp ? '.test(x.textContent)' : ' === x.textContent.trim()'}); if (!a) return null; a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); return a.href; })()`),
    // the 3D city is up and drawing: a canvas with a live WebGL context, and no fallback page. Only what a visitor's browser shows is used
    // (a production page exposes no internals without ?diag=1). Not drawing is a RenderingFailure.
    cityReady: async (seconds = Math.round((j.scenario.budgets?.firstRenderMs ?? 90000) / 1000)) => {
      for (let i = 0; i < seconds * 2; i++) {
        const state = await page.eval(`(() => {
          if (document.querySelector('[data-testid="nowebgl-business"]') || /cannot draw the 3D city|does not support 3D|WebGL is not available/i.test(document.body.innerText)) return 'fallback';
          const c = document.querySelector('canvas');
          const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
          if (gl && gl.isContextLost && gl.isContextLost()) return 'lost';
          return gl && c.width > 0 && c.height > 0 ? 'ready' : 'waiting';
        })()`).catch(() => 'waiting');
        if (state === 'ready') return true;
        if (state === 'fallback') throw new RenderingFailure('the browser showed the no-WebGL page instead of the 3D city');
        if (state === 'lost') throw new RenderingFailure('the graphics context was lost');
        await sleep(500);
      }
      throw new RenderingFailure(`the 3D city did not start within ${seconds} s`);
    },
    problems: () => page.problems(),
  };
  return b;
}
