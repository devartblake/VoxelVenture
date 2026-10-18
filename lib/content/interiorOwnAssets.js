// The project's own interior assets, which are not in the Pascal catalogue: the front door and the windows of the generated rooms
// (the /items models in apps/web/public/). On their own (no catalogue), so the API accepts exactly these ids beside the catalogue's
// (lib/content/interiorDesign.js) and the game builds and reloads rooms with the very same assets (lib/content/interiorScenes.js).
export const DOOR_ASSET = {
  id: 'door',
  category: 'door',
  name: 'door',
  thumbnail: '/items/door/thumbnail.webp',
  src: '/items/door/model.glb',
  dimensions: [1.5, 2, 0.4],
  attachTo: 'wall',
  offset: [-0.43, 0, 0],
  rotation: [0, 0, 0],
  scale: [0.8, 0.8, 0.8],
};

export const WINDOW_ASSET = {
  id: 'window-large',
  category: 'window',
  name: 'window-large',
  thumbnail: '/items/window-large/thumbnail.webp',
  src: '/items/window-large/model.glb',
  dimensions: [2, 2, 0.4],
  attachTo: 'wall',
  offset: [0, 1, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export const OWN_ASSETS = [DOOR_ASSET, WINDOW_ASSET];
export const OWN_ASSET_IDS = OWN_ASSETS.map((a) => a.id);
