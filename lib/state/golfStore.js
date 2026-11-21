import { create } from 'zustand';
import { avatarState } from '../sim/avatarState';
import { GOLF, holeScore, newBall, putt, stepBall } from '../world/golfPhysics';
import { cardTotals, recordRound } from '../world/golfScore';
import { golfLive, golfSubmit } from '../data/golf';

// Playing the mini-golf course (docs/world/minigolf.md): which hole you are on, who is playing, where the ball is, the aim and the power, and the cards. The ball's physics is lib/world/golfPhysics.js; the course is the
// baked manifest's `courses` (apps/web/components/world/MiniGolf.jsx loads it). The ball and the cards live here; the 3D side draws the ball from `ball`, and the HUD (components/ui/GolfHud.jsx) reads the rest.
//
//   phase: 'aim' (turn with A and D or the arrows, drag the ball back, or the stick on a gamepad; hold Space or A to charge, let go to putt) -> 'roll' (the ball moves) -> 'aim' again, or 'done' (in the cup, or picked up)
//   -> next (the other player on a two-player round, then the next hole) -> 'card' after the last.
// Two players share the device and take turns: on each hole the first plays it out, then the second.
export const AIM_SPEED = 1.6; // radians a second
export const CHARGE_TIME = 1.1; // seconds from nothing to full power
export const TEE_RANGE = 3.2; // how near a tee you must be to start
export const MIN_DRAG_POWER = 0.08; // a drag shorter than this (a tap) is not a putt

/** The hole of the course with this number (1 to 9), or undefined. */
const holeOf = (course, n) => course?.holes?.find((h) => h.n === n);
const toPhysics = (h) => ({ cup: h.cup, segments: h.segments.map(([ax, az, bx, bz, nx, nz]) => ({ a: { x: ax, z: az }, b: { x: bx, z: bz }, nx, nz })) });

const idle = { active: false, phase: 'idle', hole: 0, ball: null, aim: 0, power: 0, charging: false, dragging: false, players: 1, player: 0, names: ['You', 'Player 2'], cards: [[], []], card: [], putts: [], putts2: [], note: null, round: null };

