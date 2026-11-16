// What the suspension bridge is made of (docs/world/suspension_bridge.md): the numbers and the rule for the piers. On its own (it imports only the deck's numbers), so lib/world/chunkMesh.js can leave the piers out under the main span
// without a circular import; the structure itself (the towers, cables and suspenders) is lib/world/suspension.js.
import { DECK } from './bridgeDeckSpec';
import { SEA_FLOOR } from './datum';

export const SUSPENSION = {
  ids: ['harbor-causeway'], // the causeways drawn this way (the first one: the road, the train and the tunnel's neighbour); the North Causeway is an arch bridge (archSpec.js)
  towerAt: [0.17, 0.83], // each tower's place as a fraction of the bridge: the side spans are 17% each, the main span 66%
  heightAbove: 2.4, // a tower's height above the deck is this times the deck's height over the water (clearance)
  legOffset: 4.9, // each leg stands this far to the side of the centre line: just outside the 8-wide deck
  legBase: [1.9, 1.5], // a leg's size at the foot (across, along the bridge) in units, and at the top: it tapers to about 60%
  legTop: [1.1, 0.9],
  foot: SEA_FLOOR, // the foundations' lowest point (the seabed: lib/world/datum.js)
  cableRadius: 0.22,
  cableOffset: 0.0, // the main cable hangs straight above the leg's centre line
  sag: 0.1, // the cable's lowest point above the deck at mid-span, as a fraction of the tower height above the deck
  hangerEvery: 5.5, // the suspenders' spacing along the bridge
  hangerRadius: 0.08,
  deckThickness: DECK.thickness, // the deck is a girder (bridgeDeckSpec.js)
  deckWidth: DECK.width,
  kerb: DECK.kerb,
  deckSegment: DECK.segment,
  braces: [0.2, 0.42, 0.64, 0.84], // the cross struts between the legs, as fractions of the tower's height above the deck (one more at the very top is the tower's head)
  color: '#d9472b', // International Orange (a little brighter than the real paint, which the game's light darkens)
};

/** Does this baked bridge piece (`h`: { id, span, clearance }) get the suspension towers? */
export const isSuspension = (h) => SUSPENSION.ids.includes(h?.id);

/** The towers' places along a bridge of length `span`: [s0, s1]. */
export const towerS = (span) => SUSPENSION.towerAt.map((f) => f * span);

/** Is `s` under the main span or one of the towers (no piers there: the towers and cables hold the deck)? The piers of the side spans, between a shore and its tower, stay. */
export const inMainSpan = (h, s) => {
  if (!isSuspension(h)) return false;
  const [t0, t1] = towerS(h.span);
  return s > t0 + 3 && s < t1 - 3;
};

