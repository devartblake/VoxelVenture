// The shared rules of the skyline (verified traffic grows a building) and of leaseholds.
import { imp, problemTally } from './helpers.mjs';
const sky = await imp('game/skyline.js');
const lease = await imp('game/leases.js');
const { bad, total } = problemTally();
const D = lease.DAY_MS;

// ---- skyline
const none = sky.skylineFor({});
if (none.level !== 0 || none.badges.length || none.factor !== 1) bad('no traffic, no growth', JSON.stringify(none));
if (sky.engagementScore({ uniques: 10, clicks: 2, views: 10, avgSeconds: 60 }) !== 10 * 2 + 2 * 4 + 10) bad('engagement is uniques x2, clicks x4 and minutes inside', String(sky.engagementScore({ uniques: 10, clicks: 2, views: 10, avgSeconds: 60 })));
if (sky.engagementScore({ views: 10, avgSeconds: 9999 }) !== 30) bad('time inside is capped at three minutes a visit', String(sky.engagementScore({ views: 10, avgSeconds: 9999 })));
const lv = (u, c = 0, v = u, s = 60) => sky.skylineFor({ uniques: u, clicks: c, views: v, avgSeconds: s });
if (!(lv(5).level === 0 && lv(10).level === 1 && lv(40).level === 2 && lv(120).level === 3)) bad('more real traffic, a higher level', [lv(5).level, lv(10).level, lv(40).level, lv(120).level].join());
if (!lv(10).badges.includes('verified') || lv(9).badges.includes('verified')) bad('ten different real visitors earn the verified badge', '');
if (lv(120).badges.join() !== 'verified,light,pennant,fountain') bad('level 3 has every fixture', lv(120).badges.join());
if (sky.grownHeight(3, 0) !== 3 || sky.grownHeight(3, 1) !== 3.3 || sky.grownHeight(3, 3) !== 4.4) bad('level 1 is 10% taller, level 3 is 45% taller', [sky.grownHeight(3, 1), sky.grownHeight(3, 3)].join());
if (sky.grownHeight(10, 3) !== sky.MAX_HEIGHT || sky.grownHeight(11.3, 3) !== sky.MAX_HEIGHT) bad('nothing grows past the height cap', String(sky.grownHeight(10, 3)));
if (sky.grownHeight(13, 3) !== 13) bad('a building already above the cap is not shrunk', String(sky.grownHeight(13, 3)));

// ---- leases
const T = Date.UTC(2026, 5, 1);
const end = T + 30 * D;
const states = [[T, 'active'], [end - 14 * D - 1, 'active'], [end - 14 * D, 'renewal'], [end - 1, 'renewal'], [end, 'grace'], [end + 7 * D - 1, 'grace'], [end + 7 * D, 'open']];
for (const [at, want] of states) if (lease.leaseState(end, at) !== want) bad('the lease state at each moment', `${(at - T) / D} days: ${lease.leaseState(end, at)} (wanted ${want})`);
if (lease.leaseState(null, T) !== 'none' || !lease.takeoverAllowed(null, T)) bad('a business with no lease can be taken over', '');
if (lease.takeoverAllowed(end, T) || lease.takeoverAllowed(end, end + 1) || !lease.takeoverAllowed(end, end + 8 * D)) bad('a lease protects its tenant until the grace week has passed', '');
// (a lease is priced from the plot's price for a year; the take-over's 25% is in that price already, lib/game/claimPrice.js)
if (lease.termPrice(1250, 30) !== 250 || lease.termPrice(1250, 365) !== 1250 || lease.termPrice(1250, 90) !== 625) bad('a shorter lease costs less', [lease.termPrice(1250, 30), lease.termPrice(1250, 90), lease.termPrice(1250, 365)].join());
if (lease.renewalPrice(1250, 365) !== 625 || lease.renewalPrice(1250, 30) !== 125) bad('a renewal is half price', [lease.renewalPrice(1250, 365), lease.renewalPrice(1250, 30)].join());
if (lease.termPrice(5, 30) !== 1 || lease.termPrice(5, 90) !== 2.5 || lease.renewalPrice(5, 30) !== 0.5 || lease.renewalPrice(5, 90) !== 1.25) bad('a basic plot\'s lease is priced to the cent', [lease.termPrice(5, 30), lease.termPrice(5, 90), lease.renewalPrice(5, 30), lease.renewalPrice(5, 90)].join());
if (lease.termOf(45) !== null || lease.termOf('90')?.days !== 90) bad('only 30, 90 and 365 are terms', '');
if (lease.extendedEnd(end, 90, T) !== end + 90 * D || lease.extendedEnd(end, 90, end + 10 * D) !== end + 100 * D || lease.extendedEnd(null, 30, T) !== T + 30 * D) bad('renewing runs on from the old end, or from now if it has ended', '');
if (!/protected|left/.test(lease.describeLease(end, 30, T).text) || !/renew/i.test(lease.describeLease(end, 30, end - D).text) || !/buyout/.test(lease.describeLease(end, 30, end + 9 * D).text)) bad('each state is described', '');
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
