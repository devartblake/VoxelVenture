// More plots in the first town (lib/city/townExtension.js, docs/world/world_recipe.md). The live database holds claims on the plots the generator made, so the rule that
// matters most is that NONE of them changes: a fingerprint of all 855 of them, taken from the generator before the extension was written, is checked here, for the
// generator alone and for the town with the new lots added. Then the new lots themselves (count, ids, no overlaps, the editor's own checks), the switches that turn them
// off, and the server's top-up of an older database (new ids only, no existing row touched).
import crypto from 'node:crypto';
import { imp } from '../scripts/lib-loader.mjs';
import { openDb } from '../services/api/db.mjs';
import * as core from '../services/api/core.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { generateCity } = await imp('city/cityGenerator.js');
const { generateTown, extendTown, checkExtension, nextBaseId, EXTRA_TARGET } = await imp('city/townExtension.js');
const { RectIndex } = await imp('city/freeLand.js');
const SEED = 20260101;

// computed from generateCity(20260101) BEFORE any change in this work: every field of every plot, numbers to 6 places
const FIRST_TOWN_FINGERPRINT = '440f6fcc22b118a275b8326cb07f9d4fab8385e3d66e588007e39979d187c7ee';
const FIRST_TOWN_PLOTS = 855;
const FIRST_FREE_ID = 881; // the generator's ids run to 880 (some numbers are unused)
const fingerprint = (plots) => {
  const h = crypto.createHash('sha256');
  for (const p of plots) h.update(`${JSON.stringify(p, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))}\n`);
  return h.digest('hex');
};

// ---- the generator itself is untouched
const base = generateCity(SEED);
check('the generator still makes the same 855 plots, field for field (the live database depends on it)', base.plots.length === FIRST_TOWN_PLOTS && fingerprint(base.plots) === FIRST_TOWN_FINGERPRINT);

// ---- the town: the same plots, and more
const town = generateTown(SEED);
const old = town.plots.filter((p) => p.id < FIRST_FREE_ID);
const added = town.plots.filter((p) => p.id >= FIRST_FREE_ID && p.id < 100000);
check('the town holds the first 855 plots exactly as the generator made them', old.length === FIRST_TOWN_PLOTS && fingerprint(old) === FIRST_TOWN_FINGERPRINT);
check('and 150 to 250 new lots (what fits without moving anything)', added.length >= 150 && added.length <= 250 && town.plots.length === FIRST_TOWN_PLOTS + added.length, `${added.length} new, ${town.plots.length} in all`);
check('new lots are numbered from the first free id, with no repeat of any id', nextBaseId(base) === FIRST_FREE_ID && Math.min(...added.map((p) => p.id)) === FIRST_FREE_ID && new Set(town.plots.map((p) => p.id)).size === town.plots.length);
check('the extension is deterministic: the same seed gives the same town', JSON.stringify(generateTown(SEED).plots.map((p) => [p.id, p.x, p.z, p.title])) === JSON.stringify(town.plots.map((p) => [p.id, p.x, p.z, p.title])));
check('what the layout says about it matches', town.layout.extension.lots === added.length && town.layout.extension.firstId === FIRST_FREE_ID && town.layout.extension.roads >= 5);
check('it asked for 200 and got what fits, never over the ask by more than a loop', added.length <= EXTRA_TARGET + 100);

// ---- the new streets and lots are sound
const problems = checkExtension(town);
check('the editor\'s own checks find nothing wrong with the new streets or lots (no street ends in nothing, no lot on a road, every lot faces a road)', problems.length === 0, JSON.stringify(problems.slice(0, 3)));
const boxOf = (p) => { const c = Math.abs(Math.cos(p.yaw ?? 0)); const s = Math.abs(Math.sin(p.yaw ?? 0)); return { x0: p.x - (p.w * c + p.d * s) / 2, x1: p.x + (p.w * c + p.d * s) / 2, z0: p.z - (p.w * s + p.d * c) / 2, z1: p.z + (p.w * s + p.d * c) / 2 }; };
const shrink = (b) => ({ x0: b.x0 + 0.05, x1: b.x1 - 0.05, z0: b.z0 + 0.05, z1: b.z1 - 0.05 });
const idx = new RectIndex([]);
let overlaps = 0;
for (const p of old) idx.add(boxOf(p));
for (const p of added) { const b = boxOf(p); if (idx.hits(shrink(b))) overlaps++; idx.add(b); }
check('no new lot overlaps an old lot or another new lot', overlaps === 0, `${overlaps} overlaps`);
const corridors = new RectIndex(town.layout.roads.map((r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to })));
check('and none stands on a road', added.every((p) => !corridors.hits(shrink(boxOf(p)))));
const land = town.layout.land;
check('every new lot is on the land', added.every((p) => p.x > land.x0 && p.x < land.x1 && p.z > land.z0 && p.z < land.z1));
const trees = town.layout.landscape.trees;
check('no tree, bush or field is left standing under a new lot', added.every((p) => { const b = boxOf(p); return !trees.some((t) => t.x > b.x0 && t.x < b.x1 && t.z > b.z0 && t.z < b.z1); }) && added.every((p) => { const b = boxOf(p); return !town.layout.fields.some((f) => f.x0 < b.x1 && f.x1 > b.x0 && f.z0 < b.z1 && f.z1 > b.z0); }));
check('every new lot is priced like the rest (land attributes and a price)', added.every((p) => p.land && Number.isFinite(p.price) && p.price > 0));
check('the new lots are ordinary lots in the Meadow Quarter or on the country roads (no estates or prime sites appear)', added.every((p) => !p.prime && !p.luxury && !p.grand && ['meadow', 'countryside', 'outskirts', 'riverside'].includes(p.districtId)));
check('new junctions were made for the new streets, and the old roads gained only gaps', town.layout.intersections.length > base.layout.intersections.length && base.layout.roads.every((r) => town.layout.roads.some((q) => q.id === r.id && q.center === r.center && q.from === r.from && q.to === r.to)));
const extRoads = town.layout.roads.filter((r) => r.id.startsWith('ext-'));
check('every new street has a name, and is a local street', extRoads.length >= 5 && extRoads.every((r) => r.name && r.class === 'local'));

