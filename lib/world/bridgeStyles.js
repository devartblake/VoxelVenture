// Which bridges have a drawn structure of their own, and what that means for the kit's deck, the piers and the lamps (lib/world/chunkMesh.js asks). On its own (it imports only specs).
import { ARCH, inMainSpan as archMain, isArch, lampStations } from './archSpec';
import { SUSPENSION, inMainSpan as suspensionMain, isSuspension } from './suspensionSpec';

/** 'suspension', 'arch' or null for a baked bridge piece (`h`: { id, span, clearance }). */
export const bridgeKind = (h) => (isSuspension(h) ? 'suspension' : isArch(h) ? 'arch' : null);
/** The deck numbers of a styled bridge ({ deckThickness, kerb }), or null for a plain one. */
export const deckOf = (h) => (isSuspension(h) ? SUSPENSION : isArch(h) ? ARCH : null);
/** Is `s` under the main span or arch of a styled bridge (no piers there)? */
export const noPiersAt = (h, s) => suspensionMain(h, s) || archMain(h, s);
/** The stations of a bridge piece's street lamps: the standard ones, or, on the arch bridge, in line with the hangers (lib/world/archSpec.js). */
export const lampsOf = (h, standard) => (isArch(h) ? lampStations(h.span, standard) : standard);
