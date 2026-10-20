// Records a guided demo tour (docs/product/pilot_tour.md) for sales material: a screenshot of every stop, and with --frames a numbered frame
// sequence of the whole run, into artifacts/tour/<time>/, with a Markdown storyboard of the captions beside the pictures.
//
//   npm run build && node scripts/tour-record.mjs            a local production build (demo mode unless it was built with the API), the pilot tour
//   node scripts/tour-record.mjs --url http://localhost:3000 a running site (a dev server, staging); the tour is read-only, so it changes nothing there
//   options: --tour <id> (default pilot), --width 1600 --height 900, --phone (a 412x915 touch phone), --gpu (this machine's graphics card instead
//            of the SwiftShader software renderer), --frames (also a frame sequence), --fps <n> (frames per second, default 4), --settle <ms>
//            (how long each stop is left to load before its picture, default 3500), --out <dir>
//
// It opens /?tour=<id>, pauses the tour's own clock, and for each stop waits until the camera has arrived (data-tour-arrived on the caption
// card) and what the stop opened has loaded, takes the picture and presses → for the next. Console errors are written to console.txt and
// reported; the exit code is 1 if a stop was not reached. To make a video from the frames: ffmpeg -framerate 4 -i frames/%05d.jpg tour.mp4
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { imp, root, sleep } from './lib-loader.mjs';
import { findBrowser, openPage } from '../tests/browser-driver.mjs';

const { tourById } = await imp('tour/tours.js');
const { totalMs } = await imp('tour/plan.js');

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const tourId = opt('tour', 'pilot');
const tour = tourById(tourId);
if (!tour) {
  console.log(`no tour called "${tourId}" (lib/tour/tours.js)`);
  process.exit(1);
}
const phone = flag('phone');
const width = Number(opt('width', phone ? 412 : 1600));
const height = Number(opt('height', phone ? 915 : 900));
const fps = Math.min(15, Math.max(1, Number(opt('fps', 4))));
const settle = Number(opt('settle', 3500));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(opt('out', path.join(root, 'artifacts', 'tour', stamp)));
const remote = opt('url');

if (!findBrowser()) {
  console.log('no Edge or Chrome found (set BROWSER_PATH)');
  process.exit(1);
}

