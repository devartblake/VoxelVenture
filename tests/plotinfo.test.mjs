// What the plot card shows: addresses, descriptions, exposure, rank, history and the site-visit statistics.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const info = await imp('game/plotInfo.js');
const { useCityStore } = await imp('state/store.js');
const { bad, total } = problemTally();

let owned = 0, addresses = 0, uniqueAddresses = 0;
for (let seed = 1; seed <= 20; seed++) {
  const { layout, plots } = generateCity(seed);
  const seen = new Set();
  for (const p of plots) {
    const addr = info.addressOf(p, layout);
    addresses++;
    if (!/^.+, [1-9]\d*$/.test(addr)) bad('an address is "street, number"', `${seed} #${p.id}: ${addr}`);
    if (!seen.has(addr)) uniqueAddresses++;
    seen.add(addr);
    if (info.addressOf(p, layout) !== addr) bad('an address is stable', addr);

    const text = info.describeBusiness(p);
    if (text.length < 30 || text.length > 200) bad('a description is a sentence or two', `${seed} #${p.id}: ${text.length}`);
    if (p.owner && !text.includes(p.title) && p.buildingType !== 'house') bad('a description names the business', `${seed} #${p.id}`);

    const ex = info.exposureOf(p, layout, plots);
    if (!/^[A-Z]+ · (HIGH|MEDIUM|LOW) EXPOSURE$/.test(ex.label)) bad('an exposure label', ex.label);

    if (!p.owner) {
      if (info.siteVisitStats(p) !== null || info.historyOf(p).length) bad('an empty lot has no website statistics or history', `${seed} #${p.id}`);
      continue;
    }
    owned++;
    // site visits
    const s = info.siteVisitStats(p);
    if (!s || s.days.length !== 30 || !(s.views > 0)) bad('thirty days of views', `${seed} #${p.id}`);
    else {
      if (s.clicks > s.views || s.uniques > s.views || s.ctr > 0.2) bad('clicks and visitors never exceed views', `${seed} #${p.id}`);
      if (Math.abs(s.sources.reduce((a, x) => a + x.share, 0) - 1) > 1e-9) bad('the sources add up to everything', `${seed} #${p.id}`);
      if (s.busiestHour < 8 || s.busiestHour > 21 || s.avgSeconds < 20) bad('plausible hours and time on site', `${seed} #${p.id}`);
      if (JSON.stringify(s) !== JSON.stringify(info.siteVisitStats(p))) bad('the statistics are the same every time', `${seed} #${p.id}`);
      if (info.siteVisitStats(p, { siteClicks: 3 }).clicks !== s.clicks + 3 || info.siteVisitStats(p, { visits: 5 }).views !== s.views + 5) bad('what the player does is added on top', `${seed} #${p.id}`);
    }
    // history
    const h = info.historyOf(p);
    if (h[0].kind !== 'claim' || !h[0].now || h.at(-1).kind !== 'open') bad('history starts with the current owner and ends with the plot opening', `${seed} #${p.id}`);
    for (let i = 1; i < h.length; i++) if (h[i].daysAgo < h[i - 1].daysAgo) bad('history goes back in time', `${seed} #${p.id}`);
    for (let i = 1; i < h.length - 1; i++) if (!(h[i].price <= h[i - 1].price)) bad('earlier owners paid less (the 1.25x rule)', `${seed} #${p.id}`);
    if (p.generated && info.ownersOf(p) < 1) bad('at least one owner', `${seed} #${p.id}`);
  }
  // rank: 1 is the dearest plot, and no two plots share a rank
  const ranks = plots.map((p) => info.rankByValue(p, plots));
  if (new Set(ranks).size !== plots.length || Math.min(...ranks) !== 1) bad('every plot has its own rank', `${seed}`);
  const dearest = [...plots].sort((a, b) => b.value - a.value)[0];
  if (info.rankByValue(dearest, plots) !== 1) bad('the dearest plot is number 1', `${seed}`);
  // busier plots draw more visitors
  const withStats = plots.filter((p) => p.owner && p.buildingType !== 'house').map((p) => ({ p, v: info.siteVisitStats(p).views })).sort((a, b) => a.p.visits - b.p.visits);
  const q = Math.floor(withStats.length / 4);
  const avg = (list) => list.reduce((a, x) => a + x.v, 0) / list.length;
  if (!(avg(withStats.slice(-q)) > avg(withStats.slice(0, q)) * 1.5)) bad('busier plots show many more visitors', `${seed}`);
}
if (uniqueAddresses / addresses < 0.6) bad('most plots have an address of their own', `${(uniqueAddresses / addresses).toFixed(2)}`);

// the player's own activity is counted and saved
{
  const city = generateCity(2);
  useCityStore.setState({ plots: city.plots, layout: city.layout, billboards: city.billboards, activity: {} });
  const p = city.plots.find((q) => q.owner && q.buildingType !== 'house');
  useCityStore.getState().openInterior(p);
  useCityStore.getState().openInterior(p);
  useCityStore.getState().recordSiteClick(p.id);
  const a = useCityStore.getState().activity[p.id];
  if (a?.visits !== 2 || a?.siteClicks !== 1) bad('visits and website clicks are counted', JSON.stringify(a));
  // an owner can describe their business; nobody else can
  const empty = city.plots.find((q) => !q.owner && q.districtId !== 'suburb');
  useCityStore.getState().setDay('2026-10-12');
  useCityStore.getState().claimPlot(empty.id, 'Me', 'Test Shop', 'https://x.test', 'shop', null, { kind: 'generated' }, `  ${'x'.repeat(300)}  `);
  const mine = useCityStore.getState().plots.find((q) => q.id === empty.id);
  if (!mine.description || mine.description.length !== 160) bad('a description is kept, trimmed to 160 characters', String(mine.description?.length));
  if (info.describeBusiness(mine) !== mine.description) bad('the owner\'s words win over the made-up line', '');
  if (useCityStore.getState().setPlotDescription(p.id, 'hacked') !== false) bad('only the owner can change a description', '');
  if (useCityStore.getState().setPlotDescription(empty.id, 'Fresh coffee.') !== true || useCityStore.getState().plots.find((q) => q.id === empty.id).description !== 'Fresh coffee.') bad('the owner can change their description', '');
}

console.log(`${owned} businesses in 20 cities; ${(100 * uniqueAddresses / addresses).toFixed(0)}% of plots have a unique address`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
