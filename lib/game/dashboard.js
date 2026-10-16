// The owner's dashboard ("My businesses"): everything you own in one place, with how each is doing and what to do next. Pure, so it is tested in Node.

// The businesses the player owns: plots, and the stores they rent in the malls.
export const ownedBusinesses = (plots, layout) => [...plots.filter((p) => p.userClaimed), ...(layout?.malls ?? []).flatMap((m) => m.stores).filter((st) => st.userClaimed)];

// What would make a business better, in the order to do it. `designed` is true once the owner has redesigned the inside in the editor.
// Each step: { id, label, hint, done }.
export function nextSteps(plot, { designed = false } = {}) {
  const brand = plot.brand ?? {};
  return [
    { id: 'description', label: 'Write a description', hint: 'A line about what you do shows on your building card and in the directory.', done: Boolean(plot.description) },
    { id: 'outside', label: 'Style the outside', hint: 'Choose the floors, the shape, the colours and a feature for the roof so the building stands out on the map.', done: Boolean(plot.exterior) },
    { id: 'design', label: 'Design the inside', hint: 'Open the building, press Redesign inside and lay out your own room.', done: designed },
    { id: 'coupon', label: 'Add a coupon', hint: 'Visitors claim it inside your building: a reason to come in.', done: Boolean(brand.coupon) },
    { id: 'quest', label: 'Pay visitors to look around', hint: 'A visit reward in Gold: it keeps people inside long enough to read your offer.', done: Boolean(brand.quest) },
    { id: 'media', label: 'Add a video or a game demo', hint: 'A YouTube or Vimeo link, or an itch.io game, plays beside your room.', done: Boolean(brand.video || brand.game) },
    { id: 'website', label: 'Link your website', hint: 'The Visit website button counts every click.', done: Boolean(plot.website) && !/example\.com/.test(plot.website) },
  ];
}

// One row per business: its figures (from `statsOf(plot)`, the live or the simulated provider), its offers and its steps.
export function dashboardRows(businesses, { statsOf, designed = {}, leaseOf = null, worthOf = null } = {}) {
  return businesses.map((p) => {
    const stats = statsOf ? statsOf(p) : null;
    const steps = nextSteps(p, { designed: Boolean(designed[p.id]) });
    const brand = p.brand ?? {};
    return {
      id: p.id,
      title: p.title,
      mall: Boolean(p.mall),
      district: p.district,
      type: p.buildingType,
      value: p.value ?? 0,
      views: stats?.views ?? 0,
      uniques: stats?.uniques ?? 0,
      clicks: stats?.clicks ?? 0,
      ctr: stats?.ctr ?? 0,
      avgSeconds: stats?.avgSeconds ?? 0,
      simulated: Boolean(stats?.simulated),
      days: (stats?.days ?? []).slice(-14).map((d) => ({ ago: d.ago, views: d.views })), // the last fourteen days, for the chart
      offers: [brand.coupon && 'coupon', brand.quest && 'visit reward', brand.video && 'video', brand.game && 'game demo'].filter(Boolean),
      lease: leaseOf ? leaseOf(p) : null,
      worth: worthOf ? worthOf(p) : null, // { base, fixtures, count, total }: the place plus what you put in it (only meaningful once fixture prices are set)
      steps,
      stepsDone: steps.filter((s) => s.done).length,
    };
  });
}

// The ad spaces you hold: the slots you took over or booked (`userBought`) and the ones where your ad shares the screen (an ad marked `mine`).
export function ownedAdSlots(billboards) {
  return (billboards ?? [])
    .filter((b) => b.userBought || (b.ads ?? []).some((a) => a.mine))
    .map((b) => ({
      id: b.id,
      name: b.roadName ?? b.id,
      kind: b.kind === 'banner' ? 'Aerial banner' : 'Billboard',
      holder: Boolean(b.userBought),
      headline: b.userBought ? b.ad?.headline : (b.ads ?? []).find((a) => a.mine)?.headline,
      views: b.views ?? 0,
      clicks: b.clicks ?? 0,
      ctr: b.views ? (b.clicks ?? 0) / b.views : 0,
      value: b.value ?? 0,
      sharers: (b.ads ?? []).length,
    }));
}

export function dashboardTotals(rows) {
  return {
    businesses: rows.length,
    value: rows.reduce((a, r) => a + r.value, 0),
    views: rows.reduce((a, r) => a + r.views, 0),
    uniques: rows.reduce((a, r) => a + r.uniques, 0),
    clicks: rows.reduce((a, r) => a + r.clicks, 0),
    stepsLeft: rows.reduce((a, r) => a + (r.steps.length - r.stepsDone), 0),
  };
}

// The figures as a spreadsheet file (a cell that starts with = + - or @ is quoted so a spreadsheet cannot run it as a formula).
export function dashboardCsv(rows) {
  const cell = (v) => `"${/^[=+\-@]/.test(String(v)) ? "'" : ''}${String(v).replace(/"/g, '""')}"`;
  const head = ['Business', 'Where', 'Value', 'Views (30 days)', 'Visitors', 'Website clicks', 'Click rate', 'Avg seconds inside', 'Offers', 'Set-up steps done'];
  const lines = [head.map(cell).join(',')];
  for (const r of rows) lines.push([r.title, r.mall ? 'Mega mall' : r.district, r.value, r.views, r.uniques, r.clicks, `${(r.ctr * 100).toFixed(1)}%`, r.avgSeconds, r.offers.join('; '), `${r.stepsDone}/${r.steps.length}`].map(cell).join(','));
  return lines.join('\r\n');
}
