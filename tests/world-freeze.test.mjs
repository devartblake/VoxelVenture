// The world-expansion freeze check (docs/roadmap/world_freeze.md): which files it flags and how an exception is given.
import { imp } from './helpers.mjs';
const { isFrozenPath, frozenAdditions, exceptionReason, parseNameStatus } = await imp('dev/worldFreeze.js');
let fails = 0;
const check = (n, ok) => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', n); };

check('world folders are frozen', isFrozenPath('lib/city/ferries.js') && isFrozenPath('apps/web/components/city/Ferry.jsx') && isFrozenPath('lib/sim/tides.js') && isFrozenPath('apps/web/public/models/ferry.glb'));
check('Windows separators are understood', isFrozenPath('lib\\sim\\tides.js'));
check('commercial and interface folders are not', !isFrozenPath('lib/game/leases.js') && !isFrozenPath('apps/web/components/ui/PlotCard.jsx') && !isFrozenPath('apps/web/app/business/page.jsx') && !isFrozenPath('services/api/server.mjs'));
check('a folder whose name only starts the same is not', !isFrozenPath('lib/cityscape/x.js'));

const changes = parseNameStatus('M\tlib/city/cityGenerator.js\nA\tlib/city/ferries.js\nR087\tlib/game/old.js\tlib/sim/new.js\nA\tlib/game/referrals.js\nD\tcomponents/city/Old.jsx\n');
check('name-status lines are parsed (renames keep the new path)', changes.length === 5 && changes[2].file === 'lib/sim/new.js' && changes[2].status === 'R087');
const flagged = frozenAdditions(changes);
check('only new or renamed-in files under frozen folders are flagged', flagged.length === 2 && flagged.includes('lib/city/ferries.js') && flagged.includes('lib/sim/new.js'));
// Phase C moved the app into apps/web (docs/architecture/adr/0003-apps-and-services.md): a world file moved there is not new
const moved = parseNameStatus('R100\tcomponents/city/Traffic.jsx\tapps/web/components/city/Traffic.jsx\nR100\tpublic/models/kenney/shop.glb\tapps/web/public/models/kenney/shop.glb\nR095\tlib/sim/traffic.js\tlib/sim/traffic2.js\nC100\tcomponents/city/Traffic.jsx\tapps/web/components/city/Copy.jsx\nA\tapps/web/components/city/Ferry.jsx\n');
check('a world file moved within or out of the old world folders is not flagged; a copy and a new file are', moved[0].from === 'components/city/Traffic.jsx' && JSON.stringify(frozenAdditions(moved).sort()) === JSON.stringify(['apps/web/components/city/Copy.jsx', 'apps/web/components/city/Ferry.jsx']));

check('an exception trailer gives its reason', exceptionReason(['fix: x', 'perf: split Traffic batch\n\nWorld-freeze-exception: frame-rate fix on phones\n']) === 'frame-rate fix on phones');
check('the trailer is case-insensitive', exceptionReason(['world-freeze-exception: a11y']) === 'a11y');
check('no trailer, no exception', exceptionReason(['feat: ferries', 'mentions World-freeze-exception in prose']) === null);
check('an empty trailer is not an exception', exceptionReason(['World-freeze-exception:   \n']) === null);

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
