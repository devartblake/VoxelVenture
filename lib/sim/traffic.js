import { secondsUntilGreen, signalState } from './signals';
import { createCurveTraffic } from './curveTraffic';

// A headless simulation of the city's cars and pedestrians. It knows nothing about three.js: the
// renderer (apps/web/components/city/Traffic.jsx) just reads positions from `sim.cars` and `sim.walkers`.
// Keeping it pure means it can be run for thousands of simulated seconds in a test to look for
// collisions and gridlock.
//
//   Cars     drive on the right in lanes along the roads, follow the car ahead, stop at red signals,
//            stop signs and for people on crosswalks, yield at circles, and turn at intersections.
//   Walkers  walk the sidewalks, cross at the zebra crossings when it is safe, and cars give way.
//
// Coordinates are city coordinates (x east, z south), the same as the roads and plots.

const LANE = 0.4; // lane centre, from the road's centre line
const BOX = 1.4; // half-width of an intersection
const STOP_LINE = 2.15; // stop line, from the intersection centre (matches the painted bar)
const CROSSWALK = 1.75; // zebra crossing centre, from the intersection centre
const SIDEWALK = 1.1; // sidewalk centre line, from the road's centre line
const CAR_LENGTH = 0.8;
const MIN_GAP = 0.3;
const COMFORT_BRAKE = 3;
const HARD_BRAKE = 7;
const ACCEL = 2.2;

// Which way a car is heading, and its right-hand lane. Heading d = (dx, dz): the lane is (-dz, dx).
const laneVec = (d) => [-d[1], d[0]];
const turnRight = (d) => [-d[1], d[0]];
const turnLeft = (d) => [d[1], -d[0]];

// Named for where a car arrives from. `dir` points from the centre toward that arm.
const ARMS = {
  west: { dir: [-1, 0], axis: 'x', travel: 1, onAvenue: true },
  east: { dir: [1, 0], axis: 'x', travel: -1, onAvenue: true },
  north: { dir: [0, -1], axis: 'z', travel: 1, onAvenue: false },
  south: { dir: [0, 1], axis: 'z', travel: -1, onAvenue: false },
};
const ARM_NAMES = Object.keys(ARMS);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAR_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#e2e8f0', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#ec4899'];
const SHIRTS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6', '#e2e8f0', '#ec4899'];
const PANTS = ['#1e3a8a', '#374151', '#a8a29e', '#111827', '#78350f'];

// ---------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------

// Geometry that differs between a plain junction and a circle: where cars stop, where the zebra lies,
// where the junction's box ends and (for circles) the radius cars go round at.
const PLAIN_GEOMETRY = { box: BOX, stop: STOP_LINE, cw: CROSSWALK, ring: 0 };
// A circle's own size (ix.circle: island, ringIn, ringOut, outer, ...): cars enter at the ring's outer edge,
// stop a little beyond it and circle along the middle of the ring.
const circleGeometry = (c) => ({ box: c.ringOut, stop: c.ringOut + 1.1, cw: c.ringOut + 0.5, ring: (c.ringIn + c.ringOut) / 2 });

function buildNetwork(layout) {
  const ixById = new Map();
  for (const ix of layout.intersections) {
    const cw = {};
    for (const k of Object.keys(ix.approaches)) cw[k] = 0;
    ixById.set(ix.id, { ...ix, g: ix.control === 'circle' ? circleGeometry(ix.circle) : PLAIN_GEOMETRY, occupants: new Set(), queue: [], cw });
  }
  const ixList = [...ixById.values()];

  const roads = layout.roads.map((r) => {
    const along = (ix) => (r.axis === 'x' ? ix.x : ix.z);
    const onRoad = ixList.filter((ix) =>
      r.axis === 'x' ? ix.z === r.center && ix.x >= r.from - 1e-6 && ix.x <= r.to + 1e-6 : ix.x === r.center && ix.z >= r.from - 1e-6 && ix.z <= r.to + 1e-6
    );
    const nodes = onRoad.map((ix) => ({ u: along(ix), ix })).sort((a, b) => a.u - b.u);
    const mid = (r.crossings ?? []).map((u) => ({ u, peds: 0 }));
    return { ...r, nodes, mid };
  });

  // The diagonal avenue: straight stretches at an angle, each running from one circle to the next. Along a
  // stretch `u` is the distance from its first circle, so everything that works on roads works on these.
  for (const d of layout.diagonals ?? []) {
    roads.push({
      id: d.id,
      axis: 'd',
      kind: 'diagonal',
      class: d.class,
      name: d.name,
      from: 0,
      to: d.length,
      p0: [d.p0.x, d.p0.z],
      dirVec: d.dir,
      nodes: [
        { u: 0, ix: ixById.get(d.from) },
        { u: d.length, ix: ixById.get(d.to) },
      ],
      mid: [],
      gaps: [],
    });
  }

  // Each intersection knows its avenue and street (for the exit road after a turn).
  for (const road of roads) {
    if (road.axis === 'd') continue;
    for (const n of road.nodes) {
      n.ix[road.axis === 'x' ? 'avenue' : 'street'] = road;
    }
  }

  // Legs: the ways in and out of every junction. A leg points from the junction's centre along a road;
  // `outDir` is the direction of travel (+1 / -1 along the road's u) for a car leaving that way, and `uC`
  // is where the junction's centre lies along that road.
  const roadById = new Map(roads.map((r) => [r.id, r]));
  for (const ix of ixList) {
    ix.legList = [];
    ix.legs = {};
    const add = (leg) => {
      ix.legList.push(leg);
      ix.legs[leg.key] = leg;
    };
    for (const arm of ARM_NAMES) {
      if (!ix.arms[arm]) continue;
      const A = ARMS[arm];
      const road = A.axis === 'x' ? ix.avenue : ix.street;
      add({ key: arm, dir: A.dir, road, outDir: A.axis === 'x' ? A.dir[0] : A.dir[1], uC: A.axis === 'x' ? ix.x : ix.z, axis: A.axis, onAvenue: A.onAvenue });
    }
    for (const l of ix.diag ?? []) {
      const road = roadById.get(l.road);
      add({ key: l.key, dir: l.dir, road, outDir: l.end === 'from' ? 1 : -1, uC: l.end === 'from' ? 0 : road.to, axis: 'd', onAvenue: false });
    }
    ix.legList.sort((a, b) => Math.atan2(a.dir[1], a.dir[0]) - Math.atan2(b.dir[1], b.dir[0]));
  }
  return { roads, ixList, ixById };
}

