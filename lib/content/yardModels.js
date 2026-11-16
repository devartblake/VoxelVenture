// The yards owners can put behind their building that are made of Kenney models (docs/product/yard_items.md): a tropical garden, a fenced garden, a market yard, a depot yard and a campfire grill.
// Pure data. lib/content/backyards.js fits them to the free ground behind a lot and gives them to apps/web/components/city/Crowns.jsx, which draws them with the prop models (instanced: one draw call a model, however many lots).
//
// A model is { id, at: [x, z], h?, yaw? } or a row { id, row: [from, to, n, z], h? } in the same frame as backyards.js: x across the back of the building as a fraction of its width (-0.5 to 0.5),
// z away from the back wall as a fraction of the room (0 to 1). `h` is the height in world units the model is drawn at (a building floor is 1.2; a car is about 0.25 high); a row's pieces
// are scaled to fill their share of the width. `ground` is the lawn, sand or gravel under it (a flat slab). `suits` are the kinds of business it is offered first to.
export const YARD_PRESETS = [
  {
    id: 'tropical', label: 'Tropical garden', hint: 'Palms, flowers and a stone path', suits: ['house', 'restaurant', 'shop'], ground: '#4ade80',
    models: [
      { id: 'nature/tree_palm', at: [-0.38, 0.3], h: 1.35 }, { id: 'nature/tree_palmShort', at: [0.4, 0.72], h: 0.95 }, { id: 'nature/tree_palmBend', at: [0.34, 0.18], h: 1.1, yaw: 2.4 },
      { id: 'nature/flower_redA', at: [-0.1, 0.55], h: 0.2 }, { id: 'nature/flower_yellowA', at: [0.05, 0.4], h: 0.18 }, { id: 'nature/flower_purpleA', at: [-0.2, 0.82], h: 0.2 },
      { id: 'nature/plant_flatTall', at: [0.12, 0.88], h: 0.22 }, { id: 'nature/path_stone', at: [0, 0.14], h: 0.04 },
    ],
  },
  {
    id: 'fenced', label: 'Fenced garden', hint: 'A low fence round a lawn with flowers', suits: ['house', 'shop', 'office'], ground: '#86efac',
    models: [
      { id: 'nature/fence_simple', row: [-0.5, 0.5, 6, 0.97], h: 0.2 }, { id: 'nature/fence_gate', row: [-0.08, 0.08, 1, 0.97], h: 0.2 },
      { id: 'nature/flower_redA', at: [-0.3, 0.55], h: 0.2 }, { id: 'nature/flower_purpleA', at: [-0.22, 0.65], h: 0.2 }, { id: 'nature/flower_yellowA', at: [0.28, 0.5], h: 0.18 },
      { id: 'nature/pot_large', at: [0.38, 0.8], h: 0.12 }, { id: 'nature/grass_large', at: [0, 0.4], h: 0.15 }, { id: 'nature/sign', at: [-0.4, 0.88], h: 0.22 },
    ],
  },
  {
    id: 'market-yard', label: 'Market yard', hint: 'Stalls, pumpkins and melons', suits: ['shop', 'restaurant'], ground: '#d6c4a0',
    models: [
      { id: 'coaster/stall-food', at: [-0.27, 0.5], h: 0.6 }, { id: 'coaster/stall-drinks', at: [0.27, 0.5], h: 0.6 },
      { id: 'nature/crop_pumpkin', at: [-0.05, 0.25], h: 0.14 }, { id: 'nature/crop_melon', at: [0.06, 0.3], h: 0.14 }, { id: 'nature/crop_carrot', at: [0, 0.78], h: 0.2 },
      { id: 'nature/crop_pumpkin', at: [-0.4, 0.88], h: 0.14 }, { id: 'nature/sign', at: [0.42, 0.9], h: 0.22 },
    ],
  },
  {
    id: 'depot', label: 'Depot yard', hint: 'Containers, a tank and solar panels', suits: ['office', 'shop'], ground: '#a8a29e',
    models: [
      { id: 'industrial/shipping-container-a', at: [-0.38, 0.4], h: 0.38 }, { id: 'industrial/shipping-container-b', at: [-0.17, 0.4], h: 0.38 }, { id: 'industrial/shipping-container-c', at: [-0.28, 0.82], h: 0.38, yaw: 1.5708 },
      { id: 'industrial/detail-tank', at: [0.33, 0.3], h: 0.3 }, { id: 'industrial/chimney-small', at: [0.4, 0.78], h: 0.6 }, { id: 'industrial/solar-panel-landscape-group', at: [0.12, 0.82], h: 0.2 },
    ],
  },
  {
    id: 'campfire', label: 'Campfire grill', hint: 'A fire pit, logs and a tent', suits: ['restaurant'], ground: '#78716c',
    models: [
      { id: 'nature/campfire_stones', at: [0, 0.45], h: 0.07 }, { id: 'nature/log_stack', at: [-0.34, 0.35], h: 0.25 }, { id: 'nature/stump_round', at: [-0.16, 0.8], h: 0.12 }, { id: 'nature/stump_round', at: [0.18, 0.8], h: 0.12, yaw: 1 },
      { id: 'nature/tent_smallOpen', at: [0.38, 0.55], h: 0.4, yaw: 3.14 }, { id: 'nature/log', at: [0.12, 0.2], h: 0.1, yaw: 0.6 },
    ],
  },
];

export const YARD_IDS = YARD_PRESETS.map((p) => p.id);
export const yardPreset = (id) => YARD_PRESETS.find((p) => p.id === id) ?? null;
/** Every model id the yards use (the prop catalogue's ids), for loading. */
export const YARD_MODEL_IDS = [...new Set(YARD_PRESETS.flatMap((p) => p.models.map((m) => m.id)))];
