// Where the player "is" for sound: the place whose sounds are heard, and how high above the ground they are looking from. Written every frame by
// components/city/SoundListener.jsx (plain mutable data, like avatarState: it changes too often for React), read by components/SoundEngine.jsx.
//   x, z    in city coordinates: in the original view the middle of the screen (what you are looking at), in the follow views the avatar (or where you look round to)
//   far     0 close to the ground .. 1 high above the map (lib/game/soundZones.js viewFarness)
export const listener = { x: 0, z: 0, far: 0, view: 'iso', zoom: 14, distance: 28, mapOpen: false, ready: false };
