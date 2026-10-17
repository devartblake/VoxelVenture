// The notes of the city's sounds (pure, seeded by a random function, so they are tested in Node): the music you hear high above the map, the arcade's 8-bit tune and
// bleeps, a cafe's jazz, the fun park's carousel waltz, an office's keyboards, the cows and the jets. apps/web/components/SoundEngine.jsx plays them (they are all made with
// the browser's audio: no sound files). A "step" is the smallest beat of each piece; every function says how long a step is (`stepSeconds`).
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

export const SCALES = {
  pentaMajor: [0, 2, 4, 7, 9],
  pentaMinor: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};
// a note of a scale: the `degree`th step up from `root` (degrees wrap into the next octave)
export const scaleNote = (root, scale, degree) => {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  return root + oct * 12 + scale[((degree % n) + n) % n];
};

// ---- the city's music (high above the map) ----------------------------------------------------------------------------------------------------------------
// Slow chords on a soft pad, a gentle arpeggio and a bass, in a mood that follows the time of day: bright by day, warm at dusk and dawn, calm at night.
// One step is an eighth note; a chord lasts 16 steps (two bars of 4/4).
export const MOODS = {
  bright: { bpm: 92, scale: 'pentaMajor', root: 60, chords: [[0, 4, 7, 11], [9, 0, 4, 7], [5, 9, 0, 4], [7, 11, 2, 5]], arp: 0.62 }, // Cmaj7, Am7, Fmaj7, G7sus-ish
  warm: { bpm: 76, scale: 'dorian', root: 57, chords: [[0, 3, 7, 10], [5, 8, 0, 3], [10, 2, 5, 9], [7, 10, 2, 5]], arp: 0.5 }, // Am7, Dm7-ish, ...
  calm: { bpm: 62, scale: 'pentaMinor', root: 57, chords: [[0, 3, 7, 10], [8, 0, 3, 7], [3, 7, 10, 2], [10, 2, 5, 9]], arp: 0.34 },
};
export const stepSeconds = (bpm) => 60 / bpm / 2; // an eighth note

export function moodFor(sky) {
  const lamps = sky?.lamps ?? 0;
  const sun = sky?.sun?.intensity ?? 1.5;
  if (lamps > 0.85 || sun < 0.05) return 'calm';
  if (lamps > 0.2 || sun < 1.0) return 'warm';
  return 'bright';
}

// What to play at `step` of the music: { chord: [midi...] (on the first step of a chord; the pad changes), bass: midi or null, arp: [{ midi, dur }] }
export function musicStep(moodName, step, rand = Math.random) {
  const mood = MOODS[moodName] ?? MOODS.bright;
  const scale = SCALES[mood.scale];
  const bar = Math.floor(step / 16) % mood.chords.length;
  const chordTones = mood.chords[bar];
  const inBar = step % 16;
  const out = { chord: null, bass: null, arp: [] };
  if (inBar === 0) out.chord = chordTones.map((t, i) => mood.root - 12 + t + (i > 1 ? 12 : 0));
  if (inBar === 0 || inBar === 8) out.bass = mood.root - 24 + chordTones[0];
  if (rand() < mood.arp && inBar % 2 === 0) {
    // an arpeggio note: a chord tone most of the time, a scale note now and then
    const note = rand() < 0.75 ? mood.root + 12 + pick(rand, chordTones) : scaleNote(mood.root + 12, scale, Math.floor(rand() * 8));
    out.arp.push({ midi: note, dur: 2 + Math.floor(rand() * 2) });
  }
  return out;
}

// ---- the arcade ---------------------------------------------------------------------------------------------------------------------------------------------
// A 16-step loop of 16th notes at 132 bpm: a square-wave bass, a lead running over the minor pentatonic, and bleeps, coins and lasers now and then.
export const ARCADE = { bpm: 132 };
const ARCADE_BASS = [0, null, 0, null, 3, null, 3, null, 5, null, 5, null, 3, null, 7, null];
export function arcadeStep(step, rand = Math.random) {
  const i = step % 16;
  const out = [];
  const bass = ARCADE_BASS[i];
  if (bass !== null) out.push({ wave: 'square', midi: 36 + bass, steps: 2, vol: 0.5 });
  if (i % 2 === 0 && rand() < 0.7) out.push({ wave: 'square', midi: scaleNote(60, SCALES.pentaMinor, Math.floor(rand() * 10)), steps: 1 + Math.floor(rand() * 2), vol: 0.32 });
  if (i % 4 === 0) out.push({ wave: 'noise', steps: 1, vol: i % 8 === 0 ? 0.4 : 0.22 }); // a kick and a hat
  const r = rand();
  if (r < 0.035) out.push({ wave: 'coin', midi: 83, steps: 2, vol: 0.4 }); // two quick notes up
  else if (r < 0.06) out.push({ wave: 'laser', from: 1400, to: 160, steps: 3, vol: 0.28 });
  return out;
}

