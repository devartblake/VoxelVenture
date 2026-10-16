// The directory of built plots, and the live-data switch.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const d = await imp('data/liveData.js');
const { bad, total } = problemTally();
for (let seed = 1; seed <= 20; seed++) {
  const { plots } = generateCity(seed);
  const built = plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2);
  for (const sort of Object.keys(d.DIRECTORY_SORTS)) {
    const { total: t, entries } = d.buildDirectory(plots, { sort });
    if (t !== built.length || entries.length !== t) bad('the directory lists every built plot', `${seed} ${sort}`);
    if (entries.some((e, i) => e.number !== i + 1)) bad('numbered 1 to the last', `${seed} ${sort}`);
    if (new Set(entries.map((e) => e.plot.id)).size !== t) bad('each plot once', `${seed} ${sort}`);
    if (entries.some((e) => !e.plot.owner || e.plot.buildingType === 'house')) bad('only buildings', `${seed}`);
  }
  const v = d.buildDirectory(plots, { sort: 'value' }).entries;
  if (v.some((e, i) => e.rank !== i + 1) || v.some((e, i) => i && e.plot.value > v[i - 1].plot.value)) bad('by value: rank 1 is the dearest', `${seed}`);
  const p = d.buildDirectory(plots, { sort: 'plot' }).entries;
  if (p.some((e, i) => i && e.plot.id < p[i - 1].plot.id)) bad('by plot number ascending', `${seed}`);
  const q = d.buildDirectory(plots, { query: built[0].title }).entries;
  if (!q.length || q.some((e) => !`${e.plot.title} ${e.plot.owner} ${e.plot.district} ${e.plot.buildingType} #${e.plot.id}`.toLowerCase().includes(built[0].title.toLowerCase()))) bad('search filters', `${seed}`);
  if (q.some((e, i) => e.number !== i + 1)) bad('a search is numbered from 1 too', `${seed}`);
}
if (d.isLive() || d.liveDataProvider().name !== 'simulated' || !d.liveDataProvider().meta.simulated) bad('the simulated provider is used without a server', '');
if (!d.LIVE_FIELDS.length || d.LIVE_FIELDS.some((f) => !f.endpoint || !f.needs)) bad('every live field names its endpoint and need', '');
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
