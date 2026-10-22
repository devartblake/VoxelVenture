import { text } from './core.mjs';
import { countKept } from './retention.mjs';

// Real site analytics and presence, kept in the database.
//
//   presence   one row per visitor: when they were last seen (the game pings every 15 seconds while the tab is open and visible)
//   arrivals   one row per visit: a new visitor, or one back after half an hour away (kept 30 days: retention.mjs keeps the daily count)
//   events     (existing) a visitor entered a building ('visit') or pressed Visit website ('click')
//
// "Online now" is the visitors seen in the last 35 seconds. Countries come from the network in front of the server (a CDN header such as
// CF-IPCountry or X-Vercel-IP-Country) or, failing that, from the browser's language region; only the country is kept, never an address.
export const ONLINE_WINDOW_MS = 35000;
const SESSION_GAP_MS = 30 * 60000;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|monitor/i;
const DAY = 86400000;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();
export const countryName = (code) => {
  if (!code || code === 'ZZ') return 'Unknown';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

// The visitor's country as a two-letter code, or 'ZZ' if it cannot be told.
export function countryOf(headers = {}) {
  const h = (k) => String(headers[k] ?? '').trim().toUpperCase();
  for (const k of ['cf-ipcountry', 'x-vercel-ip-country', 'cloudfront-viewer-country', 'x-country-code', 'x-appengine-country']) {
    const v = h(k);
    if (/^[A-Z]{2}$/.test(v) && v !== 'XX' && v !== 'T1') return v;
  }
  const lang = String(headers['accept-language'] ?? '').split(',')[0].trim(); // en-GB -> GB
  const region = lang.split('-')[1]?.toUpperCase();
  return region && /^[A-Z]{2}$/.test(region) ? region : 'ZZ';
}

// A visitor's heartbeat. Returns { ok, arrival } or { ok: false } for a bot or a bad id.
export function ping(db, { visitor, headers = {}, account = null, now = Date.now() }) {
  const id = text(visitor, 40);
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id) || BOT.test(String(headers['user-agent'] ?? ''))) return { ok: false };
  const who = account ? `a${account.id}` : `v${id}`;
  const row = db.prepare('SELECT last_at FROM presence WHERE visitor = ?').get(who);
  const country = countryOf(headers);
  const arrival = !row || now - row.last_at > SESSION_GAP_MS;
  if (!row) db.prepare('INSERT INTO presence (visitor, country, account_id, first_at, last_at) VALUES (?,?,?,?,?)').run(who, country, account?.id ?? null, now, now);
  else db.prepare('UPDATE presence SET last_at = ?, country = ?, account_id = COALESCE(?, account_id) WHERE visitor = ?').run(now, country, account?.id ?? null, who);
  if (arrival) db.prepare('INSERT INTO arrivals (visitor, country, at) VALUES (?,?,?)').run(who, country, now);
  return { ok: true, arrival };
}

// Day boundaries in a time zone given as an offset in minutes from UTC (STATS_TZ_OFFSET_MIN, default 0 = UTC).
const startOfDay = (ms, offsetMin) => Math.floor((ms + offsetMin * 60000) / DAY) * DAY - offsetMin * 60000;

// Everything the Statistics panel shows.
export function overview(db, { now = Date.now(), offsetMin = 0 } = {}) {
  const online = db.prepare('SELECT COUNT(*) AS n FROM presence WHERE last_at >= ?').get(now - ONLINE_WINDOW_MS).n;
  const arrivals = db
    .prepare('SELECT a.country, a.at, a.visitor, (p.last_at >= ?) AS online FROM arrivals a LEFT JOIN presence p ON p.visitor = a.visitor ORDER BY a.id DESC LIMIT 6')
    .all(now - ONLINE_WINDOW_MS)
    .map((r) => ({ code: r.country || 'ZZ', country: countryName(r.country), at: r.at, online: Boolean(r.online) }));
  const today = startOfDay(now, offsetMin);
  const yesterday = today - DAY;
  const week = today - 6 * DAY; // the last seven days include today
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;
  // the total adds the daily counts kept for rows past their retention (retention.mjs); yesterday and the last 7 days are always still raw
  const metric = (label, table, where, kind) => ({
    label,
    yesterday: count(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where} AND at >= ? AND at < ?`, yesterday, today),
    last7: count(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where} AND at >= ?`, week),
    total: count(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`) + countKept(db, table, { kind }),
  });
  return {
    now,
    windowSeconds: ONLINE_WINDOW_MS / 1000,
    online,
    arrivals,
    activity: [metric('City visits', 'arrivals', '1=1', 'arrival'), metric('Building views', 'events', "kind = 'visit' AND verified = 1", 'visit'), metric('Website clicks', 'events', "kind = 'click' AND verified = 1", 'click')],
    timezone: offsetMin === 0 ? 'UTC' : `UTC${offsetMin > 0 ? '+' : '-'}${Math.abs(offsetMin / 60)}`,
  };
}

// Housekeeping: presence rows older than a day add nothing (their arrivals are kept, for RETENTION.arrivalDays: retention.mjs).
export function prunePresence(db, now = Date.now()) {
  return Number(db.prepare('DELETE FROM presence WHERE last_at < ?').run(now - DAY).changes);
}

// The live state of the whole city, for the admin headquarters' cards (GET /world/live): what is happening now and this week, from
// real events only (presence, verified visits and clicks, verified profile events, accounts and profiles). Totals only, nobody's details.
export function liveCity(db, { now = Date.now() } = {}) {
  const day = now - DAY;
  const week = now - 7 * DAY;
  const n = (sql, ...args) => db.prepare(sql).get(...args).n;
  return {
    at: now,
    online: n('SELECT COUNT(*) AS n FROM presence WHERE last_at >= ?', now - ONLINE_WINDOW_MS),
    visitors24h: n('SELECT COUNT(DISTINCT visitor) AS n FROM arrivals WHERE at >= ?', day),
    cityVisits7d: n('SELECT COUNT(*) AS n FROM arrivals WHERE at >= ?', week),
    buildingViews7d: n("SELECT COUNT(*) AS n FROM events WHERE kind = 'visit' AND verified = 1 AND at >= ?", week),
    websiteClicks7d: n("SELECT COUNT(*) AS n FROM events WHERE kind = 'click' AND verified = 1 AND at >= ?", week),
    profileViews7d: n("SELECT COUNT(*) AS n FROM business_events WHERE kind = 'view' AND verified = 1 AND at >= ?", week),
    ctaPresses7d: n("SELECT COUNT(*) AS n FROM business_events WHERE kind = 'cta' AND verified = 1 AND at >= ?", week),
    playerBusinesses: n('SELECT COUNT(*) AS n FROM plots WHERE owner_account IS NOT NULL'),
    profiles: n("SELECT COUNT(*) AS n FROM businesses WHERE status = 'published'"),
    newProfiles7d: n("SELECT COUNT(*) AS n FROM businesses WHERE status = 'published' AND created_at >= ?", week),
    accounts: n('SELECT COUNT(*) AS n FROM accounts'),
    newAccounts7d: n('SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ?', week),
  };
}