// The leg a car heading `dir` along `road` arrives at junction `ix` by.
const legOf = (ix, road, dir) => ix.legList.find((l) => l.road === road && l.outDir === -dir);

const lanePoint = (road, dir, u) => {
  if (road.axis === 'd') {
    const d = [road.dirVec[0] * dir, road.dirVec[1] * dir];
    const lv = laneVec(d);
    return [road.p0[0] + road.dirVec[0] * u + lv[0] * LANE, road.p0[1] + road.dirVec[1] * u + lv[1] * LANE];
  }
  const off = laneVec(road.axis === 'x' ? [dir, 0] : [0, dir])[road.axis === 'x' ? 1 : 0] * LANE;
  return road.axis === 'x' ? [u, road.center + off] : [road.center + off, u];
};

// The heading (a rotation about Y: forward = (sin yaw, cos yaw)) of a car going `dir` along `road`.
const laneYaw = (road, dir) => (road.axis === 'd' ? Math.atan2(road.dirVec[0] * dir, road.dirVec[1] * dir) : road.axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI);

// The route a car takes through a junction from leg `entry` to leg `exit`, as a polyline with cumulative
// lengths. `kind` is 'yield' for a circle (the car goes round the island) and 'plain' otherwise.
function buildPath(ix, entry, exit, maneuver, kind) {
  const { box, stop, ring } = ix.g;
  const d = [-entry.dir[0], -entry.dir[1]];
  const dOut = exit.dir;
  const lv = laneVec(d);
  const lo = laneVec(dOut);
  const E = [ix.x - d[0] * box + lv[0] * LANE, ix.z - d[1] * box + lv[1] * LANE];
  // Paths describe the car's centre. It starts half a car length behind the stop line, so the
  // front bumper is on the line when a car enters, and ends at the lane start beyond the box.
  const E0 = [ix.x - d[0] * (stop + CAR_LENGTH / 2) + lv[0] * LANE, ix.z - d[1] * (stop + CAR_LENGTH / 2) + lv[1] * LANE];
  const X = [ix.x + dOut[0] * box + lo[0] * LANE, ix.z + dOut[1] * box + lo[1] * LANE];

  let pts;
  if (kind === 'yield') {
    // round the island counter-clockwise (angles run backwards in x/z space)
    const thetaIn = Math.atan2(entry.dir[1], entry.dir[0]);
    const thetaOut = Math.atan2(dOut[1], dOut[0]);
    const sweep = (((thetaIn - thetaOut) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const steps = Math.max(3, Math.round(sweep / (Math.PI / 12)));
    pts = [E0, E];
    for (let k = 0; k <= steps; k++) {
      const th = thetaIn - (sweep * k) / steps;
      pts.push([ix.x + Math.cos(th) * ring, ix.z + Math.sin(th) * ring]);
    }
    pts.push(X);
  } else if (maneuver === 'straight') {
    pts = [E0, X];
  } else {
    const P = [ix.x + lv[0] * LANE + lo[0] * LANE, ix.z + lv[1] * LANE + lo[1] * LANE];
    pts = [E0];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      pts.push([a * E[0] + b * P[0] + c * X[0], a * E[1] + b * P[1] + c * X[1]]);
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return {
    pts,
    cum,
    length: cum[cum.length - 1],
    entryKey: entry.key,
    exitKey: exit.key,
    // where the car rejoins a road: the road, its direction of travel, and the u where the lane starts
    exit: { road: exit.road, dir: exit.outDir, uStart: exit.uC + exit.outDir * box },
    maneuver,
    kind,
  };
}

function pointOnPath(path, s) {
  const { pts, cum } = path;
  const clamped = Math.min(Math.max(s, 0), path.length);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < clamped) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = (clamped - cum[i - 1]) / segLen;
  const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
  const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
  return { x, z, yaw: Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) };
}

// ---------------------------------------------------------------------------------------------
// Pedestrian graph
// ---------------------------------------------------------------------------------------------

function buildWalkGraph(network) {
  const nodes = [];
  const edges = [];
  const addNode = (x, z) => {
    nodes.push({ id: nodes.length, x, z, edges: [] });
    return nodes[nodes.length - 1];
  };
  const addEdge = (a, b, extra = {}) => {
    const via = extra.via ?? null;
    const length = via ? Math.hypot(via[0] - a.x, via[1] - a.z) + Math.hypot(b.x - via[0], b.z - via[1]) : Math.hypot(b.x - a.x, b.z - a.z);
    const edge = { id: edges.length, a, b, length, kind: 'walk', ...extra };
    edges.push(edge);
    a.edges.push(edge);
    b.edges.push(edge);
    return edge;
  };

  // Crosswalk ends: for every arm of every intersection, one node on each sidewalk.
  const cwNode = new Map(); // `${ix.id}:${arm}:${sign}`
  const opposite = { west: 'east', east: 'west', north: 'south', south: 'north' };
  for (const ix of network.ixList) {
    if (ix.control === 'circle') {
      buildCircleWalk(ix);
      continue;
    }
    for (const arm of ARM_NAMES) {
      if (!ix.arms[arm]) continue;
      const A = ARMS[arm];
      const across = A.axis === 'x' ? [0, 1] : [1, 0];
      for (const sign of [-1, 1]) {
        cwNode.set(
          `${ix.id}:${arm}:${sign}`,
          addNode(ix.x + A.dir[0] * ix.g.cw + across[0] * sign * SIDEWALK, ix.z + A.dir[1] * ix.g.cw + across[1] * sign * SIDEWALK)
        );
      }
      addEdge(cwNode.get(`${ix.id}:${arm}:-1`), cwNode.get(`${ix.id}:${arm}:1`), { kind: 'cross', cw: { type: 'arm', ix, arm } });
    }
    // Round each corner (sx, sz): the pavement of the east/west arm on side sz meets the pavement of the
    // north/south arm on side sx. Where an arm is missing the pavement of the road that carries on runs
    // straight across its mouth, and at a bend it wraps round the outside corner.
    const straight = new Set();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const H = sx < 0 ? 'west' : 'east';
        const V = sz < 0 ? 'north' : 'south';
        const node = (arm, side) => cwNode.get(`${ix.id}:${arm}:${side}`);
        if (ix.arms[H] && ix.arms[V]) {
          addEdge(node(H, sz), node(V, sx), { via: [ix.x + sx * SIDEWALK, ix.z + sz * SIDEWALK] });
        } else if (!ix.arms[H] && !ix.arms[V]) {
          addEdge(node(opposite[H], sz), node(opposite[V], sx), { via: [ix.x + sx * SIDEWALK, ix.z + sz * SIDEWALK] });
        } else if (!ix.arms[V] && ix.arms.west && ix.arms.east) {
          // the north/south arm on this side is missing: the east/west road's pavement runs straight across
          const key = `h:${sz}`;
          if (!straight.has(key)) {
            straight.add(key);
            addEdge(node('west', sz), node('east', sz));
          }
        } else if (!ix.arms[H] && ix.arms.north && ix.arms.south) {
          const key = `v:${sx}`;
          if (!straight.has(key)) {
            straight.add(key);
            addEdge(node('north', sx), node('south', sx));
          }
        }
      }
    }
  }

  // A circle: a crosswalk on every leg, and the pavement round the outside of the ring between neighbouring legs.
  function buildCircleWalk(ix) {
    const ARC_R = (ix.circle.ringOut + ix.circle.outer) / 2 + 0.2;
    // the side of a leg's crosswalk as a world offset: axis legs keep the usual sign (world side), diagonal legs use their own left/right
    const across = (leg) => (leg.axis === 'x' ? [0, 1] : leg.axis === 'z' ? [1, 0] : [-leg.dir[1], leg.dir[0]]);
    for (const leg of ix.legList) {
      const a = across(leg);
      for (const sign of [-1, 1]) {
        cwNode.set(`${ix.id}:${leg.key}:${sign}`, addNode(ix.x + leg.dir[0] * ix.g.cw + a[0] * sign * SIDEWALK, ix.z + leg.dir[1] * ix.g.cw + a[1] * sign * SIDEWALK));
      }
      addEdge(cwNode.get(`${ix.id}:${leg.key}:-1`), cwNode.get(`${ix.id}:${leg.key}:1`), { kind: 'cross', cw: { type: 'arm', ix, arm: leg.key } });
    }
    // legs go round in order of angle; the pavement between two neighbours runs round the ring's outside
    const sideNode = (leg, plus) => {
      const a = across(leg);
      const perp = [-leg.dir[1], leg.dir[0]]; // turning towards larger angles
      const sign = [-1, 1].find((sg) => (a[0] * sg * perp[0] + a[1] * sg * perp[1] > 0) === plus);
      return cwNode.get(`${ix.id}:${leg.key}:${sign}`);
    };
    const n = ix.legList.length;
    for (let i = 0; i < n; i++) {
      const from = sideNode(ix.legList[i], true);
      const to = sideNode(ix.legList[(i + 1) % n], false);
      const ta = Math.atan2(from.z - ix.z, from.x - ix.x);
      const tb = Math.atan2(to.z - ix.z, to.x - ix.x);
      const sweep = (((tb - ta) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const steps = Math.max(1, Math.ceil(sweep / (Math.PI / 5)));
      let prev = from;
      for (let k = 1; k < steps; k++) {
        const th = ta + (sweep * k) / steps;
        const mid = addNode(ix.x + Math.cos(th) * ARC_R, ix.z + Math.sin(th) * ARC_R);
        addEdge(prev, mid);
        prev = mid;
      }
      addEdge(prev, to);
    }
  }

  // The diagonal avenue's pavement: straight along each side from one circle's crosswalk to the next.
  for (const road of network.roads.filter((r) => r.axis === 'd')) {
    const [n0, n1] = road.nodes;
    const leg0 = n0.ix.legList.find((l) => l.road === road);
    const leg1 = n1.ix.legList.find((l) => l.road === road);
    for (const sign of [-1, 1]) {
      // the far end's leg faces the other way, so the same physical side has the opposite sign there
      addEdge(cwNode.get(`${n0.ix.id}:${leg0.key}:${sign}`), cwNode.get(`${n1.ix.id}:${leg1.key}:${-sign}`));
    }
  }

  // Along each road, on both sidewalks: join the crossings, mid-block crossings and the road ends.
  for (const road of network.roads) {
    if (road.axis === 'd') continue;
    const axisX = road.axis === 'x';
    const pos = (u, sign) => (axisX ? [u, road.center + sign * SIDEWALK] : [road.center + sign * SIDEWALK, u]);
    const mk = (u, sign) => addNode(...pos(u, sign));
    const beforeArm = axisX ? 'west' : 'north';
    const afterArm = axisX ? 'east' : 'south';

    const midNodes = new Map(); // `${k}:${sign}`
    road.mid.forEach((m, k) => {
      const a = mk(m.u, -1);
      const b = mk(m.u, 1);
      midNodes.set(`${k}:-1`, a);
      midNodes.set(`${k}:1`, b);
      addEdge(a, b, { kind: 'cross', cw: { type: 'mid', mid: m, road } });
    });

    for (const sign of [-1, 1]) {
      // Every road starts and ends at a junction, so there are no loose ends: the pavement runs from
      // one junction's crosswalk to the next.
      const stations = [];
      for (const n of road.nodes) {
        if (n.ix.arms[beforeArm]) stations.push({ u: n.u - n.ix.g.cw, node: cwNode.get(`${n.ix.id}:${beforeArm}:${sign}`), tag: `in:${n.ix.id}` });
        if (n.ix.arms[afterArm]) stations.push({ u: n.u + n.ix.g.cw, node: cwNode.get(`${n.ix.id}:${afterArm}:${sign}`), tag: `out:${n.ix.id}` });
      }
      road.mid.forEach((m, k) => stations.push({ u: m.u, node: midNodes.get(`${k}:${sign}`), tag: 'mid' }));
      stations.sort((a, b) => a.u - b.u);
      for (let i = 1; i < stations.length; i++) {
        const p = stations[i - 1];
        const q = stations[i];
        if (p.tag.startsWith('in:') && q.tag.startsWith('out:') && p.tag.slice(3) === q.tag.slice(4)) continue; // the two sides of one intersection are linked by crossings, not a sidewalk
        addEdge(p.node, q.node);
      }
    }
  }
  return { nodes, edges };
}

// ---------------------------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------------------------

const WALK_AROUND = 1.15; // how far a walker keeps from the middle of a parked car

export function createTraffic(layout, options = {}) {
  const { seed = 1, maxCars = 34, maxWalkers = 44, avatar = null } = options;
  const obstacles = []; // cars the player left standing: { x, z } (kept in step by the renderer); traffic queues behind them and is towed after a while
  const rand = mulberry32(seed * 7919 + 13);
  const network = buildNetwork(layout);
  const graph = buildWalkGraph(network);
  const state = { time: 0 };
  const curved = createCurveTraffic(layout, { seed, avatar, obstacles }); // the cars and walkers of curved streets (curved reserved sites)
  let nextId = 1;

  const lanes = new Map(); // `${road.id}:${dir}` -> cars on it, leaders first (rebuilt every step)
  const laneKey = (road, dir) => `${road.id}:${dir}`;
  let spawnTimer = 0;

  // --- helpers -------------------------------------------------------------------------------
  const carFront = (car) => car.u;
  const carRear = (car) => car.u - car.dir * CAR_LENGTH;
  // Where a car arriving by `leg` can go. At a plain junction that is straight on, right or left, into
  // arms that exist (a T has no straight on from its stem; a bend only lets you turn). At a circle it can
  // leave by any other leg.
  const exitsFor = (ix, leg) => {
    if (ix.control === 'circle') return ix.legList.filter((l) => l !== leg).map((l) => ({ maneuver: 'circle', leg: l }));
    const d = [-leg.dir[0], -leg.dir[1]];
    const out = [];
    const find = (v) => ix.legList.find((l) => l.axis !== 'd' && l.dir[0] === v[0] && l.dir[1] === v[1]);
    if (find(d)) out.push({ maneuver: 'straight', leg: find(d) });
    if (find(turnRight(d))) out.push({ maneuver: 'right', leg: find(turnRight(d)) });
    if (find(turnLeft(d))) out.push({ maneuver: 'left', leg: find(turnLeft(d)) });
    return out;
  };
  const pickManeuver = (kind, allowed) => {
    if (allowed[0].maneuver === 'circle') return allowed[Math.floor(rand() * allowed.length)];
    const canLeft = kind === 'stop' || kind === 'yield'; // no unprotected lefts across free-flowing or signalled traffic
    const weights = { straight: 0.58, right: canLeft ? 0.25 : 0.42, left: canLeft ? 0.17 : 0 };
    const options = allowed.filter((m) => weights[m.maneuver] > 0);
    if (!options.length) return allowed[0]; // the only way on is a left turn: take it
    let roll = rand() * options.reduce((sum, m) => sum + weights[m.maneuver], 0);
    for (const m of options) {
      roll -= weights[m.maneuver];
      if (roll <= 0) return m;
    }
    return options[options.length - 1];
  };
  // The nearest intersection still ahead. Nodes are sorted by ascending u, so for a car heading
  // toward lower u the nearest one is the last candidate, not the first.
  const nextNodeAhead = (car) => {
    const nodes = car.road.nodes;
    if (car.dir > 0) return nodes.find((n) => n.u - car.u > 0.01) ?? null;
    for (let i = nodes.length - 1; i >= 0; i--) if (car.u - nodes[i].u > 0.01) return nodes[i];
    return null;
  };

  function placeCar(car) {
    const [x, z] = lanePoint(car.road, car.dir, car.u - car.dir * (CAR_LENGTH / 2));
    car.x = x;
    car.z = z;
    car.yaw = laneYaw(car.road, car.dir);
  }

  function newCar(road, dir, u, speed) {
    const car = {
      id: nextId++,
      color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)],
      road,
      dir,
      u,
      v: speed,
      mode: 'lane',
      plan: null,
      stoppedFor: 0,
      idle: 0,
      box: null,
    };
    placeCar(car);
    return car;
  }

  const cars = [];

  function rebuildLanes() {
    lanes.clear();
    for (const car of cars) {
      if (car.mode !== 'lane') continue;
      const k = laneKey(car.road, car.dir);
      if (!lanes.has(k)) lanes.set(k, []);
      lanes.get(k).push(car);
    }
    for (const list of lanes.values()) list.sort((a, b) => (b.u - a.u) * a.dir);
  }

  const leaderOf = (car) => {
    const list = lanes.get(laneKey(car.road, car.dir));
    if (!list) return null;
    const i = list.indexOf(car);
    return i > 0 ? list[i - 1] : null;
  };

  // --- seeding -------------------------------------------------------------------------------
  // A random road, favouring the busy city roads over the long quiet country ones.
  const roadWeight = (r) => Math.min(r.to - r.from, 70) * (r.kind === 'diagonal' ? 1.5 : 1) * (r.kind === 'county' || r.kind === 'spur' || r.kind === 'lake' || r.kind === 'design' ? 0.25 : r.class === 'arterial' ? 1.6 : 1);
  const totalWeight = network.roads.reduce((sum, r) => sum + roadWeight(r), 0);
  function pickRoad() {
    let roll = rand() * totalWeight;
    for (const r of network.roads) {
      roll -= roadWeight(r);
      if (roll <= 0) return r;
    }
    return network.roads[network.roads.length - 1];
  }
  function seedCars(count) {
    let tries = 0;
    while (cars.length < count && tries++ < count * 40) {
      const road = pickRoad();
      const dir = rand() < 0.5 ? 1 : -1;
      const u = road.from + 3 + rand() * (road.to - road.from - 6);
      const nearBox = road.nodes.some((n) => Math.abs(n.u - u) < n.ix.g.stop + 2);
      const nearMid = road.mid.some((m) => Math.abs(m.u - u) < 3);
      const crowded = cars.some((c) => c.mode === 'lane' && c.road === road && c.dir === dir && Math.abs(c.u - u) < 3);
      if (nearBox || nearMid || crowded) continue;
      cars.push(newCar(road, dir, u, 1 + rand()));
    }
  }

  // --- pedestrians ---------------------------------------------------------------------------
  const walkers = [];
  function seedWalkers(count) {
    for (let i = 0; i < count; i++) {
      const edge = graph.edges[Math.floor(rand() * graph.edges.length)];
      if (edge.kind === 'cross') continue; // start on the pavement
      walkers.push({
        id: nextId++,
        edge,
        forward: rand() < 0.5,
        s: rand() * edge.length,
        speed: 0.7 + rand() * 0.5,
        shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)],
        pants: PANTS[Math.floor(rand() * PANTS.length)],
        waiting: false,
        crossing: false,
        phase: rand() * 6,
        x: 0,
        z: 0,
        yaw: 0,
        lastEdge: null,
        stuck: 0,
        lateral: (rand() - 0.5) * 0.5, // walk a little off the centre line, so people don't queue single-file
      });
    }
  }

  function walkerPos(w) {
    const { a, b, length, via } = w.edge;
    const from = w.forward ? a : b;
    const to = w.forward ? b : a;
    let s = Math.min(Math.max(w.s, 0), length);
    let p0 = [from.x, from.z];
    let p1 = [to.x, to.z];
    if (via) {
      const first = Math.hypot(via[0] - from.x, via[1] - from.z);
      if (s <= first) {
        p1 = via;
      } else {
        p0 = via;
        s -= first;
      }
    }
    const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    const t = Math.min(1, s / segLen);
    const dx = (p1[0] - p0[0]) / segLen;
    const dz = (p1[1] - p0[1]) / segLen;
    return { x: p0[0] + (p1[0] - p0[0]) * t, z: p0[1] + (p1[1] - p0[1]) * t, yaw: Math.atan2(dx, dz), dx, dz };
  }

  // Who is allowed to step onto a crossing right now?
  function safeToCross(edge, t) {
    const cw = edge.cw;
    if (cw.type === 'arm') {
      const { ix, arm } = cw;
      const leg = ix.legs[arm];
      const control = ix.approaches[arm];
      if (control === 'signal') {
        const onAvenue = leg.onAvenue;
        if (signalState(t + ix.phase, onAvenue) !== 'red' || secondsUntilGreen(t + ix.phase, onAvenue) < 3) return false;
      }
      // Whatever the light says, don't step out in front of a moving car: one still arriving, or
      // one that has just turned onto this road and is still driving over the zebra.
      const road = leg.road;
      const uCross = leg.uC + leg.outDir * ix.g.cw;
      for (const dir of [1, -1]) {
        for (const car of lanes.get(laneKey(road, dir)) ?? []) {
          const dist = (uCross - carFront(car)) * dir; // positive: the crossing is still ahead of the car
          if (dist > -1.2 && dist < 3.4 && car.v > 0.25) return false;
        }
      }
      for (const car of cars) {
        if (car.mode !== 'box' || car.box.ix !== ix) continue;
        if (car.box.path.exitKey === arm) return false; // about to drive out across this crossing
        // just entered from this arm: still on, or about to reach, the zebra (it lies 0.4 past the stop line)
        if (car.box.path.entryKey === arm && car.box.s < ix.g.stop - ix.g.cw + CAR_LENGTH + 0.4) return false;
      }
      return true;
    }
    const { mid, road } = cw;
    for (const dir of [1, -1]) {
      for (const car of lanes.get(laneKey(road, dir)) ?? []) {
        const dist = (mid.u - carFront(car)) * dir;
        if (dist > -1.2 && dist < 3.4 && car.v > 0.25) return false;
      }
    }
    return true;
  }

  function walkerArrive(w, t) {
    const node = w.forward ? w.edge.b : w.edge.a;
    const options = node.edges.filter((e) => e !== w.edge);
    const next = options.length ? options[Math.floor(rand() * options.length)] : w.edge;
    w.lastEdge = w.edge;
    w.edge = next;
    w.forward = next.a === node;
    w.s = 0;
    w.waiting = next.kind === 'cross';
    void t;
  }

  function updateWalker(w, dt, t) {
    if (w.waiting) {
      if (safeToCross(w.edge, t)) {
        w.waiting = false;
        w.crossing = true;
        const { cw } = w.edge;
        if (cw.type === 'arm') cw.ix.cw[cw.arm]++;
        else cw.mid.peds++;
      }
    } else {
      w.s += w.speed * dt;
      if (w.s >= w.edge.length) {
        if (w.crossing) {
          const { cw } = w.edge;
          if (cw.type === 'arm') cw.ix.cw[cw.arm] = Math.max(0, cw.ix.cw[cw.arm] - 1);
          else cw.mid.peds = Math.max(0, cw.mid.peds - 1);
          w.crossing = false;
        }
        walkerArrive(w, t);
      }
    }
    const p = walkerPos(w);
    // step a little to the side of the line along a plain sidewalk (not while crossing)
    const side = w.edge.kind === 'walk' && !w.waiting ? w.lateral : 0;
    w.x = p.x - p.dz * side;
    w.z = p.z + p.dx * side;
    // a car the player left standing is in the way: walk round it (steered out to a car's width, so they pass it instead of through it)
    for (const o of obstacles) {
      const ox = w.x - o.x;
      const oz = w.z - o.z;
      const d = Math.hypot(ox, oz);
      if (d < WALK_AROUND) {
        const k = d > 1e-6 ? WALK_AROUND / d : 0;
        w.x = o.x + (d > 1e-6 ? ox * k : WALK_AROUND);
        w.z = o.z + (d > 1e-6 ? oz * k : 0);
      }
    }
    w.yaw = p.yaw;
    w.moving = !w.waiting;
    w.phase += w.moving ? dt * w.speed * 7 : 0;
  }

  // --- cars ----------------------------------------------------------------------------------
  // Everything that limits how far a car may drive before it must stop, as distance from its front.
  function stopDistance(car, t) {
    let limit = Infinity;
    const note = (d) => {
      if (d < limit) limit = d;
    };

    const leader = leaderOf(car);
    if (leader) note((carRear(leader) - carFront(car)) * car.dir - MIN_GAP);

    if (avatar && avatar.ready) {
      // treat the player like a pedestrian: brake for them if they stand in our lane
      const [fx, fz] = lanePoint(car.road, car.dir, carFront(car));
      const heading = laneYaw(car.road, car.dir);
      const hx = Math.sin(heading);
      const hz = Math.cos(heading);
      const ahead = (avatar.x - fx) * hx + (avatar.z - fz) * hz;
      const lateral = (avatar.x - fx) * -hz + (avatar.z - fz) * hx;
      if (ahead > -0.2 && ahead < 5 && Math.abs(lateral) < 0.5) note(ahead - 0.5);
    }

    if (obstacles.length) {
      const [fx, fz] = lanePoint(car.road, car.dir, carFront(car));
      const heading = laneYaw(car.road, car.dir);
      const hx = Math.sin(heading);
      const hz = Math.cos(heading);
      for (const o of obstacles) {
        const ahead = (o.x - fx) * hx + (o.z - fz) * hz;
        const lateral = (o.x - fx) * -hz + (o.z - fz) * hx;
        if (ahead > 0 && ahead < 9 && Math.abs(lateral) < 1.05) {
          note(ahead - 1.6); // the parked car's half length, then the usual gap is kept by MIN_GAP below
          car.sawObstacle = true;
        }
      }
    }

    for (const m of car.road.mid) {
      const dist = (m.u - carFront(car)) * car.dir;
      if (dist > -0.5 && dist < 12 && m.peds > 0) note(dist - 0.45);
    }

    const node = nextNodeAhead(car);
    car.next = node;
    car.mustWait = false;
    if (node) {
      const ix = node.ix;
      const arm = legOf(ix, car.road, car.dir);
      const control = ix.approaches[arm.key];
      const toLine = (node.u - car.dir * ix.g.stop - carFront(car)) * car.dir;
      if (toLine < 14) {
        if (!car.plan) {
          const choice = pickManeuver(control, exitsFor(ix, arm));
          car.plan = { maneuver: choice.maneuver, exit: choice.leg, decided: false };
        }
        const go = mayEnter(car, ix, arm, control, toLine, t);
        if (!go) {
          car.mustWait = true;
          note(Math.max(0, toLine));
        }
        car.arm = arm;
        car.toLine = toLine;
        car.control = control;
        if (control === 'yield' && toLine < 3.5 && toLine > 0) car.slow = 1.1;
      }
    }
    return limit;
  }

  // Is the start of the lane we would drive onto occupied by a slow or stopped car? Entering then
  // would park us in the middle of the intersection ("blocking the box").
  function exitCrowded(ix, path) {
    const { road: outRoad, dir: outDir, uStart } = path.exit;
    return (lanes.get(laneKey(outRoad, outDir)) ?? []).some((c) => {
      const rearOffset = (carRear(c) - uStart) * outDir;
      return rearOffset < 3.2 && (carFront(c) - uStart) * outDir > -0.5 && c.v < 0.6;
    });
  }

  function boxBlocked(ix, car, path) {
    for (const other of cars) {
      if (other.mode !== 'box' || other.box.ix !== ix || other === car) continue;
      if (other.box.path.entryKey === path.entryKey && other.box.s < 1.8) return true; // still leaving the entry lane ahead of us
    }
    return false;
  }

  // Would a car about to take `path` through circle `ix` come within a car's width of a car already in it? Each
  // route is looked at from where the car is now to its end.
  const AHEAD = 24;
  const samplePath = (path, from) => {
    const pts = [];
    for (let at = from; at <= Math.min(path.length, from + AHEAD); at += 0.6) {
      const p = pointOnPath(path, at);
      pts.push([p.x, p.z]);
    }
    return pts;
  };
  function circleConflict(ix, path) {
    const mine = samplePath(path, 0);
    for (const other of ix.occupants) {
      for (const q of samplePath(other.box.path, other.box.s)) {
        for (const m of mine) if (Math.hypot(m[0] - q[0], m[1] - q[1]) < 1.15) return true;
      }
    }
    return false;
  }

  function mayEnter(car, ix, leg, control, toLine, t) {
    const arm = leg.key;
    const onAvenue = leg.onAvenue;
    if (ix.cw[arm] > 0) return false; // someone is on our crosswalk
    const path = car.plan.path ?? (car.plan.path = buildPath(ix, leg, car.plan.exit, car.plan.maneuver, control === 'yield' ? 'yield' : 'plain'));
    if (path.exitKey && ix.cw[path.exitKey] > 0 && toLine < 2.5) return false; // someone is crossing where we would leave
    if (boxBlocked(ix, car, path) && toLine < 2.5) return false;
    // don't park in the middle of the junction; but after waiting a while, drivers push in anyway
    if (toLine < 4 && car.stoppedFor < 5 && exitCrowded(ix, path)) return false;

    const crossAxisOccupied = [...ix.occupants].some((o) => o.box.axis !== (onAvenue ? 'x' : 'z'));

    // Priority does not mean driving into a car that is already crossing in front of us.
    if (control === 'free') return !(crossAxisOccupied && toLine < 6);

    if (control === 'signal') {
      const light = signalState(t + ix.phase, onAvenue);
      if (light === 'red') return false;
      if (light === 'yellow') {
        const brakingRoom = (car.v * car.v) / (2 * COMFORT_BRAKE) + 0.15;
        if (toLine > brakingRoom) return false; // we can stop, so we do
        return true;
      }
      return !(crossAxisOccupied && toLine < 6);
    }

    if (control === 'yield') {
      if (toLine > 3.5) return true;
      if (ix.control !== 'circle') return ix.occupants.size === 0;
      // a circle is big enough for several cars at once, as long as their routes do not cross
      return !circleConflict(ix, path);
    }

    // stop sign: stop at the line, wait a moment, then go when it is our turn and the way is clear
    if (toLine > 0.4) return false;
    if (car.stoppedFor < 0.6) return false;
    if (ix.occupants.size > 0) return false;
    if (!ix.queue.includes(car)) ix.queue.push(car);
    const first = ix.queue.find((q) => q.mode === 'lane' && q.stoppedFor >= 0.6);
    if (ix.queue.length && first !== car && ix.approaches[arm] === 'stop' && allApproachesStop(ix)) return false; // all-way: first come, first served
    if (!allApproachesStop(ix)) {
      // two-way stop: the free-flowing road has priority. Wait for a gap on it.
      const majorRoad = leg.axis === 'x' ? ix.street : ix.avenue;
      const uC = leg.axis === 'x' ? ix.z : ix.x;
      for (const d of [1, -1]) {
        for (const other of lanes.get(laneKey(majorRoad, d)) ?? []) {
          const dist = (uC - carFront(other)) * d;
          if (dist > -1.4 && dist < 10 && other.v > 0.2) return false;
        }
      }
    }
    return true;
  }

  function allApproachesStop(ix) {
    return Object.values(ix.approaches).every((a) => !a || a === 'stop');
  }

  function enterBox(car, node) {
    const ix = node.ix;
    if (!car.plan || !car.arm) return; // nothing planned yet: try again next step
    const path = car.plan.path ?? buildPath(ix, car.arm, car.plan.exit, car.plan.maneuver, car.control === 'yield' ? 'yield' : 'plain');
    car.mode = 'box';
    car.box = { ix, path, s: 0, axis: car.arm.axis, held: 0 };
    ix.occupants.add(car);
    const qi = ix.queue.indexOf(car);
    if (qi >= 0) ix.queue.splice(qi, 1);
    car.plan = null;
    car.stoppedFor = 0;
  }

  function exitBox(car) {
    const { ix, path } = car.box;
    const { road: outRoad, dir: outDir, uStart } = path.exit;
    // is there room at the start of the exit lane?
    const blocked = (lanes.get(laneKey(outRoad, outDir)) ?? []).some((c) => (carRear(c) - uStart) * outDir < 0.9 && (carFront(c) - uStart) * outDir > -0.2);
    if (blocked && car.box.held < 8) {
      car.box.held += 1 / 20;
      car.v = 0;
      return false;
    }
    ix.occupants.delete(car);
    car.mode = 'lane';
    car.road = outRoad;
    car.dir = outDir;
    car.u = uStart + outDir * (CAR_LENGTH / 2); // the car's centre is at the start of the lane, so its front is half a length on
    car.box = null;
    car.plan = null;
    return true;
  }

  function updateCar(car, dt, t) {
    if (car.mode === 'box') {
      const { path, ix } = car.box;
      const cruise = ix.control === 'circle' ? 2.1 : path.kind === 'yield' ? 1.3 : path.maneuver === 'straight' ? 2.1 : 1.3; // a circle's ring is wide enough to go round at speed
      car.v += Math.min(cruise - car.v, ACCEL * dt);
      // keep behind a car ahead on the same path
      for (const other of ix.occupants) {
        if (other !== car && other.box.path.entryKey === path.entryKey && other.box.s > car.box.s && other.box.s - car.box.s < CAR_LENGTH + 0.2) car.v = Math.min(car.v, other.v);
      }
      // ... and keep clear of a car ahead on the lane we are about to join
      {
        const { road: outRoad, dir: outDir, uStart } = path.exit;
        for (const c of lanes.get(laneKey(outRoad, outDir)) ?? []) {
          const rearOffset = (carRear(c) - uStart) * outDir; // how far past the lane start the car's rear is
          if (rearOffset < -0.5 || rearOffset > 4) continue;
          const gap = rearOffset + (path.length - car.box.s) - MIN_GAP;
          car.v = Math.min(car.v, Math.sqrt(2 * COMFORT_BRAKE * Math.max(0, gap)));
        }
      }
      car.box.s += car.v * dt;
      if (car.box.s >= path.length) {
        car.box.s = path.length;
        if (!exitBox(car)) return;
        placeCar(car);
        return;
      }
      const p = pointOnPath(path, car.box.s);
      car.x = p.x;
      car.z = p.z;
      car.yaw = p.yaw;
      return;
    }

    car.slow = 0;
    const room = stopDistance(car, t);
    const vmax = Math.min(car.road.class === 'arterial' ? 2.4 : 1.9, car.slow || Infinity);
    let target = vmax;
    if (room < Infinity) target = Math.min(vmax, Math.sqrt(2 * COMFORT_BRAKE * Math.max(0, room)));
    if (car.v > target) car.v = Math.max(target, car.v - HARD_BRAKE * dt);
    else car.v = Math.min(target, car.v + ACCEL * dt);

    const advance = Math.min(car.v * dt, room < Infinity ? Math.max(0, room) : Infinity);
    car.u += car.dir * advance;

    // bookkeeping for stop signs and for watching for gridlock
    const atLine = car.mustWait || car.control === 'stop';
    car.blocked = car.sawObstacle && car.v < 0.05 ? (car.blocked ?? 0) + dt : 0; // waiting behind a parked car
    car.sawObstacle = false;
    if (car.v < 0.05) {
      car.stoppedFor += dt;
      car.idle += dt;
    } else {
      car.stoppedFor = 0;
      car.idle = 0;
    }
    void atLine;

    // reach the stop line free to go: enter the intersection
    if (car.next && !car.mustWait && car.toLine !== undefined && car.plan) {
      const toLineNow = (car.next.u - car.dir * car.next.ix.g.stop - carFront(car)) * car.dir;
      if (toLineNow <= 0.05) enterBox(car, car.next);
    }
    placeCar(car);
  }

  // --- spawning ------------------------------------------------------------------------------
  // Every road starts and ends at a junction, so cars don't drive in from the edge of the map. If the
  // streets are short of traffic, a new car sets off from a clear spot well away from the player.
  function trySpawn(dt) {
    spawnTimer -= dt;
    if (spawnTimer > 0 || cars.length >= maxCars) return;
    spawnTimer = 1 + rand() * 2;
    for (let attempt = 0; attempt < 12; attempt++) {
      const road = pickRoad();
      const dir = rand() < 0.5 ? 1 : -1;
      const u = road.from + 4 + rand() * (road.to - road.from - 8);
      if (road.nodes.some((n) => Math.abs(n.u - u) < n.ix.g.stop + 3) || road.mid.some((m) => Math.abs(m.u - u) < 4)) continue;
      if ((lanes.get(laneKey(road, dir)) ?? []).some((c) => Math.abs(c.u - u) < 5)) continue;
      const [x, z] = lanePoint(road, dir, u);
      if (avatar && avatar.ready && Math.hypot(avatar.x - x, avatar.z - z) < 30) continue; // never pop into view
      cars.push(newCar(road, dir, u, 1));
      return;
    }
  }

  function despawn() {
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      const off = car.mode === 'lane' && ((car.u > car.road.to + 0.6 && car.dir > 0) || (car.u < car.road.from - 0.6 && car.dir < 0));
      const stuck = car.idle > 90 || car.blocked > 9 || (car.mode === 'box' && car.box.held > 7.5);
      if (off || stuck) {
        if (car.mode === 'box') car.box.ix.occupants.delete(car);
        for (const ix of network.ixList) {
          const qi = ix.queue.indexOf(car);
          if (qi >= 0) ix.queue.splice(qi, 1);
        }
        if (stuck) {
          stats.despawnedStuck++;
          if (stats.stuckLog.length < 6) {
            stats.stuckLog.push({
              mode: car.mode,
              road: car.road.id,
              dir: car.dir,
              u: Math.round(car.u * 100) / 100,
              idle: Math.round(car.idle),
              control: car.control,
              arm: car.arm,
              toLine: car.toLine === undefined ? null : Math.round(car.toLine * 100) / 100,
              plan: car.plan ? car.plan.maneuver : null,
              ix: car.mode === 'box' ? car.box.ix.id : car.next ? car.next.ix.id : null,
            });
          }
        }
        cars.splice(i, 1);
      }
    }
  }

  // --- public --------------------------------------------------------------------------------
  const stats = { despawnedStuck: 0, stuckLog: [] };

  seedCars(Math.round(maxCars * 0.7));
  seedWalkers(maxWalkers);

  function step(dt, t) {
    rebuildLanes();
    for (const car of [...cars]) updateCar(car, dt, t);
    rebuildLanes(); // cars that just left an intersection are on the road now: walkers must see them
    for (const w of walkers) updateWalker(w, dt, t);
    trySpawn(dt);
    despawn();
    curved.update(dt);
  }

  return {
    cars,
    walkers,
    curveCars: curved.cars, // on curved streets (drawn like `cars`)
    curveWalkers: curved.walkers,
    obstacles,
    network,
    graph,
    stats,
    update(delta, clockTime) {
      // advance in small fixed steps so a slow frame can't skip over a stop line
      let remaining = Math.min(delta, 0.25);
      state.time = clockTime ?? state.time + remaining;
      while (remaining > 1e-6) {
        const dt = Math.min(remaining, 0.05);
        step(dt, state.time - remaining + dt);
        remaining -= dt;
      }
    },
  };
}

