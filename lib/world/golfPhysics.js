// The ball on a mini-golf hole (docs/world/minigolf.md): a ball that rolls on the felt, slows down, bounces off the walls (the faces lib/world/minigolf.js gives each hole as `segments`) and drops into the cup
// when it is slow enough over it. Pure and deterministic (the same putt gives the same roll), so the game can run it on every client and a test can check it. Units: game units and seconds.
import { COURSE } from './minigolf';

export const GOLF = {
  maxSpeed: 14, // a full-power putt, units a second
  friction: 2.4, // the felt's constant slowing, units a second a second
  drag: 0.3, // and the part that grows with speed, a second to the minus one
  stopBelow: 0.12, // under this the ball stops
  bounce: 0.62, // how much of the speed a wall leaves
  cupSpeed: 6, // over the cup faster than this the ball skips over
  step: 1 / 240, // the physics step
  maxStrokes: 8, // after this many a hole is picked up and counted as par + 4
};

/** A new ball on a tee. */
export const newBall = (tee) => ({ x: tee.x, z: tee.z, vx: 0, vz: 0, sunk: false, strokes: 0, moving: false });

/** Hits the ball: `angle` (radians: 0 along +x, positive toward +z), `power` 0 to 1. Counts a stroke. */
export function putt(ball, angle, power) {
  const v = GOLF.maxSpeed * Math.max(0.05, Math.min(1, power));
  ball.vx = Math.cos(angle) * v; ball.vz = Math.sin(angle) * v;
  ball.strokes++; ball.moving = true;
  return ball;
}

/** The closest point of a segment to (x, z): { x, z }. */
function closest(a, b, x, z) {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return { x: a.x + dx * t, z: a.z + dz * t };
}

/** One physics step of `dt` (at most GOLF.step): friction, the walls, the cup. Returns the ball. */
function stepOnce(ball, hole, dt) {
  ball.x += ball.vx * dt; ball.z += ball.vz * dt;
  const r = COURSE.ball;
  for (const s of hole.segments) {
    const c = closest(s.a, s.b, ball.x, ball.z);
    let dx = ball.x - c.x, dz = ball.z - c.z, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-6) { dx = s.nx; dz = s.nz; d = 1; } // exactly on the face: push along its normal
    const nx = dx / d, nz = dz / d;
    // the face must be facing the ball (the wall's inside): a ball can only be on the felt's side
    if (nx * s.nx + nz * s.nz < -0.2) continue;
    ball.x = c.x + nx * r; ball.z = c.z + nz * r;
    const vn = ball.vx * nx + ball.vz * nz;
    if (vn < 0) { ball.vx -= (1 + GOLF.bounce) * vn * nx; ball.vz -= (1 + GOLF.bounce) * vn * nz; }
  }
  const sp = Math.hypot(ball.vx, ball.vz);
  if (sp > 0) {
    const slow = Math.min(sp, (GOLF.friction + GOLF.drag * sp) * dt), k = (sp - slow) / sp;
    ball.vx *= k; ball.vz *= k;
  }
  return ball;
}

/**
 * Advances the ball by `dt` seconds on `hole` ({ cup: { x, z }, segments }): in steps of GOLF.step. Sets `sunk` when it is over the cup and slow enough, and `moving` false when it has stopped.
 * Returns the ball.
 */
export function stepBall(ball, hole, dt) {
  if (ball.sunk || !ball.moving) return ball;
  let left = dt;
  while (left > 1e-9 && !ball.sunk && ball.moving) {
    const h = Math.min(GOLF.step, left);
    stepOnce(ball, hole, h);
    left -= h;
    const sp = Math.hypot(ball.vx, ball.vz);
    if (Math.hypot(ball.x - hole.cup.x, ball.z - hole.cup.z) < COURSE.cup * 0.85 && sp < GOLF.cupSpeed) { ball.sunk = true; ball.x = hole.cup.x; ball.z = hole.cup.z; ball.vx = ball.vz = 0; ball.moving = false; }
    else if (sp < GOLF.stopBelow) { ball.vx = ball.vz = 0; ball.moving = false; }
  }
  return ball;
}

/** The score of a hole: strokes, capped (a ball not in after maxStrokes counts par + 4). */
export const holeScore = (ball, hole) => (ball.sunk ? ball.strokes : Math.max(ball.strokes, hole.par + 4));
