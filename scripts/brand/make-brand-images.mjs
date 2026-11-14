// Makes the site's icons and share images, and the social avatar and banners, from the three logo masters in apps/web/public/brand/ (which it only reads:
// the guide, docs/brand/logo_usage_guide.md section 15, says to keep them as they are). Everything comes from the same masters and the same colours, so the
// pieces match. Run it again after a master changes:
//
//   node scripts/brand/make-brand-images.mjs
//
// Writes (and overwrites):
//   apps/web/app/favicon.ico              16, 32 and 48 px, the Double-V mark on its navy tile      (guide section 10)
//   apps/web/app/icon.png                 192 px, the tab and shortcut icon
//   apps/web/app/apple-icon.png           180 px, full-bleed (iOS rounds the corners itself)
//   apps/web/app/opengraph-image.jpg      1200 x 630, the picture a shared link and a search result show (also twitter-image.jpg)
//   apps/web/public/brand/                voxel-venture-icon-192.png, -512.png and -maskable-512.png (the web manifest, structured data)
//   docs/brand/social/                    avatar-400.png, banner-x-1500x500.png, banner-linkedin-1584x396.png (not served: for the accounts)
//
// The tagline is the guide's primary one (section 13), kept apart from the logo. Its font is the first of Segoe UI, Arial or the system sans that this machine has:
// the pictures are committed, so a different machine only matters when they are regenerated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const brand = path.join(root, 'apps/web/public/brand');
const appDir = path.join(root, 'apps/web/app');
const socialDir = path.join(root, 'docs/brand/social');
for (const d of [socialDir]) fs.mkdirSync(d, { recursive: true });

// the guide's working palette (section 8)
const NAVY = '#071A3D';
const NAVY_DEEP = '#040D22';
const VIOLET = '#7138E8';
const LIGHT = '#F4F8FF';
const TAGLINE = 'Explore the city. Discover the business.';
const FONT = 'Segoe UI, Arial, Helvetica, sans-serif';

// the masters, without their transparent margins
const trimmed = async (file) => sharp(path.join(brand, file)).trim({ threshold: 8 }).png().toBuffer();
const mark = await trimmed('voxel-venture-mark.png');
const lockup = await trimmed('voxel-venture-logo-horizontal.png');

/** `buf` scaled to fit inside w x h, as { input, width, height } */
async function fit(buf, w, h) {
  const out = await sharp(buf).resize({ width: Math.round(w), height: Math.round(h), fit: 'inside' }).png().toBuffer();
  const m = await sharp(out).metadata();
  return { input: out, width: m.width, height: m.height };
}
const place = (piece, cx, cy) => ({ input: piece.input, left: Math.round(cx - piece.width / 2), top: Math.round(cy - piece.height / 2) });

const tileBg = (size, radius) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g" cx="50%" cy="40%" r="78%"><stop offset="0" stop-color="#123a7c"/><stop offset="1" stop-color="${NAVY}"/></radialGradient></defs><rect width="${size}" height="${size}" rx="${Math.round(size * radius)}" fill="url(#g)"/></svg>`);
/** the mark on the navy tile: `fraction` of the tile is the mark, `radius` rounds the corners (0 = full-bleed) */
async function tile(size, fraction, radius = 0) {
  const m = await fit(mark, size * fraction, size * fraction);
  return sharp(tileBg(size, radius)).composite([place(m, size / 2, size / 2 + size * 0.005)]).png().toBuffer();
}

const sceneBg = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>
  <linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1456"/><stop offset="0.55" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DEEP}"/></linearGradient>
  <radialGradient id="b" cx="50%" cy="46%" r="55%"><stop offset="0" stop-color="${VIOLET}" stop-opacity="0.28"/><stop offset="1" stop-color="${VIOLET}" stop-opacity="0"/></radialGradient>
  </defs><rect width="${w}" height="${h}" fill="url(#a)"/><rect width="${w}" height="${h}" fill="url(#b)"/></svg>`);
const textSvg = (w, h, text, x, y, size, anchor = 'middle', weight = 600, opacity = 0.92) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${LIGHT}" fill-opacity="${opacity}" letter-spacing="${(size * 0.02).toFixed(1)}">${text}</text></svg>`);

