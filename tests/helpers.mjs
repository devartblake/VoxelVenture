// Shared by the tests.
export { root, imp, sleep } from '../scripts/lib-loader.mjs';

// A tally of named problems, printing the first few of each kind.
export function problemTally(show = 3) {
  const tally = {};
  return {
    tally,
    bad(kind, message) {
      tally[kind] = (tally[kind] ?? 0) + 1;
      if (tally[kind] <= show) console.log(`   ! ${kind}: ${message}`);
    },
    total: () => Object.values(tally).reduce((a, b) => a + b, 0),
  };
}
