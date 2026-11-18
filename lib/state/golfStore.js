import { create } from 'zustand';
import { avatarState } from '../sim/avatarState';
import { GOLF, holeScore, newBall, putt, stepBall } from '../world/golfPhysics';
import { cardTotals, recordRound } from '../world/golfScore';

// Playing the mini-golf course (docs/world/minigolf.md): which hole you are on, where the ball is, the aim and the power, and the card. The ball's physics is lib/world/golfPhysics.js; the course is the baked
// manifest's `courses` (apps/web/components/world/MiniGolf.jsx loads it). The ball and the card live here; the 3D side draws the ball from `ball`, and the HUD (components/ui/GolfHud.jsx) reads the rest.
//
//   phase: 'aim' (turn with A and D or the arrows, hold Space to charge, let go to putt) -> 'roll' (the ball moves) -> 'aim' again, or 'done' (in the cup, or picked up) -> next hole -> 'card' after the last.
export const AIM_SPEED = 1.6; // radians a second
export const CHARGE_TIME = 1.1; // seconds from nothing to full power
export const TEE_RANGE = 3.2; // how near a tee you must be to start

/** The hole of the course with this number (1 to 9), or undefined. */
const holeOf = (course, n) => course?.holes?.find((h) => h.n === n);
const toPhysics = (h) => ({ cup: h.cup, segments: h.segments.map(([ax, az, bx, bz, nx, nz]) => ({ a: { x: ax, z: az }, b: { x: bx, z: bz }, nx, nz })) });

const idle = { active: false, phase: 'idle', hole: 0, ball: null, aim: 0, power: 0, charging: false, card: [], note: null, round: null };

export const useGolf = create((set, get) => ({
  course: null, // the manifest's course: { id, name, par, holes: [{ n, kind, par, tee, cup, bounds, segments }] }
  ...idle,
  setCourse: (course) => set({ course }),

  /** Which tee a person at (x, z) can start from: the nearest tee within TEE_RANGE, or null. */
  teeNear: (x, z) => {
    const { course } = get();
    let best = null;
    for (const h of course?.holes ?? []) { const d = Math.hypot(h.tee.x - x, h.tee.z - z); if (d <= TEE_RANGE && (!best || d < best.d)) best = { hole: h, d }; }
    return best?.hole ?? null;
  },

  /** Starts playing hole `n` (a new round when none is on; keeps the card of the round on when it is). Puts the player at the tee, looking along the lane. Refused in a vehicle. */
  start: (n) => {
    const { course, active, card } = get();
    const h = holeOf(course, n);
    if (!h || avatarState.vehicle) return false;
    const aim = bestAim(h);
    set({ active: true, phase: 'aim', hole: n, ball: newBall(h.tee), aim, power: 0, charging: false, note: null, round: null, card: active ? card : [] });
    stand(h, aim);
    return true;
  },

  /** Turns the aim by `dir` (-1 left, +1 right) for `dt` seconds. */
  turn: (dir, dt) => { if (get().phase === 'aim') set({ aim: get().aim + dir * AIM_SPEED * dt }); },
  /** Sets the aim to an angle (a drag, a tap). */
  setAim: (angle) => { if (get().phase === 'aim') set({ aim: angle }); },
  /** Starts or stops charging the putt. */
  charge: (on) => { if (get().phase === 'aim') set({ charging: on, power: on ? 0 : get().power }); },
  /** Lets go: putts at the power charged (at least 5 per cent), if there was one. */
  release: () => {
    const { phase, ball, aim, power, charging } = get();
    if (phase !== 'aim' || !charging) return false;
    putt(ball, aim, Math.max(0.05, power));
    set({ phase: 'roll', charging: false, power: 0, ball: { ...ball } });
    return true;
  },

  /** Advances the game by `dt` seconds: the charge, the ball. Returns nothing: it sets the state. */
  tick: (dt) => {
    const s = get();
    if (!s.active) return;
    const h = holeOf(s.course, s.hole);
    if (s.phase === 'aim' && s.charging) set({ power: Math.min(1, s.power + dt / CHARGE_TIME) });
    if (s.phase === 'roll') {
      const ball = s.ball;
      stepBall(ball, toPhysics(h), dt);
      if (!ball.moving) {
        const scored = ball.sunk || ball.strokes >= GOLF.maxStrokes;
        if (scored) {
          const strokes = holeScore(ball, h), card = [...s.card];
          card[s.hole - 1] = strokes;
          set({ phase: 'done', ball: { ...ball }, card, note: { strokes, par: h.par, sunk: ball.sunk } });
          return;
        }
        // stopped short: aim again from where it lies, looking at the cup
        set({ phase: 'aim', ball: { ...ball }, aim: Math.atan2(h.cup.z - ball.z, h.cup.x - ball.x) });
        stand(h, get().aim, ball);
        return;
      }
      set({ ball: { ...ball } });
    }
  },

  /** After a hole: on to the next, or the card after the last (and the round's total is kept if it is this device's best). */
  next: (storage = typeof localStorage !== 'undefined' ? localStorage : null) => {
    const { phase, hole, course, card } = get();
    if (phase !== 'done') return false;
    if (hole >= course.holes.length) {
      const t = cardTotals(card, course.holes);
      const rec = storage ? recordRound(storage, course.id, t) : { best: null, isBest: false };
      set({ phase: 'card', round: { ...t, best: rec.best, isBest: rec.isBest }, ball: null });
      return true;
    }
    return get().start(hole + 1);
  },

  /** Keeps the player where a golfer stands (a step behind the ball, facing the aim): called every frame while playing, so a click on the ground or a push does not walk them off. */
  hold: () => {
    const { active, phase, course, hole, ball, aim } = get();
    if (!active || phase === 'card') return;
    const h = holeOf(course, hole);
    if (h && ball) stand(h, aim, ball);
  },

  /** Puts the club away (any time): the card is lost unless the round is done. */
  quit: () => set({ ...idle }),
}));

/** The aim that points from the tee along the first stretch of the lane (toward the cup, which for a bent hole is not straight: the lane's own direction is better). */
function bestAim(h) {
  const dx = h.cup.x - h.tee.x, dz = h.cup.z - h.tee.z;
  return Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : Math.PI) : dz >= 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** Puts the avatar a step behind the ball, looking along the aim (so it is beside the lane's start, not in the way). */
function stand(h, aim, ball = null) {
  const p = ball ?? h.tee;
  avatarState.x = p.x - Math.cos(aim) * 1.0;
  avatarState.z = p.z - Math.sin(aim) * 1.0;
  avatarState.yaw = Math.PI / 2 - aim; // (the avatar faces along its yaw as atan2(x, z): +z at 0)
  avatarState.moving = false;
  avatarState.target = null;
}
