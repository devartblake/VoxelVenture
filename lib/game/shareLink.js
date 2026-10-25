// Links to a building, and the badge a business puts on its own website. Pure, so it is tested in Node.
//
//   /?plot=12&city=20260101      opens the city, glides the camera to building 12 and opens its card (`city` says which city the id belongs to)
//   /b/12                        the short form: redirects to the one above (apps/web/app/b/[id]/page.jsx)
//
// A building's id is a number (a plot) or a short code (a mall store: mall-1-s3).
const ID = /^[A-Za-z0-9_-]{1,40}$/;
export const isPlotId = (v) => ID.test(String(v ?? ''));

export function buildingPath(plot, seed) {
  const id = encodeURIComponent(String(plot?.id ?? plot));
  return `/?plot=${id}${seed != null ? `&city=${encodeURIComponent(String(seed))}` : ''}`;
}
export const buildingUrl = (origin, plot, seed) => `${String(origin ?? '').replace(/\/+$/, '')}${buildingPath(plot, seed)}`;

// What a link asks for: { plot, city } (plot is null when there is no valid building id; city is a number or null).
export function parseDeepLink(search) {
  const q = new URLSearchParams(search ?? '');
  const raw = q.get('plot') ?? q.get('building');
  const city = q.get('city');
  return { plot: isPlotId(raw) ? String(raw) : null, city: /^\d{1,12}$/.test(city ?? '') ? Number(city) : null };
}

// The plot an ad's address points at, when it is a building in this city (/b/12, /?plot=12 or /?building=12 on this site),
// else null. An ad for a business in the city can then take the player there, and the visit counts for that ad space.
export function cityPlotOf(url, here = typeof window === 'undefined' ? null : window.location.host) {
  let u;
  try {
    u = new URL(String(url ?? ''), here ? `https://${here}` : 'https://voxelventure.app');
  } catch {
    return null;
  }
  if (!(u.host === here || u.host === 'voxelventure.app' || u.host.endsWith('.voxelventure.app'))) return null;
  const path = u.pathname.match(/^\/b\/(\d+)\/?$/);
  return path ? path[1] : parseDeepLink(u.search).plot;
}

// Find the building a link names: a plot by id (ids are numbers in the city, so "12" matches plot 12), or a mall store by its code.
export function findBuilding(id, plots, layout) {
  if (id == null) return null;
  const plot = plots.find((p) => String(p.id) === String(id));
  if (plot) return { kind: 'plot', plot };
  for (const mall of layout?.malls ?? []) {
    const store = mall.stores.find((s) => s.id === id);
    if (store) return { kind: 'store', store, mall };
  }
  return null;
}

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The label on the badge: "Visit our 3D flagship on VoxelVenture · Plot #12".
export const badgeLabel = (plot) => `Visit our 3D ${plot?.luxury || plot?.grand ? 'flagship' : 'building'} on VoxelVenture · Plot #${plot?.id}`;

// A self-contained badge to paste into a website: one link, styled inline, no scripts and nothing loaded from anywhere.
export function badgeHtml(url, plot) {
  const style = 'display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#0b1020;color:#ffffff;font:600 13px/1 system-ui,-apple-system,Segoe UI,sans-serif;text-decoration:none;border:1px solid #6366f1';
  const dot = 'width:10px;height:10px;border-radius:3px;background:linear-gradient(135deg,#8b5cf6,#22d3ee)';
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="${style}"><span style="${dot}"></span>${escapeHtml(badgeLabel(plot))}</a>`;
}
export const badgeMarkdown = (url, plot) => `[${badgeLabel(plot)}](${url})`;

// A caption for sharing the building on a social site.
export const shareCaption = (plot, district) => `${plot?.title ?? 'A building'}${district ? ` on ${district}` : ''}: step inside the 3D storefront on VoxelVenture.`;
