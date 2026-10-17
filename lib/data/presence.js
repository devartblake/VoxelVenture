import { apiOn, request } from './api';
import { logArrival } from './localStats';
import { visitorId } from './sync';

// Presence: while the page is open and visible the game tells the server every 15 seconds that this visitor is here (POST /presence/ping). The server
// counts the visitors it has heard from in the last 35 seconds as "online now" and a first ping as an arrival (services/api/stats.mjs). Without a server
// the visit is only counted in this browser (lib/data/localStats.js).
const EVERY_MS = 15000;
let timer = null;

export function startPresence() {
  if (typeof window === 'undefined' || timer) return;
  if (!apiOn()) {
    logArrival();
    timer = true; // nothing to repeat
    return;
  }
  const ping = () => {
    if (document.visibilityState === 'hidden') return;
    request('POST', '/presence/ping', { visitor: visitorId() }).catch(() => {});
  };
  ping();
  timer = setInterval(ping, EVERY_MS);
  document.addEventListener('visibilitychange', ping); // back on the tab: say so at once
}