// ---- the site: a running one, or this checkout's production build on a free port
const children = [];
let base = remote ? remote.replace(/\/$/, '') : null;
if (!base) {
  if (!fs.existsSync(path.join(root, 'apps', 'web', '.next', 'BUILD_ID'))) {
    console.log('no production build: run `npm run build` first (or pass --url)');
    process.exit(1);
  }
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  children.push(spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', 'apps/web', '-p', String(port)], { cwd: root, stdio: 'ignore' }));
  base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/`)).ok) break;
    } catch {
      /* starting */
    }
    await sleep(500);
  }
}
const stopAll = () => children.forEach((c) => c.kill());
process.on('exit', stopAll);

const waitFor = async (page, expression, seconds = 120) => {
  for (let i = 0; i < seconds * 4; i++) {
    try {
      if (await page.eval(expression)) return true;
    } catch {
      /* not ready */
    }
    await sleep(250);
  }
  return false;
};
const caption = (attr) => `document.querySelector('[data-testid="tour-caption"]')?.getAttribute('${attr}')`;

fs.mkdirSync(outDir, { recursive: true });
const url = `${base}/?tour=${encodeURIComponent(tour.id)}`;
console.log(`recording "${tour.title}" (${tour.stops.length} stops, about ${Math.round(totalMs(tour) / 1000)} s live) from ${url}\n  into ${outDir}`);
const page = await openPage(url, { width, height, mobile: phone, gpu: flag('gpu') });

// the frame sequence: a screenshot every 1/fps seconds while the tour runs (captureScreenshot, so it is what the page shows, captions included)
let recording = flag('frames');
let frameNo = 0;
const framesDir = path.join(outDir, 'frames');
const frameLoop = (async () => {
  if (!recording) return;
  fs.mkdirSync(framesDir, { recursive: true });
  while (recording) {
    const t0 = Date.now();
    try {
      const r = await page.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
      fs.writeFileSync(path.join(framesDir, `${String(++frameNo).padStart(5, '0')}.jpg`), Buffer.from(r.data, 'base64'));
    } catch {
      /* the page is between documents */
    }
    await sleep(Math.max(0, 1000 / fps - (Date.now() - t0)));
  }
})();

const shots = [];
let reached = 0;
try {
  if (!(await waitFor(page, `${caption('data-tour-step')} === '1'`, 180))) throw new Error('the tour did not start (no caption card): is the city drawing?');
  await page.eval(`document.querySelector('[data-testid="tour-pause"]').click()`); // the recorder moves on by itself, when each stop is ready
  for (let i = 0; i < tour.stops.length; i++) {
    const s = tour.stops[i];
    const here = await waitFor(page, `${caption('data-tour-stop')} === ${JSON.stringify(s.id)} && ${caption('data-tour-arrived')} === '1'`, 60);
    if (!here) {
      console.log(`  ${i + 1}. ${s.id}: NOT REACHED`);
      break;
    }
    // what the stop opened has loaded: a page in the frame, a room, a preview
    if (s.action?.kind === 'page') await waitFor(page, `(() => { const f = document.querySelector('[data-testid="tour-frame"]'); return f && f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentDocument.querySelector('main') })()`, 30);
    if (['dashboard', 'claim', 'cart'].includes(s.action?.kind)) await waitFor(page, `Boolean(document.querySelector('[data-testid="tour-${s.action.kind === 'dashboard' ? 'figures' : s.action.kind}"]'))`, 20);
    await sleep(settle);
    const file = `${String(i + 1).padStart(2, '0')}-${s.id}.png`;
    await page.screenshot(path.join(outDir, file));
    shots.push({ stop: s, file });
    reached++;
    console.log(`  ${i + 1}. ${s.id}: ${file}`);
    if (i < tour.stops.length - 1) await page.key('ArrowRight');
  }
} catch (e) {
  console.log(`  ${e.message}`);
} finally {
  recording = false;
  await frameLoop;
  const problems = page.problems();
  fs.writeFileSync(path.join(outDir, 'console.txt'), page.consoleLines.join('\n'));
  await page.close();
  stopAll();

  const action = (a) => (!a ? '' : a.kind === 'page' ? `opens ${a.path}` : `opens the ${{ card: 'building card', interior: 'room inside', claim: 'claim form (preview)', dashboard: 'owner dashboard (preview)', cart: 'cart (preview)' }[a.kind]}${a.plot != null ? ` of plot ${a.plot}` : ''}`);
  const md = [
    `# ${tour.title}: storyboard`,
    '',
    `Recorded ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from ${base} (seed ${tour.seed}, ${width}×${height}${phone ? ', phone' : ''}). ${tour.description ?? ''}`,
    '',
    `Live, the tour takes about ${Math.round(totalMs(tour) / 1000)} seconds: \`/?tour=${tour.id}\`, then ← → to move, Space to pause, Esc to leave (docs/product/pilot_tour.md).`,
    recording === false && frameNo ? `\nFrames: ${frameNo} in \`frames/\` at ${fps} per second. A video: \`ffmpeg -framerate ${fps} -i frames/%05d.jpg -pix_fmt yuv420p tour.mp4\`.` : '',
    '',
    ...shots.flatMap(({ stop: s, file }, i) => [`## ${i + 1}. ${s.title}`, '', s.text, '', `![${s.title}](${file})`, '', `<sub>${[`${s.durationMs / 1000} s`, `camera: ${s.camera.view}`, action(s.action)].filter(Boolean).join(' · ')}</sub>`, '']),
    problems.length ? `## Console errors\n\n${problems.map((p) => `- ${p}`).join('\n')}\n` : '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'storyboard.md'), md);
  console.log(`\n${reached} of ${tour.stops.length} stops recorded${frameNo ? `, ${frameNo} frames` : ''}; ${problems.length} console error${problems.length === 1 ? '' : 's'}${problems.length ? ` (first: ${problems[0]})` : ''}\n  ${path.join(outDir, 'storyboard.md')}`);
  process.exitCode = reached === tour.stops.length ? 0 : 1;
}