// ---- the switches
check('generateTown(seed, { extraPlots: false }) is the plain generator', generateTown(SEED, { extraPlots: false }).plots.length === FIRST_TOWN_PLOTS);
process.env.NEXT_PUBLIC_EXTRA_PLOTS = '0';
check('NEXT_PUBLIC_EXTRA_PLOTS=0 turns the new lots off', generateTown(SEED).plots.length === FIRST_TOWN_PLOTS);
delete process.env.NEXT_PUBLIC_EXTRA_PLOTS;
check('asking for fewer lots gives no more than a loop over', extendTown(base, { target: 20 }).plots.length - FIRST_TOWN_PLOTS < 120);
const other = generateTown(12345);
check('another seed still makes a sound town (more lots only if they fit)', other.plots.length >= generateCity(12345).plots.length && checkExtension(other).length === 0);

// ---- the server tops up an older database, and touches nothing it already has
{
  const db = openDb(':memory:');
  // a database from before the extension: seeded from the generator alone
  const { SUBURB_ID } = await imp('city/cityGenerator.js');
  void SUBURB_ID;
  process.env.NEXT_PUBLIC_EXTRA_PLOTS = '0';
  const first = core.seedWorld(db, SEED);
  delete process.env.NEXT_PUBLIC_EXTRA_PLOTS;
  check('a database seeded without the extension holds 855 plots', first.seeded && db.prepare('SELECT COUNT(*) AS n FROM plots').get().n === FIRST_TOWN_PLOTS);
  // a player has claimed one and the server changed another: the top-up must leave both exactly as they are
  const acct = core.signup(db, { username: 'tenant', password: 'password123' });
  db.prepare('UPDATE plots SET owner_account = ?, title = ?, value = value + 7 WHERE id = (SELECT id FROM plots WHERE claimable = 1 AND owner_name IS NULL ORDER BY id LIMIT 1)').run(acct.account?.id ?? 1, 'My shop');
  const snapshot = () => crypto.createHash('sha256').update(JSON.stringify(db.prepare('SELECT id, district, building_type, owner_name, owner_account, title, website, value, claimable FROM plots WHERE id < 881 ORDER BY id').all())).digest('hex');
  const before = snapshot();
  const ledgerBefore = db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n;
  const second = core.seedWorld(db, SEED);
  check('starting the server on it adds exactly the new lots', second.seeded === false && second.toppedUp === added.length && db.prepare('SELECT COUNT(*) AS n FROM plots').get().n === town.plots.length, `${second.toppedUp} added`);
  check('and not one existing plot (ids below 881) changed: owner, title, value, anything', snapshot() === before);
  check('each new plot got its opening ledger entry, like the first ones', db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n === ledgerBefore + added.length);
  check('the new plots are open for claiming, with their facts', db.prepare('SELECT COUNT(*) AS n FROM plots WHERE id >= 881 AND claimable = 1').get().n === added.length && JSON.parse(db.prepare('SELECT facts FROM plots WHERE id = 881').get().facts).x === added[0].x);
  const third = core.seedWorld(db, SEED);
  check('starting it again adds nothing more', third.toppedUp === 0 && db.prepare('SELECT COUNT(*) AS n FROM plots').get().n === town.plots.length);
  // a brand new database is seeded with the whole town in one go
  const fresh = openDb(':memory:');
  const seeded = core.seedWorld(fresh, SEED);
  check('a new database is seeded with the whole town at once', seeded.seeded && seeded.plots === town.plots.length && fresh.prepare('SELECT COUNT(*) AS n FROM plots').get().n === town.plots.length);
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
