// Recorded music assets, selection, cancellation, fallback and cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const dataModule = (src) => `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
const library = dataModule(fs.readFileSync('lib/content/music.js', 'utf8'));
const { MUSIC_RELEASES } = await import(library);
const director = dataModule(fs.readFileSync('lib/game/musicDirector.js', 'utf8'));
const { createRecordedMusic } = await import(dataModule(fs.readFileSync('components/sound/recordedMusic.js', 'utf8').replace("'@/lib/content/music'", JSON.stringify(library)).replace("'@/lib/game/musicDirector'", JSON.stringify(director))));
const manifest = JSON.parse(fs.readFileSync('public/audio/music/manifest.json'));
assert.equal(MUSIC_RELEASES.length, 8);
assert.equal(manifest.flatMap((r) => r.files).length, 16);
for (const r of manifest) {
  assert.equal(r.license, 'CC0-1.0');
  assert.ok(fs.readFileSync(`docs/licences/music/${r.id}.html`, 'utf8').includes('creativecommons.org/publicdomain/zero'));
  for (const url of r.files) {
    const bytes = fs.readFileSync(`public${url}`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), r.fileHashes[url]);
    if (url.endsWith('.wav')) assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    else if (url.endsWith('.ogg')) assert.equal(bytes.toString('ascii', 0, 4), 'OggS');
    else assert.ok(bytes.toString('ascii', 0, 3) === 'ID3' || bytes[0] === 255);
  }
}

// The player (components/sound/recordedMusic.js) plays the music director's choices (lib/game/musicDirector.js, tested on its own in
// tests/music-director.test.mjs): the procedural fallback while a track downloads, the recording once it plays, mute, failures, cleanup.
const nodes = [];
const ctx = { state: 'running', currentTime: 0,
  createGain: () => ({ gain: { value: 0, setTargetAtTime() {} }, connect() {}, disconnect() {} }),
  createBufferSource: () => { const n = { connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } }; nodes.push(n); return n; },
  decodeAudioData: async () => ({ duration: 1 }),
};
const mix = { music: 0, local: {} };
let downloads = 0;
const player = createRecordedMusic(ctx, {}, { fetchAudio: async () => { downloads++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
let r = player.update(mix, {});
assert.equal(r.layer, 'music');
assert.equal(r.fallback, true); // the procedural tune stands in while the track downloads
await new Promise(setImmediate);
r = player.update(mix, {});
assert.equal(r.sounding, true);
assert.equal(r.fallback, false);
assert.equal(downloads, 1);
assert.ok(MUSIC_RELEASES.some((rel) => rel.files.includes(player.nowPlaying())));
// zooming out is not an input: the same track keeps playing whatever the mix says about the camera
assert.equal(player.update({ music: 1, local: {} }, {}).sounding, true);
assert.equal(downloads, 1);
// getting into a car: the radio, at once (a new track downloads)
player.update(mix, { driving: true });
await new Promise(setImmediate);
assert.equal(downloads, 2);
assert.ok(MUSIC_RELEASES.filter((rel) => ['barriers', 'funked-up', 'funk-collection'].includes(rel.id)).some((rel) => rel.files.includes(player.nowPlaying())));
// the music button stops it
r = player.update(mix, { musicOn: false });
assert.equal(r.sounding, false);
assert.ok(nodes.every((n) => !n.started || n.stopped));
player.close();
assert.equal(player.update(mix, {}).layer, null);
// a closed player cannot start a late download
let finish;
const late = createRecordedMusic(ctx, {}, { fetchAudio: () => new Promise((resolve) => { finish = resolve; }) });
late.update(mix, {});
late.close();
const before = nodes.length;
finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
await new Promise(setImmediate);
assert.equal(nodes.length, before);
// nothing can download: the procedural tunes play instead, once every track has been tried
const broken = createRecordedMusic(ctx, {}, { fetchAudio: async () => ({ ok: false }) });
for (let t = 0; t < 120; t++) {
  ctx.currentTime = t;
  broken.update(mix, {});
  await new Promise(setImmediate);
}
r = broken.update(mix, {});
assert.equal(r.sounding, false);
assert.equal(r.fallback, true);
broken.close();
ctx.currentTime = 0;
console.log('ALL OK: 16 recordings, hashes, CC0 evidence, playlists, steady soundtrack, car radio, mute, fallback and async cleanup');
