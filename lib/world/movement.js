// Is this movement plausible? (docs/architecture/presence_positions.md.) Pure: the presence server feeds it every position a connection reports and keeps what it says is VERIFIED.
//
// The rule: a new position is accepted when the avatar could have got there from the last VERIFIED position in the time that has really passed, at the speed of what it is in (on foot,
// in a car, in a boat), with a margin for lag. A position that fails is not accepted and the verified position stays where it was, so the checks do not move with a cheater: if the
// client stays at the far place, the verified position catches up only once enough real time has passed for someone to have got there. That is what "plausible" means, and nothing more:
// it does not prove a person is playing, only that the movement is physically possible and continuous. (A bot that moves like a legal player along legal paths passes; that costs real
// time, rewards are small and capped, and lib/world/antibot.js looks for the patterns bots leave.)
//
// What each failure is:
//   too_fast       farther than the mode's top speed allows, but not absurdly so (a laggy client, or a modified speed)
//   teleport       far beyond what any speed allows (several times the distance, or a jump of tens of units at once)
//   out_of_bounds  outside the world (the land and a margin), whatever the speed
//   bad            not a number
import { WALK_SPEED } from '../city/routing';
import { VEHICLES } from '../sim/vehicles';

export const RUN_MULTIPLIER = 1.8; // the game's run (Avatar.jsx)
/** The top speed of each mode, in units a second: on foot (running), a car, a boat. From the game's own constants. */
export const SPEED_CAP = { walk: WALK_SPEED * RUN_MULTIPLIER, car: VEHICLES.car.maxSpeed, racecar: VEHICLES.racecar.maxSpeed, boat: VEHICLES.boat.maxSpeed };
export const LAG_FACTOR = 1.5; // the speed cap is allowed this much over, for a slow network and a busy tab
export const SLACK = 3; // and this many units, for the rounding of the reports and the first step
export const TELEPORT_FACTOR = 3; // more than this times the allowed distance (plus TELEPORT_MIN) is a teleport, not just too fast
export const TELEPORT_MIN = 12;
export const MAX_GAP_S = 3600; // an hour: after a silence longer than this the verified position is not compared at all (a new start)

/** 'car' | 'racecar' | 'boat' | 'walk' from what a connection says it is in. */
export const modeOf = (veh) => (veh?.kind === 'car' ? (veh.spec === 'racecar' ? 'racecar' : 'car') : veh?.kind === 'boat' ? 'boat' : 'walk');

/** A fresh state for one connection. */
export const newMovement = () => ({ verified: null, counts: { ok: 0, too_fast: 0, teleport: 0, out_of_bounds: 0, bad: 0 }, lastViolationAt: 0 });

/**
 * One report. Returns { ok, kind, verified, distance, speed }. `state` is changed in place: when ok, its verified position moves to the report.
 * @param {object} state            newMovement()
 * @param {{ x: number, z: number, veh?: object|null }} report
 * @param {number} now              ms
 * @param {{ inBounds?: (x:number, z:number) => boolean }} [world]
 */
export function step(state, report, now, world = {}) {
  const x = report.x, z = report.z;
  const mode = modeOf(report.veh);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return fail(state, 'bad', now);
  if (world.inBounds && !world.inBounds(x, z)) return fail(state, 'out_of_bounds', now);
  const prev = state.verified;
  if (!prev || (now - prev.at) / 1000 > MAX_GAP_S) {
    state.verified = { x, z, at: now, mode };
    state.counts.ok++;
    return { ok: true, kind: 'start', verified: state.verified, distance: 0, speed: 0 };
  }
  const dt = Math.max(0.05, (now - prev.at) / 1000);
  const cap = Math.max(SPEED_CAP[mode], SPEED_CAP[prev.mode]); // changing between on foot and a vehicle: the faster of the two
  const allowed = cap * LAG_FACTOR * dt + SLACK;
  const distance = Math.hypot(x - prev.x, z - prev.z);
  if (distance > allowed) return fail(state, distance > allowed * TELEPORT_FACTOR + TELEPORT_MIN ? 'teleport' : 'too_fast', now, distance);
  state.verified = { x, z, at: now, mode };
  state.counts.ok++;
  return { ok: true, kind: 'ok', verified: state.verified, distance, speed: distance / dt };
}

function fail(state, kind, now, distance = 0) {
  state.counts[kind]++;
  state.lastViolationAt = now;
  return { ok: false, kind, verified: state.verified, distance, speed: 0 };
}

// (Freshness is the caller's business, and it is the CONNECTION'S, not the position's: the game sends a position only while it changes, so a player standing still for a minute is
// not stale. The presence server credits a verified position while its connection is alive and has spoken in the last half minute.)
