import { brandPalette, material } from './brandPalette';
import { CATALOG_ITEMS } from '@pascal-app/editor/catalog';

// Builds a Pascal scene graph ({ nodes, rootNodeIds, ... }) for the inside of a building.
//   - one level per floor (floor count comes from the building's height, see floorsForHeight)
//   - each level: floor slab, 4 walls, windows, furniture; the ground floor also has the front door
//   - floors are joined by a spiral staircase in the north-east corner
// Room size and layout follow the building type (office / restaurant / shop) and variant. Layouts
// are functions of the room size, so a bigger room gets more desks / tables / shelves rather than
// the same furniture spread out. Furniture comes from Pascal's catalog; doors and windows use the
// /items models in public/.

const PI = Math.PI;
const HALF_PI = PI / 2;
const STOREY_HEIGHT = 2.5; // Pascal's default wall height, used as the floor-to-floor height
const STAIR_SIZE = 2.7; // square kept clear in the NE corner of every floor of a multi-floor building

const DOOR_ASSET = {
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

const WINDOW_ASSET = {
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

const range = (from, to, step) => {
  const out = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
};

// Room size (metres) per building type / variant: offices are the largest, shops the smallest.
const ROOM_SIZES = {
  office: [12, 8],
  restaurant: [10, 7],
  shop: [8, 6],
  house: [8, 6],
  'shop/market': [10, 7],
  'shop/arcade': [9, 6],
};

// Prime buildings are bigger inside too: 4 wider and 2 deeper. A luxury estate is 8 wider and 4 deeper; a grand estate 12 and 6.
export function interiorRoomSize(type, variant, prime = false, luxury = false, grand = false) {
  const size = ROOM_SIZES[`${type}/${variant}`] ?? ROOM_SIZES[type] ?? ROOM_SIZES.office;
  return { width: size[0] + (grand ? 12 : luxury ? 8 : prime ? 4 : 0), depth: size[1] + (grand ? 6 : luxury ? 4 : prime ? 2 : 0) };
}

// One floor per ~1.2 units of building height.
export function floorsForHeight(height) {
  return Math.max(1, Math.round((height ?? 0) / 1.2));
}

// Rotation y: 0 faces +Z (into the room from the north wall), PI faces -Z (south wall), -PI/2
// faces -X (east wall), PI/2 faces +X (west wall). Item rows are [catalogId, x, z, rotationY, y?];
// y lifts an item onto a surface. `doorX` is where the front door sits on the south wall.
// Windows are on the north wall every 4 m starting at x = 2.
const LAYOUTS = {
  'office/openplan': {
    color: '#14b8a6',
    build(W, D) {
      const items = [
        ['sofa', 1.85, D - 0.65, PI],
        ['coffee-table', 1.85, D - 1.7, 0],
        ['small-indoor-plant', 0.5, D - 0.6, 0],
        ['indoor-plant', 0.6, 3.0, 0],
      ];
      // Desk rows, each desk with a chair behind it; the reception corner keeps the front-left free.
      range(0.7, D - 2.4, 2).forEach((z, row) => {
        const xs = row === 0 ? range(1.6, W - 1.8, 2.4) : range(4.2, W - 1.8, 2.4);
        xs.forEach((x) => items.push(['standing-desk-mo8wgz95', x, z, 0], ['herman-miller-aeron-mo8x36k9', x, z + 0.85, PI]));
      });
      range(D - 4, D - 2.1, 0.95).forEach((z) => items.push(['bookshelf', W - 0.2, z, -HALF_PI]));
      return { doorX: W - 1.2, items };
    },
  },
  'office/meetings': {
    color: '#14b8a6',
    build(W, D) {
      const tables = W >= 12 ? 3 : 2;
      const tableZ = Math.min(3, D / 2 - 0.4);
      const x0 = W / 2 - 1.08 * tables;
      const items = [];
      for (let i = 0; i < tables; i++) items.push(['dining-table', x0 + 1.08 + i * 2.16, tableZ, 0]);
      range(x0 + 0.55, x0 + 2.16 * tables - 0.5, 1.1).forEach((x) => {
        items.push(['office-chair', x, tableZ - 0.95, 0], ['office-chair', x, tableZ + 0.95, PI]);
      });
      items.push(
        ['herman-miller-aeron-mo8x36k9', x0 - 0.5, tableZ, HALF_PI],
        ['herman-miller-aeron-mo8x36k9', x0 + 2.16 * tables + 0.5, tableZ, -HALF_PI],
        ['television', 4, 0.3, 0],
        ['cabinet', 0.5, D - 3.4, HALF_PI],
        ['coat-rack', 0.5, D - 0.7, 0],
        ['floor-lamp', W - 0.5, D - 2.1, 0],
        ['indoor-plant', W - 0.7, 0.7, 0]
      );
      return { doorX: W - 1.2, items };
    },
  },
  'restaurant/diner': {
    color: '#dc2626',
    build(W, D) {
      const items = [['small-indoor-plant', 0.5, D - 0.6, 0]];
      // Dining room: a grid of tables with four chairs each.
      range(1.6, D - 2.4, 2.2).forEach((z) => {
        range(1.9, W - 2.2, 2.7).forEach((x) => {
          items.push(
            ['dining-table', x, z, 0],
            ['dining-chair', x - 0.5, z - 0.8, 0],
            ['dining-chair', x + 0.5, z - 0.8, 0],
            ['dining-chair', x - 0.5, z + 0.8, PI],
            ['dining-chair', x + 0.5, z + 0.8, PI]
          );
        });
      });
      // Kitchen line along the east wall.
      items.push(['stove', W - 0.45, 0.5, -HALF_PI]);
      range(1.9, D - 1.9, 1.95).forEach((z) => items.push(['kitchen-counter', W - 0.35, z, -HALF_PI]));
      items.push(['fridge', W - 0.4, D - 1.25, -HALF_PI]);
      return { doorX: 3.4, items };
    },
  },
  'restaurant/cafe': {
    color: '#dc2626',
    build(W, D) {
      const barX = W / 2;
      const items = [
        ['wooden-kitchen-bar-moa2hhh4', barX, 0.6, 0],
        ['coffee-machine', barX + 0.6, 0.6, 0, 1.06],
        ...[-1, -0.3, 0.4, 1.1].map((dx) => ['stool', barX + dx, 1.5, PI]),
        ['indoor-plant', 0.4, D - 0.45, 0],
        ['indoor-plant', W - 0.6, D - 0.6, 0],
        ['floor-lamp', W - 0.6, 0.8, 0],
      ];
      const seat = (x, z) =>
        items.push(
          ['dining-table', x, z, 0],
          ['dining-chair', x - 0.5, z - 0.8, 0],
          ['dining-chair', x + 0.5, z - 0.8, 0],
          ['dining-chair', x - 0.5, z + 0.8, PI],
          ['dining-chair', x + 0.5, z + 0.8, PI]
        );
      range(1.5, W - 2.4, 2.7).forEach((x) => seat(x, 3.3));
      [1.5, W - 3.1].forEach((x) => seat(x, D - 1.5));
      return { doorX: 3.4, items };
    },
  },
  'shop/boutique': {
    color: '#f59e0b',
    build(W, D) {
      const items = [['small-indoor-plant', 0.5, D - 0.6, 0], ['round-carpet', W / 2 + 0.5, D - 1.6, 0]];
      range(1.2, D - 2.5, 2.05).forEach((z) => items.push(['closet', 0.35, z, HALF_PI]));
      range(2.2, W - 3.5, 1).forEach((x) => items.push(['coat-rack', x, 1.6, 0]));
      range(3.5, W - 2.3, 2).forEach((x) => items.push(['dresser', x, 3.3, 0]));
      items.push(['cabinet', W - 0.85, 4, -HALF_PI], ['ikea-kallax-1x4-moa2y49n', W - 0.6, 1, -HALF_PI], ['ikea-kallax-1x4-moa2y49n', W - 0.6, 2.2, -HALF_PI]);
      return { doorX: 5.2, items };
    },
  },
  'shop/market': {
    color: '#f59e0b',
    build(W, D) {
      const items = [];
      // Aisles of back-to-back shelving.
      [2, 4.2].forEach((z) => {
        range(1.6, W - 2.6, 1).forEach((x) => items.push(['bookshelf', x, z, 0], ['bookshelf', x, z + 0.4, PI]));
      });
      // Coolers along the east wall.
      range(1, D - 3.2, 0.78).forEach((z) => items.push(['fridge', W - 0.45, z, -HALF_PI]));
      // Checkout.
      items.push(['kitchen-counter', W - 3.3, D - 0.9, 0], ['fruits', W - 3.3, D - 0.9, 0, 0.73]);
      return { doorX: 4, items };
    },
  },
  'shop/arcade': {
    color: '#ec4899',
    build(W, D) {
      const items = [
        ['pool-table', 2.3, D / 2, 0],
        ['stool', 4.3, D / 2 - 0.6, 0],
        ['stool', 4.3, D / 2 + 0.6, 0],
        ['tv-stand', W / 2 + 0.7, 0.4, 0],
        ['television', W / 2 + 0.7, 0.4, 0, 0.35],
        ['sofa', W / 2 + 0.6, D - 0.7, PI],
        ['floor-lamp', 0.6, D - 0.7, 0],
      ];
      range(2.5, D - 1.8, 1.7).forEach((z) => items.push(['basket-hoop', W - 0.6, z, -HALF_PI]));
      return { doorX: W - 1.2, items };
    },
  },
  // An Old Town house: living room, kitchen corner and a dining table.
  'house/cottage': {
    color: '#a8a29e',
    build(W, D) {
      return {
        doorX: W - 1.2,
        items: [
          ['rectangular-carpet', 2.6, 4.2, 0],
          ['sofa', 2.6, D - 0.65, PI],
          ['coffee-table', 2.6, 4.1, 0],
          ['tv-stand', 2.6, 0.4, 0],
          ['television', 2.6, 0.4, 0, 0.35],
          ['floor-lamp', 0.6, D - 0.7, 0],
          ['dining-table', 6, 2.4, 0],
          ['dining-chair', 5.5, 1.6, 0],
          ['dining-chair', 6.5, 1.6, 0],
          ['dining-chair', 5.5, 3.2, PI],
          ['dining-chair', 6.5, 3.2, PI],
          ['kitchen-counter', W - 0.35, 2.6, -HALF_PI],
          ['fridge', W - 0.4, 4.0, -HALF_PI],
          ['indoor-plant', 0.6, 1.2, 0],
        ],
      };
    },
  },
  // Upper floors of restaurants and shops (offices alternate between their two layouts).
  'restaurant/lounge': {
    color: '#dc2626',
    build(W, D) {
      const items = [['piano', 0.5, D - 2.2, HALF_PI], ['indoor-plant', 0.6, D - 0.6, 0], ['floor-lamp', W - 0.6, D - 0.6, 0]];
      range(1.9, W - 2.2, 2.7).forEach((x) => {
        [1.6, 3.8].forEach((z) => {
          items.push(
            ['dining-table', x, z, 0],
            ['dining-chair', x - 0.5, z - 0.8, 0],
            ['dining-chair', x + 0.5, z - 0.8, 0],
            ['dining-chair', x - 0.5, z + 0.8, PI],
            ['dining-chair', x + 0.5, z + 0.8, PI]
          );
        });
      });
      return { items };
    },
  },
  'shop/showroom': {
    color: '#f59e0b',
    build(W, D) {
      const items = [
        ['round-carpet', 3.2, 3.2, 0],
        ['sofa', 3.2, 4.6, PI],
        ['coffee-table', 3.2, 3.0, 0],
        ['floor-lamp', 1.0, 4.6, 0],
        ['dresser', 5.4, 3.4, 0],
        ['cabinet', W - 0.85, 4, -HALF_PI],
        ['indoor-plant', 0.6, 1.2, 0],
        ['small-indoor-plant', 0.5, D - 0.6, 0],
      ];
      return { items };
    },
  },
};

function upperLayoutKey(type, baseKey, floor) {
  if (type === 'office') return floor % 2 === 1 ? (baseKey === 'office/openplan' ? 'office/meetings' : 'office/openplan') : baseKey;
  if (type === 'restaurant') return 'restaurant/lounge';
  return 'shop/showroom';
}

// Falls back to the type's first layout, then to the generic open-plan office, for plots without a
// type (older data) or with an unknown variant.
export function interiorLayoutKey(plot) {
  const data = plot?.interiorData;
  const type = data?.theme;
  const key = `${type}/${data?.variant}`;
  if (LAYOUTS[key] && !key.endsWith('/lounge') && !key.endsWith('/showroom')) return key;
  return Object.keys(LAYOUTS).find((k) => k.startsWith(`${type}/`)) ?? 'office/openplan';
}

export function interiorFloorsFor(plot) {
  return plot?.interiorData?.floors ?? floorsForHeight(plot?.height);
}

// For the modal footer: layout name, floors and room size.
export function interiorSummaryFor(plot) {
  const key = interiorLayoutKey(plot);
  const [type, variant] = key.split('/');
  return { label: key.replace('/', ' · '), floors: interiorFloorsFor(plot), prime: Boolean(plot?.interiorData?.prime), ...interiorRoomSize(type, variant, plot?.interiorData?.prime, plot?.interiorData?.luxury, plot?.interiorData?.grand) };
}

let counter = 0;
const nextId = (prefix) => `${prefix}_${(++counter).toString(36).padStart(16, '0')}`;

function assetFromCatalog(id) {
  const entry = CATALOG_ITEMS.find((item) => item.id === id);
  if (!entry) return null;
  const { id: assetId, category, name, thumbnail, src, dimensions, offset, rotation, scale, attachTo, surface } = entry;
  return { id: assetId, category, name, thumbnail, src, dimensions, offset, rotation, scale, ...(attachTo && { attachTo }), ...(surface && { surface }) };
}

function node(type, parentId, extra) {
  const id = nextId(type);
  return { id, node: { object: 'node', id, type, parentId, visible: true, metadata: {}, ...extra } };
}

// Floor-plan footprint of a catalog item at (x, z) with rotation y (quarter turns swap width/depth).
function footprint(asset, x, z, rotY) {
  const quarter = Math.abs(Math.sin(rotY)) > 0.7;
  const w = quarter ? asset.dimensions[2] : asset.dimensions[0];
  const d = quarter ? asset.dimensions[0] : asset.dimensions[2];
  return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
}

export function buildInteriorScene(plot) {
  const baseKey = interiorLayoutKey(plot);
  const [type, variant] = baseKey.split('/');
  const floors = interiorFloorsFor(plot);
  const { width: W, depth: D } = interiorRoomSize(type, variant, plot?.interiorData?.prime, plot?.interiorData?.luxury, plot?.interiorData?.grand);
  const multiFloor = floors > 1;
  const stairBox = { x0: W - STAIR_SIZE, x1: W, z0: 0, z1: STAIR_SIZE };

  const nodes = {};
  const add = ({ id, node: n }) => {
    nodes[id] = n;
    return n;
  };

  const building = add(node('building', null, { children: [], position: [0, 0, 0], rotation: [0, 0, 0] }));
  const polygon = [[0, 0], [W, 0], [W, D], [0, D]];
  const corners = [[0, 0], [W, 0], [W, D], [0, D]];
  const levels = [];
  const palette = brandPalette(plot); // the colours of this business's inside
  let entranceX = W / 2;

  for (let floor = 0; floor < floors; floor++) {
    const key = floor === 0 ? baseKey : upperLayoutKey(type, baseKey, floor);
    const layout = LAYOUTS[key];
    const { doorX, items } = layout.build(W, D);
    if (floor === 0) entranceX = doorX;

    const level = add(node('level', building.id, { children: [], level: floor, height: STOREY_HEIGHT }));
    building.children.push(level.id);
    levels.push(level);

    level.children.push(add(node('slab', level.id, { name: 'Floor', polygon, elevation: 0.05 })).id);
    level.children.push(add(node('zone', level.id, { name: `${key} (floor ${floor + 1})`, polygon, color: layout.color })).id);

    // Walls run clockwise: north (0), east (1), south (2, holds the front door), west (3). Their front side is the room's inside and their
    // back the outside: the viewer's cut view (WallCutout) uses that to cut away the walls that face the camera.
    const walls = corners.map((start, i) => {
      // the back wall (north, 0) is the brand colour; the others a pale tint of it
      const wall = add(node('wall', level.id, { children: [], start, end: corners[(i + 1) % 4], frontSide: 'interior', backSide: 'exterior', interiorMaterial: material(i === 0 ? palette.accent : palette.wall, 'double'), interiorMaterialPreset: undefined }));
      level.children.push(wall.id);
      return wall;
    });

    const attachToWall = (wall, asset, along, y) => {
      wall.children.push(add(node('item', wall.id, { name: asset.name, position: [along, y, 0], rotation: [0, 0, 0], side: 'front', asset })).id);
    };
    range(2, W - 1.5, 4).forEach((x) => attachToWall(walls[0], WINDOW_ASSET, x, 0.5));
    if (floor === 0) attachToWall(walls[2], DOOR_ASSET, W - doorX, 0); // the south wall runs east -> west

    for (const [catalogId, x, z, rotY, y = 0] of items) {
      const asset = assetFromCatalog(catalogId);
      if (!asset) continue; // skip anything the installed catalog doesn't have
      if (multiFloor && y === 0) {
        const f = footprint(asset, x, z, rotY);
        if (f.x1 > stairBox.x0 && f.x0 < stairBox.x1 && f.z1 > stairBox.z0 && f.z0 < stairBox.z1) continue; // stairwell
      }
      level.children.push(add(node('item', level.id, { name: asset.name, position: [x, y, z], rotation: [0, rotY, 0], asset })).id);
    }
  }

  // A spiral staircase from each floor up to the next, in the north-east corner.
  levels.slice(0, -1).forEach((level, i) => {
    level.children.push(
      add(
        node('stair', level.id, {
          position: [W - STAIR_SIZE / 2, 0, STAIR_SIZE / 2],
          rotation: 0,
          stairType: 'spiral',
          fromLevelId: level.id,
          toLevelId: levels[i + 1].id,
          innerRadius: 0.25,
          width: 0.9,
          stepCount: 12,
          sweepAngle: PI * 2,
          slabOpeningMode: 'destination',
          railingMode: 'both',
          children: [],
        })
      ).id
    );
  });

  return {
    nodes,
    rootNodeIds: [building.id],
    buildingId: building.id,
    levelIds: levels.map((l) => l.id),
    room: { width: W, depth: D },
    doorX: entranceX,
    floors,
    storeyHeight: STOREY_HEIGHT,
  };
}

export const INTERIOR_LAYOUT_KEYS = Object.keys(LAYOUTS);
export const INTERIOR_STAIR_SIZE = STAIR_SIZE;