/** the horizontal lockup on the brand gradient, with the tagline under it (apart from the logo) */
async function scene(w, h, { lockupH, cx = w / 2, cy, tagline = true, taglineSize, taglineY, taglineAnchor = 'middle', taglineX = cx }) {
  const l = await fit(lockup, w * 0.9, lockupH);
  const layers = [place(l, cx, cy)];
  if (tagline) layers.push({ input: textSvg(w, h, TAGLINE, taglineX, taglineY, taglineSize, taglineAnchor), left: 0, top: 0 });
  return sharp(sceneBg(w, h)).composite(layers);
}

const written = [];
const save = async (pipeline, file, how = 'png') => {
  const buf = how === 'jpg' ? await pipeline.jpeg({ quality: 88, mozjpeg: true, progressive: true }).toBuffer() : await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
  fs.writeFileSync(file, buf);
  written.push([path.relative(root, file), buf.length]);
  return buf;
};

// ---- icons (guide section 10)
const png = async (size, fraction, radius) => sharp(await tile(size, fraction, radius));
await save(await png(192, 0.8, 0.2), path.join(appDir, 'icon.png'));
await save(await png(180, 0.74, 0), path.join(appDir, 'apple-icon.png'));
await save(await png(192, 0.8, 0.2), path.join(brand, 'voxel-venture-icon-192.png'));
await save(await png(512, 0.8, 0.2), path.join(brand, 'voxel-venture-icon-512.png'));
await save(await png(512, 0.56, 0), path.join(brand, 'voxel-venture-icon-maskable-512.png')); // the mark inside the safe circle (80% of the width)

// favicon.ico: PNG images in an ICO container (every current browser reads them); the small sizes give the mark more of the tile
const icoSizes = [[16, 0.92, 0.18], [32, 0.88, 0.2], [48, 0.84, 0.2]];
const images = [];
for (const [size, fraction, radius] of icoSizes) images.push({ size, data: await sharp(await tile(size, fraction, radius)).png({ compressionLevel: 9 }).toBuffer() });
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((im, i) => {
  const o = 6 + i * 16;
  header[o] = im.size; header[o + 1] = im.size; header.writeUInt16LE(1, o + 4); header.writeUInt16LE(32, o + 6);
  header.writeUInt32LE(im.data.length, o + 8); header.writeUInt32LE(offset, o + 12);
  offset += im.data.length;
});
const ico = Buffer.concat([header, ...images.map((i) => i.data)]);
fs.writeFileSync(path.join(appDir, 'favicon.ico'), ico);
written.push(['apps/web/app/favicon.ico', ico.length]);

// ---- the share image
const og = await save(await scene(1200, 630, { lockupH: 372, cy: 258, taglineSize: 42, taglineY: 556 }), path.join(appDir, 'opengraph-image.jpg'), 'jpg');
fs.writeFileSync(path.join(appDir, 'twitter-image.jpg'), og);
written.push(['apps/web/app/twitter-image.jpg', og.length]);
fs.writeFileSync(path.join(appDir, 'opengraph-image.alt.txt'), 'VoxelVenture, a voxel city of real businesses. A Theoretical Minds Technologies Game. Explore the city. Discover the business.\n');
fs.writeFileSync(path.join(appDir, 'twitter-image.alt.txt'), 'VoxelVenture, a voxel city of real businesses. A Theoretical Minds Technologies Game. Explore the city. Discover the business.\n');

// ---- the social accounts: the avatar is the mark (guide section 4, social media); the banners keep the middle clear of the avatar's overlap
await save(await png(400, 0.7, 0), path.join(socialDir, 'avatar-400.png'));
await save(await scene(1500, 500, { lockupH: 250, cx: 840, cy: 200, taglineSize: 32, taglineY: 410, taglineX: 840 }), path.join(socialDir, 'banner-x-1500x500.png'));
await save(await scene(1584, 396, { lockupH: 200, cx: 900, cy: 156, taglineSize: 28, taglineY: 322, taglineX: 900 }), path.join(socialDir, 'banner-linkedin-1584x396.png'));

for (const [file, bytes] of written) console.log(`${(bytes / 1024).toFixed(1).padStart(7)} KB  ${file}`);
