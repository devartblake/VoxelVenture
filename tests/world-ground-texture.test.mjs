// The grain of the baked ground (lib/world/groundTexture.js, docs/world/streaming_runtime.md, "Ground texture"): the shader patch adds detail to the vertex colours and changes nothing else.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { imp, root } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const { applyGroundTexture, GROUND_TEXTURE } = await imp('world/groundTexture.js');
const { createChunkMaterials } = await imp('world/chunkObject.js');

const materials = createChunkMaterials(THREE);
const before = { vertexColors: materials.ground.vertexColors, roughness: materials.ground.roughness };
const grass = new THREE.Texture(), dirt = new THREE.Texture();
applyGroundTexture(THREE, materials.ground, grass, dirt);
const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
materials.ground.onBeforeCompile(shader);
check('the textures repeat and are read as colour (sRGB)', grass.wrapS === THREE.RepeatWrapping && dirt.wrapT === THREE.RepeatWrapping && grass.colorSpace === THREE.SRGBColorSpace);
check('the shader gets both textures, the averages they are divided by, and the settings', shader.uniforms.uGrass.value === grass && shader.uniforms.uDirt.value === dirt && shader.uniforms.uGrassMean.value.y > 0 && shader.uniforms.uGround.value.x === GROUND_TEXTURE.tile && shader.uniforms.uFade.value.y === GROUND_TEXTURE.fadeTo);
check('the vertex shader passes the world position and the normal on, the fragment shader multiplies the vertex colour by the grain', /vGWorld = /.test(shader.vertexShader) && /vGNormal = normal/.test(shader.vertexShader) && /diffuseColor\.rgb \*= /.test(shader.fragmentShader) && /smoothstep\(uGround\.z, uGround\.w/.test(shader.fragmentShader));
check('the material is still the vertex-coloured, rough ground it was (the grain is detail, not a new colour)', materials.ground.vertexColors === before.vertexColors && materials.ground.roughness === before.roughness && materials.ground.userData.groundTexture === true);
check('the other materials are untouched (roads, highways, track)', ['roads', 'highways', 'track'].every((k) => !materials[k].onBeforeCompile.toString().includes('uGrass')));
check('the grain is a detail: its average is 1 (a texture divided by its own mean), and fades out with distance', GROUND_TEXTURE.strength <= 1 && GROUND_TEXTURE.fadeFrom < GROUND_TEXTURE.fadeTo);

// the files: two small JPEGs, listed in the admission register
const dir = path.join(root, 'apps/web/public/world/ground');
const files = fs.readdirSync(dir).sort();
check('the folder holds grass.jpg and dirt.jpg and nothing else, each under 512 KB', files.join() === 'dirt.jpg,grass.jpg' && files.every((f) => fs.statSync(path.join(dir, f)).size < 512 * 1024));
const jpg = (f) => { const b = fs.readFileSync(path.join(dir, f)); return b[0] === 0xff && b[1] === 0xd8; };
check('and they are JPEG files', files.every(jpg));

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
