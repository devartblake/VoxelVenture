// Asset admission (docs/operations/asset_admission.md): every shipped file belongs to a source in the register
// (lib/content/assetSources.js), is the format its name says and within its class's budget; every outside source has an allowed licence,
// a stored licence and evidence, and credits in the game and in CREDITS.md; every music release and interior prop is licensed, sourced and
// credited; every npm package has an allowed licence. Then the checks themselves are shown to catch what they are for.
import { imp, problemTally, root } from './helpers.mjs';
import { checkDependencies, checkFile, checkFiles, checkSources, globToRegExp, licenseProblem, runAll } from '../scripts/assets/admission.mjs';
import { glbInfo, imageSize, sniff, svgHazard } from '../scripts/assets/inspect.mjs';

const { bad, total } = problemTally(50);

// ---- the repository as it is
const all = await runAll({ root, imp });
for (const p of all.problems) bad('asset admission', p);
const reg = all.reg;
const { CREDITS } = await imp('content/credits.js');
for (const g of all.gaps) console.log(`   gap: ${g}`);
if (all.counts.files < 800) bad('the shipped files are read', String(all.counts.files));
if (all.counts.releases !== 8 || all.counts.props < 140 || all.counts.packages < 300) bad('the music, props and packages are read', JSON.stringify(all.counts));
// a gap may only excuse the assets that were admitted before the process: no new source can carry one
const grandfathered = new Set(['kenney', 'pascal-editor', 'pascal-editor-code', 'openstreetmap']);
for (const s of reg.ASSET_SOURCES) if (s.gaps && !grandfathered.has(s.id)) bad('a new source has no gaps (it is admitted complete)', s.id);

// ---- the licence allow-list
const lic = (id, kind) => licenseProblem(id, kind, reg);
for (const [id, kind] of [['CC0-1.0', 'model'], ['CC-BY-4.0', 'sound'], ['MIT', 'code'], ['BSD-3-Clause', 'code'], ['Apache-2.0', 'code'], ['OFL-1.1', 'font'], ['ODbL-1.0', 'data']]) if (lic(id, kind)) bad('an allowed licence is allowed', `${id} for ${kind}: ${lic(id, kind)}`);
for (const [id, want] of [['AGPL-3.0-only', /AGPL/], ['GPL-3.0-or-later', /GPL/], ['LGPL-2.1', /LGPL/], ['CC-BY-NC-4.0', /NonCommercial/], ['CC-BY-ND-4.0', /NoDerivatives/], ['CC-BY-SA-4.0', /ShareAlike/], ['unknown', /unknown licence/], ['', /unknown licence/], [undefined, /unknown licence/], ['WTFPL', /not on the allow-list/]]) {
  if (!want.test(lic(id, 'model') ?? '')) bad('a refused licence is refused with its reason', `${id}: ${lic(id, 'model')}`);
}
if (!/not allowed for font/.test(lic('MIT', 'font') ?? '')) bad('a licence is limited to its kinds of asset', String(lic('MIT', 'font')));
if (!/not allowed for model/.test(lic('ODbL-1.0', 'model') ?? '')) bad('ODbL is for map data only', String(lic('ODbL-1.0', 'model')));

// ---- a new source must be complete, named, and credited in both lists
const fake = (source, extra = {}) => ({ ...reg, ASSET_SOURCES: [source], ASSET_EXCEPTIONS: {}, ...extra });
const ctx = { root, credits: CREDITS, creditsMd: 'Kenney CC0' };
const newSource = { id: 'new-pack', kind: 'model', name: 'A new pack', by: 'Someone', license: 'CC-BY-4.0', files: [{ glob: 'apps/web/public/x/*.glb', budget: 'prop' }] };
const found = checkSources(fake(newSource), ctx).problems.join('\n');
for (const want of ['"new-pack" needs an https source address', '"new-pack" needs a stored copy of its licence', '"new-pack" needs stored evidence', '"new-pack" needs the version', '"new-pack" needs the date it was downloaded', '"new-pack" needs the code owner who approved it', '"new-pack" has no entry in the in-product credits', 'CREDITS.md does not name "Someone"', 'CREDITS.md does not give the licence CC BY 4.0']) {
  if (!found.includes(want)) bad('an incomplete source is refused, naming the source and the field', want);
}
const agpl = checkSources(fake({ ...newSource, license: 'AGPL-3.0-only' }), ctx).problems.join('\n');
if (!/"new-pack": licence "AGPL-3.0-only" is refused/.test(agpl)) bad('an AGPL source is refused', agpl);
const missingText = checkSources(fake({ ...newSource, licenseText: 'docs/licences/new-pack/LICENSE' }), ctx).problems.join('\n');
if (!missingText.includes('its licence text docs/licences/new-pack/LICENSE is not in the repository')) bad('a licence text that is not stored is refused', missingText);
const kenney = reg.ASSET_SOURCES.find((s) => s.id === 'kenney');
const staleGap = checkSources(fake({ ...kenney, gaps: { ...kenney.gaps, url: 'not recorded' } }), { ...ctx, creditsMd: 'Kenney CC0' }).problems.join('\n');
if (!staleGap.includes('url is present, so remove its entry from gaps')) bad('a gap for a field that is present is refused', staleGap);

// ---- every shipped file must be registered
const unregistered = checkFiles(fake(newSource), { root }).problems;
if (!unregistered.some((p) => /^apps\/web\/public\/models\/kenney\/.+ is not in the asset register/.test(p))) bad('a file in no source is refused, by name', unregistered[0]);
if (!unregistered.some((p) => p.startsWith('asset source "new-pack": apps/web/public/x/*.glb matches no file'))) bad('a source whose files are not there is refused', '');

