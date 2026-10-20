// The fixed camera spots the performance measurement uses (scripts/perf-measure.mjs, and the "Measure" button of the ?diag=1
// badge on a phone), from the city's layout. Pure: the same city always gives the same spots. Coordinates are the scene's
// (the city is drawn shifted by layout.center), for the map (isometric) camera, which sits at target + (30, 30, 30).
//
//   center       the default view: the middle of the city at the default zoom (13)
//   downtown     close over the busiest block of built plots (zoom 30)
//   whole-city   zoomed all the way out (the controls' minimum, 5) over the middle: the most on screen at once
//   airport      the first airport at the default zoom
//   airport-far  the first airport, zoomed out (6): where the "Pixel Heights Airport" artifacts were reported
export const MAP_ZOOM = Object.freeze({ default: 13, min: 5, close: 30 });
export const MAP_CAMERA_OFFSET = Object.freeze([30, 30, 30]);

export function measurementSpots(layout, plots = []) {
  const c = layout?.center ?? { x: 0, z: 0 };
  const rel = (x, z) => ({ x: Math.round((x - c.x) * 100) / 100, z: Math.round((z - c.z) * 100) / 100 });
  const spots = [
    { id: 'center', ...rel(c.x, c.z), zoom: MAP_ZOOM.default },
  ];
  // the busiest block: the 40-unit cell holding the most built plots (the first such cell, scanning in a fixed order)
  const built = plots.filter((p) => p.owner);
  if (built.length) {
    const cells = new Map();
    for (const p of built) {
      const key = `${Math.floor(p.x / 40)},${Math.floor(p.z / 40)}`;
      const cell = cells.get(key) ?? { n: 0, x: 0, z: 0, key };
      cell.n++;
      cell.x += p.x;
      cell.z += p.z;
      cells.set(key, cell);
    }
    const best = [...cells.values()].sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1))[0];
    spots.push({ id: 'downtown', ...rel(best.x / best.n, best.z / best.n), zoom: MAP_ZOOM.close });
  }
  spots.push({ id: 'whole-city', ...rel(c.x, c.z), zoom: MAP_ZOOM.min });
  const airport = layout?.airports?.[0];
  if (airport?.centre) {
    spots.push({ id: 'airport', ...rel(airport.centre.x, airport.centre.z), zoom: MAP_ZOOM.default, name: airport.name });
    spots.push({ id: 'airport-far', ...rel(airport.centre.x, airport.centre.z), zoom: 6, name: airport.name });
  }
  return spots;
}