// ---- jazz (a cafe) ------------------------------------------------------------------------------------------------------------------------------------------
// 4/4 swing at 96 bpm over Dm7, G7, Cmaj7, A7: a walking bass on the beat, chords on the off-beats, brushes on 2 and 4. One step is an eighth note (8 to a bar).
export const JAZZ = { bpm: 96 };
const JAZZ_CHORDS = [
  { root: 38, tones: [0, 3, 7, 10] }, // D minor 7
  { root: 43, tones: [0, 4, 7, 10] }, // G7
  { root: 36, tones: [0, 4, 7, 11] }, // C major 7
  { root: 45, tones: [0, 4, 7, 10] }, // A7
];
export function jazzStep(step, rand = Math.random) {
  const chord = JAZZ_CHORDS[Math.floor(step / 8) % JAZZ_CHORDS.length];
  const inBar = step % 8;
  const out = [];
  if (inBar % 2 === 0) {
    // the walking bass: root, third, fifth, then a note a half-step below the next chord's root
    const beat = inBar / 2;
    const next = JAZZ_CHORDS[(Math.floor(step / 8) + 1) % JAZZ_CHORDS.length];
    const walk = [0, chord.tones[1], chord.tones[2], null][beat];
    out.push({ wave: 'bass', midi: walk === null ? next.root - 1 : chord.root + walk, steps: 2, vol: 0.5 });
  }
  if (inBar === 3 || inBar === 7 || (inBar === 5 && rand() < 0.4)) out.push({ wave: 'chord', midi: chord.tones.map((t) => chord.root + 24 + t), steps: 2, vol: 0.22 });
  if (inBar === 2 || inBar === 6) out.push({ wave: 'brush', steps: 1, vol: 0.18 });
  if (rand() < 0.1) out.push({ wave: 'lead', midi: scaleNote(chord.root + 36, SCALES.pentaMinor, Math.floor(rand() * 6)), steps: 1, vol: 0.2 });
  return out;
}

// ---- the carousel (the fun park) ----------------------------------------------------------------------------------------------------------------------------
// An organ waltz in C major, 3/4 at 150 bpm: bass on the first beat, chords on the second and third, a tune on top. 24 steps (8 bars of 3 beats) loop; a step is a beat.
export const WALTZ = { bpm: 150 };
const WALTZ_MELODY = [76, 76, 79, 77, 77, 81, 79, 79, 83, 81, 79, 77, 76, 74, 72, 74, 76, 77, 79, 76, 72, 74, 71, 72];
const WALTZ_CHORDS = [[0, 4, 7], [0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]];
export function waltzStep(step) {
  const i = step % 24;
  const bar = Math.floor(i / 3);
  const beat = i % 3;
  const chord = WALTZ_CHORDS[bar];
  const out = [{ wave: 'organ', midi: WALTZ_MELODY[i], steps: 1, vol: 0.3 }];
  if (beat === 0) out.push({ wave: 'organ', midi: 48 + chord[0], steps: 1, vol: 0.36 });
  else out.push({ wave: 'organ', midi: chord.map((t) => 60 + t), steps: 1, vol: 0.18 });
  return out;
}

// ---- the mall --------------------------------------------------------------------------------------------------------------------------------------------------
// Soft shop music: a slow arpeggio of major sevenths, one step an eighth note at 72 bpm.
export const MUZAK = { bpm: 72 };
export function muzakStep(step, rand = Math.random) {
  const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
  const chord = chords[Math.floor(step / 8) % chords.length];
  const out = [];
  if (step % 2 === 0) out.push({ wave: 'vibes', midi: chord[(step / 2) % 4] + (rand() < 0.2 ? 12 : 0), steps: 2, vol: 0.28 });
  if (step % 8 === 0) out.push({ wave: 'vibes', midi: chord[0] - 12, steps: 6, vol: 0.2 });
  return out;
}

// ---- one-off sounds (the engine asks when to make the next one) ------------------------------------------------------------------------------------------------
// A burst of typing: 4 to 14 clicks, 70 to 180 ms apart (offsets in seconds)
export function keyboardBurst(rand = Math.random) {
  const n = 4 + Math.floor(rand() * 11);
  const t = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    t.push(Math.round(at * 1000) / 1000);
    at += 0.07 + rand() * 0.11;
  }
  return t;
}
// A cow: a low glide down, 0.9 to 1.5 s: { from, to, dur } in Hz
export const mooParams = (rand = Math.random) => ({ from: 150 + rand() * 40, to: 80 + rand() * 25, dur: 0.9 + rand() * 0.6 });
// A jet passing: a roar that rises and falls over 6 to 10 s, its pitch 160 to 260 Hz at the peak
export const jetPass = (rand = Math.random) => ({ dur: 6 + rand() * 4, peakHz: 160 + rand() * 100 });
// A bell at the market stall: one high note
export const marketBell = (rand = Math.random) => ({ midi: pick(rand, [84, 88, 91]), dur: 1.2 });
// How long to wait for the next one-off sound of a kind, in seconds, shorter the stronger the layer (`level` 0..1); Infinity when it is too quiet to matter
export function nextDelay(base, level, rand = Math.random) {
  if (!(level > 0.04)) return Infinity;
  return (base * (0.6 + rand() * 0.8)) / (0.35 + level);
}
