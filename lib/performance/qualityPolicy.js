// How much the city draws, decided from a capability profile (capabilityProfile.js). Pure: the same profile and the same
// measured frame rates always give the same tier (tests/performance-policy.test.mjs). See docs/architecture/performance_policy.md.
//
//   tierCeiling(profile)                  the best tier this device may use, and why
//   decideQuality(profile, { override, measured })   the tier in force, its reasons and its settings
//   governFps(state, fps)                 the measured-frame-rate state machine (with hysteresis, so the tier does not flap)
//   parseQualityOverride(search)          ?quality=low|medium|high|auto (auto by default)
//   thinOut(list, density)                a fixed subset of decorations, for the lower densities
//
// Nothing here may change what a visitor can do: selecting a plot, its call to action, attribution and the no-WebGL page do not
// depend on the tier. Only decoration, animation and resolution do.

export const TIERS = ['low', 'medium', 'high'];
export const QUALITY_OVERRIDES = ['auto', ...TIERS];
const rank = (tier) => TIERS.indexOf(tier);
const lower = (a, b) => (rank(a) <= rank(b) ? a : b);

// The settings of each tier. "high" is exactly what a desktop drew before the policy existed, and "medium" exactly what a
// touch device drew (no shadows, pixel ratio up to 1.25), apart from the distant-update rule.
//   dpr                    the canvas pixel-ratio range ([min, max]; the device's ratio is clamped into it)
//   shadows, shadowMapSize the sun's shadows, and the size of their map
//   animation              'full' | 'reduced' (decorative animation at a lower rate)
//   ornamentEvery          a decorative animation (a spinning gem, a flag, a ride, the water) runs every Nth frame
//   simulationEvery        an ambient simulation (traffic, animals, planes, signals, the sky) runs every Nth frame
//   distantEvery           ... and every Nth frame at most while the camera is zoomed out over the whole city
//   decorationDensity      the share of the landscape's trees and shrubs that are drawn (1: all)
//   textureTier, anisotropy  the ground textures' filtering
//   diagnosticSampleEvery  the renderer's counters are copied into the diagnostics every Nth frame
export const TIER_SETTINGS = Object.freeze({
  high: Object.freeze({ dpr: [1, 1.5], shadows: true, shadowMapSize: 4096, animation: 'full', ornamentEvery: 1, simulationEvery: 1, distantEvery: 1, decorationDensity: 1, textureTier: 'high', anisotropy: 8, diagnosticSampleEvery: 1 }),
  medium: Object.freeze({ dpr: [1, 1.25], shadows: false, shadowMapSize: 2048, animation: 'full', ornamentEvery: 1, simulationEvery: 1, distantEvery: 2, decorationDensity: 1, textureTier: 'medium', anisotropy: 4, diagnosticSampleEvery: 2 }),
  low: Object.freeze({ dpr: [1, 1], shadows: false, shadowMapSize: 1024, animation: 'reduced', ornamentEvery: 3, simulationEvery: 2, distantEvery: 4, decorationDensity: 0.5, textureTier: 'low', anisotropy: 2, diagnosticSampleEvery: 4 }),
});

export function parseQualityOverride(search = '') {
  let value;
  try {
    value = new URLSearchParams(search).get('quality');
  } catch {
    value = null;
  }
  const v = String(value ?? '').toLowerCase();
  return QUALITY_OVERRIDES.includes(v) ? v : 'auto';
}

// The ceiling: each rule that applies caps the tier; the lowest cap wins, and every rule that capped it is a reason.
// The rules read capabilities, never a list of device models.
const CEILING_RULES = [
  ['no-webgl', 'low', (p) => p.webgl && !p.webgl.available],
  ['software-renderer', 'low', (p) => Boolean(p.webgl?.software)],
  ['memory<=2GB', 'low', (p) => p.deviceMemory !== null && p.deviceMemory <= 2],
  ['cores<=2', 'low', (p) => p.hardwareConcurrency !== null && p.hardwareConcurrency <= 2],
  ['coarse-pointer', 'medium', (p) => p.coarsePointer],
  ['small-screen', 'medium', (p) => p.smallScreen],
  ['save-data', 'medium', (p) => p.saveData],
  ['memory<=4GB', 'medium', (p) => p.deviceMemory !== null && p.deviceMemory <= 4],
];

export function tierCeiling(profile) {
  let tier = 'high';
  const capped = [];
  for (const [reason, cap, applies] of CEILING_RULES) {
    if (!applies(profile)) continue;
    capped.push({ reason, cap });
    tier = lower(tier, cap);
  }
  const reasons = capped.filter((c) => c.cap === tier).map((c) => c.reason);
  return { tier, reasons: reasons.length ? reasons : ['capable-device'] };
}