// ---- file validation and budgets
const budgets = reg.ASSET_BUDGETS;
const ok = (rel, buf, budget) => checkFile(rel, buf, budget, reg);
const glb = (triangles, images = []) => {
  const bin = Buffer.concat(images);
  let at = 0;
  const views = images.map((b) => ({ buffer: 0, byteOffset: (at += b.length) - b.length, byteLength: b.length }));
  const json = { asset: { version: '2.0' }, accessors: [{ count: triangles * 3, componentType: 5123, type: 'SCALAR' }], meshes: [{ primitives: [{ attributes: {}, indices: 0 }] }], bufferViews: views, images: views.map((_, i) => ({ bufferView: i, mimeType: 'image/png' })), buffers: [{ byteLength: bin.length }] };
  let j = Buffer.from(JSON.stringify(json));
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const ch = (len, type) => {
    const c = Buffer.alloc(8);
    c.writeUInt32LE(len, 0);
    c.writeUInt32LE(type, 4);
    return c;
  };
  return Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(b.length, 0x004e4942), b]);
};
const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
if (glbInfo(glb(1234)).triangles !== 1234) bad('a .glb\'s triangles are counted', String(glbInfo(glb(1234)).triangles));
if (JSON.stringify(imageSize(png(640, 480))) !== '{"width":640,"height":480}') bad('a PNG\'s size is read', JSON.stringify(imageSize(png(640, 480))));
if (ok('x/tree.glb', glb(2000), 'prop').length) bad('a model within budget passes', ok('x/tree.glb', glb(2000), 'prop').join());
if (!ok('x/tree.glb', glb(budgets.prop.maxTriangles + 1), 'prop').some((p) => /^x\/tree\.glb: 3001 triangles is over the prop budget of 3000/.test(p))) bad('a model over its triangle budget is refused', '');
if (!ok('x/chair.glb', glb(100, [png(4096, 4096)]), 'interior-prop').some((p) => /embedded 4096 x 4096 texture is over the interior-prop budget of 2048 px/.test(p))) bad('an embedded texture over budget is refused', '');
if (!ok('x/wood.png', png(2048, 2048), 'material').some((p) => /2048 x 2048 is over the material budget of 1024 px/.test(p))) bad('a texture over budget is refused', '');
if (!ok('x/big.mp3', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200 * 1024)]), 'sound').some((p) => /over the sound budget of 128 KB/.test(p))) bad('a file over its size budget is refused', '');
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]);
if (!ok('x/icon.png', exe, 'icon').some((p) => /not a recognised asset format/.test(p))) bad('a program renamed as an image is refused', '');
if (!ok('x/icon.png', glb(10), 'icon').some((p) => /the file is glb but is named \.png/.test(p))) bad('a file whose bytes do not match its name is refused', '');
if (!ok('x/song.wav', Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVE'), Buffer.alloc(10)]), 'sound').some((p) => /wav is not an allowed format for sound/.test(p))) bad('a format outside the class is refused', '');
const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
if (ok('x/a.svg', svg('<path d="M0 0h1"/>'), 'icon').length) bad('a plain SVG passes', '');
for (const body of ['<script>alert(1)</script>', '<rect onload="x()"/>', '<a href="javascript:x()"/>', '<image href="https://example.com/t.png"/>', '<foreignObject/>']) {
  if (!ok('x/a.svg', svg(body), 'icon').some((p) => /the SVG contains/.test(p))) bad('an SVG that runs or fetches something is refused', body);
}
if (svgHazard('<svg xmlns="http://www.w3.org/2000/svg"/>')) bad('the SVG namespace is not a link', '');
if (sniff(Buffer.from('OggS....')) !== 'ogg' || sniff(Buffer.from('#?RADIANCE\n')) !== 'hdr' || sniff(Buffer.from('VOX \x96\0\0\0')) !== 'vox') bad('the formats are recognised by their bytes', '');
if (!globToRegExp('a/**.{mp3,ogg}').test('a/b/c.ogg') || globToRegExp('a/*.glb').test('a/b/c.glb') || !globToRegExp('a/{x,y}/*.png').test('a/y/z.png')) bad('the register\'s globs match as documented', '');

// ---- npm dependencies
const deps = (license, extra = {}) => checkDependencies({ packages: { '': {}, 'node_modules/pkg': { license, ...extra } } }).problems;
if (deps('MIT').length || deps('(MIT OR GPL-3.0)').length || deps('Apache-2.0 AND LGPL-3.0-or-later').length || deps('GPL-3.0', { link: true }).length) bad('allowed dependency licences pass', '');
if (!/pkg is GPL-3.0-only: GPL and AGPL code may not ship/.test(deps('GPL-3.0-only').join())) bad('a GPL dependency is refused', deps('GPL-3.0-only').join());
if (!/AGPL/.test(deps('AGPL-3.0').join())) bad('an AGPL dependency is refused', '');
if (!/not on the dependency allow-list/.test(deps('CC-BY-NC-4.0').join())) bad('a NonCommercial dependency is refused', '');
if (!/has no licence in package-lock.json/.test(deps(undefined).join())) bad('a dependency without a licence is refused', '');

console.log(`${all.counts.files} shipped files in ${all.counts.sources} sources, ${all.counts.releases} music releases, ${all.counts.props} props, ${all.counts.packages} npm packages; ${all.gaps.length} recorded gaps`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
