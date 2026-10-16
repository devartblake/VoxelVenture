// Presence-based sound: the places that make sound, how far each is heard, how near or far the view is, the level of every layer, and the notes the layers play.
import { imp, problemTally } from './helpers.mjs';
const sz = await imp('game/soundZones.js');
const mr = await imp('game/musicRules.js');
const day = await imp('game/dayCycle.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();

const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const noon = day.skyAt(12);
const night = day.skyAt(0);

// --- the places in a city
const city = generateCity(20260101);
const emitters = sz.buildEmitters(city);
const roads = sz.roadSources(city.layout);
const zones = new Set(emitters.map((e) => e.zone));
for (const z of ['arcade', 'jazz', 'office', 'market', 'park', 'water', 'mall', 'airport', 'funfair']) if (!zones.has(z)) bad('the city has places that make this sound', z);
for (const e of emitters) {
  if (!sz.ZONES[e.zone] || !(e.rect.x1 > e.rect.x0 && e.rect.z1 > e.rect.z0) || !(e.gain > 0 && e.gain <= 1) || !(e.fade > 0)) bad('every place has a zone, a size, a strength and a fade', JSON.stringify(e));
}
if (emitters.some((e) => e.zone === 'arcade' && !city.plots.some((p) => p.owner && Math.abs(p.x - (e.rect.x0 + e.rect.x1) / 2) < 0.01 && Math.abs(p.z - (e.rect.z0 + e.rect.z1) / 2) < 0.01))) bad('an arcade sound comes from a building that stands', '');
if (!(roads.length >= 40 && roads.every((r) => r.noise > 0 && r.noise <= 1))) bad('every road has a noise', String(roads.length));
const arterial = city.layout.roads.find((r) => r.class === 'arterial');
const local = city.layout.roads.find((r) => r.kind === 'infill') ?? city.layout.roads.find((r) => r.class === 'local' && r.kind === 'street');
const noiseOf = (r) => roads[city.layout.roads.indexOf(r)].noise;
if (!(noiseOf(arterial) > noiseOf(local))) bad('an arterial is noisier than a local street', `${noiseOf(arterial)} vs ${noiseOf(local)}`);

// --- how far each is heard
const urban = city.layout.urban;
const arcadeBuilding = emitters.find((e) => e.zone === 'arcade');
const ax = (arcadeBuilding.rect.x0 + arcadeBuilding.rect.x1) / 2;
const az = (arcadeBuilding.rect.z0 + arcadeBuilding.rect.z1) / 2;
const ctx = { emitters, roads, urban };
const at = sz.zoneWeights(ax, az, ctx);
if (!(at.arcade > 0.95)) bad('at an arcade you hear it at full strength', String(at.arcade));
let prev = Infinity;
for (let d = 0; d <= 12; d += 1) {
  const w = sz.zoneWeights(ax + (arcadeBuilding.rect.x1 - arcadeBuilding.rect.x0) / 2 + d, az, { emitters: emitters.filter((e) => e === arcadeBuilding), roads: [], urban: null }).arcade;
  if (w > prev + 1e-9) bad('the sound gets quieter with distance', `${d}: ${w} after ${prev}`);
  prev = w;
}
if (prev !== 0) bad('a sound is not heard beyond its fade', String(prev));
const sample = (zone) => emitters.find((e) => e.zone === zone);
for (const z of ['park', 'water', 'mall', 'funfair', 'airport', 'jazz', 'office', 'market']) {
  const e = sample(z);
  const w = sz.zoneWeights((e.rect.x0 + e.rect.x1) / 2, (e.rect.z0 + e.rect.z1) / 2, ctx)[z];
  if (!(w >= 0.5)) bad('inside a place you hear its sound', `${z}: ${w}`);
  const far = sz.zoneWeights(e.rect.x1 + e.fade + 5, (e.rect.z0 + e.rect.z1) / 2, { emitters: [e], roads: [], urban: null })[z];
  if (far !== 0) bad('well away from a place you do not hear it', `${z}: ${far}`);
}
// the fun park and the airport carry further than a cafe
if (!(sz.ZONES.funfair.fade > sz.ZONES.jazz.fade * 3 && sz.ZONES.airport.fade > sz.ZONES.arcade.fade * 3)) bad('a fun park and an airport carry far', '');
// the countryside is outside the city and grows with distance; roads are quieter there
const centre = city.layout.center;
const wc = sz.zoneWeights(centre.x, centre.z, ctx);
const out1 = sz.zoneWeights(urban.x1 + 12, centre.z, { emitters: [], roads: [], urban });
const out2 = sz.zoneWeights(urban.x1 + 40, centre.z, { emitters: [], roads: [], urban });
if (wc.farm !== 0 || !(out1.farm > 0.05 && out2.farm > out1.farm && out2.farm > 0.9)) bad('the countryside is heard outside the city and more the further out', `${wc.farm} ${out1.farm} ${out2.farm}`);
// beside a main road you hear traffic; far from any road you do not
const mid = arterial.axis === 'x' ? { x: (arterial.from + arterial.to) / 2, z: arterial.center + 1.8 } : { x: arterial.center + 1.8, z: (arterial.from + arterial.to) / 2 };
if (!(sz.zoneWeights(mid.x, mid.z, { emitters: [], roads, urban: null }).street > 0.8)) bad('beside an arterial you hear the traffic', '');
if (sz.zoneWeights(urban.x1 + 200, urban.z1 + 200, { emitters: [], roads, urban: null }).street !== 0) bad('far from every road there is no traffic', '');
for (const w of Object.values(at)) if (!(w >= 0 && w <= 1)) bad('weights are 0..1', String(w));

// --- near or far from the ground
const F = sz.viewFarness;
if (F({ view: 'iso', zoom: 20 }) !== 0 || F({ view: 'iso', zoom: 14 }) !== 0 || F({ view: 'iso', zoom: 5 }) !== 1 || F({ view: 'iso', zoom: 2 }) !== 1) bad('the isometric view is near at 14 or more and far at 5', '');
if (!(F({ view: 'iso', zoom: 9.5 }) > 0.4 && F({ view: 'iso', zoom: 9.5 }) < 0.6)) bad('in between it is in between', String(F({ view: 'iso', zoom: 9.5 })));
let last = -1;
for (let zoom = 20; zoom >= 3; zoom -= 0.5) {
  const f = F({ view: 'iso', zoom });
  if (f < last - 1e-9) bad('zooming out never makes the view nearer', String(zoom));
  last = f;
}
if (F({ view: 'diablo', distance: 28 }) !== 0 || F({ view: 'overview', distance: 160 }) !== 1 || !(F({ view: 'tactical', distance: 70 }) > 0 && F({ view: 'tactical', distance: 70 }) < 0.5)) bad('follow views are near close up and far at the Overview', '');
if (F({ view: 'first' }) !== 0 || F({ view: 'iso', zoom: 30, mapOpen: true }) !== 1) bad('first person is always near; the world map is far', '');

// --- the mix
const weights = (o) => ({ ...Object.fromEntries(Object.keys(sz.ZONES).map((k) => [k, 0])), ...o });
const near = sz.mixZones({ weights: weights({ arcade: 1, street: 0.9 }), far: 0, sky: noon });
if (!(near.local.arcade > 0.95 && near.music === 0 && near.street > 0.4 && near.top[0] === 'arcade')) bad('close to the ground at an arcade you hear the arcade and no music', JSON.stringify(near));
const above = sz.mixZones({ weights: weights({ arcade: 1, street: 0.9 }), far: 1, sky: noon });
if (!(above.music > 0.95 && above.local.arcade === 0 && above.street === 0 && above.city > 0.05 && above.city < near.city + 0.01)) bad('high above the map you hear the music and a faint city, not the arcade', JSON.stringify(above));
const half = sz.mixZones({ weights: weights({ arcade: 1 }), far: 0.5, sky: noon });
if (!(half.music > 0 && half.music < 1 && half.local.arcade > 0 && half.local.arcade < 1)) bad('half way up they crossfade', JSON.stringify(half));
for (let f = 0; f <= 1; f += 0.05) {
  const m = sz.mixZones({ weights: weights({ arcade: 1 }), far: f, sky: noon });
  const m2 = sz.mixZones({ weights: weights({ arcade: 1 }), far: Math.min(1, f + 0.05), sky: noon });
  if (m2.music < m.music - 1e-9 || m2.local.arcade > m.local.arcade + 1e-9) bad('the music rises and the local sound falls as you go up', String(f));
}
const inside = sz.mixZones({ weights: weights({ arcade: 1 }), far: 0, sky: noon, indoors: true });
if (!(inside.master < 0.4 && inside.lowpass < 2000 && inside.music === 0 && inside.local.arcade < near.local.arcade * 0.5)) bad('indoors everything is quieter and muffled, with no music', JSON.stringify(inside));
if (sz.mixZones({ weights: weights({}), far: 1, sky: noon, musicOn: false }).music !== 0) bad('music can be switched off', '');
const crowd = sz.mixZones({ weights: weights({ arcade: 0.9, jazz: 0.8, office: 0.7, market: 0.6, park: 0.5, water: 0.4 }), far: 0, sky: noon });
const active = Object.values(crowd.local).filter((v) => v > 0).length;
if (active !== sz.MAX_LOCAL || crowd.top.length !== sz.MAX_LOCAL || crowd.top.join() !== 'arcade,jazz,office,market') bad('only the loudest few local sounds play', `${active} ${crowd.top}`);
if (!(sz.mixZones({ weights: weights({ street: 1 }), far: 0, sky: noon }).street > sz.mixZones({ weights: weights({ street: 1 }), far: 0, sky: night }).street)) bad('traffic is lighter at night', '');
if (!(sz.mixZones({ weights: weights({ street: 1 }), far: 0, sky: noon, driving: true }).street < sz.mixZones({ weights: weights({ street: 1 }), far: 0, sky: noon }).street)) bad('in a car the street is quieter', '');
for (const m of [near, above, half, inside, crowd]) {
  for (const v of [m.music, m.city, m.street, m.master, ...Object.values(m.local)]) if (!(v >= 0 && v <= 1)) bad('every level is 0..1', String(v));
}
if (sz.describeMix(near) !== 'Arcade · Busy street' || sz.describeMix(above) !== 'City music' || !/^City music · Arcade/.test(sz.describeMix(half))) bad('the mix is described in words', `${sz.describeMix(near)} | ${sz.describeMix(above)} | ${sz.describeMix(half)}`);
if (sz.mixZones().music !== 0 || sz.mixZones({}).top.length !== 0) bad('an empty mix is silent', '');

// --- the notes
if (Math.abs(mr.midiHz(69) - 440) > 1e-9 || Math.abs(mr.midiHz(81) - 880) > 1e-9) bad('midi to Hz', '');
if (mr.scaleNote(60, mr.SCALES.pentaMajor, 0) !== 60 || mr.scaleNote(60, mr.SCALES.pentaMajor, 5) !== 72 || mr.scaleNote(60, mr.SCALES.pentaMajor, -1) !== 57) bad('scale notes wrap into octaves', '');
if (mr.moodFor(noon) !== 'bright' || mr.moodFor(night) !== 'calm' || mr.moodFor(day.skyAt(19)) !== 'warm' || mr.moodFor(day.skyAt(6.5)) !== 'warm') bad('the music follows the time of day', `${mr.moodFor(noon)} ${mr.moodFor(night)} ${mr.moodFor(day.skyAt(19))}`);
for (const mood of Object.keys(mr.MOODS)) {
  const r = rng(7);
  let chords = 0;
  let arps = 0;
  let basses = 0;
  const scale = mr.MOODS[mood];
  for (let step = 0; step < 16 * 8; step++) {
    const s = mr.musicStep(mood, step, r);
    if (step % 16 === 0 && !s.chord) bad('the chord changes every two bars', `${mood} ${step}`);
    if (s.chord) {
      chords++;
      if (s.chord.length !== 4 || s.chord.some((m) => m < 30 || m > 80)) bad('a chord is four notes in a comfortable range', `${mood} ${s.chord}`);
    }
    if (s.bass !== null) {
      basses++;
      if (s.bass < 20 || s.bass > 55) bad('the bass is low', String(s.bass));
    }
    for (const a of s.arp) {
      arps++;
      if (a.midi < 60 || a.midi > 96 || a.dur < 2 || a.dur > 3) bad('an arpeggio note is in range', JSON.stringify(a));
    }
  }
  if (chords !== 8 || basses !== 16 || arps < 15) bad('the music has chords, a bass and an arpeggio', `${mood}: ${chords} ${basses} ${arps}`);
  if (JSON.stringify(mr.musicStep(mood, 5, rng(3))) !== JSON.stringify(mr.musicStep(mood, 5, rng(3)))) bad('the same seed gives the same music', mood);
  if (!(scale.bpm >= 60 && scale.bpm <= 100)) bad('the music is unhurried', String(scale.bpm));
}
if (!(mr.MOODS.calm.bpm < mr.MOODS.warm.bpm && mr.MOODS.warm.bpm < mr.MOODS.bright.bpm)) bad('the music is slower as it gets darker', '');
// the arcade: notes in range, bass on the beat, now and then a coin and a laser
{
  const r = rng(11);
  const kinds = {};
  for (let step = 0; step < 16 * 200; step++) {
    for (const n of mr.arcadeStep(step, r)) {
      kinds[n.wave] = (kinds[n.wave] ?? 0) + 1;
      if (n.wave === 'square' && (n.midi < 30 || n.midi > 96)) bad('arcade notes are in range', String(n.midi));
      if (!(n.steps >= 1 && n.vol > 0 && n.vol <= 1)) bad('an arcade note has a length and a volume', JSON.stringify(n));
    }
  }
  if (!(kinds.square > 2000 && kinds.noise > 600 && kinds.coin > 20 && kinds.laser > 20)) bad('the arcade plays a tune, drums, coins and lasers', JSON.stringify(kinds));
  if (mr.arcadeStep(0, () => 0.99).every((n) => n.wave !== 'square')) bad('the arcade bass is on the first beat', '');
}
// jazz: a walking bass, chords on the off-beat, brushes
{
  const r = rng(5);
  const kinds = {};
  for (let step = 0; step < 8 * 40; step++) for (const n of mr.jazzStep(step, r)) kinds[n.wave] = (kinds[n.wave] ?? 0) + 1;
  if (!(kinds.bass === 4 * 40 && kinds.brush === 2 * 40 && kinds.chord >= 2 * 40)) bad('jazz has a walking bass, brushes and chords', JSON.stringify(kinds));
  const bass0 = mr.jazzStep(0, () => 0.99).find((n) => n.wave === 'bass').midi;
  if (bass0 !== 38) bad('jazz starts on the root of Dm7', String(bass0));
  for (let step = 0; step < 32; step++) for (const n of mr.jazzStep(step, () => 0.5)) if (n.wave === 'chord' && (n.midi.length !== 4 || n.midi.some((m) => m < 50 || m > 80))) bad('a jazz chord is four notes', JSON.stringify(n));
}
// the waltz: 24 steps, three beats a bar, the bass on the first beat only
{
  let bassBeats = 0;
  for (let step = 0; step < 24; step++) {
    const notes = mr.waltzStep(step);
    if (notes.length !== 2 || notes[0].midi < 60 || notes[0].midi > 90) bad('the waltz has a tune and an accompaniment', String(step));
    if (!Array.isArray(notes[1].midi) !== (step % 3 === 0)) bad('the bass is on the first beat, chords on the others', String(step));
    if (step % 3 === 0) bassBeats++;
  }
  if (bassBeats !== 8 || JSON.stringify(mr.waltzStep(3)) !== JSON.stringify(mr.waltzStep(27))) bad('the waltz is 8 bars and repeats', '');
}
// the mall's music and the one-off sounds
{
  const r = rng(2);
  let n = 0;
  for (let step = 0; step < 64; step++) n += mr.muzakStep(step, r).length;
  if (n < 32) bad('the mall plays a slow arpeggio', String(n));
  for (let i = 0; i < 100; i++) {
    const k = mr.keyboardBurst(r);
    if (k.length < 4 || k.length > 14 || k[0] !== 0 || k.some((t, j) => j && (t - k[j - 1] < 0.069 || t - k[j - 1] > 0.181))) bad('a burst of typing', JSON.stringify(k));
    const cow = mr.mooParams(r);
    if (!(cow.from > cow.to && cow.from > 100 && cow.to > 60 && cow.dur > 0.8 && cow.dur < 1.6)) bad('a cow glides down', JSON.stringify(cow));
    const jet = mr.jetPass(r);
    if (!(jet.dur >= 6 && jet.dur <= 10 && jet.peakHz >= 160 && jet.peakHz <= 260)) bad('a jet passes', JSON.stringify(jet));
    if (![84, 88, 91].includes(mr.marketBell(r).midi)) bad('a market bell', '');
  }
  if (mr.nextDelay(10, 0, () => 0.5) !== Infinity || mr.nextDelay(10, 0.03, () => 0.5) !== Infinity) bad('a silent layer makes no one-off sounds', '');
  if (!(mr.nextDelay(10, 1, () => 0.5) < mr.nextDelay(10, 0.2, () => 0.5))) bad('a louder layer makes more', '');
}

console.log(`${emitters.length} places (${[...zones].join(', ')})`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
