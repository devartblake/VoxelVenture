// When the city's per-frame work runs (docs/architecture/performance_policy.md). Pure: tests/performance-policy.test.mjs.
//
// Every useFrame callback in the city belongs to one class (the inventory in the policy document):
//   continuous-visible   what the visitor is controlling or watching right now: the avatar, the cameras, the driven vehicle,
//                        other players. Runs every frame while the page is visible.
//   continuous-pausable  decoration and ambient simulation: spinning gems, flags, rides, water, traffic, animals, planes,
//                        signals, the sky. Paused while the world is covered, throttled by the tier, and (ornaments only)
//                        held still for prefers-reduced-motion.
//   event-driven         polls that only act when something changed (a camera glide, the compass, the sound listener, a
//                        mall's doorway, the streamed chunks). Cheap; runs every frame while the page is visible.
//   diagnostics          the renderer counters (PerfProbe). Sampled at the tier's rate.
//
// A loop is described as { cls, kind: 'ornament' | 'simulation', distant: boolean } (kind and distant matter only for the
// pausable class). loopCadence() answers 0 (do not run) or N (run every Nth frame, with the time of the skipped frames added up).

export const LOOP = Object.freeze({
  VISIBLE: 'continuous-visible',
  PAUSABLE: 'continuous-pausable',
  EVENT: 'event-driven',
  DIAGNOSTICS: 'diagnostics',
});

// The loop descriptions the city's components use (see the inventory).
export const LOOPS = Object.freeze({
  visible: Object.freeze({ cls: LOOP.VISIBLE }),
  event: Object.freeze({ cls: LOOP.EVENT }),
  diagnostics: Object.freeze({ cls: LOOP.DIAGNOSTICS }),
  ornament: Object.freeze({ cls: LOOP.PAUSABLE, kind: 'ornament', distant: false }),
  distantOrnament: Object.freeze({ cls: LOOP.PAUSABLE, kind: 'ornament', distant: true }),
  simulation: Object.freeze({ cls: LOOP.PAUSABLE, kind: 'simulation', distant: false }),
  distantSimulation: Object.freeze({ cls: LOOP.PAUSABLE, kind: 'simulation', distant: true }),
});

// The state of the page that matters here.
//   hidden         document.hidden (another tab, a minimized window, a locked phone)
//   covered        something covers the whole world (the storefront interior, a full-screen modal)
//   overlay        something covers part of it (the world map's veil; the side panel on a phone)
//   reducedMotion  prefers-reduced-motion: reduce
//   viewFar        the map camera is zoomed out over the city, so everything is small on screen
export function readVisibility(v = {}) {
  return { hidden: Boolean(v.hidden), covered: Boolean(v.covered), overlay: Boolean(v.overlay), reducedMotion: Boolean(v.reducedMotion), viewFar: Boolean(v.viewFar) };
}

// Why the pausable loops are slowed or stopped, for the diagnostics.
export function visibilityReasons(v) {
  const out = [];
  if (v.hidden) out.push('document-hidden');
  if (v.covered) out.push('world-covered');
  if (v.overlay) out.push('world-partly-covered');
  if (v.reducedMotion) out.push('reduced-motion');
  if (v.viewFar) out.push('zoomed-out');
  return out;
}

export function loopCadence(loop, visibility, settings) {
  const v = visibility;
  if (loop.cls === LOOP.DIAGNOSTICS) return v.hidden ? 0 : Math.max(1, settings.diagnosticSampleEvery | 0);
  if (v.hidden) return 0;
  if (loop.cls !== LOOP.PAUSABLE) return 1;
  if (v.covered) return 0;
  const ornament = loop.kind === 'ornament';
  if (ornament && v.reducedMotion) return 0;
  let every = Math.max(1, (ornament ? settings.ornamentEvery : settings.simulationEvery) | 0);
  if (loop.distant && v.viewFar) every = Math.max(every, settings.distantEvery | 0);
  if (v.overlay) every *= 2;
  return every;
}

// What the decorative animation looks like right now: 'full', 'reduced' (a lower rate) or 'still'.
export function animationLevel(visibility, settings) {
  if (visibility.hidden || visibility.covered || visibility.reducedMotion) return 'still';
  return settings.animation === 'full' && !visibility.overlay ? 'full' : 'reduced';
}

// How often the world itself is drawn: every frame, except while it is covered, when a few frames a second keep the blurred
// city behind the modal alive at a fraction of the cost. 0 while the page is hidden (the browser stops frames anyway).
export const COVERED_RENDER_EVERY = 15; // about 4 frames a second at 60 Hz
export function worldRenderEvery(visibility) {
  if (visibility.hidden) return 0;
  return visibility.covered ? COVERED_RENDER_EVERY : 1;
}

// Whether a loop runs on a given frame: `frame` is the shared frame counter, `offset` spreads the instances of one component
// over the frames, so a hundred throttled signals do not all run on the same one.
export function runsOnFrame(every, frame, offset = 0) {
  if (every <= 0) return false;
  return every === 1 || (frame + offset) % every === 0;
}
