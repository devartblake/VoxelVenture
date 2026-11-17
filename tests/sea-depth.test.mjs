// The sea's depth shading (lib/world/seaDepth.js, docs/world/water.md): a raster of the signed distance to the coast, the shading it drives, and the shader patch.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { imp, problemTally, root } from './helpers.mjs';
const S = await imp('world/seaDepth.js');
const { SEA_LEVEL } = await imp('world/datum.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));

// ---- the settings
const K = S.SEA_DEPTH;
if (!(K.foam < K.deep && K.shallow < K.deep && K.deep < K.maxDist && K.cell > 0)) bad('the shading distances are ordered: foam, shallow, deep, then the raster\'s reach', JSON.stringify(K));
if (!(K.shallowOpacity > 0.3 && K.shallowOpacity < K.deepOpacity && K.deepOpacity <= 1)) bad('shallow water is clearer than deep water, and neither is more than opaque', '');

// ---- a square island: the signed distance is right
const square = { id: 'sq', bounds: { x0: -100, x1: 100, z0: -100, z1: 100 }, coast: { points: [{ x: -100, z: -100 }, { x: 100, z: -100 }, { x: 100, z: 100 }, { x: -100, z: 100 }] } };
const field = S.shoreField([square], { x0: -400, x1: 400, z0: -400, z1: 400 }, { cell: 10, maxDist: 300 });
if (field.w !== 80 || field.h !== 80 || field.data.length !== 6400) bad('the raster covers the bounds, a cell of 10', `${field.w}x${field.h}`);
const near = (a, b, e) => Math.abs(a - b) <= e;
if (!(S.shoreSigned(field, 0, 0) < -90)) bad('the middle of an island is far inland (negative)', String(S.shoreSigned(field, 0, 0)));
if (!near(S.shoreSigned(field, 150, 0), 50, 7) || !near(S.shoreSigned(field, 0, -200), 100, 7) || !near(S.shoreSigned(field, 250, 250), Math.hypot(150, 150), 10)) bad('the distance out at sea is the distance to the nearest coast (a corner too)', `${S.shoreSigned(field, 150, 0)} ${S.shoreSigned(field, 0, -200)} ${S.shoreSigned(field, 250, 250)}`);
if (!(S.shoreSigned(field, 395, 395) > 250) || S.shoreSigned(field, 9999, 0) !== 300) bad('far from any coast it is the farthest distance, and outside the raster too', '');
if (!(S.shoreDistance(field, 0, 0) === 0 && S.shoreDistance(field, 150, 0) > 40)) bad('shoreDistance is 0 on land', '');
if (!(field.data[40 * 80 + 40] < 128 && field.data[40 * 80 + 79] > 128)) bad('the byte is below 128 on land and above it at sea', '');
// it only grows going out to sea
let last = -Infinity, monotone = true;
for (let x = 100; x < 400; x += 10) { const d = S.shoreSigned(field, x + 5, 0); if (d < last - 1e-6) monotone = false; last = d; }
if (!monotone) bad('the distance only grows going out to sea', '');

// ---- the shading
const a = S.shade(1), b = S.shade(50), c = S.shade(150), d = S.shade(400);
if (!(a.t < b.t && b.t < c.t && c.t < d.t) || !(a.opacity < d.opacity) || d.t < 0.99) bad('the water gets deeper and more opaque away from the coast', JSON.stringify([a, b, c, d]));
if (!(a.foam > 0.9 && S.shade(K.foam * 1.5).foam < 0.01 + (a.foam - 0.9)) || S.shade(100).foam !== 0) bad('there is foam at the shore and none further out', JSON.stringify([a.foam, S.shade(K.foam * 1.5).foam]));
if (a.opacity < K.shallowOpacity - 1e-9 || d.opacity > K.deepOpacity + 1e-9) bad('opacity stays between the shallow and the deep value (the foam aside)', '');

// ---- the real world
const t0 = Date.now();
const real = S.shoreField(manifest.landmasses, manifest.ocean);
const ms = Date.now() - t0;
if (ms > 3000) bad('the raster of the whole ocean is made in a few seconds at most (once, at load)', `${ms} ms`);
if (real.w * real.h > 60000) bad('the raster stays small (a few tens of thousands of cells)', String(real.w * real.h));
if (!(S.shoreSigned(real, 12, -207) < -300)) bad('the middle of the mainland is far inland', String(S.shoreSigned(real, 12, -207)));
if (S.shoreSigned(real, 4000, 1100) < 400) bad('open ocean is far from every coast', String(S.shoreSigned(real, 4000, 1100)));
// the causeways cross water: the middle of the first one is out at sea, a long way from either coast
const cw = manifest.causeways[0];
const mid = { x: (cw.span.from.x + cw.span.to.x) / 2, z: (cw.span.from.z + cw.span.to.z) / 2 };
const dm = S.shoreSigned(real, mid.x, mid.z);
if (!(dm > 100 && dm < 400)) bad('the middle of the first causeway is out at sea, between the coasts', String(dm));
// both ends of the first causeway are near a coast
for (const p of [cw.span.from, cw.span.to]) if (S.shoreSigned(real, p.x, p.z) > 60) bad('the ends of the bridge are at the coast', String(S.shoreSigned(real, p.x, p.z)));

// ---- the shader patch
const material = new THREE.MeshStandardMaterial({ transparent: true });
const texture = new THREE.DataTexture(field.data, field.w, field.h, THREE.RedFormat, THREE.UnsignedByteType);
const uniforms = S.applySeaDepth(THREE, material, field, texture);
const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
material.onBeforeCompile(shader);
if (!(uniforms.uShore.value === texture && shader.uniforms.uShore === uniforms.uShore && shader.uniforms.uTime === uniforms.uTime && material.userData.seaDepth === uniforms)) bad('the shader gets the raster and a clock the caller can advance', '');
if (!(uniforms.uShoreBox.value.z > 0 && near(uniforms.uSea.value.x, 300, 1e-9) && uniforms.uSea.value.w === K.foam)) bad('the shader gets the raster\'s box and the settings', '');
if (!/vSeaXZ = /.test(shader.vertexShader) || !/diffuseColor\.a = /.test(shader.fragmentShader) || !/uShore/.test(shader.fragmentShader) || !/smoothstep\(-8\.0, -40\.0, sd\)/.test(shader.fragmentShader)) bad('the shader colours by distance, makes the opacity and treats undrawn land as deep water', '');
if (material.transparent !== true || SEA_LEVEL !== -0.3) bad('the sea is still the datum\'s translucent plane', '');
console.log(`sea depth: raster ${real.w}x${real.h} (${real.w * real.h} cells) made in ${ms} ms`);
total();
