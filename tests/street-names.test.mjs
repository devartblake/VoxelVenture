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

// District street names (data/street-names/districts.json): the infill streets take the Meadow Quarter's garden-suburb names; the avenues,
// the cross streets and the pun names keep theirs; nothing else moves; off when asked
const { DISTRICT_STREET_NAMES, STREET_NAME_ATTRIBUTION } = await imp('content/streetNames.js');
const districts = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/street-names/districts.json', import.meta.url), 'utf8'));
const DISTRICT_IDS = ['saas', 'creator', 'bazaar', 'arcade', 'suburb', 'riverside', 'lakeside', 'meadow', 'outskirts', 'countryside'];
if (JSON.stringify(Object.keys(DISTRICT_STREET_NAMES).sort()) !== JSON.stringify([...DISTRICT_IDS].sort())) bad('a list for each district');
if (JSON.stringify(DISTRICT_STREET_NAMES.meadow.names) !== JSON.stringify(districts.districts.meadow.names)) bad('lib/content/streetNames.js is packed from data/street-names/districts.json (run scripts/streets/build-names.mjs)');
if (!/OpenStreetMap/.test(districts.attribution) || !/OpenStreetMap/.test(STREET_NAME_ATTRIBUTION)) bad('the names carry the OpenStreetMap attribution');
for (const id of DISTRICT_IDS) if (DISTRICT_STREET_NAMES[id].names.some((n) => /\d|Avenue/.test(n) || n.length > 22)) bad(`${id}: no numbered names, no Avenue, short enough`);
for (const seed of [20260101, 7, 42]) {
  const on = generateCity(seed);
  const off = generateCity(seed, { districtStreetNames: false });
  const infill = on.layout.roads.filter((r) => r.infill);
  const meadow = new Set(DISTRICT_STREET_NAMES.meadow.names);
  if (!infill.length || !infill.every((r) => meadow.has(r.name) || /^(Meadow|Clover|Willow|Maple|Fern|Hazel|Orchard|Linden|Poppy|Cedar|Briar|Sorrel)/.test(r.name))) bad(`seed ${seed}: infill streets take Meadow Quarter names`);
  if (new Set(on.layout.roads.map((r) => r.name)).size < new Set(off.layout.roads.map((r) => r.name)).size) bad(`seed ${seed}: no two streets share a district name`);
  if (JSON.stringify(on.layout.roads.filter((r) => !r.infill).map((r) => r.name)) !== JSON.stringify(off.layout.roads.filter((r) => !r.infill).map((r) => r.name))) bad(`seed ${seed}: the avenues, cross streets and other roads keep their names`);
  if (strip(on) !== strip(off)) bad(`seed ${seed}: district names moved the city`);
  if (off.layout.roads.filter((r) => r.infill).some((r) => meadow.has(r.name))) bad(`seed ${seed}: districtStreetNames: false keeps the built-in names`);
}
const avenues = generateCity(20260101).layout.roads.filter((r) => r.kind === 'avenue').map((r) => r.name);
if (!['SaaS Silicon Strip', 'The Bazaar', 'Arcade Alley', 'Creator Commons'].every((n) => avenues.includes(n))) bad('the eight avenue names are untouched');
console.log(`district names: ${generateCity(20260101).layout.roads.filter((r) => r.nameDistrict).length} infill streets named from the Meadow Quarter list`);
if (failed) process.exit(1);
console.log('ALL OK');
