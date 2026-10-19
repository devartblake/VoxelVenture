// The hold on a plot while a player sets it up: three minutes to claim and pay once they start, then it is open again. Pure, so it is tested in Node.
// With a game server and a signed-in player the hold is kept on the server too (services/api/economy.mjs: POST /plots/:id/hold), so two players
// cannot each think they hold the same plot; this clock then counts down the time the server gives.
export const HOLD_SECONDS = 180;

export const holdUntil = (now = Date.now()) => now + HOLD_SECONDS * 1000;

// { left (seconds, never negative), expired, label ('2:41') } for a hold that ends at `until`.
export function holdState(until, now = Date.now()) {
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return { left, expired: left <= 0, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, urgent: left <= 30 };
}
