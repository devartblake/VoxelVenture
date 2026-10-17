import { MAX_IMAGE_CHARS, isImageUrl } from '@/lib/game/logos';

// Turns a picture the owner chose into a small data: URL for their roof banner: scaled to fit a 128 x 128 square (kept
// whole, on a transparent background) and saved as a PNG, or a WebP if that is much smaller. Nothing is uploaded anywhere:
// the picture lives in the saved game. Rejects with a message the owner can read.
const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_FILE = 5 * 1024 * 1024;

const load = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as a picture.'));
    };
    img.src = url;
  });

export async function fileToLogoImage(file) {
  if (!file) throw new Error('Choose a picture.');
  if (!OK_TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG, WebP, GIF or SVG picture.');
  if (file.size > MAX_FILE) throw new Error('That picture is over 5 MB. Choose a smaller one.');
  const img = await load(file);
  const w = img.naturalWidth || img.width || 128;
  const h = img.naturalHeight || img.height || 128;
  for (const size of [128, 96, 64]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const k = Math.min(size / w, size / h);
    ctx.drawImage(img, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
    for (const [type, quality] of [['image/png'], ['image/webp', 0.85]]) {
      const url = canvas.toDataURL(type, quality);
      if (url.startsWith(`data:${type}`) && isImageUrl(url)) return url;
    }
  }
  throw new Error(`That picture is too detailed to keep (the limit is about ${Math.round(MAX_IMAGE_CHARS / 1400)} KB once shrunk). Try a simpler one.`);
}
