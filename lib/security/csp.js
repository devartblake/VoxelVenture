// The game's Content-Security-Policy (docs/operations/voxelventure_security_action_plan.md, V2), built per request around a nonce.
// apps/web/proxy.js calls it for every page; tests/security-headers.test.mjs checks it. It is plain JS with no imports so the proxy can load it.
//
//   script-src: 'self', the nonce Next.js puts on its own scripts, and 'strict-dynamic' (scripts those load are trusted; nothing else inline runs).
//   'wasm-unsafe-eval' and blob: are for the Draco/KTX2/GLTF loaders and their workers; the props bucket, the API and the presence server
//   are the only other places the page may fetch from. Inline style ATTRIBUTES (React Three Fiber and the UI set them) stay allowed; inline
//   <style> elements need the nonce. Pages may be framed by the site itself only: the pilot tour shows the pages of each stop in an iframe
//   (components/tour/TourPlayer.jsx), so 'none' would break it; no other site can frame them.

const origin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};
const list = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** The addresses the page may reach, from the same NEXT_PUBLIC_ settings the app is built with. */
export function cspSources(env = {}) {
  const props = origin(env.NEXT_PUBLIC_PROPS_BASE_URL);
  const api = origin(env.NEXT_PUBLIC_LIVE_API_URL);
  const mp = [...list(env.NEXT_PUBLIC_MP_URL), ...list(env.NEXT_PUBLIC_MP_URLS)].map(origin).filter(Boolean);
  return { props, api, mp };
}

/**
 * @param {{ nonce: string, env?: Record<string, string|undefined>, dev?: boolean }} o
 * @returns {string} one header value
 */
export function buildCsp({ nonce, env = {}, dev = false }) {
  const { props, api, mp } = cspSources(env);
  const connect = ["'self'", 'blob:', 'data:', api, ...mp, props];
  const directives = [
    ["default-src", ["'self'"]],
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", `'nonce-${nonce}'`]],
    ['style-src-attr', ["'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', props]],
    ['media-src', ["'self'", 'blob:', props]],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', connect],
    ['worker-src', ["'self'", 'blob:']],
    ['frame-ancestors', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['object-src', ["'none'"]],
    ...(api ? [['report-uri', [`${api}/csp-report`]]] : []),
  ];
  return directives.map(([name, values]) => `${name} ${[...new Set(values.filter(Boolean))].join(' ')}`).join('; ');
}

/** CSP_ENFORCE=1 makes it a real policy; anything else only reports, so a mistake cannot break the game. */
export const cspHeaderName = (env = {}) => (env.CSP_ENFORCE === '1' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only');
