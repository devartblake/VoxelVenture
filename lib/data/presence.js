import { apiOn, request } from './api';
import { logArrival } from './localStats';
import { visitorId } from './sync';
import { avatarState } from '../sim/avatarState';
import { MAX_AREAS_PER_PING, SAMPLE_MS, areaOf } from '../game/economy';

// Presence: while the page is open and visible the game tells the server every 15 seconds that this visitor is here (POST /presence/ping). The server
// counts the visitors it has heard from in the last 35 seconds as "online now" and a first ping as an arrival (services/api/stats.mjs). Without a server
// the visit is only counted in this browser (lib/data/localStats.js).
// Each ping also carries the areas of the map the player passed through outdoors since the last one (lib/game/economy.js areaOf), sampled every
// two seconds from the avatar's position: the foot traffic of the plot economy's data (services/api/economy.mjs). Nothing is sampled while
// `indoors()` says the player is inside a building (going in is a visit, not a pass) or the tab is hidden.
const EVERY_MS = 15000;
let timer = null;
const passed = new Set();

export function startPresence({ indoors = () => false } = {}) {
  if (typeof window === 'undefined' || timer) return;
  if (!apiOn()) {
    logArrival();
    timer = true; // nothing to repeat
    return;
  }
  const ping = () => {
    if (document.visibilityState === 'hidden') return;
    const areas = [...passed].slice(-MAX_AREAS_PER_PING);
    passed.clear();
    request('POST', '/presence/ping', { visitor: visitorId(), ...(areas.length ? { areas } : {}) }).catch(() => {});
  };
  ping();
  timer = setInterval(ping, EVERY_MS);
  setInterval(() => {
    if (document.visibilityState === 'hidden' || !avatarState.ready || indoors()) return;
    const area = areaOf(avatarState.x, avatarState.z);
    passed.delete(area); // the most recent last, so a long drive keeps the latest areas
    passed.add(area);
  }, SAMPLE_MS);
  document.addEventListener('visibilitychange', ping); // back on the tab: say so at once
}
