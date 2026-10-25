// Everything the game shows that needs LIVE data, in one place, behind one provider.
//
// Without a game server (NEXT_PUBLIC_LIVE_API_URL unset) the SIMULATED provider makes deterministic figures from lib/game/plotInfo.js plus what
// this browser's player did, and the UI labels them "simulated". With a server the LIVE provider only ever returns the server's figures:
// verified visits, the real ledger and the server's counts. A figure that has not arrived yet is null (shown as loading), never a simulated
// stand-in, so an owner or an advertiser never sees an invented number as theirs (docs/architecture/authoritative_data.md).
import { exposureOf, historyOf, ownersOf, siteVisitStats } from '../game/plotInfo';
import { liveHistoryOf, liveStatsOf } from './liveStats';

// What needs live data, and where it comes from. All of these are served by the API (server/api); `simulated` is the fallback without one.
export const LIVE_FIELDS = [
  { id: 'plot.visits', label: 'Visits to a building', endpoint: 'GET /plots/state', needs: 'verified visit events (a player entered the building)' },
  { id: 'plot.siteStats', label: 'Site visits: visitors, clicks, hours, sources (30 days)', endpoint: 'GET /plots/{id}/stats', needs: 'verified visit and website-click events with a source tag' },
  { id: 'plot.history', label: 'Building history (owners, prices, dates)', endpoint: 'GET /plots/{id}/history', needs: 'the ownership ledger in the database' },
  { id: 'plot.owners', label: 'Number of owners', endpoint: 'GET /plots/{id}/history', needs: 'the ownership ledger' },
  { id: 'plot.value', label: 'Current value and rank', endpoint: 'GET /plots/state', needs: 'authoritative plot prices (the 1.25x rule on the server)' },
  { id: 'directory', label: 'The directory of built plots', endpoint: 'GET /plots/state', needs: 'the plots table (title, logo, description, website, value, visits)' },
  { id: 'world.online', label: 'Players online now and total visits', endpoint: 'GET /stats/overview', needs: 'presence pings' },
  { id: 'plot.ownership', label: 'Who owns a plot (claim, take over)', endpoint: 'POST /plots/{id}/claim', needs: 'accounts, payments and an atomic claim' },
];

const simulated = (extra = {}) => ({ simulated: true, ...extra });

// The simulated provider: the single-player game.
export const simulatedProvider = {
  name: 'simulated',
  plotStats: (plot, activity) => siteVisitStats(plot, activity),
  plotHistory: (plot) => historyOf(plot),
  plotOwners: (plot) => ownersOf(plot),
  exposure: (plot, layout, plots) => exposureOf(plot, layout, plots),
  visits: (plot, activity = {}) => (plot.visits ?? 0) + (activity.visits ?? 0),
  meta: simulated(),
};

// The live provider: the server's figures only (loaded by lib/data/liveStats.js; call wantFigures(id) to ask for them).
export const remoteProvider = {
  name: 'live',
  meta: { simulated: false },
  plotStats: (plot) => liveStatsOf(plot.id),
  plotHistory: (plot) => liveHistoryOf(plot.id)?.events ?? [],
  plotOwners: (plot) => liveHistoryOf(plot.id)?.owners ?? null,
  exposure: (plot, layout, plots) => exposureOf(plot, layout, plots), // where it stands and its share of the (verified) visits
  visits: (plot) => plot.visits ?? 0, // the server's verified count; the player's own visit is counted there, not added here
};

const API = process.env.NEXT_PUBLIC_LIVE_API_URL || '';
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
// `type` (office, restaurant, shop) and `district` (a district's name) narrow the list; null for all.
export function buildDirectory(plots, { sort = 'value', query = '', type = null, district = null } = {}) {
  const built = plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2 && (!type || p.buildingType === type) && (!district || p.district === district));
  const byValue = [...built].sort(DIRECTORY_SORTS.value.cmp);
  const rank = new Map(byValue.map((p, i) => [p.id, i + 1]));
  const q = query.trim().toLowerCase();
  const list = (q ? built.filter((p) => `${p.title} ${p.owner} ${p.district} ${p.buildingType} #${p.id}`.toLowerCase().includes(q)) : built).sort((DIRECTORY_SORTS[sort] ?? DIRECTORY_SORTS.value).cmp);
  return { total: built.length, entries: list.map((plot, i) => ({ plot, number: i + 1, rank: rank.get(plot.id) })) };
}
