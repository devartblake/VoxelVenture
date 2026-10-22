// Looks inside an asset file without trusting its name: what the bytes are (the file signature), the size of an image or a texture,
// and how many triangles and which textures a .glb holds. Used by the asset-admission check (tests/asset-admission.test.mjs,
// docs/operations/asset_admission.md); nothing here decodes pixels or audio, so it is fast enough to run over every shipped file.
import fs from 'node:fs';

const ascii = (buf, at, n) => buf.toString('latin1', at, at + n);

// What the file's bytes say it is, or null. Compared with the extension, so a renamed file (an .exe called .png) is caught.
export function sniff(buf) {
  if (buf.length >= 12 && buf.readUInt32LE(0) === 0x46546c67) return 'glb';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') return 'webp';
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WAVE') return 'wav';
  if (buf.length >= 12 && buf[0] === 0xab && ascii(buf, 1, 6) === 'KTX 20') return 'ktx2';
  if (buf.length >= 4 && ascii(buf, 0, 4) === 'OggS') return 'ogg';
  if (buf.length >= 3 && (ascii(buf, 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) return 'mp3';
  if (buf.length >= 4 && ascii(buf, 0, 4) === 'VOX ') return 'vox';
  if (buf.length >= 10 && /^#\?(RADIANCE|RGBE)/.test(ascii(buf, 0, 10))) return 'hdr';
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'FORM' && /AIF[FC]/.test(ascii(buf, 8, 4))) return 'aiff';
  if (buf.length >= 4 && ascii(buf, 0, 4) === 'wOF2') return 'woff2';
  if (buf.length >= 4 && ascii(buf, 0, 4) === 'wOFF') return 'woff';
  const head = buf.toString('utf8', 0, Math.min(buf.length, 4096)).replace(/^\u{FEFF}/u, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  if (/^[[{]/.test(head)) return 'json';
  if (/^(#|[\w-]+:|\s*$)/.test(head) && !buf.subarray(0, 4096).includes(0)) return 'text';
  return null;
}

// Width and height of a PNG, JPEG, WebP, KTX2 or Radiance HDR image, or null when it cannot be read.
export function imageSize(buf, kind = sniff(buf)) {
  try {
    if (kind === 'png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (kind === 'ktx2') return { width: buf.readUInt32LE(20), height: buf.readUInt32LE(24) };
    if (kind === 'webp') {
      const chunk = ascii(buf, 12, 4);
      if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
      }
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (kind === 'jpg') {
      let at = 2;
      while (at + 9 < buf.length) {
        if (buf[at] !== 0xff) return null;
        const marker = buf[at + 1];
        const len = buf.readUInt16BE(at + 2);
        // SOF0..SOF15, except DHT (c4), JPG (c8) and DAC (cc)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(at + 7), height: buf.readUInt16BE(at + 5) };
        at += 2 + len;
      }
      return null;
    }
    if (kind === 'hdr') {
      const m = buf.toString('latin1', 0, Math.min(buf.length, 2048)).match(/\n([-+])Y (\d+) ([-+])X (\d+)\n/);
      return m ? { width: Number(m[4]), height: Number(m[2]) } : null;
    }
  } catch {
    return null;
  }
  return null;
}

// A .glb's triangles (summed over its meshes, as the renderer draws one copy of each) and its textures: the embedded images (with
// their sizes) and any image it refers to by address (`external`; a shipped model must not fetch from elsewhere).
export function glbInfo(buf) {
  if (sniff(buf) !== 'glb') return null;
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  const accessors = json.accessors ?? [];
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      const mode = p.mode ?? 4;
      const count = p.indices != null ? accessors[p.indices]?.count ?? 0 : accessors[p.attributes?.POSITION]?.count ?? 0;
      if (mode === 4) triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
    }
  }
  const images = [];
  const external = [];
  for (const img of json.images ?? []) {
    if (img.uri && !img.uri.startsWith('data:')) external.push(img.uri);
    if (img.bufferView == null) continue;
    const view = json.bufferViews?.[img.bufferView];
    if (!view) continue;
    const bytes = buf.subarray(binStart + (view.byteOffset ?? 0), binStart + (view.byteOffset ?? 0) + view.byteLength);
    const kind = sniff(bytes);
    images.push({ kind, ...(imageSize(bytes, kind) ?? { width: null, height: null }) });
  }
  return { triangles, images, external, extensions: json.extensionsUsed ?? [] };
}

// Text in an SVG that would run or fetch something when the file is opened on its own: scripts, event handlers, javascript: links,
// embedded HTML, and references to other sites. Returns the first such thing found, or null.
export function svgHazard(text) {
  const checks = [
    [/<script[\s/>]/i, '<script>'],
    [/<foreignObject[\s/>]/i, '<foreignObject>'],
    [/\son[a-z]+\s*=/i, 'an on… event attribute'],
    [/javascript:/i, 'a javascript: link'],
    [/(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i, 'a link to another site'],
    [/@import/i, 'a CSS @import'],
  ];
  for (const [re, what] of checks) if (re.test(text)) return what;
  return null;
}

// Every file under a folder (relative paths with forward slashes), sorted.
export function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(file, base));
    else out.push(file.slice(base.length + 1));
  }
  return out.sort();
}
