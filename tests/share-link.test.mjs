// Links to buildings and the badge for a business's own website.
import { imp, problemTally } from './helpers.mjs';
const s = await imp('game/shareLink.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();

// ids
for (const ok of ['12', 'mall-1-s3', 'a_b-c', '0']) if (!s.isPlotId(ok)) bad('a valid id is accepted', ok);
for (const no of ['', 'a b', '../x', '<script>', 'x'.repeat(41), null, undefined, '12;drop']) if (s.isPlotId(no)) bad('a bad id is refused', String(no));

// links
if (s.buildingPath({ id: 12 }, 20260101) !== '/?plot=12&city=20260101') bad('a building path', s.buildingPath({ id: 12 }, 20260101));
if (s.buildingPath('mall-2-s4') !== '/?plot=mall-2-s4') bad('a path without a city', s.buildingPath('mall-2-s4'));
if (s.buildingUrl('https://voxelventure.example/', { id: 7 }, 5) !== 'https://voxelventure.example/?plot=7&city=5') bad('a full link drops the trailing slash', '');
const round = s.parseDeepLink(s.buildingPath({ id: 'mall-1-s3' }, 99).slice(1));
if (round.plot !== 'mall-1-s3' || round.city !== 99) bad('a link reads back', JSON.stringify(round));
if (s.parseDeepLink('?plot=<b>x</b>').plot !== null || s.parseDeepLink('?plot=').plot !== null || s.parseDeepLink('').plot !== null) bad('a bad or missing id gives no building', '');
if (s.parseDeepLink('?plot=5&city=abc').city !== null || s.parseDeepLink('?plot=5&city=-3').city !== null || s.parseDeepLink('?plot=5&city=1e9999').city !== null) bad('a bad city is ignored', '');
if (s.parseDeepLink('?building=8').plot !== '8') bad('"building" works as an alias', '');

// finding the building
const { plots, layout } = generateCity(3);
const some = plots.find((p) => p.owner);
if (s.findBuilding(String(some.id), plots, layout)?.plot?.id !== some.id) bad('a plot is found by its id', '');
const store = layout.malls[1].stores[3];
const hit = s.findBuilding(store.id, plots, layout);
if (hit?.kind !== 'store' || hit.mall.id !== 'mall-2' || hit.store.id !== store.id) bad('a mall store is found by its code', JSON.stringify(hit?.kind));
if (s.findBuilding('999999', plots, layout) !== null || s.findBuilding(null, plots, layout) !== null) bad('an unknown building is not found', '');

// an ad that points at a building in the city
if (s.cityPlotOf('/b/12', 'voxelventure.app') !== '12' || s.cityPlotOf('https://voxelventure.app/?plot=7', 'localhost:3000') !== '7' || s.cityPlotOf('https://staging.voxelventure.app/b/3/', 'x') !== '3') bad("an ad's link to a building in the city is found", '');
if (s.cityPlotOf('https://evil.example/b/12', 'voxelventure.app') !== null || s.cityPlotOf('https://amy.test', 'voxelventure.app') !== null || s.cityPlotOf('not a url ::', 'voxelventure.app') !== null || s.cityPlotOf(null, 'voxelventure.app') !== null) bad('another site or a plain website is not a building', '');

// the badge: self-contained, escaped, no script
const evil = { id: 12, title: '<img src=x onerror=alert(1)>', luxury: true };
const html = s.badgeHtml('https://x.example/?plot=12&city=1', evil);
if (/<script|onerror=|javascript:/i.test(html) || html.includes('<img')) bad('the badge cannot carry code', html);
if (!html.startsWith('<a href="https://x.example/?plot=12&amp;city=1"') || !/rel="noopener"/.test(html) || !/Plot #12/.test(html)) bad('the badge is a link to the building', html.slice(0, 120));
if (!/flagship/.test(s.badgeLabel({ id: 1, luxury: true })) || /flagship/.test(s.badgeLabel({ id: 1 }))) bad('a luxury building is a flagship', '');
const quoteTrap = s.badgeHtml('https://x.example/?a="onmouseover="x', { id: 1 });
if (/onmouseover=/.test(quoteTrap.replace(/&quot;/g, '')) && !quoteTrap.includes('&quot;')) bad('quotes in the link are escaped', quoteTrap);
if (s.badgeMarkdown('https://x.example', { id: 3 }) !== '[Visit our 3D building on VoxelVenture · Plot #3](https://x.example)') bad('the markdown badge', s.badgeMarkdown('https://x.example', { id: 3 }));
if (!/on District A/.test(s.shareCaption({ title: 'Cart Grill' }, 'District A')) || !/Cart Grill/.test(s.shareCaption({ title: 'Cart Grill' }))) bad('a share caption names the building', '');

console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
