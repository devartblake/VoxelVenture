// What the arch bridge is made of (docs/world/arch_bridge.md): the North Causeway drawn after the great steel through-arch bridge of Sydney harbour (the owner's choice): a steel arch of two latticed ribs
// rising over the deck, the deck hung from it by vertical hangers in the middle and carried on posts near the ends, four stone pylons at the ends, no piers under the arch. On its own (it imports only the deck's
// numbers), so lib/world/chunkMesh.js can leave the piers out under the arch; the structure itself is lib/world/archBridge.js.
import { DECK } from './bridgeDeckSpec';

export const ARCH = {
  ids: ['north-causeway'],
  archAt: [0.1, 0.9], // where the arch springs from and lands, as fractions of the bridge: the approaches are 10% each, the arch spans 80%
  springAbove: 0.5, // the height of the springing above the water (a little under the deck, which is at its full height from 60 units in)
  crownAbove: 4.0, // the crown's height above the deck, in times the deck's height over the water (the real arch rises 85 m over a deck 49 m high: 1.7 times; here it is drawn taller so that it reads as an arch over a span this long)
  legOffset: 4.9, // each rib stands this far to the side of the centre line: just outside the 8-wide deck
  depth: [1.6, 4.8], // a rib's depth (top chord to bottom chord) at the crown and at the springing
  chordRadius: 0.38,
  webRadius: 0.2,
  panel: 7, // the web's panel length along the bridge
  hangerRadius: 0.12,
  hangerEvery: 6,
  strutEvery: 12, // the cross struts between the ribs, where the bottom chord is high enough to clear a train
  strutClear: 4.5, // the least clearance under a cross strut, over the deck
  pylon: { across: 3.4, along: 3.4, top: 12, offset: 7.6 }, // a pylon's footprint at the base, its height above the deck, and its distance from the centre line
  foot: -1.5,
  deckThickness: DECK.thickness,
  deckWidth: DECK.width,
  kerb: DECK.kerb,
  deckSegment: DECK.segment,
  steel: '#8a8f99', // the steel: a light grey (the real bridge is grey)
  stone: '#b8a98a', // the pylons' granite
};

/** Does this baked bridge piece (`h`: { id, span, clearance }) get the arch? */
export const isArch = (h) => ARCH.ids.includes(h?.id);
/** Where the arch springs and lands along a bridge of length `span`: [s0, s1]. */
export const archS = (span) => ARCH.archAt.map((f) => f * span);
/** Is `s` under the arch (no piers there: the arch carries the deck)? The approaches, between a shore and the arch, keep theirs. */
export const inMainSpan = (h, s) => {
  if (!isArch(h)) return false;
  const [a0, a1] = archS(h.span);
  return s > a0 + 3 && s < a1 - 3;
};
