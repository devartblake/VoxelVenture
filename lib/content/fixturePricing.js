// What the fixtures in a building are worth, and so what the business is worth. The prices are in fixturePrices.js (all 0 until you set them). Pure.
import { FIXTURE_PRICES } from './fixturePrices';
import { groupOf } from './furnitureGroups';

// The price of one catalogue item: its own price, else its group's default, else 0.
export function priceOf(item, prices = FIXTURE_PRICES) {
  const own = prices.items?.[item?.id];
  if (Number.isFinite(own) && own >= 0) return own;
  const group = prices.defaults?.[groupOf(item ?? {})];
  return Number.isFinite(group) && group >= 0 ? group : 0;
}

// True once any price is set (the editor and the dashboard only show prices then).
export const pricesConfigured = (prices = FIXTURE_PRICES) => Object.values(prices.items ?? {}).some((p) => p > 0) || Object.values(prices.defaults ?? {}).some((p) => p > 0);

// The items placed in a scene graph ({ nodes }), as [{ id, name, count }] sorted by name. Doors and windows built into the walls are not furniture.
export function fixtureList(graph) {
  const counts = new Map();
  for (const n of Object.values(graph?.nodes ?? {})) {
    if (n?.type !== 'item' || !n.asset?.id) continue;
    if (/^(door|window)/i.test(n.asset.id)) continue;
    const row = counts.get(n.asset.id) ?? { id: n.asset.id, name: n.asset.name ?? n.asset.id, category: n.asset.category, count: 0 };
    row.count++;
    counts.set(n.asset.id, row);
  }
  return [...counts.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function fixturesValue(graph, prices = FIXTURE_PRICES) {
  const list = fixtureList(graph);
  return { count: list.reduce((a, r) => a + r.count, 0), kinds: list.length, value: Math.round(list.reduce((a, r) => a + priceOf(r, prices) * r.count, 0)) };
}

// A business's worth: what the place is worth (its plot or store value) plus what you put in it, scaled by `worthFactor`.
export function businessWorth(plot, graph, prices = FIXTURE_PRICES) {
  const f = fixturesValue(graph, prices);
  return { base: plot?.value ?? 0, fixtures: f.value, count: f.count, total: Math.round((plot?.value ?? 0) + f.value * (prices.worthFactor ?? 1)) };
}
