// A uniform grid over rectangles, so a map can draw only what is in view instead of everything. Pure, tested in Node.
//   const grid = buildGrid(items, (item) => ({ x0, x1, z0, z1 }), cell)
//   queryGrid(grid, { x0, x1, z0, z1 }) -> the items whose rectangle meets the query rectangle (each once)
export function buildGrid(items, rectOf, cell = 24) {
  const cells = new Map();
  items.forEach((item, i) => {
    const r = rectOf(item);
    for (let cx = Math.floor(r.x0 / cell); cx <= Math.floor(r.x1 / cell); cx++) {
      for (let cz = Math.floor(r.z0 / cell); cz <= Math.floor(r.z1 / cell); cz++) {
        const k = `${cx},${cz}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(i);
      }
    }
  });
  return { cells, items, rectOf, cell };
}

export function queryGrid(grid, q) {
  const seen = new Set();
  const out = [];
  const { cell, cells, items, rectOf } = grid;
  for (let cx = Math.floor(q.x0 / cell); cx <= Math.floor(q.x1 / cell); cx++) {
    for (let cz = Math.floor(q.z0 / cell); cz <= Math.floor(q.z1 / cell); cz++) {
      for (const i of cells.get(`${cx},${cz}`) ?? []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const r = rectOf(items[i]);
        if (r.x1 >= q.x0 && r.x0 <= q.x1 && r.z1 >= q.z0 && r.z0 <= q.z1) out.push(items[i]);
      }
    }
  }
  return out;
}
