// A minimal Chrome DevTools Protocol driver for headless Edge / Chrome: open a page (optionally as an emulated
// phone with touch), evaluate expressions, click, take screenshots, collect console messages.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { sleep } from './helpers.mjs';

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export const findBrowser = () => CANDIDATES.find((p) => fs.existsSync(p));

let nextPort = 9300 + Math.floor(Math.random() * 400);

// Each page gets its own temporary profile and debugging port, so it never touches (or hands off to)
// a browser you already have open.
// `userAgent`: browse as an ordinary browser (headless Chrome names itself, and the server rightly does not count its visits as human).
// webgl: false starts a browser with WebGL switched off (as on a locked-down or very old machine), for the city's fallback page
// gpu: true draws with the machine's graphics card instead of the SwiftShader software renderer the tests use (same on every
// machine), for the performance measurement (scripts/perf-measure.mjs); uncapped: true also lifts the 60 Hz frame limit, so
// a frame time is what the frame costs rather than the display's interval
export async function openPage(url, { width = 1200, height = 800, mobile = false, userAgent = null, webgl = true, gpu = false, uncapped = false } = {}) {
  const exe = findBrowser();
  if (!exe) throw new Error('no browser found (set BROWSER_PATH)');
  const port = nextPort++;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-browser-'));
  const gl = gpu ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  if (uncapped) gl.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions',
    ...(webgl ? gl : ['--disable-webgl', '--disable-3d-apis']),
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {
      /* not up yet */
    }
  }
  if (!target) {
    proc.kill();
    throw new Error('the browser did not start');
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 1 << 28 });
  await new Promise((r) => ws.on('open', r));

  let id = 0;
  const pending = new Map();
  const consoleLines = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message));
      else resolve(m.result);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      consoleLines.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await call('Runtime.enable');
  await call('Page.enable');
  if (mobile) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await call('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
  } else {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }
  if (userAgent) await call('Emulation.setUserAgentOverride', { userAgent });
  await call('Page.navigate', { url });

  return {
    consoleLines,
    /** Console errors and uncaught exceptions so far. */
    problems: () => consoleLines.filter((l) => /^(error|exception)/i.test(l)),
    eval: async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    click: async (x, y) => {
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await sleep(300);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    },
    /** Types text into whatever has the focus, as the keyboard would (pages that format what is typed, like Stripe's card field, see real input). */
    type: (text) => call('Input.insertText', { text }),
    drag: async (x, y, toX, toY) => {
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 8; i++) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + ((toX - x) * i) / 8, y: y + ((toY - y) * i) / 8, button: 'left', buttons: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', buttons: 0, clickCount: 1 });
    },
    /** A raw DevTools Protocol call, for what the helpers here do not cover (emulated media, raw touch points). */
    cdp: call,
    // Touch (a page opened with mobile: true has touch emulation on): a tap, a one-finger drag, a two-finger pinch (`scale` > 1
    // spreads the fingers apart, < 1 brings them together) and a long press. Each point is { x, y } in CSS pixels.
    tap: async (x, y) => {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(60);
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    touchDrag: async (x, y, toX, toY, steps = 10) => {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (let i = 1; i <= steps; i++) {
        await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + ((toX - x) * i) / steps, y: y + ((toY - y) * i) / steps, id: 1 }] });
        await sleep(16);
      }
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    pinch: async (cx, cy, scale, { from = 60, steps = 10 } = {}) => {
      const at = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
      for (let i = 1; i <= steps; i++) {
        await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(from * (1 + ((scale - 1) * i) / steps)) });
        await sleep(16);
      }
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    longPress: async (x, y, ms = 800) => {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(ms);
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    /** A key press, as the keyboard sends it (keydown, then keyup after `hold` ms). */
    key: async (key, { code = key, hold = 0 } = {}) => {
      const text = key.length === 1 ? key : undefined;
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, windowsVirtualKeyCode: key === 'Escape' ? 27 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 });
      if (hold) await sleep(hold);
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: key === 'Escape' ? 27 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 });
    },
    screenshot: async (file) => {
      const r = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    close: async () => {
      try {
        await call('Browser.close');
      } catch {
        /* already gone */
      }
      ws.close();
      proc.kill();
      await sleep(1000); // Edge's crash reporter can still hold a file in the profile for a moment
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch {
        /* a leftover temp folder is harmless; it must not fail the test run */
      }
    },
  };
}
