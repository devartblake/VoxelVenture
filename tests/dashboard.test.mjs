// The owner's dashboard: which businesses are yours, the set-up steps, the totals and the spreadsheet.
import { imp, problemTally } from './helpers.mjs';
const d = await imp('game/dashboard.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { useCityStore } = await imp('state/store.js');
const { siteVisitStats } = await imp('game/plotInfo.js');
const { bad, total } = problemTally();

const city = generateCity(4);
useCityStore.setState({ plots: city.plots, layout: city.layout, billboards: city.billboards });
const lot = useCityStore.getState().plots.find((p) => !p.owner && p.districtId !== 'suburb' && !p.designSite);
const gen = useCityStore.getState().plots.find((p) => p.owner && !p.admin && p.districtId !== 'suburb');

// nothing owned
if (d.ownedBusinesses(useCityStore.getState().plots, useCityStore.getState().layout).length !== 0) bad('a new game owns nothing', '');

// claim a lot, take over a business, rent a store
useCityStore.getState().claimPlot(lot.id, 'Tester', 'My Test Shop', 'https://mine.example/shop', 'shop', null, { kind: 'generated' }, 'We sell tests.');
useCityStore.getState().takeOverPlot(gen.id, 'Tester', 'Taken Over', 'https://example.com', 'office', null, { kind: 'generated' }, '');
useCityStore.getState().rentStore(city.layout.malls[0].stores[2].id, 'Tester', 'Mall Corner', 'https://example.com', { kind: 'generated' });
const st = useCityStore.getState();
const mine = d.ownedBusinesses(st.plots, st.layout);
if (mine.length !== 3) bad('the dashboard lists a claim, a take-over and a rented store', String(mine.length));
if (!mine.some((p) => p.mall)) bad('a rented mall store is listed', '');
if (mine.some((p) => !p.userClaimed)) bad('only your own businesses are listed', '');

// the steps
const fresh = d.nextSteps({ title: 'x', website: 'https://example.com', brand: null });
if (fresh.some((s) => s.done)) bad('a bare business has every step to do', JSON.stringify(fresh.map((s) => s.id + s.done)));
const full = d.nextSteps({ exterior: { floors: 3 }, description: 'Hello', website: 'https://real.example', brand: { coupon: { text: 'x' }, quest: { gold: 5 }, video: { url: 'u' } } }, { designed: true });
if (full.some((s) => !s.done)) bad('a finished business has no steps left', JSON.stringify(full.filter((s) => !s.done).map((s) => s.id)));
if (d.nextSteps({ website: 'https://example.com/x' }).find((s) => s.id === 'website').done) bad('the placeholder website does not count as linked', '');

// rows and totals
const rows = d.dashboardRows(mine, { statsOf: (p) => siteVisitStats(p, st.activity[p.id] ?? {}), designed: { [mine[0].id]: true } });
if (rows.length !== 3 || rows.some((r) => !(r.views >= 0) || !(r.uniques >= 0) || r.steps.length !== 7)) bad('a row has figures and seven steps', JSON.stringify(rows[0]));
if (!rows[0].steps.find((s) => s.id === 'design').done || rows[1].steps.find((s) => s.id === 'design').done) bad('a designed building has its design step done', '');
if (rows.find((r) => r.title === 'My Test Shop').steps.find((s) => s.id === 'description').done !== true) bad('the description you wrote counts', '');
const t = d.dashboardTotals(rows);
if (t.businesses !== 3 || t.views !== rows.reduce((a, r) => a + r.views, 0) || t.stepsLeft !== rows.reduce((a, r) => a + 7 - r.stepsDone, 0)) bad('the totals add up', JSON.stringify(t));
if (d.dashboardRows([], {}).length !== 0 || d.dashboardTotals([]).businesses !== 0) bad('an empty dashboard is empty', '');

// the chart
if (rows.some((r) => r.days.length !== 14 || r.days[13].ago !== 0)) bad('a row has the last fourteen days, ending today', JSON.stringify(rows[0].days.slice(-2)));

// ad spaces
{
  const b = useCityStore.getState().billboards;
  if (d.ownedAdSlots(b).length !== 0) bad('no ad spaces are yours at the start', '');
  const taken = b.find((x) => x.kind !== 'banner' && x.ad);
  const shared = b.find((x) => x.kind !== 'banner' && x.ad && x.id !== taken.id);
  const open = b.find((x) => !x.ad);
  useCityStore.getState().buyBillboard(taken.id, { advertiser: 'Me', headline: 'Mine', tagline: 't', url: 'https://x.example', color: '#112233' });
  useCityStore.getState().shareBillboard(shared.id, { advertiser: 'Me', headline: 'Shared mine', tagline: 't', url: 'https://x.example', color: '#334455' });
  if (open) useCityStore.getState().buyBillboard(open.id, { advertiser: 'Me', headline: 'Booked', tagline: 't', url: 'https://x.example', color: '#556677' });
  const slots = d.ownedAdSlots(useCityStore.getState().billboards);
  if (slots.length !== (open ? 3 : 2)) bad('the ad spaces you hold or share are listed', JSON.stringify(slots.map((x) => x.id)));
  const sh = slots.find((x) => x.id === shared.id);
  if (!sh || sh.holder || sh.sharers !== 1 || sh.headline !== 'Shared mine') bad('a shared slot is listed as shared, with your headline', JSON.stringify(sh));
  const held = slots.find((x) => x.id === taken.id);
  if (!held?.holder || held.headline !== 'Mine') bad('a slot you took over is listed as held', JSON.stringify(held));
}

// the spreadsheet
const csv = d.dashboardCsv([{ ...rows[0], title: '=HYPERLINK("x")', offers: ['coupon', 'video'] }, rows[1]]);
const lines = csv.split('\r\n');
if (lines.length !== 3 || !lines[0].startsWith('"Business"')) bad('the CSV has a header and a row each', csv.slice(0, 80));
if (!lines[1].startsWith('"\'=HYPERLINK')) bad('a formula in a title is quoted so a spreadsheet cannot run it', lines[1].slice(0, 40));
if (!lines[1].includes('coupon; video')) bad('the offers are listed', lines[1]);

console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