// The tier in force. `override` is the ?quality= value; `measured` the governor's state (governFps), if it has stepped.
export function decideQuality(profile, { override = 'auto', measured = null } = {}) {
  const ceiling = tierCeiling(profile);
  if (override !== 'auto' && TIERS.includes(override)) {
    return { tier: override, source: 'override', ceiling: ceiling.tier, reasons: [`quality=${override}`], settings: TIER_SETTINGS[override] };
  }
  let tier = ceiling.tier;
  let reasons = ceiling.reasons;
  if (measured && rank(measured.tier) < rank(tier)) {
    tier = measured.tier;
    reasons = [...ceiling.reasons.filter((r) => r !== 'capable-device'), measured.reason ?? 'measured-fps'];
  }
  return { tier, source: 'auto', ceiling: ceiling.tier, reasons, settings: TIER_SETTINGS[tier] };
}

// The performance budget of each tier, at every measurement spot (lib/performance/measureSpots.js; scripts/perf-measure.mjs):
// the 95th-percentile frame time in ms, and the mean draw calls, triangles, geometries and textures per frame.
//   high    a desktop or a laptop with a good GPU: 60 fps
//   medium  a mid-range laptop or a recent phone: 40 fps
//   low     an older or low-memory phone: 30 fps
export const PERF_BUDGETS = Object.freeze({
  high: Object.freeze({ frameP95: 16.7, drawCalls: 1200, triangles: 3_000_000, geometries: 2500, textures: 120 }),
  medium: Object.freeze({ frameP95: 25, drawCalls: 900, triangles: 1_500_000, geometries: 2500, textures: 120 }),
  low: Object.freeze({ frameP95: 33.3, drawCalls: 600, triangles: 1_000_000, geometries: 2500, textures: 120 }),
});

// ---- the measured frame rate ------------------------------------------------------------------------------------------
// One reading per window (about two seconds of frames, taken only while the city is visible and not covered). A tier is
// dropped after DROP_AFTER windows in a row below its floor, and raised (never above the ceiling) after RAISE_AFTER windows
// in a row well above the next tier's floor. A change is followed by COOLDOWN windows that are not counted, while the new
// settings take effect. The floors and the raise thresholds are far apart, so a device that sits near a boundary stays put.
// A tier the device was dropped from is harder to return to: each drop from it doubles the windows needed, and after
// MAX_RETRIES drops it is not tried again this visit (a device fast on medium but slow on high would otherwise go round).
// `fps` is the window's typical frame rate: 1000 / the median frame time (runtime.js), so a few long frames while something
// loads are not taken for a slow device. On a 60 Hz display a median of 33 ms (30 fps) is below the high floor.
export const FPS_FLOOR = Object.freeze({ high: 40, medium: 22 }); // below this, drop a tier
export const FPS_RAISE = Object.freeze({ low: 45, medium: 52 }); // above this, try the tier up
export const DROP_AFTER = 3;
export const RAISE_AFTER = 5;
export const COOLDOWN = 2;
export const MAX_RETRIES = 2;

export function createFpsGovernor(ceiling, start = ceiling) {
  return { ceiling, tier: lower(start, ceiling), below: 0, above: 0, cooldown: COOLDOWN, changes: 0, drops: {}, reason: null, lastFps: null };
}

export function governFps(state, fps) {
  const s = { ...state, lastFps: fps };
  if (!(fps > 0)) return s;
  if (s.cooldown > 0) return { ...s, cooldown: s.cooldown - 1 };
  const floor = FPS_FLOOR[s.tier];
  const raise = FPS_RAISE[s.tier];
  const up = TIERS[rank(s.tier) + 1];
  const failures = (up && s.drops?.[up]) || 0;
  const mayRaise = raise !== undefined && rank(s.tier) < rank(s.ceiling) && failures < MAX_RETRIES;
  s.below = floor !== undefined && fps < floor ? s.below + 1 : 0;
  s.above = mayRaise && fps > raise ? s.above + 1 : 0;
  if (s.below >= DROP_AFTER) {
    const tier = TIERS[rank(s.tier) - 1];
    return { ...s, tier, below: 0, above: 0, cooldown: COOLDOWN, changes: s.changes + 1, drops: { ...s.drops, [s.tier]: (s.drops?.[s.tier] ?? 0) + 1 }, reason: `fps<${floor}` };
  }
  if (s.above >= RAISE_AFTER * 2 ** failures) {
    return { ...s, tier: up, below: 0, above: 0, cooldown: COOLDOWN, changes: s.changes + 1, reason: `fps>${raise}` };
  }
  return s;
}

// A fixed subset of a list (the same items every time, spread evenly): keeps round(n * density) of n.
export function thinOut(list, density) {
  if (!Array.isArray(list) || density >= 1) return list;
  if (density <= 0) return [];
  return list.filter((_, i) => Math.floor((i + 1) * density) > Math.floor(i * density));
}
