// Things Gold can buy. `slot` is where it is worn; emotes are played with number keys.

export const COSMETICS = [
  { id: 'shirt-blue', slot: 'shirt', name: 'Blue tee', color: '#3b82f6', price: 0 },
  { id: 'shirt-red', slot: 'shirt', name: 'Red tee', color: '#ef4444', price: 25 },
  { id: 'shirt-green', slot: 'shirt', name: 'Green tee', color: '#22c55e', price: 25 },
  { id: 'shirt-black', slot: 'shirt', name: 'Black tee', color: '#1f2937', price: 40 },
  { id: 'shirt-purple', slot: 'shirt', name: 'Purple tee', color: '#a855f7', price: 40 },
  { id: 'shirt-gold', slot: 'shirt', name: 'Gold jacket', color: '#facc15', price: 80 },

  { id: 'pants-navy', slot: 'pants', name: 'Navy pants', color: '#1e3a8a', price: 0 },
  { id: 'pants-khaki', slot: 'pants', name: 'Khakis', color: '#a8a29e', price: 20 },
  { id: 'pants-black', slot: 'pants', name: 'Black pants', color: '#111827', price: 20 },
  { id: 'pants-white', slot: 'pants', name: 'White pants', color: '#e2e8f0', price: 30 },

  { id: 'hat-none', slot: 'hat', name: 'No hat', color: null, price: 0 },
  { id: 'hat-cap', slot: 'hat', name: 'Cap', color: '#ef4444', price: 40 },
  { id: 'hat-party', slot: 'hat', name: 'Party hat', color: '#ec4899', price: 60 },
  { id: 'hat-top', slot: 'hat', name: 'Top hat', color: '#111827', price: 100 },
  { id: 'hat-crown', slot: 'hat', name: 'Crown', color: '#facc15', price: 250 },

  { id: 'emote-wave', slot: 'emote', name: 'Wave', key: '1', price: 30 },
  { id: 'emote-dance', slot: 'emote', name: 'Dance', key: '2', price: 60 },
  { id: 'emote-jump', slot: 'emote', name: 'Jump', key: '3', price: 40 },
];

export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const DEFAULT_APPEARANCE = { shirt: 'shirt-blue', pants: 'pants-navy', hat: 'hat-none' };
export const DEFAULT_OWNED = { 'shirt-blue': true, 'pants-navy': true, 'hat-none': true };

// A sponsored raffle: costs Gold to enter, prizes are mostly small, so on average it costs more
// than it pays (a Gold sink). Chances add up to 1.
export const RAFFLE_COST = 15;
export const RAFFLE_PRIZES = [
  { gold: 0, chance: 0.55 },
  { gold: 10, chance: 0.25 },
  { gold: 25, chance: 0.15 },
  { gold: 60, chance: 0.04 },
  { gold: 250, chance: 0.01 },
];

export function drawRafflePrize(roll = Math.random()) {
  let acc = 0;
  for (const prize of RAFFLE_PRIZES) {
    acc += prize.chance;
    if (roll < acc) return prize.gold;
  }
  return 0;
}
