# Day and night, lights and sound

## What is built
- **The clock** (`lib/game/dayCycle.js`): one day is 24 real minutes (one city hour is a real minute), computed from the UTC clock, so every player sees the same sky without a server. With a game server, the client asks `/health` (now returns `now`) once and corrects a wrong device clock (`clockOffset`).
- **The lights** (`apps/web/components/city/DayNight.jsx`): ambient, sun and a fill light follow keyframes by the hour. Noon is exactly the old look. The sun rises in the east, crosses the south and sets in the west, so shadows move; its shadow is switched off at night. Night is dark blue moonlight, dawn and dusk are warm.
- **Street lamps** (`apps/web/components/city/nightLights.js`): the lamp heads of straight, diagonal and curved roads share one material, so the baked road meshes follow it: dim by day, bright at night.
- **Windows**: the box buildings' glass material and the 3D building models' colour maps glow warm at night. The glow comes from each material's emissive level, so thousands of windows cost nothing extra.
- **Controls** (bottom right): the time button (Live, Dawn, Day, Dusk, Night), `?time=night` or `?time=14.5` in the address, and the speaker button with a volume slider (`?sound=0` or `?sound=1`). The choice is remembered. Test browsers (`?diag=1`) start in Day and muted.
- **Sound** (`lib/game/soundscape.js`, `apps/web/components/SoundEngine.jsx`): procedural ambience with local CC0 music recordings. A low hum, traffic that follows the hour (rush hours at 8 and 17:30), bird calls by daylight, cricket bursts at night, water by a lake, muffled indoors, quieter traffic in a car. It starts after the first click or key press (browsers require that) and pauses when the tab is hidden.
- Tests: `tests/ambient.test.mjs` (clock, light keyframes, sound levels), and the browser test checks the buttons and `?time=night`.

