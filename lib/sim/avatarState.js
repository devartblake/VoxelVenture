// The avatar's live state. Plain mutable data on purpose: it changes every frame, so it must
// not live in React state or the zustand store (that would re-render the UI 60 times a second).
// The 3D avatar writes it; the mini-map and the interaction check read it.
//   x, z   : position in city coordinates (the space roads and plots are drawn in)
//   yaw    : heading as a rotation about Y; the avatar faces (sin yaw, cos yaw)
//   ready  : false until the avatar has been placed in the city
//   target : where a click on the ground sent it ({ x, z }) or null
//   emote  : the emote being played ({ name, t }) or null
//   joy    : on-screen joystick, { x, y } each -1..1 (right / up), or null when not held
//   run    : the on-screen run toggle
//   vehicle : the car or boat being driven ({ kind, id, x, z, yaw, speed, color }) or null; while set, x / z / yaw follow it
//   cameraYaw : the camera's heading round the avatar (angle from +Z towards +X); walking is relative to it. 45 degrees is the isometric view.
export const avatarState = { x: 0, z: 0, yaw: 0, moving: false, ready: false, target: null, emote: null, joy: null, run: false, cameraYaw: Math.PI / 4, vehicle: null };
