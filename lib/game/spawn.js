import { AVATAR_RADIUS, findSpawn, isBlocked } from '../sim/collision';
import { findBuilding, parseDeepLink } from './shareLink';

// Where a new player starts. Everyone used to appear at the same spot (the middle of the first arterial avenue, findSpawn); now each page
// load picks one of many good spots spread over the city. Pure, so it is tested in Node (tests/spawn.test.mjs).
//
//   spawnCandidates(layout, collision, plots)  every good starting spot, worked out from the layout alone (the same list every time for a city)
//   pickSpawn(candidates, rand)                one of them, uniformly at random (`rand` returns 0..1, Math.random by default)
//   startSpot({ layout, collision, plots, search })  what the avatar uses: ?spawn=fixed keeps the old spot; a building link (?plot=12) starts
//                                              beside that building; otherwise a random candidate; findSpawn when there is none
//
// A good spot is on a pavement of a straight road (both sides, every SPAWN_SPACING units), not blocked by anything solid (buildings, water, hills,
// hedges, stalls), not on an airport's runway or apron, not inside a plot, and with SPAWN_BUSINESSES businesses within SPAWN_NEAR units
// (no empty edges: there is something to see). So that no one district gets everyone, none keeps more than DISTRICT_CAP of the spots
// (the extra ones are thinned evenly, the same way every time). The game does not save where you were, so this is every visit's start.

export const SPAWN_SPACING = 6;
export const SPAWN_NEAR = 25; // businesses must stand this close...
export const SPAWN_BUSINESSES = 3; // ...and at least this many of them
export const DISTRICT_CAP = 0.3; // the most of the spots any one district keeps
export const SPAWN_EDGE = 0.8; // no spot further from the city's centre than this share of its businesses: never on the outer edge, looking out at nothing
const PAVEMENT = 1.1; // from a road's centre line to the middle of its pavement (asphalt 0.8, corridor 1.4)
const CLEAR = AVATAR_RADIUS + 0.1;
const SKIP_KINDS = new Set(['airport']);
const BUCKET = 25;

const inBox = (b, x, z, pad = 0) => b && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;

function insidePlot(p, x, z) {
  const hw = (p.w ?? 3) / 2;
  const hd = (p.d ?? 3) / 2;
  const dx = x - p.x;
  const dz = z - p.z;
  const yaw = p.yaw ?? 0;
  if (!yaw) return Math.abs(dx) < hw && Math.abs(dz) < hd;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return Math.abs(dx * c - dz * s) < hw && Math.abs(dx * s + dz * c) < hd;
}

