// The shared day and night, and the city's ambient sound: the clock, the lights at each hour, and the sound levels. All pure logic.
import { imp, problemTally } from './helpers.mjs';
const d = await imp('game/dayCycle.js');
const sc = await imp('game/soundscape.js');
const { bad, total } = problemTally();

// the clock: shared by everyone, from the world clock alone
if (d.DAY_MINUTES !== 24) bad('a day lasts 24 real minutes', String(d.DAY_MINUTES));
if (d.hourAt(0) !== 0 || Math.abs(d.hourAt(d.DAY_MS / 2) - 12) > 1e-9 || Math.abs(d.hourAt(d.DAY_MS * 7 + d.DAY_MS / 4) - 6) > 1e-9) bad('the hour follows the world clock and repeats each day', `${d.hourAt(d.DAY_MS / 2)}`);
if (d.hourAt(123456789) !== d.hourAt(123456789)) bad('the same time gives the same hour', '');
if (!(d.hourAt(-5) >= 0 && d.hourAt(-5) < 24)) bad('an hour before the epoch is still 0..24', String(d.hourAt(-5)));
if (Math.abs(d.hourAt(1000, d.DAY_MS / 2) - d.hourAt(1000 + d.DAY_MS / 2)) > 1e-9) bad('a server offset shifts the clock', '');
for (let t = 0; t < d.DAY_MS * 3; t += 9973) {
  const h = d.hourAt(t);
  if (!(h >= 0 && h < 24)) bad('the hour is always 0..24', String(h));
}
// every player sees the same sky at the same moment
const when = 1767225600000 + 12345;
if (JSON.stringify(d.skyAt(d.hourAt(when))) !== JSON.stringify(d.skyAt(d.hourAt(when)))) bad('the sky is the same for everyone', '');

// the modes
if (d.parseTime('NIGHT') !== 'night' || d.parseTime('live') !== 'live' || d.parseTime('14.5') !== '14.5' || d.parseTime('25') !== null || d.parseTime('x') !== null || d.parseTime(null) !== null || d.parseTime('-1') !== null) bad('?time= values', '');
if (d.modeHour('day') !== 12 || d.modeHour('night') !== 0 || d.modeHour('dusk') !== 19 || d.modeHour('14.5') !== 14.5) bad('presets give fixed hours', '');
if (d.modeHour('live', d.DAY_MS / 4) !== 6) bad('live follows the clock', '');

