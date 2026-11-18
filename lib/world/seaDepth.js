// Depth shading for the sea (docs/world/water.md): the sea is one plane over open ocean with no seabed beneath it, so it has no depth to show. This gives it one to look like it has: a raster of the distance from every
// point of the ocean to the nearest coast (made once from the landmasses' coast outlines in the manifest), which the sea's shader reads to colour the water by how far from land it is (pale turquoise and clear in the
// shallows, deep blue and opaque far out) and to draw a foam line where it meets the shore. Pure (no three.js): the raster and the settings are tested in Node; `applySeaDepth` adds the shader to a material.
export const SEA_DEPTH = {
  cell: 24, // the raster's cell, in units (the sea's shading is smooth: a 24-unit cell is enough, and 30,000 cells are made in a fraction of a second)
  maxDist: 510, // the farthest distance kept (the raster stores it in a byte: about 2 units a step)
  shallow: 14, // the water is pale and clear up to about this far from the coast
  deep: 300, // and fully deep from about this far
  foam: 3.2, // the width of the foam line at the shore
  shallowOpacity: 0.62,
  deepOpacity: 0.93,
};

// point in polygon (ray casting) and the distance from a point to a polygon's edges
const inside = (poly, x, z) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
const edgeDist = (poly, x, z, best) => {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
    if (d < best) best = d;
  }
  return best;
};

/**
 * The raster of the SIGNED distance to the coast over `bounds` ({ x0, x1, z0, z1 }): { w, h, x0, z0, cell, maxDist, data } where `data` is a byte for each cell: 128 at the coast, up to 255 at maxDist out at sea and down to 0 at
 * maxDist inland (so a linear filter across the coast is smooth and the coast is where the byte crosses 127.5). `landmasses` are the manifest's ([{ coast: { points: [{ x, z }] } }]).
 */
export function shoreField(landmasses, bounds, { cell = SEA_DEPTH.cell, maxDist = SEA_DEPTH.maxDist } = {}) {
  const w = Math.ceil((bounds.x1 - bounds.x0) / cell), h = Math.ceil((bounds.z1 - bounds.z0) / cell);
  const polys = landmasses.map((l) => ({ pts: l.coast.points, b: l.bounds ?? null }));
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const z = bounds.z0 + (j + 0.5) * cell;
    for (let i = 0; i < w; i++) {
      const x = bounds.x0 + (i + 0.5) * cell;
      let d = maxDist, land = false;
      for (const p of polys) {
        if (p.b && (x < p.b.x0 - maxDist || x > p.b.x1 + maxDist || z < p.b.z0 - maxDist || z > p.b.z1 + maxDist)) continue; // too far from this one to matter
        if (p.b && x >= p.b.x0 && x <= p.b.x1 && z >= p.b.z0 && z <= p.b.z1 && inside(p.pts, x, z)) land = true;
        d = edgeDist(p.pts, x, z, d);
      }
      const signed = (land ? -1 : 1) * Math.min(d, maxDist);
      data[j * w + i] = Math.round(127.5 + (signed / maxDist) * 127.5);
    }
  }
  return { w, h, x0: bounds.x0, z0: bounds.z0, cell, maxDist, data };
}

/** The signed distance to the coast at (x, z) from a raster (the nearest cell; negative on land, maxDist outside it). */
export function shoreSigned(field, x, z) {
  const i = Math.floor((x - field.x0) / field.cell), j = Math.floor((z - field.z0) / field.cell);
  if (i < 0 || j < 0 || i >= field.w || j >= field.h) return field.maxDist;
  return ((field.data[j * field.w + i] - 127.5) / 127.5) * field.maxDist;
}
/** The distance to the coast at (x, z) from a raster: 0 on land. */
export const shoreDistance = (field, x, z) => Math.max(0, shoreSigned(field, x, z));

/** The water's depth shading at a distance from the coast, as the shader computes it: { t (0 shallow to 1 deep), opacity, foam (0 to 1) }. For the tests and for tuning. */
export function shade(distance, s = SEA_DEPTH) {
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const t = smooth(s.shallow * 0.1, s.deep, distance);
  const foam = 1 - smooth(s.foam * 0.4, s.foam, distance);
  return { t, opacity: Math.max(s.shallowOpacity + (s.deepOpacity - s.shallowOpacity) * smooth(0, 0.25, t), foam * 0.9), foam };
}

