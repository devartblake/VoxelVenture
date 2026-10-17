import { MUSIC_PLAYLISTS, MUSIC_RELEASES } from '@/lib/content/music';
import { createMusicDirector, isNightSky } from '@/lib/game/musicDirector';

// Plays what the music director (lib/game/musicDirector.js) picks: one continuous soundtrack, a track to its end, a short quiet, the next;
// a crossfade when you get into a car or settle at the arcade or a cafe. Two decks, so one track can fade out while the next fades in.
// Only the track about to play is downloaded (after the audio is unlocked), at most two decoded tracks are kept, and a download no longer
// wanted is cancelled. While a track downloads, or if none of a playlist's tracks can play, the procedural tunes stand in (`fallback`).
const LAYER = { city: 'music', night: 'music', driving: 'music', arcade: 'arcade', jazz: 'jazz' }; // the procedural layer standing in for each
const TITLES = new Map(MUSIC_RELEASES.flatMap((r) => r.files.map((url) => [url, { title: r.title, artist: r.artist }])));
export const trackInfo = (url) => (url ? TITLES.get(url) ?? null : null);

export function createRecordedMusic(ctx, output, { fetchAudio = fetch, rand = Math.random, playlists = MUSIC_PLAYLISTS } = {}) {
  const director = createMusicDirector({ playlists, rand });
  const bus = ctx.createGain(); // the music's level (steady; quieter indoors)
  bus.gain.value = 0;
  bus.connect(output);
  const decks = [0, 1].map(() => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    return { gain, source: null, url: null };
  });
  let live = 0;
  const cache = new Map();
  const failed = new Set();
  let request = null;
  let loading = null;
  let ended = false;
  let closed = false;
  let generation = 0;

  const fadeOut = (deck, seconds) => {
    const src = deck.source;
    deck.source = null;
    deck.url = null;
    deck.gain.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.03, seconds / 3));
    if (src) {
      src.onended = null;
      try {
        src.stop(ctx.currentTime + seconds + 0.2);
      } catch {
        /* already stopped */
      }
    }
  };
  const cancel = () => {
    generation++;
    request?.abort();
    request = null;
    loading = null;
  };

  async function start(url, fade) {
    cancel();
    const version = generation;
    const controller = new AbortController();
    request = controller;
    loading = url;
    try {
      let buffer = cache.get(url);
      if (!buffer) {
        const response = await fetchAudio(encodeURI(url), { signal: controller.signal });
        if (!response.ok) throw new Error('Music download failed');
        buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (closed || version !== generation) return;
        cache.set(url, buffer);
        if (cache.size > 2) cache.delete(cache.keys().next().value);
      }
      if (closed || version !== generation) return;
      const old = decks[live];
      const deck = decks[1 - live];
      if (deck.source) fadeOut(deck, 0.05);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(deck.gain);
      node.onended = () => {
        if (deck.source !== node) return;
        node.disconnect();
        deck.source = null;
        deck.url = null;
        ended = true; // the director starts the next after a short quiet
      };
      deck.source = node;
      deck.url = url;
      if (fade > 0) deck.gain.gain.setTargetAtTime(1, ctx.currentTime, fade / 3);
      else deck.gain.gain.value = 1;
      node.start();
      if (old.source) fadeOut(old, Math.max(fade, 0.3));
      live = 1 - live;
    } catch (error) {
      if (error.name !== 'AbortError' && version === generation) {
        failed.add(url);
        ended = true; // as if it had played: the next track is tried
      }
    } finally {
      if (version === generation) {
        loading = null;
        request = null;
      }
    }
  }

  return {
    // -> { layer, level, sounding, fallback }: the procedural layer that stands for this music, its level, whether a recording sounds,
    //    and whether the procedural layer should play instead (while a track downloads, or when a playlist cannot play at all)
    update(mix, extras = {}) {
      if (closed || ctx.state !== 'running') return { layer: null, level: 0, sounding: false, fallback: false };
      const playing = Boolean(decks[live].source) || Boolean(loading);
      const d = director.step({ now: ctx.currentTime, musicOn: extras.musicOn !== false, driving: Boolean(extras.driving), indoors: Boolean(extras.indoors), night: isNightSky(extras.sky), zone: extras.zone ?? null, playing, ended, failed });
      ended = false;
      if (d.stop != null) {
        cancel();
        for (const deck of decks) if (deck.source) fadeOut(deck, d.stop);
      }
      if (d.play) void start(d.play.url, d.play.fade);
      bus.gain.setTargetAtTime(d.level, ctx.currentTime, 0.5);
      const sounding = Boolean(decks[live].source);
      const unplayable = Boolean(d.playlist) && (playlists[d.playlist] ?? []).every((url) => failed.has(url));
      return { layer: d.playlist ? LAYER[d.playlist] : null, level: d.level, sounding, fallback: Boolean(d.playlist) && !sounding && (Boolean(loading) || unplayable) };
    },
    nowPlaying: () => decks[live].url,
    close() {
      closed = true;
      cancel();
      for (const deck of decks) {
        if (deck.source) fadeOut(deck, 0.05);
        deck.gain.disconnect();
      }
      cache.clear();
      bus.disconnect();
    },
  };
}