// plots in square buckets, for "what is near (x, z)"
function bucketed(plots) {
  const grid = new Map();
  for (const p of plots) {
    const k = `${Math.floor(p.x / BUCKET)},${Math.floor(p.z / BUCKET)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return (x, z) => {
    const out = [];
    const bx = Math.floor(x / BUCKET);
    const bz = Math.floor(z / BUCKET);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of grid.get(`${bx + i},${bz + j}`) ?? []) out.push(p);
    return out;
  };
}

const isBusiness = (p) => Boolean(p.owner) && p.buildingType !== 'house';

export function spawnCandidates(layout, collision, plots = []) {
  const { rects, bounds } = collision;
  const near = bucketed(plots);
  const runways = (layout.airports ?? []).flatMap((a) => [a.runway, a.apron]).filter(Boolean);
  // the outer edge: further from the centre than SPAWN_EDGE of the businesses (a spot there sees the city on one side and nothing on the other)
  const centre = layout.center ?? { x: 0, z: 0 };
  const reach = plots.filter(isBusiness).map((p) => Math.hypot(p.x - centre.x, p.z - centre.z)).sort((a, b) => a - b);
  const edge = reach.length ? reach[Math.min(reach.length - 1, Math.floor(SPAWN_EDGE * reach.length))] : Infinity;
  const raw = [];
  const seen = new Set();
  for (const road of layout.roads ?? []) {
    if (SKIP_KINDS.has(road.kind) || !(road.axis === 'x' || road.axis === 'z')) continue;
    const len = road.to - road.from;
    const n = Math.floor(len / SPAWN_SPACING);
    const start = road.from + (len - n * SPAWN_SPACING) / 2;
    for (let i = 0; i <= n; i++) {
      const u = start + i * SPAWN_SPACING;
      for (const side of [-1, 1]) {
        const v = road.center + side * PAVEMENT;
        const x = road.axis === 'x' ? u : v;
        const z = road.axis === 'x' ? v : u;
        const key = `${Math.round(x * 2)},${Math.round(z * 2)}`; // two roads meeting share a corner: keep one
        if (seen.has(key)) continue;
        seen.add(key);
        if (bounds && !inBox(bounds, x, z, -0.5)) continue;
        if (runways.some((r) => inBox(r, x, z, 0.5))) continue;
        if (Math.hypot(x - centre.x, z - centre.z) > edge) continue;
        const around = near(x, z);
        if (around.some((p) => insidePlot(p, x, z))) continue;
        let district = null;
        let best = Infinity;
        let business = 0;
        for (const p of around) {
          const d = Math.hypot(p.x - x, p.z - z);
          if (d < best) {
            best = d;
            district = p.districtId ?? null;
          }
          if (d <= SPAWN_NEAR && isBusiness(p)) business++;
        }
        if (business < SPAWN_BUSINESSES) continue;
        if (isBlocked(x, z, rects, CLEAR)) continue;
        raw.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, district: district ?? 'none', road: road.id });
      }
    }
  }
  return capDistricts(raw, DISTRICT_CAP);
}

// Thin any district holding more than `cap` of the spots, evenly through its list, until none does (deterministic).
function capDistricts(list, cap) {
  let out = list;
  for (let round = 0; round < 8; round++) {
    const counts = new Map();
    for (const c of out) counts.set(c.district, (counts.get(c.district) ?? 0) + 1);
    if (counts.size < 4) return out; // a tiny city: nothing to balance
    const over = [...counts].filter(([, n]) => n > cap * out.length);
    if (!over.length) return out;
    // each crowded district keeps m spots, where m = cap * (the rest + k * m), k crowded districts; chosen at even steps through its list
    const rest = out.length - over.reduce((a, [, n]) => a + n, 0);
    const m = Math.max(1, Math.floor((cap * rest) / Math.max(0.05, 1 - cap * over.length)));
    const keep = new Map(over.map(([d, n]) => [d, { n, want: Math.min(n, m), seen: 0 }]));
    out = out.filter((c) => {
      const k = keep.get(c.district);
      if (!k) return true;
      const i = k.seen++;
      return Math.floor(((i + 1) * k.want) / k.n) > Math.floor((i * k.want) / k.n);
    });
  }
  return out;
}

export function pickSpawn(candidates, rand = Math.random) {
  if (!candidates?.length) return null;
  const i = Math.min(candidates.length - 1, Math.floor(rand() * candidates.length));
  const c = candidates[i];
  return { x: c.x, z: c.z };
}

// ?spawn=fixed: the old fixed spot, for tests and demos that need to know where the avatar starts.
export const spawnMode = (search) => (new URLSearchParams(search ?? '').get('spawn') === 'fixed' ? 'fixed' : 'random');

// The spot chosen for each city, so the avatar is not sent somewhere new when the start runs again for the same city (the camera
// changing between the map and a follow view re-runs it); another city gets its own pick.
const chosen = new Map(); // city seed -> { x, z }

// The page's building link, kept by apps/web/components/DeepLink.jsx before it tidies the address (the avatar may be placed after that).
let linkedSearch = '';
export const rememberLink = (search) => {
  linkedSearch = String(search ?? '');
};

// The follow camera's heading for a spot: standing on the side away from the city's centre, so it looks across the avatar into the city.
export const facingCentre = (spot, layout) => Math.atan2(spot.x - (layout.center?.x ?? 0), spot.z - (layout.center?.z ?? 0));

// Where the avatar starts on this page load.
export function startSpot({ layout, collision, plots = [], search = '', rand = Math.random }) {
  if (spawnMode(search) === 'fixed') return findSpawn(layout, collision);
  if (chosen.has(layout.seed)) return { ...chosen.get(layout.seed) };
  const list = spawnCandidates(layout, collision, plots);
  let spot = null;
  // a link to a building in this city (/?plot=12, /b/12): start at the good spot nearest it, so the visitor is beside what they came to see
  const { plot: id, city } = parseDeepLink(parseDeepLink(search).plot ? search : linkedSearch);
  const hit = id && (city == null || city === layout.seed) ? findBuilding(id, plots, layout) : null;
  const at = hit ? (hit.kind === 'plot' ? hit.plot : hit.mall) : null;
  if (at && list.length) {
    let best = list[0];
    for (const c of list) if (Math.hypot(c.x - at.x, c.z - at.z) < Math.hypot(best.x - at.x, best.z - at.z)) best = c;
    spot = { x: best.x, z: best.z };
  }
  spot ??= pickSpawn(list, rand) ?? findSpawn(layout, collision);
  chosen.set(layout.seed, spot);
  return { ...spot };
}
