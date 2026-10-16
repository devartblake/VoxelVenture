// Interior hotspots: the places a visitor can jump to inside a building.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
// (the interior scenes need the Pascal catalog, which only a bundler can load: the browser test checks the real rooms)
const rooms = [{ width: 8, depth: 6 }, { width: 12, depth: 8 }, { width: 16, depth: 10 }, { width: 28, depth: 14 }];
const { hotspotsFor, viewFor } = await imp('content/interiorHotspots.js');
const { bad, total } = problemTally();

let checked = 0;
let withOffers = 0;
for (let seed = 1; seed <= 10; seed++) {
  const { plots, layout } = generateCity(seed);
  const businesses = [...plots.filter((p) => p.owner && p.interiorData).slice(0, 30), ...(layout.malls ?? []).flatMap((m) => m.stores)];
  for (const plot of businesses) {
    const scene = { room: rooms[(plot.id.toString().length + seed) % rooms.length], doorX: seed % 2 ? 3.4 : undefined };
    const spots = hotspotsFor(plot, scene.room, scene.doorX);
    checked++;
    const ids = spots.map((s) => s.id);
    if (new Set(ids).size !== ids.length) bad('hotspot ids are unique', ids.join());
    for (const need of ['overview', 'entrance', 'back', 'left', 'right']) if (!ids.includes(need)) bad(`a building has a ${need} hotspot`, `${plot.id}`);
    const brand = plot.brand;
    if (Boolean(brand?.coupon) !== ids.includes('offer') || Boolean(brand?.video) !== ids.includes('video') || Boolean(brand?.game) !== ids.includes('game') || Boolean(brand?.quest) !== ids.includes('reward')) bad('there is a hotspot for each offer, and only for those', `${plot.id}: ${ids}`);
    if (brand && (brand.coupon || brand.video || brand.game || brand.quest)) withOffers++;
    for (const s of spots) {
      if (!s.pos) continue;
      const [x, y, z] = s.pos;
      if (x < 0 || x > scene.room.width || z < 0 || z > scene.room.depth || y < 0.5 || y > 2.5) bad('a hotspot is inside the room', `${plot.id} ${s.id} ${s.pos}`);
      const v = viewFor(s, scene.room, 0);
      const [ex, , ez] = v.eye;
      const slack = 6;
      if (ex < -slack || ex > scene.room.width + slack || ez < -slack || ez > scene.room.depth + slack) bad('the camera for a hotspot is near the room', `${plot.id} ${s.id}`);
      if (!v.eye.every(Number.isFinite) || !v.look.every(Number.isFinite)) bad('the view is a real position', `${plot.id} ${s.id}`);
      if (Math.hypot(ex - x, ez - z) < 2.9) bad('the camera stands back from what it looks at', `${plot.id} ${s.id}`);
    }
  }
}
if (withOffers < 5) bad('some of the buildings checked have offers', String(withOffers));
console.log(`${checked} interiors, ${withOffers} with offers`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
