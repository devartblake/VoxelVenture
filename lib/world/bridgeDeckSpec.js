// The girder deck the styled bridges share (the suspension bridge: docs/world/suspension_bridge.md; the arch bridge: docs/world/arch_bridge.md). Reads only the datum (lib/world/datum.js). The kit's deck tile is not used for them: it has
// four pier sockets that hang under the deck as stray pieces when no pier is there.
import { LIFT } from './datum';
export const DECK = {
  thickness: 1.4, // the girder's depth
  width: 8, // as wide as the plain deck (the highway's 6 + 2)
  kerb: { centre: 3.7, width: 0.6, height: LIFT.deckKerb }, // the walk on each edge: its middle's distance from the centre line, its width, and its top above the road (the lamps stand on it)
  segment: 4, // the deck is cut into pieces this long, each laid along the slope
};
