// The music director (lib/game/musicDirector.js): one continuous soundtrack. Tracks play to their end with a short quiet between them, day
// and night change at the end of a track, a car or a settled stay at the arcade or a cafe change it at once with a crossfade, a cafe you
// only walk past changes nothing, and the camera has no say. Simulated over time, no audio.
import { imp } from './helpers.mjs';

const { createMusicDirector, wantedPlaylist, zoneAt, isNightSky, ZONE_DWELL, GAP, FADE, LEVEL } = await imp('game/musicDirector.js');
const { MUSIC_PLAYLISTS } = await imp('content/music.js');

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// the rules on their own
check('the criteria in order: driving, a place, night, the city', wantedPlaylist({ driving: true, zone: 'arcade', night: true }) === 'driving' && wantedPlaylist({ zone: 'jazz', night: true }) === 'jazz' && wantedPlaylist({ night: true }) === 'night' && wantedPlaylist({}) === 'city');
check('being at a place means being near it (from the avatar, not the camera)', zoneAt({ arcade: 0.9, jazz: 0.2 }) === 'arcade' && zoneAt({ jazz: 0.7 }) === 'jazz' && zoneAt({ arcade: 0.3 }) === null);
check('night is the lamps on or the sun down', isNightSky({ lamps: 1 }) && isNightSky({ sun: { intensity: 0 } }) && !isNightSky({ lamps: 0.2, sun: { intensity: 1.2 } }));
check('every playlist has tracks', Object.values(MUSIC_PLAYLISTS).every((l) => l.length > 0));

// a little player round the director: a track lasts `len` seconds; it tells the director when one ends
function run(steps, { len = 60, dt = 0.5 } = {}) {
  const d = createMusicDirector({ playlists: MUSIC_PLAYLISTS, rand: rng(7) });
  const log = [];
  let playing = null; // { url, until }
  let t = 0;
  for (const s of steps) {
    for (let k = 0; k < s.for / dt; k++, t += dt) {
      const ended = Boolean(playing && t >= playing.until);
      if (ended) playing = null;
      const out = d.step({ now: t, playing: Boolean(playing), ended, ...s.state });
      if (out.stop != null) (playing = null), log.push({ t, stop: out.stop });
      if (out.play) (playing = { url: out.play.url, until: t + len }), log.push({ t, play: out.play.url, fade: out.play.fade, playlist: out.playlist });
      s.after?.(out, t);
    }
  }
  return log;
}
const listOf = (url) => Object.entries(MUSIC_PLAYLISTS).find(([, l]) => l.includes(url))?.[0];

// the city by day for three tracks: each plays to its end, then a quiet, then the next; never the same twice running
{
  const log = run([{ for: 200, state: {} }]);
  const plays = log.filter((e) => e.play);
  check('it starts at once and plays the city playlist', plays[0].t === 0 && plays.every((p) => p.playlist === 'city'));
  check('a track plays to its end, then a short quiet, then the next', plays.length >= 3 && Math.abs(plays[1].t - (60 + GAP)) <= 0.5 && Math.abs(plays[2].t - 2 * (60 + GAP)) <= 1, JSON.stringify(plays.map((p) => p.t)));
  check('no track twice in a row', plays.every((p, i) => !i || p.play !== plays[i - 1].play));
  check('nothing cuts in between', !log.some((e) => e.stop != null));
}

// dusk falls in the middle of a track: the night playlist starts only when it ends
{
  const log = run([{ for: 30, state: {} }, { for: 60, state: { night: true } }]);
  const plays = log.filter((e) => e.play);
  check('day to night waits for the end of the track', plays.length === 2 && listOf(plays[0].play) === 'city' && listOf(plays[1].play) === 'night' && plays[1].t >= 60, JSON.stringify(plays.map((p) => [p.t, p.playlist])));
}

// getting into a car: the radio at once, with a short crossfade; getting out: back at once
{
  const log = run([{ for: 20, state: {} }, { for: 20, state: { driving: true } }, { for: 10, state: {} }]);
  const plays = log.filter((e) => e.play);
  check('the car radio starts at once with a short crossfade', plays[1] && plays[1].playlist === 'driving' && Math.abs(plays[1].t - 20) <= 0.5 && plays[1].fade === FADE.driving);
  check('and stops when you get out', plays[2] && plays[2].playlist === 'city' && Math.abs(plays[2].t - 40) <= 0.5);
}

// the arcade: walking past it changes nothing; staying there brings its music; leaving gives the city back
{
  const passing = run([{ for: 10, state: {} }, { for: ZONE_DWELL - 2, state: { zone: 'arcade' } }, { for: 20, state: {} }]);
  check('walking past the arcade changes nothing', passing.filter((e) => e.play).length === 1);
  const staying = run([{ for: 10, state: {} }, { for: 30, state: { zone: 'arcade' } }, { for: 20, state: {} }]);
  const plays = staying.filter((e) => e.play);
  check('staying at the arcade brings its music after a few seconds, crossfaded', plays[1] && plays[1].playlist === 'arcade' && Math.abs(plays[1].t - (10 + ZONE_DWELL)) <= 0.5 && plays[1].fade === FADE.zone, JSON.stringify(plays.map((p) => [p.t, p.playlist])));
  check('leaving gives the city back a few seconds later', plays[2] && plays[2].playlist === 'city' && Math.abs(plays[2].t - (40 + ZONE_DWELL)) <= 0.5);
}

// zooming the camera in and out is not an input at all: the same steps give the same music
{
  const a = run([{ for: 120, state: {} }]);
  const b = run([{ for: 120, state: { far: 1 } }, { for: 0, state: {} }]);
  check('the camera has no say', JSON.stringify(a) === JSON.stringify(b));
}

// indoors quieter, not cut; the music button stops it and starts it again
{
  let indoorLevel = null;
  const log = run([{ for: 10, state: {} }, { for: 10, state: { indoors: true }, after: (o) => (indoorLevel = o.level) }, { for: 5, state: { musicOn: false } }, { for: 5, state: {} }]);
  check('indoors the music is quieter, not cut', indoorLevel === LEVEL.indoors && !log.some((e) => e.stop != null && e.t < 20));
  check('the music button stops it, and it starts again when switched back on', log.some((e) => e.stop != null && Math.abs(e.t - 20) <= 0.5) && log.some((e) => e.play && Math.abs(e.t - 25) <= 0.5));
}

// a track that cannot play is skipped, the rest go on
{
  const d = createMusicDirector({ playlists: { city: ['a', 'b', 'c'] }, rand: rng(3) });
  const first = d.step({ now: 0 }).play.url;
  const failed = new Set([first]);
  d.step({ now: 1, ended: true, failed });
  const next = d.step({ now: 1 + GAP, failed }).play?.url;
  check('a track that failed is skipped, another plays after the quiet', next && next !== first, `${first} -> ${next}`);
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall music director checks passed');
process.exit(fails ? 1 : 0);
