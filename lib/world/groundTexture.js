// The grain of the baked ground (docs/world/streaming_runtime.md, "Ground texture"): the ground is coloured per vertex (grass, beach, rock by height, slope and shore), which is smooth and flat up close. This puts
// ambientCG's grass and dirt (CC0, apps/web/public/world/ground/) over those colours as DETAIL: each texture is divided by its own average colour, so it only adds grain (light and dark, a little hue) and the
// vertex colours keep deciding the overall colour. Grass lies on the flat ground and dirt on the steeper slopes (by the surface's normal); a second, larger sampling of each breaks up the repeating.
// No React and no `import 'three'`: the caller passes THREE and the two loaded textures. With no textures nothing changes.
export const GROUND_TEXTURE = {
  tile: 18, // map units one repeat of the grass covers
  grassMean: [0.1345, 0.2329, 0.0268], // the average colour (linear) of grass.jpg and dirt.jpg: what a texel is divided by
  dirtMean: [0.0947, 0.0538, 0.0376],
  strength: 0.85, // 0: none, 1: the full grain
  steepFrom: 0.86, // a surface whose normal points up less than this starts to show dirt, and is all dirt below steepTo
  steepTo: 0.66,
  fadeFrom: 380, // the grain fades out between these distances from the camera (a far hillside is a smooth colour: no texture shimmer)
  fadeTo: 900,
};

/** Adds the grain to a ground material (a MeshStandardMaterial with vertex colours). `grass` and `dirt` are loaded THREE textures. Returns the material. */
export function applyGroundTexture(THREE, material, grass, dirt, options = {}) {
  const o = { ...GROUND_TEXTURE, ...options };
  for (const t of [grass, dirt]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
  }
  material.userData.groundTexture = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: grass };
    shader.uniforms.uDirt = { value: dirt };
    shader.uniforms.uGrassMean = { value: new THREE.Vector3(...o.grassMean) };
    shader.uniforms.uDirtMean = { value: new THREE.Vector3(...o.dirtMean) };
    shader.uniforms.uGround = { value: new THREE.Vector4(o.tile, o.strength, o.steepFrom, o.steepTo) };
    shader.uniforms.uFade = { value: new THREE.Vector2(o.fadeFrom, o.fadeTo) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;\nvarying vec3 vGNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;\nvarying vec3 vGNormal;\nuniform sampler2D uGrass;\nuniform sampler2D uDirt;\nuniform vec3 uGrassMean;\nuniform vec3 uDirtMean;\nuniform vec4 uGround;\nuniform vec2 uFade;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vGWorld.xz / uGround.x;
        vec3 g = texture2D(uGrass, p).rgb * 0.62 + texture2D(uGrass, p * 0.21 + vec2(0.37, 0.11)).rgb * 0.38;
        vec3 d = texture2D(uDirt, p * 1.3).rgb * 0.62 + texture2D(uDirt, p * 0.27 + vec2(0.71, 0.43)).rgb * 0.38;
        vec3 gd = clamp(g / uGrassMean, 0.35, 2.2);
        vec3 dd = clamp(d / uDirtMean, 0.35, 2.2);
        float steep = smoothstep(uGround.z, uGround.w, normalize(vGNormal).y);
        float depth = length(vViewPosition);
        float near = 1.0 - smoothstep(uFade.x, uFade.y, depth);
        diffuseColor.rgb *= mix(vec3(1.0), mix(gd, dd, steep), uGround.y * near);
      }`);
  };
  material.customProgramCacheKey = () => 'ground-texture-v1';
  material.needsUpdate = true;
  return material;
}
