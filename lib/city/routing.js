// Road-following routes for the world map. Pure (no three.js, no DOM), so it is tested in Node.
//
//   buildRoadGraph(layout)            the roads as a graph: a node at every junction, an edge along a road between two junctions (and along each diagonal)
//   findRoute(graph, from, to)        the shortest way on the roads from one point to another: the point is joined to the nearest road, the roads are
//                                     searched (A*), and the route is joined from the last road to the goal
//   -> { points: [{ x, z }], length, onRoad }   (a straight line if the roads cannot get there)
//
// Walking speed in the game is WALK_SPEED units a second; routeSeconds() turns a length into a time.
export const WALK_SPEED = 3.0;
export const routeSeconds = (length, speed = WALK_SPEED) => length / speed;

const key = (x, z) => `${Math.round(x * 20)},${Math.round(z * 20)}`;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function buildRoadGraph(layout) {
  const nodes = []; // { id, x, z, edges: [{ to, length, road }] }
  const byKey = new Map();
  const node = (x, z) => {
    const k = key(x, z);
    if (!byKey.has(k)) {
      byKey.set(k, nodes.length);
      nodes.push({ id: nodes.length, x, z, edges: [] });
    }
    return byKey.get(k);
  };
  const edges = []; // every edge once, for snapping a point to the nearest road: { a, b, road }
  const connect = (a, b, road) => {
    if (a === b) return;
    const length = dist(nodes[a], nodes[b]);
    nodes[a].edges.push({ to: b, length, road });
    nodes[b].edges.push({ to: a, length, road });
    edges.push({ a, b, road });
  };
  const EPS = 0.06;
  const junctions = layout.intersections ?? [];
  // an axis-aligned road: the junctions that lie on it, in order, and an edge between each neighbouring pair
  for (const r of layout.roads) {
    const on = junctions
      .filter((i) => (r.axis === 'x' ? Math.abs(i.z - r.center) < EPS && i.x >= r.from - EPS && i.x <= r.to + EPS : Math.abs(i.x - r.center) < EPS && i.z >= r.from - EPS && i.z <= r.to + EPS))
      .map((i) => (r.axis === 'x' ? { x: i.x, z: r.center, u: i.x } : { x: r.center, z: i.z, u: i.z }))
      .sort((p, q) => p.u - q.u);
    // the ends of a road are junctions already; if a short road has fewer than two, join its ends
    const pts = on.length >= 2 ? on : r.axis === 'x' ? [{ x: r.from, z: r.center }, { x: r.to, z: r.center }] : [{ x: r.center, z: r.from }, { x: r.center, z: r.to }];
    for (let k = 1; k < pts.length; k++) connect(node(pts[k - 1].x, pts[k - 1].z), node(pts[k].x, pts[k].z), r.id);
  }
  // the diagonal avenue: from circle to circle, joined to the nearest node at each end
  const nearest = (p, within) => {
    let best = -1;
    let bd = within;
    for (const n of nodes) {
      const d = dist(n, p);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  };
  for (const d of layout.diagonals ?? []) {
    const a = nearest(d.p0, 2.5);
    const b = nearest(d.p1, 2.5);
    const na = a >= 0 ? a : node(d.p0.x, d.p0.z);
    const nb = b >= 0 ? b : node(d.p1.x, d.p1.z);
    connect(na, nb, d.id);
  }
  return { nodes, edges };
}

// The nearest point on any road to p: { edge, point, t, d }.
export function snapToRoad(graph, p) {
  let best = null;
  for (const e of graph.edges) {
    const a = graph.nodes[e.a];
    const b = graph.nodes[e.b];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
    const q = { x: a.x + vx * t, z: a.z + vz * t };
    const d = dist(p, q);
    if (!best || d < best.d) best = { edge: e, point: q, t, d };
  }
  return best;
}

// The shortest way along the roads from `from` to `to` (both { x, z }), and where the roads cannot get there, the straight line.
export function findRoute(graph, from, to) {
  const straight = { points: [from, to], length: dist(from, to), onRoad: false };
  if (!graph.nodes.length) return straight;
  const s = snapToRoad(graph, from);
  const g = snapToRoad(graph, to);
  if (!s || !g) return straight;
  // temporary nodes for the two snapped points, joined to the ends of their edges (and to each other if they are on the same edge)
  const N = graph.nodes.length;
  const S = N;
  const G = N + 1;
  const pos = (id) => (id === S ? s.point : id === G ? g.point : graph.nodes[id]);
  const extra = new Map([[S, []], [G, []]]);
  const addTemp = (id, snap) => {
    const a = snap.edge.a;
    const b = snap.edge.b;
    extra.get(id).push({ to: a, length: dist(snap.point, graph.nodes[a]) }, { to: b, length: dist(snap.point, graph.nodes[b]) });
  };
  addTemp(S, s);
  addTemp(G, g);
  if (s.edge === g.edge) extra.get(S).push({ to: G, length: dist(s.point, g.point) });
  const edgesOf = (id) => {
    if (id === S || id === G) return extra.get(id);
    const list = graph.nodes[id].edges;
    const extraTo = [];
    if (id === s.edge.a || id === s.edge.b) extraTo.push({ to: S, length: dist(graph.nodes[id], s.point) });
    if (id === g.edge.a || id === g.edge.b) extraTo.push({ to: G, length: dist(graph.nodes[id], g.point) });
    return extraTo.length ? [...list, ...extraTo] : list;
  };
  // A*
  const open = new Map([[S, 0]]);
  const gScore = new Map([[S, 0]]);
  const prev = new Map();
  const h = (id) => dist(pos(id), g.point);
  const closed = new Set();
  while (open.size) {
    let cur = null;
    let bf = Infinity;
    for (const [id, f] of open) if (f < bf) { bf = f; cur = id; }
    if (cur === G) break;
    open.delete(cur);
    closed.add(cur);
    for (const e of edgesOf(cur)) {
      if (closed.has(e.to)) continue;
      const tg = gScore.get(cur) + e.length;
      if (tg < (gScore.get(e.to) ?? Infinity)) {
        gScore.set(e.to, tg);
        prev.set(e.to, cur);
        open.set(e.to, tg + h(e.to));
      }
    }
  }
  if (!prev.has(G)) return straight; // the roads do not join up
  const ids = [G];
  while (ids[0] !== S) ids.unshift(prev.get(ids[0]));
  const roadPoints = ids.map((id) => ({ x: pos(id).x, z: pos(id).z }));
  const points = [from, ...roadPoints, to].filter((p, i, a) => i === 0 || dist(p, a[i - 1]) > 1e-6);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  return { points, length, onRoad: true };
}

// A cache: one graph per layout.
const graphs = new WeakMap();
export function graphFor(layout) {
  if (!graphs.has(layout)) graphs.set(layout, buildRoadGraph(layout));
  return graphs.get(layout);
}
