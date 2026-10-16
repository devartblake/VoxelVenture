// The market: how the stalls and pop-up booths are laid out on a market site, how busy each spot is, and what it costs. Pure (no three.js,
// no DOM), so the editor, the 3D market, the server and the tests all use the same plan.
//
// A site (layout.reserved[i] with `market: true`) is a rectangle beside a road: { x0, x1, z0, z1, frontRoad, frontSide }. The plan is worked out in
// the site's own frame: u runs along the road, v runs away from it (v = 0 is the road side, where the gates are). It is turned into world
// coordinates at the end, so every stall comes out as an axis-aligned rectangle with the way it faces (its customer side).
//
//   planMarket(site, params, road) -> { stalls, gates, aisles, plaza, bounds, stats }
//
// Styles: rows (rows run along the road, back to back, with an aisle between pairs), columns (rows run away from the road, so every entrance
// looks straight down an aisle), plaza (a ring of stalls round the walls, rows inside, an open square in the middle).

export const MARKET_STYLES = [
  { id: 'rows', label: 'Rows along the road', note: 'Back-to-back rows parallel to the road with a cross aisle in front. The most stalls.' },
  { id: 'columns', label: 'Aisles from the gates', note: 'Rows run away from the road, so each gate looks down an aisle. Good for walk-through traffic.' },
  { id: 'plaza', label: 'Plaza', note: 'Stalls round the walls and in rows inside, with an open square in the middle for food and music.' },
];

export const MARKET_DEFAULTS = { style: 'rows', entrances: 2, stallW: 2.2, stallD: 1.7, boothW: 1.5, aisle: 2.6, boothShare: 0.25, seed: 1 };
export const MARKET_LIMITS = {
  entrances: [1, 3],
  stallW: [1.8, 3],
  stallD: [1.4, 2.4],
  boothW: [1.2, 2],
  aisle: [2.2, 3.6],
  boothShare: [0, 0.6],
};

// A stall is rented for one of these lengths; the price is one flat rate for the spot, whichever is chosen.
export const HOURS = [24, 48, 72];
export const TIERS = [
  { id: 'prime', label: 'Prime', share: 0.15, cents: 500 },
  { id: 'busy', label: 'Busy', share: 0.25, cents: 400 },
  { id: 'standard', label: 'Standard', share: 0.35, cents: 300 },
  { id: 'quiet', label: 'Quiet', share: 0.25, cents: 200 },
];
export const TIER_COLOURS = { prime: '#f59e0b', busy: '#f97316', standard: '#38bdf8', quiet: '#64748b' };
export const PRICE_RANGE_CENTS = [200, 500]; // what an admin may set

const EDGE = 1; // the fence round the market
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const cleanParams = (p = {}) => {
  const out = { ...MARKET_DEFAULTS, ...p };
  if (!MARKET_STYLES.some((s) => s.id === out.style)) out.style = MARKET_DEFAULTS.style;
  for (const k of Object.keys(MARKET_LIMITS)) out[k] = clamp(Number(out[k]) || MARKET_DEFAULTS[k], MARKET_LIMITS[k]);
  out.entrances = Math.round(out.entrances);
  out.seed = Math.floor(Number(out.seed) || 1);
  return out;
};

// Row letters: A, B, ... Z, AA, AB ...
const letters = (n) => (n >= 26 ? letters(Math.floor(n / 26) - 1) : '') + String.fromCharCode(65 + (n % 26));

// The site's frame: where local (u, v) is in the world, and which way each local direction points.
export function frameOf(site, road) {
  const alongX = (road?.axis ?? 'x') === 'x';
  const side = site.frontSide ?? 1;
  const A = alongX ? site.x1 - site.x0 : site.z1 - site.z0; // along the road
  const B = alongX ? site.z1 - site.z0 : site.x1 - site.x0; // away from it
  const toWorld = (u, v) =>
    alongX ? { x: site.x0 + u, z: side < 0 ? site.z1 - v : site.z0 + v } : { x: side < 0 ? site.x1 - v : site.x0 + v, z: site.z0 + u };
  // compass for a local direction: [du, dv] -> 'N' | 'S' | 'E' | 'W'
  const dirs = alongX
    ? { '+u': 'E', '-u': 'W', '+v': side < 0 ? 'N' : 'S', '-v': side < 0 ? 'S' : 'N' }
    : { '+u': 'S', '-u': 'N', '+v': side < 0 ? 'W' : 'E', '-v': side < 0 ? 'E' : 'W' };
  return { A, B, alongX, side, toWorld, dirs };
}