/**
 * Gives a sea material (a MeshStandardMaterial, transparent) the depth shading: `texture` is a THREE texture of the raster (one byte a cell, linear filtering, clamped). Returns the `uniforms`, whose `uTime` the caller
 * advances for the foam. With no raster nothing changes.
 */
export function applySeaDepth(THREE, material, field, texture, s = SEA_DEPTH, bed = null) {
  const uniforms = {
    uShore: { value: texture },
    uShoreBox: { value: new THREE.Vector4(field.x0, field.z0, 1 / (field.w * field.cell), 1 / (field.h * field.cell)) },
    uSea: { value: new THREE.Vector4(field.maxDist, s.shallow, s.deep, s.foam) },
    uOpacity: { value: new THREE.Vector2(s.shallowOpacity, s.deepOpacity) },
    uTime: { value: 0 },
    // the seabed's profile (lib/world/seabed.js), when it is drawn: the shelf and reach, how fast the water absorbs light and goes blue; and the shallows' floor, the ocean floor and the sea level
    uBed: { value: new THREE.Vector4(bed?.shelf ?? 0, bed?.reach ?? 1, bed?.absorb ?? 0, bed?.tint ?? 0) },
    uBedY: { value: new THREE.Vector3(bed?.shallowY ?? 0, bed?.deepY ?? 0, bed?.seaY ?? 0) },
  };
  material.userData.seaDepth = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;\nuniform sampler2D uShore;\nuniform vec4 uShoreBox;\nuniform vec4 uSea;\nuniform vec2 uOpacity;\nuniform float uTime;\nuniform vec4 uBed;\nuniform vec3 uBedY;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float sd = (texture2D(uShore, (vSeaXZ - uShoreBox.xy) * uShoreBox.zw).r * 2.0 - 1.0) * uSea.x; // signed distance to the coast: negative on land
        float d = max(sd, 0.0);
        float land = smoothstep(-8.0, -40.0, sd); // land that no chunk draws (a chunk not loaded yet) is drawn as deep water, as before
        float t = max(smoothstep(uSea.y * 0.1, uSea.z, d), land);
        vec3 c = mix(vec3(0.22, 0.84, 0.82), vec3(0.10, 0.52, 0.78), smoothstep(0.0, 0.12, t));
        c = mix(c, vec3(0.05, 0.20, 0.42), smoothstep(0.1, 0.85, t));
        float wob = 0.55 * sin(vSeaXZ.x * 0.37 + uTime * 1.3) + 0.45 * sin(vSeaXZ.y * 0.43 - uTime * 1.1);
        float foam = (1.0 - smoothstep(uSea.w * 0.4, uSea.w, d + wob)) * (1.0 - land);
        c = mix(c, vec3(0.96, 0.98, 0.98), foam * 0.85);
        float alpha = mix(uOpacity.x, uOpacity.y, smoothstep(0.0, 0.25, t));
        if (uBed.z > 0.0) {
          // a water column: the depth over the seabed there, the thickness along the view, the light it takes (Beer-Lambert) and the blue it turns
          float bedY = uBedY.x + (uBedY.y - uBedY.x) * smoothstep(uBed.x, uBed.y, d);
          float depth = max(uBedY.z - bedY, 0.0);
          vec3 toEye = cameraPosition - vec3(vSeaXZ.x, uBedY.z, vSeaXZ.y);
          float cosView = max(abs(toEye.y) / max(length(toEye), 0.001), 0.12);
          alpha = 1.0 - exp(-(depth / cosView) * uBed.z);
          alpha = max(alpha, 0.14);
          c = mix(vec3(0.20, 0.84, 0.82), vec3(0.05, 0.20, 0.42), 1.0 - exp(-depth * uBed.w));
          c = mix(c, vec3(0.96, 0.98, 0.98), foam * 0.85);
          alpha = mix(alpha, 0.93, land);
        }
        diffuseColor.rgb = c;
        diffuseColor.a = max(alpha, foam * 0.9);
      }`);
  };
  material.customProgramCacheKey = () => 'sea-depth-v3';
  material.needsUpdate = true;
  return uniforms;
}