## Not built yet (a plan, in order of value)
1. **Light pools on the road under each lamp** (an additive instanced disc per lamp, from the same lamp positions), so the streets look lit and not just dotted.
2. **Window lights that differ by building**: a lit/dark pattern per floor by a hash of the plot, with some owners' offices dark after hours, and a shop's sign always lit. Needs a window mask on the model textures or a small shader on the glass.
3. **Car headlights and brake lights** that come on with the lamps. The box cars have head and tail lights (`apps/web/components/city/Traffic.jsx`), but they glow the same by day and night, and the 3D car models have none.
4. **Neon trims** on `tokyo` style buildings (the exterior builder's palette) at their full strength only at night.
5. **A sky** (stars and a moon, a colour at the horizon) instead of the plain dark background outside the land.
6. **A time slider in the interior viewer**, so an owner can see their room by day and night (the interior has its own lights).
7. **Sound**: footsteps, a door when entering a building, and a stronger crowd murmur near busy plazas; recorded loops can replace the synthesised ones later.

## Presence-based sound (like the SimCity games)
The **ambience** depends on where you are and how high you look: close to the ground you hear the places round you, high above the map only a faint murmur of the city, and in between the two crossfade. The **music** is a soundtrack over all of it, at a steady level, picked from what the player is doing (below). This is the "positional audio" plan in [voxelventure_idea_02.md](../competitive-research/voxelventure_idea_02.md) section 6 (retro 8-bit music at Arcade Alley, jazz at a coffee shop), originally built with procedural audio; recorded CC0 playlists now complement those layers.

| Where you are | What you hear |
| :--- | :--- |
| At an **arcade** (a built arcade building; the Arcade Alley district) | 8-bit bass line, lead, drums, coins and lasers (132 bpm) |
| At a **restaurant / cafe** | low-key swing jazz: walking bass, off-beat chords, brushes (Dm7, G7, Cmaj7, A7) |
| At an **office** (SaaS Silicon Strip) | air-conditioning hum and bursts of typing |
| In the **bazaar**, at the pop-up market | crowd murmur and a stall bell now and then |
| In a **park** | birds (more than elsewhere) and the fountain |
| At a **lake, the river or a pier** | water lapping |
| At a **mall** | soft vibraphone shop music and a crowd |
| At the **airport** (it carries 45 units) | jets passing |
| At the **amusement park** (carries 34) | a carousel organ waltz, a crowd, the coaster's rush and screams |
| In the **countryside** (outside the built-up area, more the further out) | wind, cows, birds, crickets at night |
| Beside a **busy street** | traffic by how noisy the road is (arterials most) and the hour, with a horn now and then |
| **High above the map** (zoomed out, the Overview view, or the world map open) | the places fade and the city's hum stays under the soundtrack (the music itself does not change with the zoom: see below). The procedural city music (a pad, a bass and a gentle arpeggio whose mood follows the time of day) is the soundtrack's stand-in while a recording downloads |

- **Where "you" are**: in the original view it is the middle of the screen (what you are looking at, so you can scroll over the city and hear it), in the follow views it is the avatar (or where you look round to). How high you look comes from the zoom (original view: 14 or more is close, 5 is as far as it goes) or the camera distance (follow views: up to 40 is close, 160 is the Overview).
- **At most four local sounds at once** (the loudest), so the mix stays clear and light. Indoors everything is muffled and quieter, the music too.
- **Controls** (bottom right): the speaker button (on/off, volume slider), a **music** button (the city music on/off: `?music=0` starts without it), and a small label with the track and what you hear here ("♪ Sideways City · Arcade · Busy street"). `?sound=0` / `?sound=1` as before.
- **Code**: the rules are pure and tested (`lib/game/soundZones.js` places, falloff, view height, the mix; `lib/game/musicRules.js` the notes), `lib/sim/listener.js` + `apps/web/components/city/SoundListener.jsx` say where the listener is, `apps/web/components/sound/engine.js` makes the sound with the browser's audio, `apps/web/components/SoundEngine.jsx` ties them together. Tests: `tests/sound-zones.test.mjs` and the "presence-based sound" checks in `tests/browser.test.mjs` (arcade near, music far, the music button).
- **The music: one soundtrack, like SimCity's** (`lib/game/musicDirector.js`, played by `apps/web/components/sound/recordedMusic.js`).
  - **What changed:** the music used to follow the camera. Zooming in and out crossed the thresholds where the arcade, cafe and city playlists took over, so each zoom cut the track and started another, and the music's volume rose and fell with the zoom.
  - **How it works now:**
    - The music is one continuous programme at a steady level: a track plays to its end, then about 3.5 s of quiet, then the next.
    - The camera never changes it. Only the ambience of the places round you follows the camera.
    - What plays is picked from criteria about the player, read from where the **avatar** is:

    | Criterion | Playlist | When it changes |
    | --- | --- | --- |
    | Driving a car | `driving`: Barriers, Funked Up, the Funk collection (the radio) | At once, with a 2 s crossfade (and back when you get out) |
    | On foot at the arcade | `arcade`: Happy Chiptunes | After 6 s there, with a 4 s crossfade. Walking past changes nothing, and leaving gives the city back 6 s later |
    | On foot at a restaurant or cafe | `jazz`: Fusion Jazz | The same |
    | Night (the street lamps on, or no sun) | `night`: Moil | At the end of the track playing |
    | Otherwise | `city`: Wednesday Night, Sideways City | At the end of the track playing |

  - **Track order:** each playlist is shuffled once and played round, never the same track twice in a row. Coming back to a playlist goes on with its next track.
  - **Indoors:** the music is quieter, not cut.
  - **Controls:** the music button stops it and starts it again, and the volume slider applies.
  - **The label:** the small label shows the track ("♪ Sideways City · Arcade · Busy street").
  - **The recordings:** 16 recordings from eight OpenGameArt releases, all CC0, in `apps/web/public/audio/music/` and listed in `lib/content/music.js`.
    - **Downloads:** only the track about to play downloads, after the audio is unlocked. At most two decoded tracks are kept, and a download no longer wanted is cancelled.
    - **Crossfades:** two decks, so one track fades out while the next fades in.
    - **Fallback:** while a track downloads, or if none of a playlist's tracks can play, the procedural tunes (`lib/game/musicRules.js`) stand in at the same steady level. They are silent in the quiet between tracks. A track that fails is skipped.
  - **Evidence:** the source pages and CC0 text are in `docs/licences/music/`; the addresses and SHA-256 hashes are in `apps/web/public/audio/music/manifest.json`.
  - **Tests:**
    - `tests/music-director.test.mjs` simulates the rules over time: tracks to the end with a quiet between, day to night at the end of a track, the car at once, the arcade only after a stay, the camera with no say, indoors, the music button, a failed track.
    - `tests/recorded-music.test.mjs` covers the assets and the player: hashes, CC0 evidence, the steady soundtrack, the car radio, mute, fallback, clean-up.
    - `tests/credits.test.mjs` checks the tracks are credited.
  - **Known limit:** tracks without loop points end and the next begins after the quiet. That is intended, like a radio programme.
- **Not built**: a district's own chosen tracks (owners picking music), footsteps and doors, other players' voices and vehicles, rain and weather, the creak of a boat, recorded loops for the remaining places (offices, market, parks, mall, airport, the fun park), seamless loop points.

## Recorded music

At the user's request, eight CC0 releases (16 recordings) now provide city overview, night, arcade, cafe and driving playlists. The existing sound and music controls apply. Procedural music remains the loading/error fallback. Assets are served locally and decoded on demand; at most two tracks are cached. Sources, hashes, preserved source pages and licensing details are in the [music provenance record](../licences/music/README.md).
