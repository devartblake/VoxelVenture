# Day and night, lights and sound

## What is built
- **The clock** (`lib/game/dayCycle.js`): one day is 24 real minutes (one city hour is a real minute), computed from the UTC clock, so every player sees the same sky without a server. With a game server, the client asks `/health` (now returns `now`) once and corrects a wrong device clock (`clockOffset`).
- **The lights** (`components/city/DayNight.jsx`): ambient, sun and a fill light follow keyframes by the hour. Noon is exactly the old look. The sun rises in the east, crosses the south and sets in the west, so shadows move; its shadow is switched off at night. Night is dark blue moonlight, dawn and dusk are warm.
- **Street lamps** (`components/city/nightLights.js`): the lamp heads of straight, diagonal and curved roads share one material, so the baked road meshes follow it: dim by day, bright at night.
- **Windows**: the box buildings' glass material and the 3D building models' colour maps glow warm at night. The glow comes from each material's emissive level, so thousands of windows cost nothing extra.
- **Controls** (bottom right): the time button (Live, Dawn, Day, Dusk, Night), `?time=night` or `?time=14.5` in the address, and the speaker button with a volume slider (`?sound=0` or `?sound=1`). The choice is remembered. Test browsers (`?diag=1`) start in Day and muted.
- **Sound** (`lib/game/soundscape.js`, `components/SoundEngine.jsx`): no sound files; it is synthesised. A low hum, traffic that follows the hour (rush hours at 8 and 17:30), bird calls by daylight, cricket bursts at night, water by a lake, muffled indoors, quieter traffic in a car. It starts after the first click or key press (browsers require that) and pauses when the tab is hidden.
- Tests: `tests/ambient.test.mjs` (clock, light keyframes, sound levels), and the browser test checks the buttons and `?time=night`.

## Not built yet (a plan, in order of value)
1. **Light pools on the road under each lamp** (an additive instanced disc per lamp, from the same lamp positions), so the streets look lit and not just dotted.
2. **Window lights that differ by building**: a lit/dark pattern per floor by a hash of the plot, with some owners' offices dark after hours, and a shop's sign always lit. Needs a window mask on the model textures or a small shader on the glass.
3. **Car headlights and brake lights** that come on with the lamps. The box cars have head and tail lights (`components/city/Traffic.jsx`), but they glow the same by day and night, and the 3D car models have none.
4. **Neon trims** on `tokyo` style buildings (the exterior builder's palette) at their full strength only at night.
5. **A sky** (stars and a moon, a colour at the horizon) instead of the plain dark background outside the land.
6. **A time slider in the interior viewer**, so an owner can see their room by day and night (the interior has its own lights).
7. **Sound**: footsteps, a door when entering a building, and a stronger crowd murmur near busy plazas; recorded loops can replace the synthesised ones later.

## Presence-based sound (like the SimCity games)
What you hear depends on **where you are and how high you look**. Close to the ground you hear the places round you; high above the map you hear the city's music, with only a faint murmur under it; in between the two crossfade. This is the "positional audio" plan in [voxelventure_idea_02.md](voxelventure_idea_02.md) section 6 (retro 8-bit music at Arcade Alley, jazz at a coffee shop), built with no sound files.

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
| **High above the map** (zoomed out, the Overview view, or the world map open) | the city's **music**: a pad, a bass and a gentle arpeggio whose mood follows the time of day (bright by day, warm at dusk and dawn, calm at night) |

- **Where "you" are**: in the original view it is the middle of the screen (what you are looking at, so you can scroll over the city and hear it), in the follow views it is the avatar (or where you look round to). How high you look comes from the zoom (original view: 14 or more is close, 5 is as far as it goes) or the camera distance (follow views: up to 40 is close, 160 is the Overview).
- **At most four local sounds at once** (the loudest), so the mix stays clear and light. Indoors everything is muffled and quieter, and there is no music.
- **Controls** (bottom right): the speaker button (on/off, volume slider), a **music** button (the city music on/off: `?music=0` starts without it), and a small label of what you hear here ("Arcade · Busy street", "City music"). `?sound=0` / `?sound=1` as before.
- **Code**: the rules are pure and tested (`lib/game/soundZones.js` places, falloff, view height, the mix; `lib/game/musicRules.js` the notes), `lib/sim/listener.js` + `components/city/SoundListener.jsx` say where the listener is, `components/sound/engine.js` makes the sound with the browser's audio, `components/SoundEngine.jsx` ties them together. Tests: `tests/sound-zones.test.mjs` and the "presence-based sound" checks in `tests/browser.test.mjs` (arcade near, music far, the music button).
- **No music files**: every tune is made live (`lib/game/musicRules.js`, played by `components/sound/engine.js`; the settings are in `lib/state/soundStore.js`). Outside music (CC0 packs) was considered, but none was added. Any recorded track added later must be listed in `lib/content/credits.js` (the in-game Credits panel) and in `CREDITS.md`; `tests/credits.test.mjs` checks the two agree.
- **Not built**: a district's own chosen tracks (owners picking music), footsteps and doors, other players' voices and vehicles, rain and weather, the creak of a boat, recorded loops in place of the synthesised ones.
