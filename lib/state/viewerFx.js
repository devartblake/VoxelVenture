// Whether the interior viewer draws its rich effects (soft shadows, ambient occlusion). Off unless the player turned them on: they are the heaviest thing the
// viewer does, and on some graphics setups the view stays blank with them on. ?fx=1 or ?fx=0 in the address overrides what was saved.
const KEY = 'voxelventure-viewer-fx';

export function readFx() {
  if (typeof window === 'undefined') return false;
  const asked = new URLSearchParams(window.location.search).get('fx');
  if (asked === '1') return true;
  if (asked === '0') return false;
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveFx(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* not remembered */
  }
}
