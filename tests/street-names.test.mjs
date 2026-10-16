// Real street names: off by default, used when asked for, and the rest of the city does not move.
import { imp } from './helpers.mjs';

const { generateCity } = await imp('city/cityGenerator.js');
const { STREET_NAME_SETS } = await imp('content/streetNames.js');
let failed = 0;
const bad = (m) => { failed++; console.error('FAIL', m); };

const key = Object.keys(STREET_NAME_SETS)[0];
const a = generateCity(20260101);
const b = generateCity(20260101, { streetNames: key });
const c = generateCity(20260101, { streetNames: key });
if (!a.layout.roads.some((r) => r.name === 'Byte St' || /St|Ln|Way|Rd/.test(r.name))) bad('default names changed');
const names = new Set(STREET_NAME_SETS[key].names);
const local = b.layout.roads.filter((r) => names.has(r.name));
if (!local.length) bad('no road took a real name');
if (JSON.stringify(b.layout.roads.map((r) => r.name)) !== JSON.stringify(c.layout.roads.map((r) => r.name))) bad('real names are not deterministic');
const strip = (city) => JSON.stringify({ p: city.plots.map((p) => [p.id, p.x, p.z]), r: city.layout.roads.map((r) => [r.id, r.center, r.from, r.to]) });
if (strip(a) !== strip(b)) bad('real names moved the city');
if (generateCity(20260101, { streetNames: ["Zed Road", "Yew Lane"] }).layout.roads.every((r) => !['Zed Road', 'Yew Lane'].includes(r.name))) bad('a custom list was ignored');
console.log(`street names: ${local.length} roads named from ${key}`);
if (failed) process.exit(1);
console.log('ALL OK');
