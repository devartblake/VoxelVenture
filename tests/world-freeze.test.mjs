// The world-expansion freeze check (docs/world_freeze.md): which files it flags and how an exception is given.
import { imp } from './helpers.mjs';
const { isFrozenPath, frozenAdditions, exceptionReason, parseNameStatus } = await imp('dev/worldFreeze.js');
let fails = 0;
const check = (n, ok) => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', n); };

check('world folders are frozen', isFrozenPath('lib/city/ferries.js') && isFrozenPath('components/city/Ferry.jsx') && isFrozenPath('lib/sim/tides.js') && isFrozenPath('public/models/ferry.glb'));
check('Windows separators are understood', isFrozenPath('lib\\sim\\tides.js'));
check('commercial and interface folders are not', !isFrozenPath('lib/game/leases.js') && !isFrozenPath('components/ui/PlotCard.jsx') && !isFrozenPath('app/business/page.jsx') && !isFrozenPath('server/api/server.mjs'));
check('a folder whose name only starts the same is not', !isFrozenPath('lib/cityscape/x.js'));

const changes = parseNameStatus('M\tlib/city/cityGenerator.js\nA\tlib/city/ferries.js\nR087\tlib/game/old.js\tlib/sim/new.js\nA\tlib/game/referrals.js\nD\tcomponents/city/Old.jsx\n');
check('name-status lines are parsed (renames keep the new path)', changes.length === 5 && changes[2].file === 'lib/sim/new.js' && changes[2].status === 'R087');
const flagged = frozenAdditions(changes);
check('only new or renamed-in files under frozen folders are flagged', flagged.length === 2 && flagged.includes('lib/city/ferries.js') && flagged.includes('lib/sim/new.js'));

check('an exception trailer gives its reason', exceptionReason(['fix: x', 'perf: split Traffic batch\n\nWorld-freeze-exception: frame-rate fix on phones\n']) === 'frame-rate fix on phones');
check('the trailer is case-insensitive', exceptionReason(['world-freeze-exception: a11y']) === 'a11y');
check('no trailer, no exception', exceptionReason(['feat: ferries', 'mentions World-freeze-exception in prose']) === null);
check('an empty trailer is not an exception', exceptionReason(['World-freeze-exception:   \n']) === null);

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
