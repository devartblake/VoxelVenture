// Recorded music assets, selection, cancellation, fallback and cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const dataModule = (src) => `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
const library = dataModule(fs.readFileSync('lib/content/music.js', 'utf8'));
const { MUSIC_RELEASES, recordedMusicChoice } = await import(library);
const { createRecordedMusic } = await import(dataModule(fs.readFileSync('components/sound/recordedMusic.js', 'utf8').replace("'@/lib/content/music'", JSON.stringify(library))));
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
const mix = { music: 1, local: { arcade: 0, jazz: 0 } };
assert.equal(recordedMusicChoice(mix).playlist, 'city');
assert.equal(recordedMusicChoice(mix, { sky: { lamps: 1 } }).playlist, 'night');
assert.equal(recordedMusicChoice(mix, { driving: true }).playlist, 'driving');
assert.equal(recordedMusicChoice(mix, { driving: true, musicOn: false }), null);
assert.equal(recordedMusicChoice({ music: 0, local: { arcade: 1 } }).playlist, 'arcade');
assert.equal(recordedMusicChoice({ music: 0, local: { jazz: 1 } }).playlist, 'jazz');
assert.equal(recordedMusicChoice({ music: 0, local: {} }), null);
const nodes = [];
const ctx = { state: 'running', currentTime: 0,
  createGain: () => ({ gain: { value: 0, setTargetAtTime() {} }, connect() {}, disconnect() {} }),
  createBufferSource: () => { const n = { connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } }; nodes.push(n); return n; },
  decodeAudioData: async () => ({ duration: 1 }),
};
let downloads = 0;
const player = createRecordedMusic(ctx, {}, { fetchAudio: async () => { downloads++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
assert.equal(player.update(mix, {}), null); // procedural fallback during download
await new Promise(setImmediate);
assert.equal(player.update(mix, {}), 'music');
assert.equal(downloads, 1);
assert.equal(player.update(mix, { musicOn: false }), null);
assert.ok(nodes[0].stopped);
player.close();
assert.equal(player.update(mix, {}), null);
let finish;
const late = createRecordedMusic(ctx, {}, { fetchAudio: () => new Promise((resolve) => { finish = resolve; }) });
late.update(mix, {});
late.close();
const before = nodes.length;
finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
await new Promise(setImmediate);
assert.equal(nodes.length, before); // closed player cannot start a late download
const broken = createRecordedMusic(ctx, {}, { fetchAudio: async () => ({ ok: false }) });
broken.update(mix, {});
await new Promise(setImmediate);
assert.equal(broken.update(mix, {}), null);
broken.close();
console.log('ALL OK: 16 recordings, hashes, CC0 evidence, playlists, mute, fallback and async cleanup');
