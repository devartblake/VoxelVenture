// What this device can do, as one plain object (docs/architecture/performance_policy.md).
//
//   buildCapabilityProfile(raw)  pure: normalizes what was read into a profile (tested in Node: tests/performance-policy.test.mjs)
//   readBrowserCapabilities(gl)  browser only: reads the pointer, pixel ratio, viewport, reduced motion, memory and core hints,
//                                and (given the renderer's WebGL context) the GPU's renderer string
//   createFrameWindow(seconds)   a rolling window of frame times, for the measured frame rate
//
// The decisions made from a profile are in qualityPolicy.js (how much to draw) and visibilityPolicy.js (when to pause).
// The profile never looks at the user-agent string: a phone is recognized by its coarse pointer and small screen, a weak
// machine by its memory and core hints, its software renderer and, above all, by the frame rate it actually reaches.

// Media queries, shared by everything that asks "is this a touch device?" (the canvas, the touch controls, the telemetry).
export const COARSE_POINTER_QUERY = '(pointer: coarse)';
export const FINE_POINTER_QUERY = '(any-pointer: fine)';
export const TOUCH_UI_QUERY = '(pointer: coarse), (max-width: 639px)'; // the on-screen joystick: touch devices and narrow windows
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// A renderer string naming a software rasterizer (no GPU): SwiftShader (Chrome without a usable GPU, and headless test
// browsers), llvmpipe/softpipe (Mesa), Microsoft Basic Render Driver (Windows without a display driver).
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software rasterizer|basic render|microsoft basic/i;

// The shortest side, in CSS pixels, below which a screen counts as small (a phone held either way; not a tablet or a laptop).
export const SMALL_SCREEN_SIDE = 600;

const positive = (v, fallback = null) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);

export function isSoftwareRenderer(renderer) {
  return SOFTWARE_RENDERER.test(String(renderer ?? ''));
}

// raw: { coarsePointer, finePointer, dpr, viewport: { width, height }, reducedMotion, deviceMemory, hardwareConcurrency, saveData,
//        webgl: null (not read yet) | { available, version, renderer, vendor, maxTextureSize } }
export function buildCapabilityProfile(raw = {}) {
  const width = positive(raw.viewport?.width, 0);
  const height = positive(raw.viewport?.height, 0);
  const coarsePointer = Boolean(raw.coarsePointer);
  let webgl = null;
  if (raw.webgl) {
    const renderer = String(raw.webgl.renderer ?? '').slice(0, 160);
    webgl = {
      available: raw.webgl.available !== false,
      version: raw.webgl.version === 1 ? 1 : 2,
      renderer,
      vendor: String(raw.webgl.vendor ?? '').slice(0, 80),
      maxTextureSize: positive(raw.webgl.maxTextureSize),
      software: isSoftwareRenderer(renderer),
    };
  }
  return {
    coarsePointer,
    finePointer: typeof raw.finePointer === 'boolean' ? raw.finePointer : !coarsePointer,
    dpr: positive(raw.dpr, 1),
    viewport: { width, height },
    smallScreen: width > 0 && height > 0 && Math.min(width, height) < SMALL_SCREEN_SIDE,
    reducedMotion: Boolean(raw.reducedMotion),
    deviceMemory: positive(raw.deviceMemory), // GB, rounded down by the browser (Chrome only: 0.25 to 8)
    hardwareConcurrency: positive(raw.hardwareConcurrency),
    saveData: Boolean(raw.saveData),
    webgl,
  };
}

// The renderer's WebGL details. The unmasked renderer string needs WEBGL_debug_renderer_info (Chrome, Edge, Safari);
// Firefox gives a sanitized string from RENDERER itself.
export function readWebGLInfo(context) {
  if (!context || typeof context.getParameter !== 'function') return { available: false };
  try {
    const ext = context.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? context.getParameter(ext.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER);
    const vendor = ext ? context.getParameter(ext.UNMASKED_VENDOR_WEBGL) : context.getParameter(context.VENDOR);
    const version = typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext ? 2 : 1;
    return { available: true, version, renderer, vendor, maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE) };
  } catch {
    return { available: true, renderer: '', vendor: '' };
  }
}

// Reads the browser (after mount: the server render cannot know). `context` is the renderer's WebGL context, or nothing
// before the canvas exists (the profile then has `webgl: null` and is refined once it does).
export function readBrowserCapabilities(context = null) {
  const media = (q) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  return buildCapabilityProfile({
    coarsePointer: media(COARSE_POINTER_QUERY),
    finePointer: media(FINE_POINTER_QUERY),
    dpr: window.devicePixelRatio || 1,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    reducedMotion: media(REDUCED_MOTION_QUERY),
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    saveData: Boolean(nav.connection?.saveData),
    webgl: context ? readWebGLInfo(context) : null,
  });
}

// Percentiles of a list of frame times (ms).
export function frameTimeStats(samples) {
  const n = samples.length;
  if (!n) return { frames: 0, fps: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
  const total = samples.reduce((s, v) => s + v, 0);
  const round = (v) => Math.round(v * 100) / 100;
  return { frames: n, fps: round(total > 0 ? (n * 1000) / total : 0), p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted[n - 1]), mean: round(total / n) };
}

// A window of the latest frame times covering `seconds` of frames: push(ms) each frame; full() once it spans the window.
export function createFrameWindow(seconds = 2) {
  let samples = [];
  let total = 0;
  const span = seconds * 1000;
  return {
    push(ms) {
      if (!(ms > 0) || ms > 1000) return; // a stalled tab or a debugger pause is not a frame
      samples.push(ms);
      total += ms;
    },
    full: () => total >= span,
    stats: () => frameTimeStats(samples),
    clear() {
      samples = [];
      total = 0;
    },
  };
}
