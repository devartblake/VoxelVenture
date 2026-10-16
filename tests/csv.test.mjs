// The sign-ups spreadsheet: quoting, and no spreadsheet formulas.
import { imp } from './helpers.mjs';
const { leadsCsv } = await imp('data/csv.js');
let fails = 0;
const check = (n, ok) => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', n); };
const csv = leadsCsv({ items: [{ kind: 'plot', title: 'Joe "the" Cafe, Ltd', confirmed: [{ email: 'a@b.co', at: Date.UTC(2026, 0, 5) }, { email: '=HYPERLINK("http://x")@evil.co', at: Date.UTC(2026, 0, 6) }] }, { kind: 'ad', title: '+SUM(A1)', confirmed: [{ email: 'c@d.co', at: Date.UTC(2026, 1, 1) }] }] });
const lines = csv.split('\r\n');
check('a header and one row per confirmed address', lines.length === 4 && lines[0] === '"Business","Type","Email","Confirmed on"');
check('quotes and commas in a name are escaped', lines[1].startsWith('"Joe ""the"" Cafe, Ltd","Business","a@b.co","2026-01-05"'));
check('a cell that starts with = + - or @ is neutralised', lines[2].includes(`"'=HYPERLINK`) && lines[3].startsWith(`"'+SUM(A1)"`));
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
