// The live data provider (lib/data/liveData.js, lib/data/liveStats.js): with a game server, a building's figures are the server's or
// nothing (null while loading), never the simulated stand-ins an owner could mistake for their own.
import { imp } from './helpers.mjs';
const { remoteProvider, simulatedProvider } = await imp('data/liveData.js');
const L = await imp('data/liveStats.js');
const { generateCity } = await imp('city/cityGenerator.js');
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', n, extra); };

const plot = generateCity(20260101).plots.find((p) => p.owner && p.buildingType && p.buildingType !== 'house');
check('(the simulated provider would invent figures for it)', simulatedProvider.plotStats(plot, {}).views > 0 && simulatedProvider.plotHistory(plot).length > 0 && simulatedProvider.meta.simulated);
check('the live provider says it is not simulated', remoteProvider.meta.simulated === false && remoteProvider.name === 'live');
check('before the server answers: no statistics, no history, owners unknown', remoteProvider.plotStats(plot) === null && remoteProvider.plotHistory(plot).length === 0 && remoteProvider.plotOwners(plot) === null);
check('and the figure state is loading', L.figuresState(plot.id) === 'loading');
check('visits are the server count as given, with nothing added for this player', remoteProvider.visits({ ...plot, visits: 4 }, { visits: 10 }) === 4);
const real = { simulated: false, verified: true, views: 7, uniques: 5, clicks: 1, ctr: 1 / 7, days: [], sources: [] };
L.useLiveStats.setState({ stats: { [plot.id]: { at: Date.now(), data: real } }, history: { [plot.id]: { at: Date.now(), data: { simulated: false, events: [{ kind: 'open', title: 'x', price: 1, daysAgo: 3 }], owners: 0 } } } });
check("once it answers: the server's statistics exactly", remoteProvider.plotStats(plot) === real && L.figuresState(plot.id) === 'ready');
check("and the server's history and owner count", remoteProvider.plotHistory(plot).length === 1 && remoteProvider.plotOwners(plot) === 0);
L.useLiveStats.setState({ stats: { [plot.id]: { at: Date.now(), error: 'offline' } } });
check('a failed request is an error, still never a stand-in', remoteProvider.plotStats(plot) === null && L.figuresState(plot.id) === 'error');
L.useLiveStats.setState({ stats: { [plot.id]: { at: Date.now(), data: { empty: true } } } });
check('an empty lot has no statistics', remoteProvider.plotStats(plot) === null);
check('a mall store (not on the server) is never fetched', (L.wantFigures('mall-1-s3'), Object.keys(L.useLiveStats.getState().stats).every((k) => k !== 'mall-1-s3')));

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
