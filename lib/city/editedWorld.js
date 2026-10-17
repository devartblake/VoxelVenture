// The city as the editor left it (development only): `generateWorld(seed)` is `generateCity(seed)` with the saved edits replayed over it, when there are edits for this seed.
// The editor (apps/web/components/dev/CityEditor.jsx) saves them in the browser; the game's store builds its city through this function, so "Open in the game" shows the edited city.
// A release has no edits (devToolsOn is false), and a city with edits for another seed is generated as usual.
import { generateCity } from './cityGenerator';
import { applyEdits, fromDocument, toDocument } from './cityEdit';
import { devToolsOn } from '../dev/devTools';

export const EDITS_KEY = 'voxelventure-city-edits';

export function loadEdits() {
  if (!devToolsOn() || typeof window === 'undefined') return null;
  try {
    return fromDocument(JSON.parse(window.localStorage.getItem(EDITS_KEY) ?? 'null'));
  } catch {
    return null;
  }
}
export function saveEdits(seed, ops) {
  try {
    window.localStorage.setItem(EDITS_KEY, JSON.stringify(toDocument(seed, ops)));
    return true;
  } catch {
    return false;
  }
}
export function clearEdits() {
  try {
    window.localStorage.removeItem(EDITS_KEY);
  } catch {
    /* nothing saved */
  }
}

// `generateCity(seed, options)`, with the saved edits for this seed applied (an edit that cannot be applied is skipped: the plain city is returned)
export function generateWorld(seed, options = {}) {
  const city = generateCity(seed, options);
  const saved = loadEdits();
  if (!saved || saved.seed !== seed || !saved.ops.length) return city;
  try {
    return applyEdits(city, saved.ops);
  } catch {
    return city;
  }
}
