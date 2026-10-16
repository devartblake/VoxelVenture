// Reads the filled-in price sheet and rewrites lib/content/fixturePrices.js.
//
//   node scripts/import-fixture-prices.mjs fixture-prices.csv [--currency $] [--factor 1] [--dry]
//
// A row's `price` becomes that item's price; if every item of a group has the same price and the rest are blank, put it in the `group_default`
// column of any row of that group to price the whole group. Prices must be numbers of 0 or more; a bad value stops the import and names the row.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from './lib-loader.mjs';

const { FIXTURE_PRICES } = await imp('content/fixturePrices.js');
const { FURNITURE_GROUPS, OTHER_GROUP } = await imp('content/furnitureGroups.js');

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const file = args.find((a) => !a.startsWith('--') && a !== flag('currency') && a !== flag('factor'));
if (!file) {
  console.error('Usage: node scripts/import-fixture-prices.mjs fixture-prices.csv [--currency $] [--factor 1] [--dry]');
  process.exit(1);
}

// a small CSV reader (quoted cells, doubled quotes, \r\n)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"', i++);
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const rows = parseCsv(fs.readFileSync(path.resolve(file), 'utf8'));
const head = rows.shift().map((h) => h.trim().toLowerCase());
const col = (n) => head.indexOf(n);
for (const need of ['id', 'price']) if (col(need) < 0) (console.error(`The sheet has no "${need}" column.`), process.exit(1));
const labelToId = Object.fromEntries([...FURNITURE_GROUPS, OTHER_GROUP].map((g) => [g.label.toLowerCase(), g.id]));

const parse = (v, where) => {
  const t = String(v).trim().replace(/^[^\d.-]+/, '').replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) (console.error(`Row ${where}: "${v}" is not a price (a number of 0 or more).`), process.exit(1));
  return Math.round(n * 100) / 100;
};

const items = {};
const defaults = {};
rows.forEach((r, i) => {
  const id = r[col('id')]?.trim();
  if (!id) return;
  const price = parse(r[col('price')] ?? '', i + 2);
  if (price !== null) items[id] = price;
  if (col('group_default') >= 0 && col('group') >= 0) {
    const d = parse(r[col('group_default')] ?? '', i + 2);
    const g = labelToId[String(r[col('group')]).trim().toLowerCase()];
    if (d !== null && g) defaults[g] = d;
  }
});

const next = { currency: flag('currency', FIXTURE_PRICES.currency), worthFactor: Number(flag('factor', FIXTURE_PRICES.worthFactor)), defaults, items };
if (!Number.isFinite(next.worthFactor) || next.worthFactor < 0) (console.error('--factor must be a number of 0 or more.'), process.exit(1));

const target = path.join(root, 'lib', 'content', 'fixturePrices.js');
const old = fs.readFileSync(target, 'utf8');
const header = old.slice(0, old.indexOf('export const FIXTURE_PRICES'));
const body = `export const FIXTURE_PRICES = ${JSON.stringify(next, null, 2).replace(/"([a-zA-Z_]\w*)":/g, '$1:').replace(/"/g, "'")};\n`;
console.log(`${Object.keys(items).length} item prices and ${Object.keys(defaults).length} group defaults read; currency ${next.currency}, worth factor ${next.worthFactor}.`);
if (args.includes('--dry')) process.exit(0);
fs.writeFileSync(target, header + body);
console.log(`Written to ${path.relative(root, target)}. Rebuild the app to use the new prices.`);