// ---- the plan ------------------------------------------------------------------------------------------------------------------------
export function planMarket(site, params = {}, road = null) {
  const p = cleanParams(params);
  const f = frameOf(site, road);
  const { A, B } = f;
  const rand = mulberry(p.seed * 7919 + 13);
  const D = p.stallD;
  const stalls = []; // local rectangles: { u0, u1, v0, v1, face, kind }
  const aisles = [];
  let plaza = null;

  // a run of stalls along `dir` ('u' or 'v'), starting at `from`, up to `to`, with its back line at `back` (u or v) and `depth` of stall.
  // `face` is the direction customers stand in ('+u' '-u' '+v' '-v').
  const run = (dir, from, to, back, face, tag) => {
    let pos = from;
    const out = [];
    while (true) {
      const booth = rand() < p.boothShare;
      const w = booth ? p.boothW : p.stallW;
      const depth = booth ? Math.min(D, p.boothW) : D;
      if (pos + w > to + 1e-9) break;
      const toward = face[0] === '+' ? 1 : -1; // the stall's back is on `back`; it grows towards the side its customers stand on
      const r = dir === 'u'
        ? { u0: pos, u1: pos + w, v0: toward > 0 ? back : back - depth, v1: toward > 0 ? back + depth : back }
        : { v0: pos, v1: pos + w, u0: toward > 0 ? back : back - depth, u1: toward > 0 ? back + depth : back };
      out.push({ ...r, face, kind: booth ? 'booth' : 'stall', tag });
      pos += w + 0.15;
    }
    // centre the run in the space it was given
    if (out.length) {
      const last = out[out.length - 1];
      const used = (dir === 'u' ? last.u1 : last.v1) - from;
      const shift = (to - from - used) / 2;
      for (const r of out) {
        if (dir === 'u') { r.u0 += shift; r.u1 += shift; } else { r.v0 += shift; r.v1 += shift; }
      }
    }
    return out;
  };

  // ---- the rows of one region: [u0, u1] x [v0, v1] filled with pairs of rows (back to back) with aisles between, rows along u or along v
  const fillRows = (u0, u1, v0, v1, along, singleFirst = false) => {
    const out = [];
    const span = along === 'u' ? v1 - v0 : u1 - u0; // the direction the rows are stacked in
    const lo = along === 'u' ? v0 : u0;
    const hi = along === 'u' ? v1 : u1;
    let q = lo;
    let rowIndex = 0;
    const along0 = along === 'u' ? u0 : v0;
    const along1 = along === 'u' ? u1 : v1;
    // with no aisle on the starting side (the wall), the first row is a single one against it, facing the first aisle
    if (singleFirst && hi - q >= D + p.aisle + 2 * D) {
      out.push(...run(along, along0, along1, q, along === 'u' ? '+v' : '+u', rowIndex++));
      aisles.push(along === 'u' ? { u0: along0, u1: along1, v0: q + D, v1: q + D + p.aisle } : { v0: along0, v1: along1, u0: q + D, u1: q + D + p.aisle });
      q += D + p.aisle;
    }
    while (hi - q >= 2 * D + 0.1) {
      // a pair of rows back to back round the line q + D + 0.05
      const back = q + D + 0.05;
      out.push(...run(along, along0, along1, back, along === 'u' ? '-v' : '-u', rowIndex), ...run(along, along0, along1, back, along === 'u' ? '+v' : '+u', rowIndex + 1));
      rowIndex += 2;
      q += 2 * D + 0.1;
      if (hi - q >= p.aisle + D + 0.2) {
        aisles.push(along === 'u' ? { u0: along0, u1: along1, v0: q, v1: q + p.aisle } : { v0: along0, v1: along1, u0: q, u1: q + p.aisle });
        q += p.aisle;
      } else break;
    }
    // a single row against the far wall, facing the last aisle
    if (hi - q >= D) {
      const back = hi;
      out.push(...run(along, along0, along1, back, along === 'u' ? '-v' : '-u', rowIndex));
    }
    void span;
    return out;
  };

  const inner = { u0: EDGE, u1: A - EDGE, v0: EDGE, v1: B - EDGE };
  const promenade = { u0: inner.u0, u1: inner.u1, v0: inner.v0, v1: inner.v0 + p.aisle };
  aisles.push(promenade);
  const rowsFrom = promenade.v1;

  if (p.style === 'rows') {
    stalls.push(...fillRows(inner.u0, inner.u1, rowsFrom, inner.v1, 'u'));
  } else if (p.style === 'columns') {
    stalls.push(...fillRows(inner.u0, inner.u1, rowsFrom, inner.v1, 'v', true));
  } else {
    // plaza: a ring of single stalls on the two side walls and the far wall (facing in), rows inside, a square left open in the middle
    const ringDepth = D + 0.4;
    const cu0 = inner.u0 + ringDepth;
    const cu1 = inner.u1 - ringDepth;
    const cv1 = inner.v1 - ringDepth;
    stalls.push(...run('v', rowsFrom, inner.v1, inner.u0, '+u', 'W'));
    stalls.push(...run('v', rowsFrom, inner.v1, inner.u1, '-u', 'E'));
    stalls.push(...run('u', cu0, cu1, inner.v1, '-v', 'F'));
    stalls.push(...fillRows(cu0 + 0.6, cu1 - 0.6, rowsFrom, cv1 - 0.4, 'u'));
    const pw = Math.min(11, (cu1 - cu0) * 0.4);
    const pd = Math.min(7, (cv1 - rowsFrom) * 0.4);
    plaza = { u0: (A - pw) / 2, u1: (A + pw) / 2, v0: rowsFrom + (cv1 - rowsFrom - pd) / 2, v1: rowsFrom + (cv1 - rowsFrom - pd) / 2 + pd };
  }

  // gates, evenly spaced along the road side; in the columns style they sit on the aisles
  const gates = [];
  if (p.style === 'columns') {
    const aisleCentres = aisles.filter((a) => a !== promenade).map((a) => (a.u0 + a.u1) / 2);
    const want = Math.min(p.entrances, aisleCentres.length || p.entrances);
    for (let i = 0; i < want; i++) gates.push(aisleCentres.length ? aisleCentres[Math.min(aisleCentres.length - 1, Math.round(((i + 0.5) * aisleCentres.length) / want - 0.5))] : ((i + 0.5) * A) / want);
  } else {
    for (let i = 0; i < p.entrances; i++) gates.push(((i + 0.5) * A) / p.entrances);
  }
  // each gate opens onto a spine aisle that runs to the far wall (not in the columns style, where the aisles already do)
  if (p.style !== 'columns') {
    for (const g of gates) aisles.push({ u0: g - p.aisle / 2, u1: g + p.aisle / 2, v0: promenade.v1, v1: inner.v1 });
  }
  const spines = aisles.filter((a) => a !== promenade);
  const overlaps = (a, b) => Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > 0.05 && Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > 0.05;
  const kept = stalls.filter((s) => !spines.some((a) => overlaps(s, a)) && !(plaza && overlaps(s, plaza)) && !overlaps(s, promenade));
  // the stalls must be inside the market and clear of one another
  const insideFence = (s) => s.u0 >= EDGE - 1e-6 && s.u1 <= A - EDGE + 1e-6 && s.v0 >= EDGE - 1e-6 && s.v1 <= B - EDGE + 1e-6;
  const placed = [];
  for (const s of kept) if (insideFence(s) && !placed.some((o) => overlaps(s, o))) placed.push(s);

  // ---- how busy each spot is: walking distance from the gates to the spot in front of the stall, along the aisles
  const cell = 0.5;
  const nu = Math.ceil(A / cell);
  const nv = Math.ceil(B / cell);
  const blocked = new Uint8Array(nu * nv);
  const mark = (r, value) => {
    for (let j = Math.max(0, Math.floor(r.v0 / cell)); j < Math.min(nv, Math.ceil(r.v1 / cell)); j++) for (let i = Math.max(0, Math.floor(r.u0 / cell)); i < Math.min(nu, Math.ceil(r.u1 / cell)); i++) blocked[j * nu + i] = value;
  };
  for (const s of placed) mark(s, 1);
  if (plaza) mark(plaza, 0);
  const dist = new Float32Array(nu * nv).fill(Infinity);
  const queue = [];
  for (const g of gates) {
    const i = Math.min(nu - 1, Math.floor(g / cell));
    const j = Math.min(nv - 1, Math.floor((EDGE + 0.3) / cell));
    dist[j * nu + i] = 0;
    queue.push([i, j]);
  }
  for (let h = 0; h < queue.length; h++) {
    const [i, j] = queue[h];
    const d0 = dist[j * nu + i];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nu || b >= nv || blocked[b * nu + a] || dist[b * nu + a] <= d0 + cell) continue;
      // keep inside the fence
      const uu = (a + 0.5) * cell;
      const vv = (b + 0.5) * cell;
      if (uu < EDGE || uu > A - EDGE || vv < EDGE || vv > B - EDGE) continue;
      dist[b * nu + a] = d0 + cell;
      queue.push([a, b]);
    }
  }
  const front = (s) => {
    // the spot just in front of the stall's face, in the middle of it
    const cu = (s.u0 + s.u1) / 2;
    const cv = (s.v0 + s.v1) / 2;
    const by = s.face === '+u' ? [s.u1 + 0.65, cv] : s.face === '-u' ? [s.u0 - 0.65, cv] : s.face === '+v' ? [cu, s.v1 + 0.65] : [cu, s.v0 - 0.65];
    return by;
  };
  const centreU = A / 2;
  const centreV = B * 0.45;
  const scoredAll = placed.map((s) => {
    const [fu, fv] = front(s);
    const i = Math.min(nu - 1, Math.max(0, Math.floor(fu / cell)));
    const j = Math.min(nv - 1, Math.max(0, Math.floor(fv / cell)));
    const d = dist[j * nu + i];
    const walk = Number.isFinite(d) ? d : A + B;
    const onSpine = aisles.some((a) => fu >= a.u0 - 0.2 && fu <= a.u1 + 0.2 && fv >= a.v0 - 0.2 && fv <= a.v1 + 0.2 && (a === promenade || a.v1 - a.v0 > a.u1 - a.u0 || a.u1 - a.u0 > A * 0.5));
    const nearGate = gates.reduce((m, g) => Math.min(m, Math.hypot(fu - g, fv - EDGE)), Infinity);
    const middle = 1 - Math.min(1, Math.hypot(fu - centreU, fv - centreV) / Math.hypot(A, B) / 0.6);
    const traffic = 0.55 * Math.exp(-walk / 16) + 0.2 * Math.exp(-nearGate / 7) + 0.15 * (onSpine ? 1 : 0) + 0.1 * middle;
    return { s, traffic, walk, reachable: Number.isFinite(d) };
  });
  // a stall nobody can walk up to is not a stall
  const scored = scoredAll.filter((x) => x.reachable);
  // number the stalls: rows from the road outwards, left to right
  scored.sort((a, b) => a.s.v0 - b.s.v0 || a.s.u0 - b.s.u0);
  const rowKey = (s) => `${s.tag}`;
  const rowOrder = new Map();
  for (const { s } of scored) if (!rowOrder.has(rowKey(s))) rowOrder.set(rowKey(s), rowOrder.size);
  const counters = new Map();
  const ranked = [...scored].sort((a, b) => b.traffic - a.traffic);
  const tierOf = new Map();
  let at = 0;
  for (const t of TIERS) {
    const n = t === TIERS[TIERS.length - 1] ? ranked.length - at : Math.round(ranked.length * t.share);
    for (let i = 0; i < n && at < ranked.length; i++) tierOf.set(ranked[at++].s, t);
  }
  const out = scored.map(({ s, traffic, walk, reachable }) => {
    const row = rowOrder.get(rowKey(s));
    const n = (counters.get(row) ?? 0) + 1;
    counters.set(row, n);
    const c = f.toWorld((s.u0 + s.u1) / 2, (s.v0 + s.v1) / 2);
    const a = f.toWorld(s.u0, s.v0);
    const b = f.toWorld(s.u1, s.v1);
    const tier = tierOf.get(s);
    return {
      id: `${letters(row)}${n}`,
      kind: s.kind,
      x: c.x,
      z: c.z,
      w: Math.abs(b.x - a.x),
      d: Math.abs(b.z - a.z),
      front: f.dirs[s.face],
      u: (s.u0 + s.u1) / 2,
      v: (s.v0 + s.v1) / 2,
      traffic: Math.round(traffic * 1000) / 1000,
      walk: Math.round(walk * 10) / 10,
      reachable,
      tier: tier.id,
      cents: tier.cents,
    };
  });
  const worldRect = (r) => {
    const a = f.toWorld(r.u0, r.v0);
    const b = f.toWorld(r.u1, r.v1);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
  };
  const stats = {
    total: out.length,
    stalls: out.filter((s) => s.kind === 'stall').length,
    booths: out.filter((s) => s.kind === 'booth').length,
    byTier: Object.fromEntries(TIERS.map((t) => [t.id, out.filter((s) => s.tier === t.id).length])),
    dropped: scoredAll.length - scored.length, // spots that could not be reached and were left out
    perDayCents: out.reduce((n, s) => n + s.cents, 0),
  };
  return {
    params: p,
    stalls: out,
    gates: gates.map((g) => ({ ...f.toWorld(g, 0), u: g, face: f.dirs['+v'] })),
    aisles: aisles.map(worldRect),
    plaza: plaza ? worldRect(plaza) : null,
    bounds: { x0: site.x0, x1: site.x1, z0: site.z0, z1: site.z1 },
    frame: { A, B, alongX: f.alongX, side: f.side },
    stats,
  };
}

// The price of a spot, in cents, with the admin's own rates if they set any: { prime, busy, standard, quiet } -> cents each.
export function priceOf(stall, rates = null) {
  const c = rates?.[stall.tier];
  return Number.isFinite(c) ? Math.round(clamp(c, PRICE_RANGE_CENTS)) : stall.cents;
}
export const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
