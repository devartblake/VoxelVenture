import { MUSIC_PLAYLISTS, recordedMusicChoice } from '@/lib/content/music';

// Decode only the active track after the audio context has been unlocked. Keep at most
// two decoded tracks; obsolete downloads are aborted. Procedural music covers loading/errors.
export function createRecordedMusic(ctx, output, { fetchAudio = fetch } = {}) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(output);
  const cache = new Map();
  const failed = new Set();
  const positions = new Map();
  let choice = null;
  let source = null;
  let request = null;
  let pending = null;
  let closed = false;
  let generation = 0;
  const stop = () => {
    generation++;
    request?.abort();
    request = null;
    pending = null;
    if (source) {
      source.onended = null;
      source.stop();
      source.disconnect();
      source = null;
    }
  };
  async function load(url) {
    const version = generation;
    const controller = new AbortController();
    request = controller;
    pending = url;
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
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      node.onended = () => {
        if (source !== node) return;
        node.disconnect();
        source = null;
        positions.set(choice.playlist, (positions.get(choice.playlist) ?? 0) + 1);
      };
      source = node;
      node.start();
    } catch (error) {
      if (error.name !== 'AbortError' && version === generation) failed.add(url);
    } finally {
      if (version === generation) { pending = null; request = null; }
    }
  }
  return {
    update(mix, extras) {
      const next = recordedMusicChoice(mix, extras);
      if (next?.playlist !== choice?.playlist) { stop(); choice = next; }
      else choice = next;
      if (!choice || closed) return null;
      gain.gain.setTargetAtTime(choice.level, ctx.currentTime, 0.5);
      if (ctx.state === 'running' && !source && !pending) {
        const files = MUSIC_PLAYLISTS[choice.playlist].filter((url) => !failed.has(url));
        if (files.length) void load(files[(positions.get(choice.playlist) ?? 0) % files.length]);
      }
      return source ? choice.layer : null;
    },
    close() { closed = true; stop(); cache.clear(); gain.disconnect(); },
  };
}