export const useGolf = create((set, get) => ({
  course: null, // the manifest's course: { id, name, par, holes: [{ n, kind, par, tee, cup, bounds, segments }] }
  ...idle,
  courses: [], // every course of the world (the park's two nines); `course` is the one being played, or the first
  setCourse: (course) => set({ course, courses: course ? [course] : [] }),
  /** Gives the store every course of the world's manifest. */
  setCourses: (list) => set({ courses: list ?? [], course: list?.[0] ?? null }),

  /** Which tee a person at (x, z) can start from, on any course: the nearest tee within TEE_RANGE ({ ...hole, courseId, courseName }), or null. */
  teeNear: (x, z) => {
    const { course, courses } = get();
    let best = null;
    for (const c of courses.length ? courses : course ? [course] : []) for (const h of c.holes) { const d = Math.hypot(h.tee.x - x, h.tee.z - z); if (d <= TEE_RANGE && (!best || d < best.d)) best = { hole: { ...h, courseId: c.id, courseName: c.name }, d }; }
    return best?.hole ?? null;
  },

  /**
   * Starts playing hole `n`. With `players` (1 or 2) and `names` it starts a new round for them; without, it goes on with the round that is on (or starts a one-player round). Puts the player at the tee, looking
   * along the lane. Refused in a vehicle.
   */
  start: (n, opts = {}) => {
    let { course } = get();
    const { active, players, names, cards } = get();
    if (opts.course && opts.course !== course?.id) { const c = get().courses.find((x) => x.id === opts.course); if (c) { course = c; set({ course: c }); } } // (a tee on the other nine)
    const h = holeOf(course, n);
    if (!h || avatarState.vehicle) return false;
    const fresh = !active || opts.players !== undefined;
    const count = fresh ? (opts.players === 2 ? 2 : 1) : players;
    const nm = fresh ? [opts.names?.[0] ?? 'You', opts.names?.[1] ?? 'Player 2'] : names;
    const cs = fresh ? [[], []] : cards;
    const aim = bestAim(h);
    const ps = fresh ? [] : get().putts.map((l) => [...l]), ps2 = fresh ? [] : get().putts2.map((l) => [...l]);
    ps[n - 1] = []; ps2[n - 1] = []; // (this hole's putts start again)
    set({ active: true, phase: 'aim', hole: n, ball: newBall(h.tee), aim, power: 0, charging: false, dragging: false, note: null, round: null, players: count, names: nm, player: 0, cards: cs, card: cs[0], putts: ps, putts2: ps2 });
    stand(h, aim);
    return true;
  },

  /** Turns the aim by `dir` (-1 left, +1 right) for `dt` seconds. */
  turn: (dir, dt) => { if (get().phase === 'aim') set({ aim: get().aim + dir * AIM_SPEED * dt }); },
  /** Sets the aim to an angle. */
  setAim: (angle) => { if (get().phase === 'aim') set({ aim: angle }); },
  /** Starts or stops charging the putt. */
  charge: (on) => { if (get().phase === 'aim') set({ charging: on, dragging: false, power: on ? 0 : get().power }); },
  /** A drag in progress: sets the aim and the power from the pull (the indicators show them; nothing is putt until `dragEnd`). */
  drag: (angle, power) => { if (get().phase === 'aim') set({ aim: angle, power: Math.max(0, Math.min(1, power)), dragging: true, charging: false }); },
  /** Lets go of a drag: putts at the power pulled, or does nothing for a short pull (a tap). */
  dragEnd: () => {
    const { phase, dragging, power } = get();
    if (phase !== 'aim' || !dragging) return false;
    if (power < MIN_DRAG_POWER) { set({ dragging: false, power: 0 }); return false; }
    set({ charging: true, dragging: false });
    return get().release();
  },
  /** Lets go: putts at the power charged (at least 5 per cent), if there was one. */
  release: () => {
    const { phase, ball, aim, power, charging } = get();
    if (phase !== 'aim' || !charging) return false;
    // the putt is kept as whole thousandths (the angle within -pi to pi, the power from 5 to 100 per cent): the server plays the round again from these, so the roll is the same on both
    const a = Math.round(Math.atan2(Math.sin(aim), Math.cos(aim)) * 1000), p = Math.max(50, Math.min(1000, Math.round(power * 1000)));
    putt(ball, a / 1000, p / 1000);
    { const key = get().player === 0 ? 'putts' : 'putts2', ps = get()[key].map((l) => [...l]); (ps[get().hole - 1] ??= []).push([a, p]); set({ [key]: ps }); } // (each player's putts, kept for the server to play again)
    set({ phase: 'roll', charging: false, dragging: false, power: 0, ball: { ...ball } });
    return true;
  },

  /** Advances the game by `dt` seconds: the charge, the ball. */
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
          const strokes = holeScore(ball, h), cards = s.cards.map((c) => [...c]);
          cards[s.player][s.hole - 1] = strokes;
          set({ phase: 'done', ball: { ...ball }, cards, card: cards[s.player], note: { strokes, par: h.par, sunk: ball.sunk } });
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

  /**
   * After a hole: the other player's turn on the same hole (two players), else on to the next hole, or the card after the last (and a one-player round's total is kept if it is this device's best).
   */
  next: (storage = typeof localStorage !== 'undefined' ? localStorage : null) => {
    const { phase, hole, course, cards, players, player } = get();
    if (phase !== 'done') return false;
    if (players === 2 && player === 0) { // the second player plays the same hole
      const h = holeOf(course, hole), aim = bestAim(h);
      set({ phase: 'aim', player: 1, card: cards[1], ball: newBall(h.tee), aim, power: 0, charging: false, dragging: false, note: null });
      stand(h, aim);
      return true;
    }
    if (hole >= course.holes.length) {
      const totals = cards.slice(0, players).map((c) => cardTotals(c, course.holes));
      let rec = { best: null, isBest: false };
      if (players === 1 && storage) rec = recordRound(storage, course.id, totals[0]);
      const winner = players === 2 ? (totals[0].strokes === totals[1].strokes ? -1 : totals[0].strokes < totals[1].strokes ? 0 : 1) : null;
      set({ phase: 'card', round: { ...totals[0], totals, winner, best: rec.best, isBest: rec.isBest, saved: null }, ball: null });
      // a signed-in round goes to the server, which plays the putts again and says where it stands (docs/world/minigolf.md, "The saved leaderboard"); a two-player round goes with both players' putts and is kept as a match
      if (golfLive()) {
        const { putts, putts2, names } = get();
        golfSubmit(course.id, putts, players === 2 ? { putts2, names: names.slice(0, 2) } : undefined).then((r) => { if (get().phase === 'card') set({ round: { ...get().round, saved: { rank: r.rank, best: r.best, record: r.record, strokes: r.strokes, match: r.match ?? null } } }); }).catch(() => { if (get().phase === 'card') set({ round: { ...get().round, saved: { error: true } } }); });
      }
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

  /** Puts the club away (any time): the cards are lost unless the round is done. */
  quit: () => set({ ...idle }),
}));

/** The aim that points from the tee along the first stretch of the lane. */
function bestAim(h) {
  if (Number.isFinite(h.aim)) return h.aim; // (the lane's own first direction, from the manifest)
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
