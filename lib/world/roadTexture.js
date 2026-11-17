// The surface of the baked roads (docs/world/road_texture.md): the streets were a flat slate colour and the highways a flat amber one, nothing like the old town's streets (dark asphalt with white dashes down the
// middle, apps/web/components/city/Road.jsx). This gives them the town's look: ambientCG's Asphalt031 (CC0, apps/web/public/world/ground/asphalt.jpg) over the colour as DETAIL (divided by its own average, so it only adds
// grain and the colour decides the shade, as the ground's texture does: lib/world/groundTexture.js), a dashed centre line (white on a street, amber on a highway: the highways' old colour, kept as their line) and
// two edge lines on a wide road. The lines come from a per-vertex attribute (`roadUv`, made by lib/world/chunkMesh.js: the distance from the centre line, the distance along the road, the road's half width), so they
// are the same on a road of any width and need no texture. Both fade with distance from the camera (a far road is a plain colour: no shimmer). No React and no `import 'three'`: the caller passes THREE and the
// loaded texture. With no texture the road keeps its plain colour (and its lines are not drawn).
export const ROAD_TEXTURE = {
  tile: 5, // map units one repeat of the asphalt covers
  mean: [0.1956, 0.1956, 0.1956], // the average colour (linear) of asphalt.jpg: what a texel is divided by
  strength: 0.9, // 0: none, 1: the full grain
  grainFadeFrom: 260, // the grain fades out between these distances from the camera
  grainFadeTo: 640,
  lineFadeFrom: 170, // the lines fade out between these
  lineFadeTo: 380,
  dash: { period: 7, on: 3.6, width: 0.13 }, // the centre line: a dash every 7 units, 3.6 long, 0.26 wide (the old town's dashes are 0.2 wide)
  edge: { inset: 0.42, width: 0.07, minHalf: 2.9 }, // an edge line this far in from each edge, on a road at least this half wide (a ring, a spur, a causeway: not a street or a link)
  colours: { street: '#e2e8f0', highway: '#e0a82e', edge: '#e2e8f0' }, // the centre line: the town's white on a street, the highways' amber; the edge lines are white
  base: { street: '#313a49', highway: '#3a4352' }, // the road colours the texture's grain goes over (the old town's streets are #1f2937)
};

/** The per-vertex roadUv a ribbon needs: the signed distance from the centre line (+ on the left, - on the right), the distance along (from `s0`), and the half width. Four vertices (a left, a right, b left, b right). */
export function ribbonRoadUv(w, s0, len) {
  const h = w / 2;
  return [h, s0, h, -h, s0, h, h, s0 + len, h, -h, s0 + len, h];
}

/** Does a point at `offset` from the centre, `along` the road, on a road `half` wide, fall on a line? { centre, edge }: the same maths as the shader's, for the tests. */
export function lineAt(offset, along, half, o = ROAD_TEXTURE) {
  const centre = Math.abs(offset) < o.dash.width && ((along % o.dash.period) + o.dash.period) % o.dash.period < o.dash.on;
  const edge = half >= o.edge.minHalf && Math.abs(Math.abs(offset) - (half - o.edge.inset)) < o.edge.width;
  return { centre, edge };
}

/** Gives a road material (a MeshStandardMaterial) the asphalt and the lines. `kind` is 'street' or 'highway' (the line's colour). `asphalt` is a loaded THREE texture. Returns the material. */
export function applyRoadTexture(THREE, material, asphalt, kind = 'street', options = {}) {
  const o = { ...ROAD_TEXTURE, ...options };
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.colorSpace = THREE.SRGBColorSpace;
  asphalt.anisotropy = 4;
  asphalt.needsUpdate = true;
  material.userData.roadTexture = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAsphalt = { value: asphalt };
    shader.uniforms.uAsphaltMean = { value: new THREE.Vector3(...o.mean) };
    shader.uniforms.uRoad = { value: new THREE.Vector4(o.tile, o.strength, o.grainFadeFrom, o.grainFadeTo) };
    shader.uniforms.uLineFade = { value: new THREE.Vector2(o.lineFadeFrom, o.lineFadeTo) };
    shader.uniforms.uDash = { value: new THREE.Vector3(o.dash.period, o.dash.on, o.dash.width) };
    shader.uniforms.uEdge = { value: new THREE.Vector3(o.edge.inset, o.edge.width, o.edge.minHalf) };
    shader.uniforms.uLineColour = { value: new THREE.Color(o.colours[kind] ?? o.colours.street) };
    shader.uniforms.uEdgeColour = { value: new THREE.Color(o.colours.edge) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 roadUv;\nvarying vec3 vRoadUv;\nvarying vec3 vRWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadUv = roadUv;\nvRWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoadUv;\nvarying vec3 vRWorld;\nuniform sampler2D uAsphalt;\nuniform vec3 uAsphaltMean;\nuniform vec4 uRoad;\nuniform vec2 uLineFade;\nuniform vec3 uDash;\nuniform vec3 uEdge;\nuniform vec3 uLineColour;\nuniform vec3 uEdgeColour;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float depth = length(vViewPosition);
        vec2 p = vRWorld.xz / uRoad.x;
        vec3 a = texture2D(uAsphalt, p).rgb * 0.65 + texture2D(uAsphalt, p * 0.23 + vec2(0.31, 0.57)).rgb * 0.35;
        float grain = 1.0 - smoothstep(uRoad.z, uRoad.w, depth);
        diffuseColor.rgb *= mix(vec3(1.0), clamp(a / uAsphaltMean, 0.45, 1.9), uRoad.y * grain);
        float lines = 1.0 - smoothstep(uLineFade.x, uLineFade.y, depth);
        float halfW = vRoadUv.z;
        float aa = fwidth(vRoadUv.x) * 0.75;
        float centre = (1.0 - smoothstep(uDash.z - aa, uDash.z + aa, abs(vRoadUv.x))) * step(mod(vRoadUv.y, uDash.x), uDash.y);
        float edge = step(uEdge.z, halfW) * (1.0 - smoothstep(uEdge.y - aa, uEdge.y + aa, abs(abs(vRoadUv.x) - (halfW - uEdge.x))));
        diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeColour, edge * lines * 0.92);
        diffuseColor.rgb = mix(diffuseColor.rgb, uLineColour, centre * lines * 0.92);
      }`);
  };
  material.customProgramCacheKey = () => `road-texture-v2-${kind}`;
  material.needsUpdate = true;
  return material;
}
