// Everything the game shows that needs LIVE data, in one place, behind one provider.
//
// Today every provider method is SIMULATED (deterministic numbers from lib/game/plotInfo.js plus what this browser's player did).
// To go live: set NEXT_PUBLIC_LIVE_API_URL, implement the endpoints listed in LIVE_FIELDS on the server (docs/live_data.md), and the
// `remoteProvider` below fetches them; the UI already asks the provider for every one of these figures and labels the simulated ones.
import { exposureOf, historyOf, ownersOf, siteVisitStats } from '../game/plotInfo';

// What needs live data, and where it will come from. `simulated` is true while the provider cannot serve it for real.
export const LIVE_FIELDS = [
  { id: 'plot.visits', label: 'Visits to a building', endpoint: 'GET /plots/{id}/stats', needs: 'a visit event logged when a player enters a building' },
  { id: 'plot.siteStats', label: 'Site visits: visitors, clicks, hours, sources (30 days)', endpoint: 'GET /plots/{id}/stats', needs: 'page-view and website-click events with a source tag' },
  { id: 'plot.history', label: 'Building history (owners, prices, dates)', endpoint: 'GET /plots/{id}/history', needs: 'the ownership ledger in the database' },
  { id: 'plot.owners', label: 'Number of owners', endpoint: 'GET /plots/{id}/history', needs: 'the ownership ledger' },
  { id: 'plot.value', label: 'Current value and rank', endpoint: 'GET /plots?sort=value', needs: 'authoritative plot prices (the 1.25x rule on the server)' },
  { id: 'directory', label: 'The directory of built plots', endpoint: 'GET /plots?built=1&sort=value', needs: 'the plots table (title, logo, description, website, value, visits)' },
  { id: 'world.online', label: 'Players online now and total visits', endpoint: 'GET /world/stats', needs: 'presence from the multiplayer server' },
  { id: 'plot.ownership', label: 'Who owns a plot (claim, take over)', endpoint: 'POST /plots/{id}/claim', needs: 'accounts, payments and an atomic claim' },
];

const simulated = (extra = {}) => ({ simulated: true, ...extra });

// The simulated provider: what the game uses now.
export const simulatedProvider = {
  name: 'simulated',
  plotStats: (plot, activity) => siteVisitStats(plot, activity),
  plotHistory: (plot) => historyOf(plot),
  plotOwners: (plot) => ownersOf(plot),
  exposure: (plot, layout, plots) => exposureOf(plot, layout, plots),
  visits: (plot, activity = {}) => (plot.visits ?? 0) + (activity.visits ?? 0),
  meta: simulated(),
};

// The live provider: asks the server. Every call falls back to the simulated figure if the server cannot be reached, so the
// game never shows an empty card. (Responses are expected in the same shapes the simulated provider returns.)
const API = process.env.NEXT_PUBLIC_LIVE_API_URL || '';
async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}
export const remoteProvider = {
  ...simulatedProvider,
  name: 'live',
  meta: { simulated: false },
  fetchPlotStats: (plot) => get(`/plots/${plot.id}/stats`).catch(() => simulatedProvider.plotStats(plot)),
  fetchPlotHistory: (plot) => get(`/plots/${plot.id}/history`).catch(() => simulatedProvider.plotHistory(plot)),
  fetchDirectory: () => get('/plots?built=1&sort=value'),
};

export const liveDataProvider = () => (API ? remoteProvider : simulatedProvider);
export const isLive = () => Boolean(API);

// ---- the directory ------------------------------------------------------------------------------------------------
export const DIRECTORY_SORTS = {
  value: { label: 'Value', cmp: (a, b) => b.value - a.value || a.id - b.id },
  visits: { label: 'Visits', cmp: (a, b) => b.visits - a.visits || a.id - b.id },
  plot: { label: 'Plot number', cmp: (a, b) => a.id - b.id },
  name: { label: 'Name', cmp: (a, b) => a.title.localeCompare(b.title) },
};

// Every plot with a building (not empty lots, not Old Town houses), numbered 1 to N in the chosen order.
// `entries[i].number` is the position in that order; `rank` is always the position by value.
export function buildDirectory(plots, { sort = 'value', query = '' } = {}) {
  const built = plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2);
  const byValue = [...built].sort(DIRECTORY_SORTS.value.cmp);
  const rank = new Map(byValue.map((p, i) => [p.id, i + 1]));
  const q = query.trim().toLowerCase();
  const list = (q ? built.filter((p) => `${p.title} ${p.owner} ${p.district} ${p.buildingType} #${p.id}`.toLowerCase().includes(q)) : built).sort((DIRECTORY_SORTS[sort] ?? DIRECTORY_SORTS.value).cmp);
  return { total: built.length, entries: list.map((plot, i) => ({ plot, number: i + 1, rank: rank.get(plot.id) })) };
}
