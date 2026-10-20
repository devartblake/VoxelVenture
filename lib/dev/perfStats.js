// Render statistics from the 3D canvas (apps/web/components/city/PerfProbe.jsx), read by the multiplayer client
// (lib/net/multiplayer.js) so the client monitor can show draw calls and triangles per device, and the quality tier in force
// with its reasons (lib/performance/runtime.js; docs/architecture/performance_policy.md). frameP95 is the 95th-percentile
// frame time (ms) of the last two seconds of the uncovered city.
export const perfStats = { calls: 0, triangles: 0, geometries: 0, textures: 0, quality: 'high', qualityReasons: '', frameP95: 0 };
