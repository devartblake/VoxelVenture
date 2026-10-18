// The music director: which recording plays, and when it changes (docs/world/day_night_sound.md, "Music").
//
// Like the SimCity soundtracks, the music is one continuous programme at a steady level: a track plays to its end, a short pause, then the
// next. How high or far the camera is never changes it (only the ambience of the places round you follows the camera). What plays is picked
// from criteria about the player, not the camera, in this order:
//
//   driving                 you drive a car (or sail)           -> 'driving' (the radio)   at once, a short crossfade
//   at the arcade / a cafe  on foot, there for ZONE_DWELL s     -> 'arcade' / 'jazz'       a crossfade, once you have stayed (or left) a while
//   night                   the street lamps are on             -> 'night'                 at the end of the track playing
//   otherwise                                                  -> 'city'                  at the end of the track playing
//
// Each playlist is shuffled once and played round, never the same track twice in a row; coming back to a playlist goes on with its next
// track. Indoors the music is quieter, not cut; the music button stops it. Pure (no audio): `step()` is fed the player's state and the
// time, and answers what the audio player should do. Tested in tests/music-director.test.mjs.

export const ZONE_DWELL = 6; // seconds at the arcade or a cafe (or away from it) before its music takes over (or gives back)
export const GAP = 3.5; // seconds of quiet between two tracks
export const FADE = { driving: 2, zone: 4, end: 0 }; // crossfade lengths: getting in or out of a car, a place, the end of a track
export const LEVEL = { base: 0.5, indoors: 0.25, driving: 0.45 };
const ZONE_PLAYLISTS = ['arcade', 'jazz'];
export const ZONE_STRENGTH = 0.5; // how near a place counts as being at it (zoneWeights at the avatar: 1 inside, fading to 0 round it)

// A shuffled order of a playlist's tracks, from a random stream (Math.random by default).
function order(n, rand) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The playlist the criteria want, before any waiting. `zone` is 'arcade', 'jazz' or null (already held for ZONE_DWELL by the caller).
export function wantedPlaylist({ driving = false, zone = null, night = false } = {}) {
  if (driving) return 'driving';
  if (ZONE_PLAYLISTS.includes(zone)) return zone;
  return night ? 'night' : 'city';
}

// Night, for the music: the street lamps are (nearly) all on, or the sun is down (skyAt in lib/game/dayCycle.js).
export const isNightSky = (sky) => (sky?.lamps ?? 0) > 0.85 || (sky?.sun?.intensity ?? 1.5) < 0.05;

// The place the avatar is at, from zoneWeights at its position (not the camera's): the stronger of the arcade and a cafe, or null.
export function zoneAt(weights = {}) {
  const arcade = weights.arcade ?? 0;
  const jazz = weights.jazz ?? 0;
  if (Math.max(arcade, jazz) < ZONE_STRENGTH) return null;
  return arcade >= jazz ? 'arcade' : 'jazz';
}

// createMusicDirector({ playlists: { name: [url, ...] }, rand })
//   step({ now, musicOn, driving, indoors, night, zone, playing, ended, failed })
//     now      seconds (any clock that only goes forward)
//     playing  the audio player has a track sounding; ended: the track it was playing has just finished; failed: [urls that cannot play]
//   -> { playlist, level, play: { url, fade } | null, stop: fade | null, title: url | null }
//     play: start this track now (crossfading over `fade` seconds from whatever plays); stop: fade out over `fade` and play nothing
export function createMusicDirector({ playlists, rand = Math.random }) {
  const orders = {};
  const next = {}; // the next position in each playlist's order
  const s = { playlist: null, url: null, zone: null, zoneSince: 0, zoneSeen: null, waitUntil: null, last: {} };

  const pick = (name, failed) => {
    const files = playlists[name] ?? [];
    if (!files.length) return null;
    orders[name] ??= order(files.length, rand);
    for (let tries = 0; tries < files.length; tries++) {
      const i = next[name] ?? 0;
      next[name] = (i + 1) % files.length;
      const url = files[orders[name][i]];
      if (failed?.has?.(url)) continue;
      if (url === s.last[name] && files.length > 1 && tries < files.length - 1) continue; // never the same one twice in a row
      s.last[name] = url;
      return url;
    }
    return null;
  };

  return {
    state: s,
    step({ now = 0, musicOn = true, driving = false, indoors = false, night = false, zone = null, playing = false, ended = false, failed = null } = {}) {
      const level = driving ? LEVEL.driving : indoors ? LEVEL.indoors : LEVEL.base;
      if (!musicOn) {
        const was = s.url;
        s.url = null;
        s.playlist = null;
        s.waitUntil = null;
        return { playlist: null, level: 0, play: null, stop: was ? 1 : null, title: null };
      }
      // the place, held for a while before it counts (in or out), so walking past a cafe does not flip the music
      const seen = driving ? null : zone;
      if (seen !== s.zoneSeen) {
        s.zoneSeen = seen;
        s.zoneSince = now;
      }
      if (now - s.zoneSince >= ZONE_DWELL) s.zone = s.zoneSeen;
      if (driving) s.zone = null;
      const want = wantedPlaylist({ driving, zone: s.zone, night });
      const out = { playlist: s.playlist, level, play: null, stop: null, title: s.url };

      // nothing yet (the start, or after the music button): begin at once
      if (!s.playlist) {
        s.playlist = want;
        s.url = pick(want, failed);
        s.waitUntil = null;
        return { ...out, playlist: want, play: s.url ? { url: s.url, fade: 1 } : null, title: s.url };
      }
      // a car or a place: change now, with a crossfade
      const urgent = want !== s.playlist && (want === 'driving' || s.playlist === 'driving' || ZONE_PLAYLISTS.includes(want) || ZONE_PLAYLISTS.includes(s.playlist));
      if (urgent) {
        const fade = want === 'driving' || s.playlist === 'driving' ? FADE.driving : FADE.zone;
        s.playlist = want;
        s.url = pick(want, failed);
        s.waitUntil = null;
        return { ...out, playlist: want, play: s.url ? { url: s.url, fade } : null, stop: s.url ? null : fade, title: s.url };
      }
      // the end of a track: a short quiet, then the next, from the playlist wanted now (day and night change here)
      if (ended || (!playing && s.waitUntil == null && s.url == null)) s.waitUntil = now + GAP;
      if (s.waitUntil != null) {
        if (now < s.waitUntil) return { ...out, title: null };
        s.waitUntil = null;
        s.playlist = want;
        s.url = pick(want, failed);
        return { ...out, playlist: want, play: s.url ? { url: s.url, fade: FADE.end } : null, title: s.url };
      }
      return out;
    },
  };
}