// the lights: noon is the original look, night is dark and blue, the sun is higher at noon than at dusk
const noon = d.skyAt(12);
if (noon.ambient.color !== '#ffffff' || noon.ambient.intensity !== 0.7 || noon.sun.color !== '#ffffff' || noon.sun.intensity !== 1.5 || noon.fill.intensity !== 0.3) bad('noon is the original lighting', JSON.stringify(noon));
const night = d.skyAt(0);
if (night.sun.intensity !== 0 || !(night.ambient.intensity < noon.ambient.intensity)) bad('the sun is out at night and the light is low', JSON.stringify(night));
const [r, , b] = [1, 3, 5].map((i) => parseInt(night.ambient.color.slice(i, i + 2), 16));
if (!(b > r)) bad('night light is blue', night.ambient.color);
if (noon.lamps !== 0 || night.lamps !== 1) bad('lamps are off at noon and fully lit at night', `${noon.lamps} ${night.lamps}`);
if (!(d.skyAt(12).sunDir[1] > d.skyAt(18.5).sunDir[1])) bad('the sun is higher at noon than at dusk', '');
let prev = null;
for (let h = 0; h < 24; h += 0.05) {
  const s = d.skyAt(h);
  const len = Math.hypot(...s.sunDir);
  if (Math.abs(len - 1) > 1e-6) bad('the sun direction is a unit vector', `${h}: ${len}`);
  if (s.sunDir[1] < d.SUN_MIN - 1e-6 || s.sunDir[1] > 1) bad('the sun never goes below the minimum or past the zenith', `${h}: ${s.sunDir[1]}`);
  if (!/^#[0-9a-f]{6}$/.test(s.ambient.color) || !/^#[0-9a-f]{6}$/.test(s.sun.color) || !/^#[0-9a-f]{6}$/.test(s.fill.color)) bad('colours are hex', String(h));
  if (!(s.ambient.intensity > 0 && s.ambient.intensity <= 0.71) || s.sun.intensity < 0 || s.sun.intensity > 1.51 || s.lamps < 0 || s.lamps > 1) bad('levels are in range', String(h));
  if (prev && (Math.abs(s.ambient.intensity - prev.ambient.intensity) > 0.06 || Math.abs(s.sun.intensity - prev.sun.intensity) > 0.2)) bad('light changes smoothly', `${h}`);
  prev = s;
}
if (d.skyAt(24).ambient.color !== d.skyAt(0).ambient.color) bad('midnight joins up', '');
if (d.skyAt(-1).hour !== 23) bad('negative hours wrap', String(d.skyAt(-1).hour));
const phases = new Set([0, 6.5, 12, 19].map((h) => d.skyAt(h).phase));
if (phases.size !== 4) bad('four phases: night, dawn, day, dusk', [...phases].join());
if (d.clockLabel(9.5) !== '09:30' || d.clockLabel(23.99) !== '23:59' || d.clockLabel(0) !== '00:00') bad('clock labels', d.clockLabel(9.5));

// the server's clock
if (d.clockOffset(1000, 0, 100) !== 950) bad('clock offset from a round trip', String(d.clockOffset(1000, 0, 100)));
if (d.clockOffset(NaN, 0, 1) !== 0 || d.clockOffset(1, 5, 1) !== 0) bad('a bad reply gives no offset', '');

// the sound
const at = (h, extra = {}) => sc.soundMix({ sky: d.skyAt(h), ...extra });
const day = at(12);
const dark = at(0);
if (!(day.birds > 0.5) || dark.birds !== 0) bad('birds sing by day and not at night', `${day.birds} ${dark.birds}`);
if (!(dark.crickets > 0.5) || day.crickets !== 0) bad('crickets chirp at night and not by day', `${dark.crickets} ${day.crickets}`);
if (!(sc.trafficLevel(8) > sc.trafficLevel(3) && sc.trafficLevel(17.5) > sc.trafficLevel(3) && sc.trafficLevel(13) > sc.trafficLevel(0))) bad('traffic is busier at rush hour and by day than at night', '');
for (let h = 0; h < 24; h += 0.25) {
  const t = sc.trafficLevel(h);
  if (!(t >= 0 && t <= 1)) bad('traffic level is 0..1', String(h));
  const m = at(h);
  for (const k of ['hum', 'traffic', 'birds', 'crickets', 'water', 'master']) if (!(m[k] >= 0 && m[k] <= 1)) bad('every level is 0..1', `${h} ${k} ${m[k]}`);
}
const inside = at(12, { indoors: true });
if (!(inside.master < day.master * 0.5) || !(inside.lowpass < day.lowpass / 5)) bad('indoors is quieter and muffled', JSON.stringify(inside));
if (!(at(8, { driving: true }).traffic < at(8).traffic)) bad('in a car the outside traffic is quieter', '');
if (!(at(12, { water: 1 }).water > at(12).water)) bad('water is louder beside a lake', '');
if (sc.soundMix().master !== 1 || !Number.isFinite(sc.soundMix({}).hum)) bad('the mix works with no input', '');

// bird calls and cricket bursts
if (sc.nextCallDelay(0) !== Infinity || sc.nextCallDelay(0.01) !== Infinity) bad('a silent layer never calls', '');
if (!(sc.nextCallDelay(1, () => 0.5) < sc.nextCallDelay(0.1, () => 0.5))) bad('a louder layer calls more often', '');
for (let i = 0; i < 50; i++) {
  const call = sc.birdCall();
  if (call.length < 2 || call.length > 4 || call.some(([s, l, a, b]) => !(s >= 0 && l > 0 && a > 1000 && a < 8000 && b > 1000 && b < 8000))) bad('a bird call is a few chirps in the audible range', JSON.stringify(call));
  const burst = sc.cricketBurst();
  if (burst.length < 3 || burst.length > 5 || burst.some(([s, l, hz]) => !(s >= 0 && l > 0 && hz > 3500 && hz < 5000))) bad('a cricket burst is a few high pulses', JSON.stringify(burst));
}

console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
