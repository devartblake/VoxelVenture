// A business owner can show a video or a game demo inside their storefront. Anything a user types
// into a page that ends up in an <iframe> is dangerous, so nothing is embedded as typed. A link is
// only accepted if it is one of a short list of known services AND it matches that service's exact
// URL shape; it is then rebuilt from the ID alone, so no other part of what the user typed (query
// strings, extra paths, credentials) ever reaches the iframe.

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const NUMERIC_ID = /^[0-9]{1,12}$/;

function parse(input) {
  let url;
  try {
    url = new URL(String(input ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null; // no http:, javascript:, data: ...
  if (url.username || url.password) return null; // no embedded credentials
  if (url.port && url.port !== '443') return null;
  return url;
}

const hostIs = (url, ...hosts) => hosts.includes(url.hostname.toLowerCase());

// Videos: YouTube (watch, short link, embed or shorts) and Vimeo.
function videoEmbed(url) {
  if (hostIs(url, 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com')) {
    const parts = url.pathname.split('/').filter(Boolean);
    let id = null;
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0]) && parts.length === 2) id = parts[1];
    return id && YOUTUBE_ID.test(id) ? { url: `https://www.youtube-nocookie.com/embed/${id}`, service: 'YouTube' } : null;
  }
  if (hostIs(url, 'youtu.be')) {
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length === 1 && YOUTUBE_ID.test(parts[0]) ? { url: `https://www.youtube-nocookie.com/embed/${parts[0]}`, service: 'YouTube' } : null;
  }
  if (hostIs(url, 'vimeo.com', 'www.vimeo.com', 'player.vimeo.com')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const id = parts[0] === 'video' && parts.length === 2 ? parts[1] : parts.length === 1 ? parts[0] : null;
    return id && NUMERIC_ID.test(id) ? { url: `https://player.vimeo.com/video/${id}`, service: 'Vimeo' } : null;
  }
  return null;
}

// Game demos: itch.io's embed pages (https://itch.io/embed-upload/ID for a web game, /embed/ID for the widget).
function gameEmbed(url) {
  if (!hostIs(url, 'itch.io', 'www.itch.io')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 2 && ['embed-upload', 'embed'].includes(parts[0]) && NUMERIC_ID.test(parts[1])) {
    return { url: `https://itch.io/${parts[0]}/${parts[1]}`, service: 'itch.io' };
  }
  return null;
}

const EXAMPLES = {
  video: 'a YouTube or Vimeo link, e.g. https://youtu.be/dQw4w9WgXcQ',
  game: 'an itch.io embed link, e.g. https://itch.io/embed-upload/1234567',
};

// kind: 'video' | 'game'. Returns { ok: true, url, service } or { ok: false, error }. An empty
// input is fine and means "none" ({ ok: true, url: null }).
export function toEmbedUrl(kind, input) {
  if (input == null || String(input).trim() === '') return { ok: true, url: null, service: null };
  const url = parse(input);
  if (!url) return { ok: false, error: `That isn't a valid https link. Use ${EXAMPLES[kind]}.` };
  const result = kind === 'game' ? gameEmbed(url) : videoEmbed(url);
  if (!result) return { ok: false, error: `Only ${kind === 'game' ? 'itch.io' : 'YouTube and Vimeo'} links can be embedded. Use ${EXAMPLES[kind]}.` };
  return { ok: true, ...result };
}

// What the <iframe> is allowed to do. Scripts must run for a video or game to play, and the frame is
// a different origin from the app, so same-origin here only lets the embed use its own storage.
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';
