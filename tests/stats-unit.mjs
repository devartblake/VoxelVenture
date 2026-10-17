// Run by stats.test.mjs with the sqlite flag: the presence and analytics rules with a controlled clock. Prints JSON lines { name, ok, extra }.
import { openDb } from '../services/api/db.mjs';
import { ONLINE_WINDOW_MS, countryOf, countryName, overview, ping, prunePresence } from '../services/api/stats.mjs';

const out = (name, ok, extra = '') => console.log(JSON.stringify({ name, ok: Boolean(ok), extra }));
const db = openDb(':memory:');
const T0 = Date.UTC(2026, 2, 11, 12, 0, 0); // a Wednesday noon
const hdr = (c) => ({ 'cf-ipcountry': c, 'user-agent': 'Mozilla/5.0' });

out('a CDN country header wins', countryOf({ 'cf-ipcountry': 'nl', 'accept-language': 'en-US' }) === 'NL');
out('without one the browser language region is used', countryOf({ 'accept-language': 'en-GB,en;q=0.9' }) === 'GB' && countryOf({ 'accept-language': 'en' }) === 'ZZ' && countryOf({}) === 'ZZ');
out('country names are in English', countryName('NL') === 'Netherlands' && countryName('US') === 'United States' && countryName('ZZ') === 'Unknown');

// three visitors arrive
out('a first ping is an arrival', ping(db, { visitor: 'visitor-aaaa', headers: hdr('NL'), now: T0 }).arrival === true);
ping(db, { visitor: 'visitor-bbbb', headers: hdr('US'), now: T0 + 5000 });
ping(db, { visitor: 'visitor-cccc', headers: hdr('US'), now: T0 + 10000 });
out('a second ping is not a new arrival', ping(db, { visitor: 'visitor-aaaa', headers: hdr('NL'), now: T0 + 15000 }).arrival === false);
out('bots are ignored', ping(db, { visitor: 'visitor-dddd', headers: { 'user-agent': 'Googlebot/2.1' }, now: T0 }).ok === false && ping(db, { visitor: 'x', headers: hdr('NL') }).ok === false && ping(db, { visitor: 'bad id!', headers: hdr('NL') }).ok === false);

let o = overview(db, { now: T0 + 20000 });
out('three visitors are online', o.online === 3, String(o.online));
out('the latest arrivals come first, with country names', o.arrivals.length === 3 && o.arrivals[0].country === 'United States' && o.arrivals[2].country === 'Netherlands' && o.arrivals.every((a) => a.online));
// a visitor stays online for 35 seconds after their last ping
o = overview(db, { now: T0 + 15000 + ONLINE_WINDOW_MS - 1000 });
out('a visitor is online until 35 seconds after their last ping', o.online === 1 && o.arrivals.find((a) => a.country === 'Netherlands').online === true && o.arrivals.filter((a) => a.country === 'United States').every((a) => !a.online) && o.windowSeconds === 35, JSON.stringify(o.arrivals.map((a) => [a.country, a.online])));
out('...and offline just after', overview(db, { now: T0 + 15000 + ONLINE_WINDOW_MS + 1000 }).online === 0);
// back after a long time away: a new arrival
out('half an hour away makes the next visit a new arrival', ping(db, { visitor: 'visitor-aaaa', headers: hdr('NL'), now: T0 + 3600000 }).arrival === true);

// recorded activity by period: yesterday is the whole calendar day before, the last 7 days include today
db.exec("INSERT INTO accounts (id, username, pass_salt, pass_hash, created_at) VALUES (1, 'a', 's', 'h', 1)");
db.exec("INSERT INTO plots (id, district, title, value, facts, updated_at, owner_name) VALUES (1, 'd', 'Shop', 100, '{}', 1, 'Owner')");
const DAY = 86400000;
const startToday = Math.floor(T0 / DAY) * DAY;
const ins = db.prepare("INSERT INTO events (plot_id, kind, source, visitor, at) VALUES (1, ?, 'street', 'v', ?)");
for (const [kind, at] of [['visit', startToday - 1000], ['visit', startToday - DAY + 5000], ['visit', startToday + 1000], ['visit', startToday - 8 * DAY], ['click', startToday - 3 * DAY], ['click', startToday + 5]]) ins.run(kind, at);
o = overview(db, { now: T0 + 3600000 + 20000 });
const row = (label) => o.activity.find((a) => a.label === label);
out('building views: 2 yesterday (the whole day), 3 in the last 7 days, 4 in all', row('Building views').yesterday === 2 && row('Building views').last7 === 3 && row('Building views').total === 4, JSON.stringify(row('Building views')));
out('website clicks are counted the same way', row('Website clicks').yesterday === 0 && row('Website clicks').last7 === 2 && row('Website clicks').total === 2);
out('city visits count every arrival', row('City visits').total === 4 && row('City visits').last7 === 4 && row('City visits').yesterday === 0, JSON.stringify(row('City visits')));
const shifted = overview(db, { now: T0 + 3600000 + 20000, offsetMin: 600 }); // a time zone 10 hours ahead moves the day boundary
out('the time zone moves the day boundary', JSON.stringify(shifted.activity) !== JSON.stringify(o.activity) && shifted.timezone === 'UTC+10');
out('old presence rows are pruned', prunePresence(db, T0 + 3 * DAY) >= 1 && overview(db, { now: T0 + 3 * DAY }).online === 0);
