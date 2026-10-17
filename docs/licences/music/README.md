# Recorded music provenance

Eight releases were downloaded from their creator-uploaded OpenGameArt pages on 2026-10-16. Each saved HTML page declares CC0. cc0-1.0.txt preserves the public-domain dedication legal text. The manifest at public/audio/music/manifest.json records source and download URLs, original download hashes, local paths and per-file hashes.

Collection archives were extracted with path containment checks. Duplicate OGG versions and downloaded ZIP containers were omitted from the shipped assets; recordings are otherwise unmodified. Four Happy Chiptunes recordings and six Funk Collection recordings accompany six individual tracks (16 tracks total).

City overview: Wednesday Night and Sideways City. Night overview: Moil. Arcade: Happy Chiptunes. Cafe: Fusion Jazz. Driving: Barriers, Funked Up and Funk Collection. Playback follows existing sound zones, master volume and music mute; procedural tunes cover loading and download/decode failures. Only the active recording downloads, with at most two decoded tracks cached. Original recordings are retained, so tracks without authored loop points may have a short transition between plays.

This addition is explicitly requested by the user despite the roadmap deferral of outside music. It introduces no new sound zones. Hosted CI and listening checks remain separate from automated verification.

## Verification

Production build and lint passed. Focused tests verified asset signatures, file hashes, CC0 evidence, playlist selection, mute, loading/error fallback and cancellation on cleanup; existing credits and sound-zone tests passed. An isolated headless Edge session decoded all 16 recordings and verified actual playback and music mute. Listening balance and mobile-device performance have not been manually reviewed. The audio assets occupy approximately 124 MiB; browser downloads are on demand rather than preloaded.
