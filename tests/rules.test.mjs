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
// a 30-day lease: the last 7 days are the renewal window, the 3 days after the end the grace days
const states = [[T, 'active'], [end - 7 * D - 1, 'active'], [end - 7 * D, 'renewal'], [end - 1, 'renewal'], [end, 'grace'], [end + 3 * D - 1, 'grace'], [end + 3 * D, 'open']];
for (const [at, want] of states) if (lease.leaseState(end, at, 30) !== want) bad('the lease state at each moment', `${(at - T) / D} days: ${lease.leaseState(end, at, 30)} (wanted ${want})`);
for (const [at, want] of states) if (lease.leaseState(end, at) !== want) bad('without a term, a lease is read as the usual 30 days', `${(at - T) / D} days`);
// a 14-day lease has the same 7-day window; a 7-day lease only its last 3 days
const end7 = T + 7 * D;
const states7 = [[T, 'active'], [end7 - 3 * D - 1, 'active'], [end7 - 3 * D, 'renewal'], [end7 - 1, 'renewal'], [end7, 'grace'], [end7 + 3 * D, 'open']];
for (const [at, want] of states7) if (lease.leaseState(end7, at, 7) !== want) bad('a 7-day lease can be renewed in its last 3 days', `${(at - T) / D} days: ${lease.leaseState(end7, at, 7)} (wanted ${want})`);
if (lease.leaseState(T + 14 * D, T + 7 * D, 14) !== 'renewal' || lease.leaseState(T + 14 * D, T + 7 * D - 1, 14) !== 'active') bad('a 14-day lease can be renewed in its last 7 days', '');
if (lease.renewalWindowDays(7) !== 3 || lease.renewalWindowDays(14) !== 7 || lease.renewalWindowDays(30) !== 7 || lease.renewalWindowDays(365) !== 7 || lease.RENEWAL_WINDOW_DAYS !== 7 || lease.GRACE_DAYS !== 3) bad('the renewal window is 3 days for 7 days, else 7; the grace is 3 days', '');
if (lease.leaseState(null, T) !== 'none' || !lease.takeoverAllowed(null, T)) bad('a business with no lease can be taken over', '');
if (lease.takeoverAllowed(end, T) || lease.takeoverAllowed(end, end + 1) || !lease.takeoverAllowed(end, end + 4 * D)) bad('a lease protects its tenant until the grace days have passed', '');
// (a lease is priced from the plot's price for 30 days; the take-over's 25% is in that price already, lib/game/claimPrice.js)
if (lease.termPrice(100, 7) !== 30 || lease.termPrice(100, 14) !== 55 || lease.termPrice(100, 30) !== 100) bad('a shorter lease costs less: 7 days 0.3, 14 days 0.55 of 30 days', [lease.termPrice(100, 7), lease.termPrice(100, 14), lease.termPrice(100, 30)].join());
if (lease.renewalPrice(100, 30) !== 90 || lease.renewalPrice(100, 7) !== 27 || lease.RENEWAL_DISCOUNT !== 0.1 || lease.RENEWAL_SHARE !== 0.9) bad('a renewal is 10% off', [lease.renewalPrice(100, 30), lease.renewalPrice(100, 7)].join());
if (lease.termPrice(5, 7) !== 1.5 || lease.termPrice(5.5, 14) !== 3.03 || lease.renewalPrice(5, 7) !== 1.35 || lease.renewalPrice(5.5, 14) !== 2.73) bad('a basic plot\'s lease is priced to the cent', [lease.termPrice(5, 7), lease.termPrice(5.5, 14), lease.renewalPrice(5, 7), lease.renewalPrice(5.5, 14)].join());
if (JSON.stringify(lease.TERMS.map((t) => [t.days, t.factor, t.label])) !== JSON.stringify([[7, 0.3, '7 days'], [14, 0.55, '14 days'], [30, 1, '30 days']]) || lease.DEFAULT_TERM !== 30) bad('the terms are 7, 14 and 30 days; 30 if none is chosen', JSON.stringify(lease.TERMS));
if (lease.termOf(45) !== null || lease.termOf(90) !== null || lease.termOf('14')?.days !== 14 || lease.termOf(7)?.label !== '7 days') bad('only 7, 14 and 30 days are terms', '');
if (lease.termFor(90) !== 30 || lease.termFor(182) !== 30 || lease.termFor(365) !== 30 || lease.termFor(7) !== 7 || lease.termFor(14) !== 14 || lease.termFor(null) !== 30 || lease.termFor(undefined) !== 30) bad('a lease of an old term (90, 182, 365 days) renews for 30 days, as does none at all', [90, 182, 365, 7, 14, null].map((d) => lease.termFor(d)).join());
if (lease.termLabel(14) !== '14 days' || lease.termLabel(182) !== '182 days') bad('a term has a name; an old one says its days', '');
// Pro: 15% off a lease, to the cent; never under Stripe's 50 cents
if (lease.PRO_PLOT_DISCOUNT !== 0.15 || lease.PRO_DISCOUNT_LABEL !== 'Pro: 15% off') bad('Pro is 15% off plots', '');
if (lease.chargeOf(100, true) !== 85 || lease.chargeOf(100, false) !== 100 || lease.proDiscount(1.5, true) !== 0.23 || lease.chargeOf(1.5, true) !== 1.27 || lease.proDiscount(1.5, false) !== 0) bad('the Pro discount is taken off to the cent', [lease.chargeOf(100, true), lease.chargeOf(1.5, true)].join());
if (lease.chargeOf(0.4, false) !== 0.5 || lease.chargeOf(0.55, true) !== 0.5 || lease.MIN_LEASE_CHARGE !== 0.5) bad('no lease is charged under 50 cents', [lease.chargeOf(0.4, false), lease.chargeOf(0.55, true)].join());
if (lease.extendedEnd(end, 14, T) !== end + 14 * D || lease.extendedEnd(end, 7, end + 2 * D) !== end + 9 * D || lease.extendedEnd(null, 30, T) !== T + 30 * D) bad('renewing runs on from the old end, or from now if it has ended', '');
if (!/protected|left/.test(lease.describeLease(end, 30, T).text) || !/30 days/.test(lease.describeLease(end, 30, T).text) || !/renew/i.test(lease.describeLease(end, 30, end - D).text) || !/3 days/.test(lease.describeLease(end, 30, end + D).text) || !/buyout/.test(lease.describeLease(end, 30, end + 4 * D).text)) bad('each state is described', '');
if (lease.describeLease(end7, 7, end7 - 4 * D).state !== 'active' || lease.describeLease(end7, 7, end7 - 2 * D).state !== 'renewal') bad('a 7-day lease is described with its own window', '');
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
