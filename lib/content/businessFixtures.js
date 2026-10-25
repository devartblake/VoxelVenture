// What furniture and fixtures suit which kind of business. The owner says what the business is (shop, restaurant, office, house, and the layout they
// picked), and the editor's furniture menu starts from what that business needs: a restaurant sees kitchen gear, tables and seating first, a shop sees
// shelves and counters. Everything is still there under "Show all furniture". Pure, so it is tested in Node.
import { FURNITURE_GROUPS, OTHER_GROUP, groupOf } from './furnitureGroups';

// `groups` are furniture group ids (see furnitureGroups.js) in the order a business of this kind would want them; `essentials` picks the few items it
// cannot do without, shown first as "Essentials for your <label>".
export const BUSINESS_KITS = {
  shop: {
    label: 'shop',
    groups: ['shop', 'tables', 'seating', 'lighting', 'plants', 'tech', 'outdoor'],
    essentials: /^(shelf|bookshelf|coat.?rack|closet|dresser|rounded.?mirror|kitchen.?counter|coffee.?table|stool|table.?lamp|floor.?lamp|ceiling.?lamp|rectangular.?carpet|picture|indoor.?plant|television|computer|trash.?bin)/i,
  },
  restaurant: {
    label: 'restaurant',
    groups: ['kitchen', 'tables', 'seating', 'lighting', 'plants', 'tech', 'outdoor', 'bathroom'],
    essentials: /^(kitchen.?counter|kitchen.?cabinet|dining.?table|dining.?chair|stool|fridge|stove|microwave|coffee|wine|sink|table.?lamp|ceiling.?lamp|indoor.?plant|television|trash.?bin|umbrella)/i,
  },
  office: {
    label: 'office',
    groups: ['tables', 'seating', 'tech', 'shop', 'lighting', 'plants', 'safety', 'kitchen'],
    essentials: /^(office.?table|office.?chair|computer|television|bookshelf|shelf|filing|sofa|coffee.?table|floor.?lamp|ceiling.?lamp|indoor.?plant|trash.?bin|printer|coffee)/i,
  },
  house: {
    label: 'home',
    groups: ['seating', 'bedroom', 'kitchen', 'tables', 'bathroom', 'lighting', 'plants', 'tech', 'fun', 'shop'],
    essentials: /^(sofa|single.?bed|double.?bed|bed|dining.?table|dining.?chair|coffee.?table|tv.?stand|television|fridge|stove|toilet|shower|sink|table.?lamp|floor.?lamp|rectangular.?carpet|indoor.?plant)/i,
  },
};

// A layout can change the emphasis: a cafe is a restaurant that leans on counters and coffee, a market a shop with outdoor stalls, a meeting-room
// office wants a big table and screens.
export const VARIANT_KITS = {
  'shop/market': { label: 'market stall', lead: ['outdoor'] },
  'restaurant/cafe': { label: 'cafe', lead: ['tables', 'kitchen'] },
  'restaurant/diner': { label: 'diner', lead: ['seating', 'tables'] },
  'office/meetings': { label: 'meeting-room office', lead: ['tables', 'tech'] },
};

export function kitFor(type, variant) {
  const base = BUSINESS_KITS[type] ?? BUSINESS_KITS.shop;
  const v = VARIANT_KITS[`${type}/${variant}`];
  const lead = v?.lead ?? [];
  return { type, variant, label: v?.label ?? base.label, groups: [...lead, ...base.groups.filter((g) => !lead.includes(g))], essentials: base.essentials };
}

// The menu for a business: [{ id, label, hint, items, essential?, more? }].
//   - "Essentials for your <label>" first (the items the kit names), then the kit's groups in its order;
//   - with `showAll`, every other group follows (marked `more`), so nothing is ever out of reach.
export function menuFor(items, kit, { showAll = false } = {}) {
  const byGroup = new Map();
  for (const it of items) {
    const g = groupOf(it);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(it);
  }
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const info = new Map([...FURNITURE_GROUPS, OTHER_GROUP].map((g) => [g.id, g]));
  const out = [];
  const top = items.filter((i) => kit.essentials.test(i.id ?? '') || kit.essentials.test(i.name ?? '')).sort(byName);
  if (top.length) out.push({ id: 'essentials', label: `Essentials for your ${kit.label}`, hint: 'Where most owners of this kind of business start', items: top, essential: true });
  for (const id of kit.groups) {
    const list = byGroup.get(id);
    if (list?.length) out.push({ ...info.get(id), items: [...list].sort(byName) });
  }
  if (showAll) for (const [id, list] of byGroup) if (!kit.groups.includes(id)) out.push({ ...info.get(id), items: [...list].sort(byName), more: true });
  return out;
}

// Which kinds of business an item suits (for the price sheet): the kits whose groups hold it.
export function suitedFor(item) {
  const g = groupOf(item);
  return Object.keys(BUSINESS_KITS).filter((t) => BUSINESS_KITS[t].groups.includes(g));
}
