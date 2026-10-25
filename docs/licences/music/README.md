# Recorded music provenance

Eight releases were downloaded from their creator-uploaded OpenGameArt pages on 2026-10-16. Each saved HTML page declares CC0. cc0-1.0.txt preserves the public-domain dedication legal text. The manifest at public/audio/music/manifest.json records source and download URLs, original download hashes, local paths and per-file hashes.

Collection archives were extracted with path containment checks. Duplicate OGG versions and downloaded ZIP containers were omitted from the shipped assets; recordings are otherwise unmodified except Sideways City (below). Four Happy Chiptunes recordings and six Funk Collection recordings accompany six individual tracks (16 tracks total).

City overview: Wednesday Night and Sideways City. Night overview: Moil. Arcade: Happy Chiptunes. Cafe: Fusion Jazz. Driving: Barriers, Funked Up and Funk Collection. Playback follows existing sound zones, master volume and music mute; procedural tunes cover loading and download/decode failures. Only the active recording downloads, with at most two decoded tracks cached. Original recordings are retained, so tracks without authored loop points may have a short transition between plays.

This addition is explicitly requested by the user despite the roadmap deferral of outside music. It introduces no new sound zones. Hosted CI and listening checks remain separate from automated verification.

## Sideways City: re-encoded (2026-10-24)

Sideways City was released as an uncompressed WAV (`sideways_city_loop.wav`: 32-bit float PCM, 44.1 kHz stereo, 115.2 s, 40,642,838 bytes, SHA-256 `549309746ba2609d7d91d19f5757de6c86a987017e7d0f54aa2a97cb88f8521c`), four times the 10 MB music budget ([asset admission](../../operations/asset_admission.md), section 6). It was re-encoded on 2026-10-24 with ffmpeg 9.0.2 (`-c:a libvorbis -q:a 5 -map_metadata -1`) to `sideways-city.ogg`: Ogg Vorbis, 44.1 kHz stereo, the same 115.2 s (the loop length is unchanged), about 151 kbit/s, 2,179,100 bytes (SHA-256 `65910a27771fb167bb36dbc1f6642bdc0f766df4a44e481f34cb126cf3322127`), the same quality class as the other Vorbis tracks (Wednesday Night about 129 kbit/s, Fusion Jazz about 151 kbit/s). Peak level -1.2 dB before, -0.7 dB after; nothing else was changed. The player decodes it with the Web Audio API like the two other .ogg tracks. CC0 1.0 places the recording in the public domain, so re-encoding needs no permission; the release keeps its id, credit and saved page (`sideways-city.html`), and the manifest records the original download hash (`sha256`) beside the new file's hash (`fileHashes`) and the conversion (`encoded`).

## Verification

Production build and lint passed. Focused tests verified asset signatures, file hashes, CC0 evidence, playlist selection, mute, loading/error fallback and cancellation on cleanup; existing credits and sound-zone tests passed. An isolated headless Edge session decoded all 16 recordings and verified actual playback and music mute. Listening balance and mobile-device performance have not been manually reviewed. The audio assets occupy approximately 124 MiB; browser downloads are on demand rather than preloaded.
