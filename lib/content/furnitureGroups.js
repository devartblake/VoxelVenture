// The editor's furniture, sorted into the groups people look for. Pascal's own catalogue has five broad categories and hundreds of tags; a
// shop owner thinks in "shelves", "seating", "lights". Each item goes in the first group whose pattern matches its id or name; `featured`
// is a short list of what most shops want first. Pure, so it is tested in Node.
export const FURNITURE_GROUPS = [
  { id: 'shop', label: 'Shop & display', hint: 'Shelves, racks, mirrors and pictures', match: /shelf|bookshelf|coat.?rack|closet|dresser|picture|mirror|column|pillar|easel|drying.?rack/i },
  { id: 'seating', label: 'Seating', hint: 'Chairs, sofas and stools', match: /chair|sofa|stool|lounge|sunbed|bench/i },
  { id: 'lighting', label: 'Lighting & decor', hint: 'Lamps, carpets and fireplaces', match: /lamp|light|carpet|rug|fireplace|trash|bin|fan\b/i },
  { id: 'tables', label: 'Tables & desks', hint: 'Counters, tables and desks', match: /table|desk|counter|tv.?stand|kitchen.?bar|pool/i },
  { id: 'bedroom', label: 'Bedroom', hint: 'Beds and bedside furniture', match: /bed|bunk/i },
  { id: 'kitchen', label: 'Kitchen & dining', hint: 'Cooking, cafe and dining', match: /kitchen|fridge|stove|microwave|hood|frying|cutting|fruit|wine|toaster|kettle|coffee|dishwasher|utensil/i },
  { id: 'bathroom', label: 'Bathroom & laundry', hint: 'Sinks, showers and laundry', match: /bath|shower|toilet|sink|washing|laundry|iron/i },
  { id: 'plants', label: 'Plants & trees', hint: 'Indoor plants, bushes and trees', match: /plant|cactus|bush|palm|fir\b|tree|flower/i },
  { id: 'tech', label: 'Screens & technology', hint: 'TVs, computers, speakers', match: /television|computer|stereo|speaker|keypad|sewing|panel|thermostat|outlet|charger|conditioning|ac block/i },
  { id: 'safety', label: 'Safety & building', hint: 'Detectors, signs, hydrants', match: /detector|smoke|fire|exit|sprinkler|hydrant|alarm/i },
  { id: 'fun', label: 'Play, music & fitness', hint: 'Instruments, games, gym', match: /piano|guitar|barbell|treadmill|threadmill|toy|ball|hoop|skate|scooter|playhouse|books|billiard/i },
  { id: 'outdoor', label: 'Outdoor & vehicles', hint: 'Umbrellas, parking, cars', match: /parking|umbrella|carb\b/i },
];
export const OTHER_GROUP = { id: 'other', label: 'More', hint: 'Everything else' };

// Items most shops start with, by catalogue id or name.
export const FEATURED = /^(shelf|bookshelf|coat.?rack|kitchen.?counter|dining.?table|coffee.?table|office.?table|sofa|dining.?chair|office.?chair|stool|table.?lamp|floor.?lamp|ceiling.?lamp|rectangular.?carpet|picture|rounded.?mirror|indoor.?plant|television|computer|trash.?bin)/i;

export function groupOf(item) {
  const text = `${item.id ?? ''} ${item.name ?? ''}`;
  for (const g of FURNITURE_GROUPS) if (g.match.test(text)) return g.id;
  return OTHER_GROUP.id;
}

// [{ ...group, items }] for the groups that have items, in order, with a "Popular for shops" group first when `featured` is wanted.
export function groupItems(items, { featured = true } = {}) {
  const buckets = new Map([...FURNITURE_GROUPS, OTHER_GROUP].map((g) => [g.id, { ...g, items: [] }]));
  for (const it of items) buckets.get(groupOf(it)).items.push(it);
  const groups = [...buckets.values()].filter((g) => g.items.length);
  for (const g of groups) g.items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (featured) {
    const top = items.filter((i) => FEATURED.test(i.id ?? '') || FEATURED.test(i.name ?? ''));
    if (top.length) groups.unshift({ id: 'popular', label: 'Popular for shops', hint: 'Where most owners start', items: top.sort((a, b) => String(a.name).localeCompare(String(b.name))) });
  }
  return groups;
}
