// The Statistics panel without a game server: this browser's own visits, building views and website clicks, kept in localStorage in the same shape the
// server returns from GET /stats/overview (server/api/stats.mjs), so the panel looks and works the same. Only this browser's activity is counted.
const KEY = 'voxelventure-local-stats';
const DAY = 86400000;
const WINDOW_S = 35;
const CAP = 2000;

const read = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return { visits: s?.visits ?? [], views: s?.views ?? [], clicks: s?.clicks ?? [], lastSeen: s?.lastSeen ?? 0 };
  } catch {
    return { visits: [], views: [], clicks: [], lastSeen: 0 };
  }
};
const write = (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, visits: s.visits.slice(-CAP), views: s.views.slice(-CAP), clicks: s.clicks.slice(-CAP) }));
  } catch {
    /* storage unavailable: nothing is remembered */
  }
};

// A page load counts as a visit, unless this browser was here in the last half hour.
export function logArrival(now = Date.now()) {
  const s = read();
  if (now - s.lastSeen > 30 * 60000) s.visits.push(now);
  s.lastSeen = now;
  write(s);
}
export function logLocal(kind, now = Date.now()) {
  const s = read();
  (kind === 'click' ? s.clicks : s.views).push(now);
  s.lastSeen = now;
  write(s);
}

// `people` is how many are in the city right now (this browser and the other players on the presence server).
export function localOverview(people = 1, now = Date.now(), offsetMin = 0) {
  const s = read();
  const today = Math.floor((now + offsetMin * 60000) / DAY) * DAY - offsetMin * 60000;
  const yesterday = today - DAY;
  const week = today - 6 * DAY;
  const metric = (label, list) => ({ label, yesterday: list.filter((t) => t >= yesterday && t < today).length, last7: list.filter((t) => t >= week).length, total: list.length });
  return {
    now,
    windowSeconds: WINDOW_S,
    online: Math.max(1, people),
    arrivals: s.visits.slice(-6).reverse().map((at, i) => ({ code: '', country: i === 0 ? 'This browser (now)' : 'This browser', at, online: i === 0 })),
    activity: [metric('City visits', s.visits), metric('Building views', s.views), metric('Website clicks', s.clicks)],
    timezone: 'UTC',
    local: true,
  };
}
