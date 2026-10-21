// End to end with a real server: build the app with NEXT_PUBLIC_LIVE_API_URL, start the API and the app, then in a real browser:
// browse without signing in, be asked to sign in before setting a plot up, sign up, set it up (held on the server) and see the plot become
// yours (and in the server).
// Then chat between the two signed-in pages: nearby lines, a private message, the request answered, and a question to a building's owner.
// (It rebuilds the app, so it takes a few minutes. `node tests/live-browser.test.mjs`; `npm test` runs it too.)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { root, sleep } from './helpers.mjs';
import { openPage, findBrowser } from './browser-driver.mjs';

if (!findBrowser()) { console.log('SKIP: no Edge or Chrome'); process.exit(0); }
const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const apiPort = await free();
const webPort = await free();
const mpPort = await free(); // a presence server of the test's own, joined to its API (not whatever runs on 3001)
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-live-mp-'));
const ADMIN_TOKEN = 'live-admin-token';
const env = { ...process.env, NEXT_PUBLIC_LIVE_API_URL: `http://localhost:${apiPort}`, MP_NOTIFY_SECRET: 'live-test', INTERNAL_SECRET: 'live-inside', ADMIN_TOKEN };
// MESSAGING_IMPL=fastapi: the same run with messaging served by the Python service (docs/architecture/node_fastapi_architecture_plan.md, step 5)
const FASTAPI = process.env.MESSAGING_IMPL === 'fastapi';
const msgPort = await free();
const msgDir = path.join(root, 'services', 'messaging');
const python = [path.join(msgDir, '.venv', 'Scripts', 'python.exe'), path.join(msgDir, '.venv', 'bin', 'python')].find((p) => fs.existsSync(p));
if (FASTAPI && !python) { console.log('SKIP: no services/messaging/.venv'); process.exit(0); }
const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const children = [];
const type2 = (pg, selector, value) => pg.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
try {
  const build = spawnSync(process.execPath, [next, 'build', 'apps/web'], { cwd: root, env, encoding: 'utf8' });
  if (build.status !== 0) {
    // show why, so a failure in CI can be read from the log (the end of the output has Next's error list)
    const lines = `${build.stdout ?? ''}\n${build.stderr ?? ''}`.trim().split('\n');
    console.log(`--- next build failed (status ${build.status}); the last ${Math.min(80, lines.length)} lines:\n${lines.slice(-80).join('\n')}\n---`);
    throw new Error('build failed');
  }
  children.push(spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { cwd: root, env: { ...env, API_PORT: String(apiPort), API_DB: ':memory:', PROFILE_CTA_CAP: '5', MP_NOTIFY_URL: `http://localhost:${mpPort}/notify`, ...(FASTAPI ? { MESSAGING_SERVICE_URL: `http://localhost:${msgPort}` } : {}) }, stdio: 'ignore' }));
  if (FASTAPI) children.push(spawn(python, ['-m', 'app'], { cwd: msgDir, env: { ...env, MESSAGING_PORT: String(msgPort), MESSAGING_DB: ':memory:', NODE_API_URL: `http://localhost:${apiPort}`, MP_NOTIFY_URL: `http://localhost:${mpPort}/notify` }, stdio: 'ignore' }));
  console.log(`messaging served by ${FASTAPI ? 'the FastAPI service' : 'the Node API'}`);
  children.push(spawn(process.execPath, [path.join(root, 'services', 'multiplayer', 'server.mjs')], { cwd: root, env: { ...env, MP_PORT: String(mpPort), MP_LOG_DIR: logDir, MP_API_URL: `http://localhost:${apiPort}` }, stdio: 'ignore' }));
  children.push(spawn(process.execPath, [next, 'start', 'apps/web', '-p', String(webPort)], { cwd: root, env, stdio: 'ignore' }));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${webPort}/`)).ok && (await fetch(`http://localhost:${apiPort}/health`)).ok && (await fetch(`http://localhost:${mpPort}/health`)).ok) break; } catch { /* starting */ } await sleep(500); }

  const page = await openPage(`http://localhost:${webPort}/?diag=1&view=iso&spawn=fixed&mp=${mpPort}`, { width: 1400, height: 1000 });
  for (let i = 0; i < 120 && !(await page.eval('Boolean(window.__vvStore && window.__vvPanel)').catch(() => false)); i++) await sleep(500);
  await sleep(2500);
  check('the page loads and nothing asks for a sign-in', !(await page.eval(`document.body.innerText.includes('Sign in to continue')`)));
  await page.eval(`document.querySelector('[aria-label="Close"]')?.click()`);

  const lot = JSON.parse(await page.eval(`JSON.stringify((() => { const p = window.__vvStore.getState().plots.find((q) => !q.owner && q.districtId !== 'suburb' && !q.prime); return { id: p.id }; })())`));
  await page.eval(`window.__vvStore.getState().setSelectedPlot(window.__vvStore.getState().plots.find((q) => q.id === ${lot.id}))`);
  await sleep(1200);
  check('selecting a lot and browsing still need no account', !(await page.eval(`document.body.innerText.includes('Sign in to continue')`)));
  const type = (selector, value) => page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  // with a server a plot is set up signed in (the server holds it meanwhile: services/api/economy.mjs), so the card asks first
  check('signed out, the card asks to sign in in place of the setup form', await page.eval(`Boolean(document.querySelector('[data-testid="sign-in-to-set-up"]')) && !document.querySelector('input[placeholder="Store / Company Name"]')`));
  await page.eval(`document.querySelector('[data-testid="sign-in-to-set-up"] button').click()`);
  await sleep(800);
  check('pressing it opens the sign-in form', await page.eval(`document.body.innerText.includes('Sign in to continue')`));
  check('the lot is not claimed yet', await page.eval(`!window.__vvStore.getState().plots.find((q) => q.id === ${lot.id}).owner`));
  await type('input[aria-label="Name"]', 'BrowserBaker');
  await type('input[aria-label="Password"]', 'longenough1');
  await page.eval(`[...document.querySelectorAll('[role=dialog] button[type=submit]')][0].click()`);
  for (let i = 0; i < 20 && !(await page.eval(`Boolean(document.querySelector('input[placeholder="Store / Company Name"]'))`)); i++) await sleep(500);
  check('after signing up, the setup form is there', await page.eval(`Boolean(document.querySelector('input[placeholder="Store / Company Name"]'))`));
  await type('input[placeholder="Store / Company Name"]', 'Browser Bakery');
  check('there is no username field: the account is the name', !(await page.eval(`Boolean(document.querySelector('input[placeholder="Your Username"]'))`)));
  for (let i = 0; i < 20 && !(await page.eval(`Boolean(document.querySelector('[data-testid="claim-hold"]'))`)); i++) await sleep(250);
  await sleep(1500); // the server hold is taken a moment after the setup starts
  const held = await (await fetch(`http://localhost:${apiPort}/plots/${lot.id}/hold`)).json();
  check('setting it up holds the plot on the server', held.held === true && held.secondsLeft > 0, JSON.stringify(held));
  await page.eval(`[...document.querySelectorAll('button[type=submit]')].find((b) => /Claim/.test(b.textContent)).click()`);
  for (let i = 0; i < 20 && !(await page.eval(`Boolean(window.__vvStore.getState().plots.find((q) => q.id === ${lot.id}).owner)`)); i++) await sleep(500);
  check('the claim goes through and the plot is yours', await page.eval(`(() => { const p = window.__vvStore.getState().plots.find((q) => q.id === ${lot.id}); return p.owner === 'BrowserBaker' && p.userClaimed && p.title === 'Browser Bakery'; })()`));
  check('the form is gone', !(await page.eval(`document.body.innerText.includes('Sign in to continue')`)));
  const server = await (await fetch(`http://localhost:${apiPort}/plots/${lot.id}`)).json();
  check('the server has the claim', server.owner === 'BrowserBaker' && server.title === 'Browser Bakery');

  // another visitor (a second page, no account) sees it after a sync, and is not asked to sign in to look
  const other = await openPage(`http://localhost:${webPort}/?diag=1&view=iso&spawn=fixed&mp=${mpPort}`, { width: 1200, height: 800 });
  for (let i = 0; i < 120 && !(await other.eval(`Boolean(window.__vvStore && window.__vvStore.getState().plots.find((q) => q.id === ${lot.id})?.owner)`).catch(() => false)); i++) await sleep(500);
  check('a second visitor sees the new building without signing in', await other.eval(`(() => { const p = window.__vvStore.getState().plots.find((q) => q.id === ${lot.id}); return p.owner === 'BrowserBaker' && !p.userClaimed; })()`));
  check('and no console errors on either page', page.problems().length === 0 && other.problems().length === 0, [...page.problems(), ...other.problems()].slice(0, 2).join(' | '));
  // ---- the storefront of a business: offers and the feedback board come from the server
  const biz = JSON.parse(await other.eval(`JSON.stringify((() => { const p = window.__vvStore.getState().plots.find((q) => q.owner && q.generated && q.brand?.coupon); return { id: p.id, title: p.title }; })())`));
  await other.eval(`window.__vvStore.getState().openInterior(window.__vvStore.getState().plots.find((q) => q.id === ${biz.id}))`);
  // the storefront loads its 3D scene and then asks the server: wait for it (up to 30 s on a slow machine) rather than a fixed time
  const storefrontReady = () => other.eval(`(() => { const t = document.body.innerText.toLowerCase(); return t.includes('feedback board') && t.includes('claim coupon') && t.includes('get updates'); })()`).catch(() => false);
  let shown = false;
  for (let i = 0; i < 60 && !(shown = await storefrontReady()); i++) await sleep(500);
  check('a business\'s storefront shows its offer and a feedback board (from the server)', shown);
  await type2(other, 'input[aria-label="Feedback"]', 'Lovely place, will be back.');
  await other.eval(`[...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === 'Post').click()`);
  await sleep(800);
  check('posting feedback asks for a sign-in, only now', await other.eval(`document.body.innerText.includes('Sign in to continue')`));
  await type2(other, 'input[aria-label="Name"]', 'FeedbackFan');
  await type2(other, 'input[aria-label="Password"]', 'longenough1');
  await other.eval(`[...document.querySelectorAll('[role=dialog] button[type=submit]')][0].click()`);
  for (let i = 0; i < 20 && !(await other.eval(`document.body.innerText.includes('Lovely place, will be back.')`)); i++) await sleep(500);
  check('after signing in the post goes through and appears on the board', await other.eval(`document.body.innerText.includes('Lovely place, will be back.') && document.body.innerText.includes('FeedbackFan')`));
  const sf = await (await fetch(`http://localhost:${apiPort}/plots/${biz.id}/storefront`)).json();
  check('the server holds the message', sf.feedback.some((f) => f.author === 'FeedbackFan'));
  await other.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Claim coupon')?.click()`);
  await sleep(800);
  check('claiming the coupon shows the code', await other.eval(`/[A-Z]{2,4}-\\d{2,3}/.test([...document.querySelectorAll('aside')].find((a) => /storefront/i.test(a.innerText))?.innerText ?? '')`));
  await other.eval(`window.__vvStore.getState().closeInterior(); window.__vvPanel.getState().open('account')`);
  for (let i = 0; i < 30; i++) { // (the panel can take a while to fill on a slow machine)
    if (await other.eval(`/Welcome Credits/.test(document.querySelector('[data-testid="side-panel"]')?.innerText ?? '')`).catch(() => false)) break;
    await sleep(500);
  }
  const acct = await other.eval(`document.querySelector('[data-testid="side-panel"]').innerText`);
  check('the Account view shows the name, email notices and the quest wallet (100 starter Credits)', /FeedbackFan/.test(acct) && /Email notices/.test(acct) && /Quest wallet/.test(acct) && /Welcome Credits/.test(acct) && /100/.test(acct), JSON.stringify(acct.slice(0, 400)));
  check('the Account view has the sign-ups screen and calls the server money Credits', /Your sign-ups/.test(acct) && /Quest wallet/.test(acct) && /Credits/.test(acct) && /separate from the Gold/.test(acct));
  check('...and the owner of a plot sees it listed there', await other.eval(`document.querySelector('[data-testid="my-leads"]') !== null`));
  await type2(other, 'input[aria-label="Email address"]', 'fan@example.com');
  await other.eval(`[...document.querySelectorAll('[data-testid="side-panel"] button')].find((b) => b.textContent.trim() === 'Save').click()`);
  for (let i = 0; i < 30 && !(await other.eval(`document.body.innerText.includes('open it to confirm')`)); i++) await sleep(500); // (a slow machine)
  check('saving an email asks them to confirm it', await other.eval(`document.body.innerText.includes('open it to confirm')`));
  await other.eval(`window.__vvPanel.getState().open('online')`);
  await sleep(600);
  check('the Online view links to the chat', await other.eval(`Boolean(document.querySelector('[data-testid="open-chat"]'))`));

  // ---- chat: both pages are signed in (BrowserBaker on `page`, FeedbackFan on `other`) and stand near each other
  const panelText = (pg) => pg.eval(`document.querySelector('[data-testid="side-panel"]')?.innerText ?? ''`);
  const waitFor = async (pg, expr, seconds = 15) => { for (let i = 0; i < seconds * 4; i++) { if (await pg.eval(expr).catch(() => false)) return true; await sleep(250); } return false; };
  const clickText = (pg, scope, text) => pg.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); b?.click(); return Boolean(b); })()`);
  for (const pg of [page, other]) await pg.eval(`window.__vvStore.getState().closeInterior?.(); window.__vvPanel.getState().open('chat')`);
  await other.eval(`document.querySelector('[data-testid="open-chat"]')?.click()`);
  check('the Chat panel opens on Nearby with its message box (signed in, so allowed to talk)', await waitFor(other, `Boolean(document.querySelector('[data-testid="chat-view"] input[aria-label="Chat message"]:not([disabled])'))`));
  await type2(other, 'input[aria-label="Chat message"]', 'Hello from the browser');
  await other.eval(`document.querySelector('[data-testid="chat-view"] button[aria-label="Send"]').click()`);
  check('the line shows as sent for the speaker', await waitFor(other, `document.querySelector('[data-testid="chat-log"]').innerText.includes('Hello from the browser') && !document.querySelector('[data-testid="chat-log"]').innerText.includes('Sending')`));
  check('the other player hears it, with the speaker\'s account name and a verified mark', await waitFor(page, `(() => { const log = document.querySelector('[data-testid="chat-log"]'); return log && log.innerText.includes('Hello from the browser') && log.innerText.includes('FeedbackFan') && Boolean(log.querySelector('[aria-label="signed-in account"]')); })()`));
  await page.eval(`document.querySelector('[data-testid="chat-log"] button[aria-haspopup="menu"]').click()`);
  await sleep(200);
  check('their message has a menu with Message privately, Hide, Block and Report', /Message privately[\s\S]*Hide this player[\s\S]*Block[\s\S]*Report/.test(await panelText(page)));
  await clickText(page, '[role="menu"] button', 'Message privately');
  check('Message privately opens a new message to them', await waitFor(page, `document.querySelector('[data-testid="side-panel"]').innerText.includes('To FeedbackFan')`));
  await type2(page, 'textarea[aria-label="Message to FeedbackFan"]', 'Hi! Want to see my bakery?');
  await page.eval(`document.querySelector('[data-testid="chat-view"] button[aria-label="Send"]').click()`);
  check('it is sent and the conversation opens', await waitFor(page, `(() => { const t = document.querySelector('[data-testid="side-panel"]').innerText; return t.includes('Hi! Want to see my bakery?') && t.includes('Waiting for FeedbackFan to accept'); })()`));
  check('the recipient\'s Chat button shows a badge at once (the presence server\'s nudge)', await waitFor(other, `document.querySelector('[data-testid="chat-badge"]')?.textContent === '1'`, 8));
  await other.eval(`document.querySelector('[data-testid="chat-tab-inbox"]').click()`);
  await sleep(300);
  await clickText(other, '[data-testid="chat-view"] [role="tab"]', 'Requests1');
  check('it waits in their Requests', await waitFor(other, `document.querySelector('[data-testid="side-panel"]').innerText.includes('BrowserBaker')`));
  await other.eval(`[...document.querySelectorAll('[data-testid="chat-view"] ul button')].find((b) => b.innerText.includes('BrowserBaker')).click()`);
  check('opening it shows the message and Accept / Decline', await waitFor(other, `(() => { const t = document.querySelector('[data-testid="side-panel"]').innerText; return t.includes('Hi! Want to see my bakery?') && t.includes('Accept') && t.includes('Decline'); })()`));
  await type2(other, 'textarea[aria-label="Message to BrowserBaker"]', 'Yes please!');
  await other.eval(`document.querySelector('[data-testid="chat-view"] button[aria-label="Send"]').click()`);
  check('replying accepts, and the badge clears once it is read', await waitFor(other, `!document.querySelector('[data-testid="side-panel"]').innerText.includes('Decline') && !document.querySelector('[data-testid="chat-badge"]')`));
  check('the reply reaches the sender\'s open conversation by itself', await waitFor(page, `(() => { const t = document.querySelector('[data-testid="side-panel"]').innerText; return t.includes('Yes please!') && !t.includes('Waiting for'); })()`));
  // a question for a building's owner, from its card
  await other.eval(`window.__vvStore.getState().setSelectedPlot(window.__vvStore.getState().plots.find((q) => q.id === ${lot.id}))`);
  check('a building a player owns has Message the owner on its card', await waitFor(other, `Boolean(document.querySelector('[data-testid="message-owner"]'))`));
  await other.eval(`document.querySelector('[data-testid="message-owner"]').click()`);
  check('it opens a message to the owner of that building', await waitFor(other, `document.querySelector('[data-testid="side-panel"]').innerText.includes('To the owner of Browser Bakery')`));
  await type2(other, 'textarea[aria-label="Message to the owner of Browser Bakery"]', 'Do you sell rye bread?');
  await other.eval(`document.querySelector('[data-testid="chat-view"] button[aria-label="Send"]').click()`);
  check('the owner is told at once', await waitFor(page, `Boolean(document.querySelector('[data-testid="chat-badge"]'))`, 8));
  check('no console errors on either page during chat', page.problems().length === 0 && other.problems().length === 0, [...page.problems(), ...other.problems()].slice(0, 2).join(' | '));
  check('no console errors during the storefront, account and chat steps either', other.problems().length === 0, other.problems().slice(0, 2).join(' | '));

  // ---- conversion measurement (docs/monetization/conversions.md): the owner of Browser Bakery gives it a business profile linked to the building,
  // then a fresh visitor sees it in a list, stays on its page, presses its button, and another walks into the 3D storefront
  const api = async (method, p, body) => (await fetch(`http://localhost:${apiPort}${p}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bakerToken}` }, body: body && JSON.stringify(body) })).json();
  const bakerToken = await page.eval(`localStorage.getItem('voxelventure-token')`);
  await api('POST', '/businesses', { name: 'Browser Bakery', category: 'food', website: 'https://bakery.test', cta: { kind: 'order', url: 'https://bakery.test/shop' } });
  await api('PUT', '/businesses/browser-bakery/plot', { plotId: lot.id });
  const figures = async () => (await api('GET', '/me/businesses')).profiles.find((x) => x.profile.slug === 'browser-bakery').stats;
  const until = async (test, seconds = 30) => { for (let i = 0; i < seconds * 2; i++) { if (test(await figures())) return true; await sleep(500); } return false; };
  // (an ordinary browser's user agent: the server does not count headless Chrome as a human visitor)
  const visitor = await openPage(`http://localhost:${webPort}/discover`, { width: 1200, height: 1400, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  check('a card on screen in Discover counts as an impression', await until((f) => f.impressions >= 1));
  await visitor.eval(`location.href = '/business/browser-bakery'; 1`);
  check('opening the profile counts a visit', await until((f) => f.views >= 1));
  check('staying 15 seconds makes it a qualified visit', await until((f) => f.qualified >= 1, 40));
  const href = await visitor.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => x.textContent.includes('Order online')); a.click(); return a.href; })()`);
  const pressedAt = Date.now();
  check('pressing the button counts it, and its link carries the click id', /^https:\/\/bakery\.test\/shop\?vv_click=[A-Za-z0-9]{10,32}$/.test(href) && (await until((f) => f.ctaClicks >= 1)), href);
  check('no console errors on the business pages', visitor.problems().length === 0, visitor.problems().slice(0, 2).join(' | '));
  // the same visitor goes into the 3D city: walking into the building and pressing its website link count for the profile too
  await visitor.eval(`location.href = '/?diag=1&view=iso&spawn=fixed&mp=${mpPort}'; 1`);
  check('the city knows the building is linked to the profile', await waitFor(visitor, `Boolean(window.__vvStore) && window.__vvStore.getState().plots.find((q) => q.id === ${lot.id})?.profileSlug === 'browser-bakery'`, 60));
  await visitor.eval(`window.__vvStore.getState().openInterior(window.__vvStore.getState().plots.find((q) => q.id === ${lot.id}))`);
  check('walking into the 3D storefront is a store entry for the profile', await until((f) => f.storeEntries >= 1));
  await sleep(Math.max(0, pressedAt + 61000 - Date.now())); // the same visitor pressing twice within a minute is one press
  const cityHref = (await waitFor(visitor, `Boolean([...document.querySelectorAll('a')].find((x) => /Visit Official Website/.test(x.textContent)))`)) && (await visitor.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => /Visit Official Website/.test(x.textContent)); a.click(); return a.href; })()`));
  check('pressing the website link inside it is a press for the profile, from the city', /vv_click=/.test(String(cityHref)) && (await until((f) => f.ctaClicks >= 2)), String(cityHref));
  check('no console errors in the city during these steps', visitor.problems().length === 0, visitor.problems().slice(0, 2).join(' | '));
  // a signed-in player opens the market: the panel asks the API about an admin session, and shows no editor
  await page.eval(`(() => { const a = window.__vvStore.getState().layout.reserved.find((r) => r.market); window.__vvPanel.getState().editReserved(a.id); })()`);
  check('market: a player never sees the weekly layout editor', (await waitFor(page, `window.__vvMarket.getState().adminChecked && Boolean(window.__vvMarket.getState().data)`, 30)) && (await page.eval(`!window.__vvMarket.getState().isAdmin() && !document.querySelector('[data-testid="market-admin-tabs"], [data-testid="market-editor"], [data-testid="market-admin-sign-in"]') && !/Set up weeks|Admin token/.test(document.body.innerText)`)));
  await visitor.close();
  await page.close();
  await other.close();

  // ---- the admin sign-in, for real (services/api/admin.mjs, apps/web/app/admin): the site and the API on two origins of the same site, the
  // session in an HttpOnly cookie on the API's host, sent back with credentials: 'include'
  const ADMIN_PW = 'browser admin password';
  const adm = await openPage(`http://localhost:${webPort}/admin/economy`, { width: 390, height: 800, mobile: true });
  check('admin: an admin page without a session goes to the sign-in', await waitFor(adm, `location.pathname === '/admin/login' && new URLSearchParams(location.search).get('next') === '/admin/economy'`, 30));
  check('admin: with no admin account yet, the sign-in points to the setup', await waitFor(adm, `Boolean(document.querySelector('[data-testid="admin-setup-needed"] a[href="/admin/setup"]'))`, 20));
  await adm.eval(`location.href = '/admin/setup'; 1`);
  await waitFor(adm, `document.querySelector('[data-testid="admin-setup-form"]')?.dataset.ready === '1'`, 20);
  await type2(adm, '#token', ADMIN_TOKEN);
  await type2(adm, '#username', 'boss');
  await type2(adm, '#password', ADMIN_PW);
  await type2(adm, '#confirm', ADMIN_PW);
  await adm.eval(`document.querySelector('[data-testid="admin-setup-form"] button[type=submit]').click()`);
  check('admin: the setup makes the account and goes to the sign-in', await waitFor(adm, `location.pathname === '/admin/login' && location.search.includes('created=1')`, 20), await adm.eval(`location.href + ' | ' + (document.querySelector('[data-testid="admin-form-error"]')?.textContent ?? '') + ' | ' + [...document.querySelectorAll('input')].map((i) => i.id + '=' + i.value.length).join(',')`).catch((e) => e.message));
  const stored = await adm.eval(`JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie])`);
  check('admin: the token is kept nowhere in the browser, not even in the address', !stored.includes(ADMIN_TOKEN) && !(await adm.eval('location.href')).includes(ADMIN_TOKEN));
  // the market editor's link with no session (components/ui/panel/MarketPanel.jsx): "Sign in as an admin", back to the game, and no editor
  await adm.eval(`location.href = '/?market=edit&diag=1&view=iso&spawn=fixed&mp=${mpPort}'; 1`);
  check('market: the editor link without a session shows "Sign in as an admin", back to the game', await waitFor(adm, `document.querySelector('[data-testid="market-admin-sign-in"] a')?.getAttribute('href') === '/admin/login?next=' + encodeURIComponent('/?market=edit')`, 90), await adm.eval(`location.href + ' | ' + JSON.stringify({ checked: window.__vvMarket?.getState().adminChecked, view: window.__vvPanel?.getState().view })`).catch((e) => e.message));
  check('market: and no editor, no tabs', await adm.eval(`!document.querySelector('[data-testid="market-editor"], [data-testid="market-admin-tabs"]') && !/Admin token/.test(document.body.innerText)`));
  await adm.eval(`location.href = '/admin/login?next=' + encodeURIComponent('/admin/economy'); 1`);
  await waitFor(adm, `document.querySelector('[data-testid="admin-login-form"]')?.dataset.ready === '1' && !document.querySelector('[data-testid="admin-login-form"] fieldset').disabled`, 20);
  await type2(adm, '#username', 'boss');
  await type2(adm, '#password', 'not the password');
  await adm.eval(`document.querySelector('[data-testid="admin-login-form"] button[type=submit]').click()`);
  check('admin: a wrong password shows an error on the form', await waitFor(adm, `/did not work/.test(document.querySelector('[data-testid="admin-form-error"]')?.textContent ?? '')`, 20));
  await type2(adm, '#password', ADMIN_PW);
  await adm.eval(`document.querySelector('[data-testid="admin-login-form"] button[type=submit]').click()`);
  check('admin: signing in goes back to the page asked for', await waitFor(adm, `location.pathname === '/admin/economy' && document.querySelector('[data-testid="admin-user"]')?.textContent === 'boss'`, 20));
  check('admin: the page shows the API\'s figures with the session alone', await waitFor(adm, `/By tier/.test(document.body.innerText)`, 20));
  check('admin: the session cookie cannot be read by the page', !(await adm.eval(`document.cookie`)).includes('vv_admin'));
  // the market editor in the game, with the session (lib/state/marketStore.js): from the Overview's link, the editor opens and a week is saved
  await adm.eval(`location.href = '/admin'; 1`);
  check('market: the Overview links to the market editor in the game', await waitFor(adm, `document.querySelector('[data-testid="admin-market-editor"]')?.getAttribute('href') === '/?market=edit'`, 20));
  await adm.eval(`location.href = '/?market=edit&diag=1&view=iso&spawn=fixed&mp=${mpPort}'; 1`);
  check('market: signed in, the link opens the weekly layout editor', await waitFor(adm, `Boolean(document.querySelector('[data-testid="market-editor"]')) && Boolean(document.querySelector('[data-testid="market-admin-tabs"]')) && window.__vvMarket.getState().admin?.username === 'boss'`, 90));
  await adm.eval(`[...document.querySelectorAll('[data-testid="market-editor"] button')].find((b) => b.textContent.trim() === 'Save draft').click()`);
  check('market: the editor saves the week with the session alone', await waitFor(adm, `/Saved as a draft/.test(window.__vvMarket.getState().notice?.text ?? '')`, 20), await adm.eval(`JSON.stringify(window.__vvMarket.getState().notice)`).catch((e) => e.message));
  const saved = await (await fetch(`http://localhost:${apiPort}/admin/market?week=${await adm.eval('window.__vvMarket.getState().week')}`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
  check('market: and the server has the admin\'s layout', JSON.stringify(saved).includes('"source":"admin"'), JSON.stringify(saved).slice(0, 200));
  const marketStored = await adm.eval(`JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), Object.values(localStorage), Object.values(sessionStorage), document.cookie])`);
  check('market: nothing about the admin is kept in the browser (no token, no admin key)', !marketStored.includes(ADMIN_TOKEN) && !marketStored.includes('voxelventure-admin') && !marketStored.includes('vv_admin') && !/"admin":\{/.test(marketStored), marketStored.slice(0, 200));
  await adm.eval(`location.href = '/admin/economy'; 1`);
  await waitFor(adm, `document.querySelector('[data-testid="admin-user"]')?.textContent === 'boss'`, 20);
  // the dashboard's frame on a phone (components/admin/AdminShell.jsx): the pages behind a menu button, in a drawer that Escape closes
  check('admin: on a phone the page fits (no sideways scroll) and the nav is behind a menu button', await adm.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1 && Boolean(document.querySelector('[data-testid="admin-menu"]')) && !document.querySelector('[data-testid="admin-drawer"]')`));
  await adm.eval(`document.querySelector('[data-testid="admin-menu"]').click()`);
  check('admin: the menu opens the drawer, the current page marked and focused', await waitFor(adm, `(() => { const cur = document.querySelector('[data-testid="admin-drawer"] a[aria-current="page"]'); return cur?.getAttribute('href') === '/admin/economy' && document.activeElement === cur && document.getElementById('admin-shell').hasAttribute('inert'); })()`, 10));
  await adm.key('Escape');
  check('admin: Escape closes the drawer and gives the focus back to the menu button', await waitFor(adm, `!document.querySelector('[data-testid="admin-drawer"]') && document.activeElement === document.querySelector('[data-testid="admin-menu"]') && !document.getElementById('admin-shell').hasAttribute('inert')`, 10));
  await adm.eval(`document.querySelector('[data-testid="admin-sign-out"]').click()`);
  check('admin: signing out goes to the sign-in', await waitFor(adm, `location.pathname === '/admin/login' && location.search.includes('signedOut=1')`, 20));
  await adm.eval(`location.href = '/admin/economy'; 1`);
  check('admin: and the admin pages are closed again', await waitFor(adm, `location.pathname === '/admin/login'`, 20));
  check('admin: no console errors on the admin pages', adm.problems().filter((p) => !/401|403|Failed to load resource/.test(p)).length === 0, adm.problems().slice(0, 3).join(' | '));
  await adm.close();
} catch (e) {
  fails++;
  console.log('FAIL the live browser test crashed:', e.stack);
} finally {
  for (const c of children) c.kill();
  await sleep(300);
  fs.rmSync(logDir, { recursive: true, force: true });
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
