// An owner's redesigned interior as the server keeps it, and the checks it passes first. Pure, so the API and the game use the same rules.
//
//   design = { nodes: { [id]: node }, rootNodeIds: [buildingId] }      (contract interior.design v1, packages/shared-types)
//
// A design is the Pascal editor's scene graph with only what the inside of a building needs: a building, its levels, and on each level the
// floor slab, the zone, the walls (with their doors and windows), the furniture and the stairs. Everything else is refused or left out:
//   - only those node types; at most MAX_NODES nodes and MAX_LEVELS floors; every parent and child is a node of the design
//   - every number finite, every position inside the plot's room (with a metre to spare), every size no bigger than the room
//   - furniture by catalogue id only: an item's asset is { id }, and the id must be in the Pascal catalogue or be one of the project's own door and window models
//     (lib/content/interiorOwnAssets.js).
//     The client fills in the rest from the catalogue when it loads the design (withCatalogAssets in lib/content/interiorScenes.js), so the
//     stored design never depends on where the prop files are served from
//   - no free text: names, room numbers and marks are left out (they would be shown to every visitor without moderation), and any other
//     string is a short token (a colour, a preset, an enum value, an id)
//   - the editor's bookkeeping (metadata, camera, provenance, collections, procedural sources) is left out
import { CATALOG_ITEM_IDS } from './interiorAssetIds';
import { interiorRoomSize } from './interiorRooms';
import { OWN_ASSET_IDS } from './interiorOwnAssets';

export const DESIGN_VERSION = 1; // the version of the contract a design fits (interior.design)
export const MAX_DESIGN_BYTES = 512 * 1024; // the design as stored, in JSON. The largest generated interior (9 floors, a grand office) is about 200 KB
export const MAX_BODY_BYTES = 1024 * 1024; // what a PUT may send: room for a design whose assets were sent whole
export const MAX_NODES = 2000; // the largest generated interior has 634
export const MAX_LEVELS = 12;
// the furniture a design may name: the catalogue's, and the project's own door and windows of the generated rooms
const ASSET_IDS = new Set([...CATALOG_ITEM_IDS, ...OWN_ASSET_IDS]);

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_#.-]{0,64}$/;
const MARGIN = 1; // metres a design may reach past the room's walls
const MAX_Y = 6; // metres above a floor
// The fields kept, per node type, besides object, id, type, parentId, visible and children: Pascal's own fields of that type
// (@pascal-app/core schema/nodes), without free text and bookkeeping.
const FIELDS = {
  building: ['position', 'rotation'],
  level: ['level', 'baseElevation', 'height'],
  slab: ['material', 'materialPreset', 'slots', 'polygon', 'holes', 'holeMetadata', 'elevation', 'floorHeight', 'referenceFloorElevation', 'foundation', 'thickness', 'recessed', 'recessedRimElevation', 'fillToTerrain', 'boundary', 'support', 'plateRole', 'railing', 'zoneIds', 'associatedZoneIds', 'autoFromWalls'],
  zone: ['polygon', 'holes', 'autoFromWalls', 'boundaryWallIds', 'boundarySeparatorIds', 'hostZoneId', 'seed', 'floor', 'ceiling', 'floorStepFinish', 'floorStepOverrides', 'floorEdgeFinish', 'wallMaterial', 'wallOverrides', 'hasFloor', 'hasCeiling', 'spaceRole', 'enclosureStatus', 'floorFinish', 'wallFinish', 'ceilingFinish', 'ceilingHeight', 'occupancy', 'clearDimensionPolicy', 'color'],
  wall: ['wallType', 'curtainWall', 'material', 'materialPreset', 'interiorMaterial', 'interiorMaterialPreset', 'exteriorMaterial', 'exteriorMaterialPreset', 'slots', 'legacyFaceMaterials', 'faceRegions', 'thickness', 'assembly', 'justification', 'height', 'curveOffset', 'supportSlabId', 'supportOffset', 'fillToTerrain', 'underpinning', 'skirting', 'crown', 'chairRail', 'start', 'end', 'frontSide', 'backSide', 'a', 'b'],
  item: ['position', 'rotation', 'scale', 'side', 'wallId', 'wallT', 'supportSlabId', 'slots', 'asset'],
  stair: ['material', 'materialPreset', 'railingMaterial', 'railingMaterialPreset', 'treadMaterial', 'treadMaterialPreset', 'sideMaterial', 'sideMaterialPreset', 'slots', 'position', 'rotation', 'supportSlabId', 'stairType', 'fromLevelId', 'toLevelId', 'deckSlabId', 'slabOpeningMode', 'openingOffset', 'width', 'totalRise', 'designTargets', 'uniformRisers', 'stepCount', 'thickness', 'fillToFloor', 'construction', 'innerRadius', 'sweepAngle', 'topLandingMode', 'topLandingDepth', 'showCenterColumn', 'showStepSupports', 'railingMode', 'railingHeight', 'railingStyle', 'railingPath', 'handrail', 'railingTopPost', 'railingTopReach', 'railingPostThrough'],
  // doors and windows drawn with the editor's own tools (the generated rooms use items for theirs)
  door: ['material', 'slots', 'position', 'rotation', 'side', 'verticalAnchor', 'floorThresholdVersion', 'wallId', 'width', 'height', 'constructionType', 'dimensionReference', 'roughOpeningWidth', 'roughOpeningHeight', 'masonryOpeningWidth', 'masonryOpeningHeight', 'finishOpeningWidth', 'finishOpeningHeight', 'doorCategory', 'doorType', 'leafCount', 'operationState', 'slideDirection', 'trackStyle', 'garagePanelCount', 'openingKind', 'openingShape', 'openingRadiusMode', 'openingTopRadii', 'cornerRadius', 'archHeight', 'openingRevealRadius', 'frameThickness', 'frameDepth', 'threshold', 'thresholdHeight', 'hingesSide', 'swingDirection', 'swingAngle', 'segments', 'handle', 'handleHeight', 'handleSide', 'contentPadding', 'doorCloser', 'panicBar', 'panicBarHeight'],
  window: ['material', 'slots', 'position', 'rotation', 'side', 'verticalAnchor', 'floorThresholdVersion', 'wallId', 'width', 'height', 'constructionType', 'dimensionReference', 'roughOpeningWidth', 'roughOpeningHeight', 'masonryOpeningWidth', 'masonryOpeningHeight', 'finishOpeningWidth', 'finishOpeningHeight', 'openingKind', 'windowType', 'operationState', 'awningDirection', 'casementStyle', 'hingesSide', 'openingShape', 'openingRadiusMode', 'openingCornerRadii', 'cornerRadius', 'archHeight', 'openingRevealRadius', 'frameThickness', 'frameDepth', 'columnRatios', 'rowRatios', 'columnDividerThickness', 'rowDividerThickness', 'sill', 'sillDepth', 'sillThickness'],
};
export const NODE_TYPES = Object.keys(FIELDS);
// where each type may hang in the tree
const PARENTS = { building: [null], level: ['building'], slab: ['level'], zone: ['level'], wall: ['level'], stair: ['level'], item: ['level', 'wall', 'item'], door: ['wall'], window: ['wall'] };
// sizes: never negative, never bigger than the room
const SIZES = new Set(['width', 'height', 'thickness', 'ceilingHeight', 'railingHeight', 'totalRise', 'innerRadius', 'topLandingDepth', 'frameThickness', 'frameDepth', 'sillDepth', 'sillThickness', 'thresholdHeight', 'handleHeight', 'panicBarHeight', 'archHeight', 'cornerRadius', 'roughOpeningWidth', 'roughOpeningHeight', 'masonryOpeningWidth', 'masonryOpeningHeight', 'finishOpeningWidth', 'finishOpeningHeight', 'floorHeight']);

class Refused extends Error {
  constructor(message, code = 'bad_design', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const refuse = (message, code, status) => {
  throw new Refused(message, code, status);
};
const finite = (v, where) => (typeof v === 'number' && Number.isFinite(v) ? v : refuse(`${where} must be a number.`, 'bad_number'));
const inside = (v, lo, hi, where) => (finite(v, where) >= lo && v <= hi ? v : refuse(`${where} is outside the room.`, 'outside_room'));

// Any other value of a kept field: plain JSON of tokens and bounded numbers, a few levels deep.
function plain(v, where, depth = 0) {
  if (depth > 5) refuse(`${where} is nested too deeply.`, 'bad_value');
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Math.abs(finite(v, where)) <= 1000 ? v : refuse(`${where} is too large.`, 'bad_number');
  if (typeof v === 'string') return TOKEN.test(v) ? v : refuse(`${where} must be a short code (a colour, an id or a setting), not text.`, 'bad_value');
  if (Array.isArray(v)) return v.length <= 256 ? v.map((x, i) => plain(x, `${where}[${i}]`, depth + 1)) : refuse(`${where} has too many entries.`, 'bad_value');
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length > 64) refuse(`${where} has too many fields.`, 'bad_value');
    return Object.fromEntries(keys.filter((k) => TOKEN.test(k) && v[k] !== undefined).map((k) => [k, plain(v[k], `${where}.${k}`, depth + 1)]));
  }
  return refuse(`${where} is not valid.`, 'bad_value');
}
const vec3 = (v, where, check) => (Array.isArray(v) && v.length === 3 ? v.map((x, i) => check(x, i)) : refuse(`${where} must be three numbers.`, 'bad_number'));
const ids = (v, where) => (Array.isArray(v) && v.length <= MAX_NODES ? v.map((x) => (typeof x === 'string' && ID.test(x) ? x : refuse(`${where} lists something that is not a node id.`, 'bad_tree'))) : refuse(`${where} must be a list of node ids.`, 'bad_tree'));

// The room a plot's design must stay in: { width, depth } in metres, from the plot's type, variant and tier (as the generated room is sized).
export const roomForPlot = ({ buildingType, variant, prime, luxury, grand }) => interiorRoomSize(buildingType ?? 'office', variant, prime, luxury, grand);

// Checks and cleans a design for a plot's room. Returns the design to store, or throws an Error with `code` and `status` (400, or 413 when
// it is too large) and a message for the owner.
export function cleanDesign(input, room) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) refuse('Send the design as { nodes, rootNodeIds }.');
  if (!input.nodes || typeof input.nodes !== 'object' || Array.isArray(input.nodes)) refuse('The design has no nodes.');
  const entries = Object.entries(input.nodes);
  if (entries.length > MAX_NODES) refuse(`A design can have at most ${MAX_NODES} pieces (walls, furniture, floors...); this one has ${entries.length}.`, 'too_many_nodes', 413);
  const W = room.width;
  const D = room.depth;
  const reach = Math.max(W, D) + MARGIN;
  const nodes = {};
  for (const [key, n] of entries) {
    if (!n || typeof n !== 'object' || Array.isArray(n)) refuse(`Node ${String(key).slice(0, 64)} is not valid.`, 'bad_tree');
    if (!ID.test(key) || n.id !== key) refuse(`Node ${String(key).slice(0, 64)} must be stored under its own id.`, 'bad_tree');
    if (!Object.hasOwn(FIELDS, n.type)) refuse(`An interior cannot have a "${String(n.type).slice(0, 40)}": only ${NODE_TYPES.join(', ')}.`, 'bad_node_type');
    const out = { object: 'node', id: key, type: n.type, parentId: n.parentId ?? null, visible: n.visible !== false };
    if (out.parentId !== null && (typeof out.parentId !== 'string' || !ID.test(out.parentId))) refuse(`The parent of ${key} is not a node id.`, 'bad_tree');
    if (n.children !== undefined) out.children = ids(n.children, `${key}.children`);
    for (const f of FIELDS[n.type]) {
      if (n[f] === undefined) continue;
      const where = `${key}.${f}`;
      if (f === 'asset') {
        const id = n.asset?.id;
        if (typeof id !== 'string') refuse(`Item ${key} has no catalogue id.`, 'unknown_asset');
        if (!ASSET_IDS.has(id)) refuse(`Furniture must come from the catalogue: "${String(id).slice(0, 64)}" is not in it.`, 'unknown_asset');
        out.asset = { id };
      } else if (SIZES.has(f)) out[f] = inside(n[f], 0, reach, where);
      else out[f] = plain(n[f], where);
    }
    if (n.type === 'item' && !out.asset) refuse(`Item ${key} has no catalogue id.`, 'unknown_asset');
    if (n.type === 'item' && out.scale) out.scale = vec3(out.scale, `${key}.scale`, (x) => (finite(x, `${key}.scale`) >= 0.05 && x <= 20 ? x : refuse(`${key}.scale is out of range.`, 'bad_number')));
    if (out.rotation !== undefined && Array.isArray(out.rotation)) out.rotation.forEach((x) => finite(x, `${key}.rotation`));
    nodes[key] = out;
  }

  // the tree: one building at the root, every parent and child a node of the design, and each type where it belongs
  const roots = ids(input.rootNodeIds ?? [], 'rootNodeIds');
  if (roots.length !== 1 || nodes[roots[0]]?.type !== 'building') refuse('A design has exactly one building at its root.', 'bad_tree');
  for (const n of Object.values(nodes)) {
    const parent = n.parentId === null ? null : nodes[n.parentId];
    if (n.parentId !== null && !parent) refuse(`The parent of ${n.id} is not in the design.`, 'bad_tree');
    if (!PARENTS[n.type].includes(parent ? parent.type : null)) refuse(`A ${n.type} cannot be inside ${parent ? `a ${parent.type}` : 'nothing'}.`, 'bad_tree');
    for (const c of n.children ?? []) if (!nodes[c]) refuse(`${n.id} lists a child that is not in the design.`, 'bad_tree');
  }
  const levels = Object.values(nodes).filter((n) => n.type === 'level');
  if (!levels.length) refuse('A design needs at least one floor.', 'bad_tree');
  if (levels.length > MAX_LEVELS) refuse(`A building can have at most ${MAX_LEVELS} floors.`, 'too_many_levels');
  for (const l of levels) if (l.level !== undefined && (!Number.isInteger(l.level) || l.level < 0 || l.level >= MAX_LEVELS)) refuse(`${l.id}.level must be a floor number from 0 to ${MAX_LEVELS - 1}.`, 'bad_number');

  // everything stays in the room: points on the floor plan, and positions (on a level: in the room; on a wall: along it)
  const onPlan = (p, where) => (Array.isArray(p) && p.length === 2 ? [inside(p[0], -MARGIN, W + MARGIN, where), inside(p[1], -MARGIN, D + MARGIN, where)] : refuse(`${where} must be a point [x, z].`, 'bad_number'));
  const polygon = (list, where) => (Array.isArray(list) && list.length <= 256 ? list.forEach((p, i) => onPlan(p, `${where}[${i}]`)) : refuse(`${where} must be a list of points.`, 'bad_number'));
  for (const n of Object.values(nodes)) {
    if (n.polygon !== undefined) polygon(n.polygon, `${n.id}.polygon`);
    if (Array.isArray(n.holes)) n.holes.forEach((h, i) => polygon(h, `${n.id}.holes[${i}]`));
    if (n.type === 'wall') {
      if (n.start === undefined || n.end === undefined) refuse(`Wall ${n.id} needs a start and an end.`, 'bad_number');
      onPlan(n.start, `${n.id}.start`);
      onPlan(n.end, `${n.id}.end`);
    }
  }
  for (const n of Object.values(nodes)) {
    if (n.position === undefined) continue;
    const parent = n.parentId ? nodes[n.parentId] : null;
    const where = `${n.id}.position`;
    if (parent?.type === 'wall') {
      const length = Math.hypot(parent.end[0] - parent.start[0], parent.end[1] - parent.start[1]);
      vec3(n.position, where, (x, i) => (i === 0 ? inside(x, -MARGIN, length + MARGIN, where) : i === 1 ? inside(x, -MARGIN, MAX_Y, where) : inside(x, -MARGIN, MARGIN, where)));
    } else if (parent?.type === 'item') vec3(n.position, where, (x) => inside(x, -reach, reach, where));
    else vec3(n.position, where, (x, i) => inside(x, -MARGIN, [W + MARGIN, MAX_Y, D + MARGIN][i], where)); // y is above the node's own floor
  }

  const design = { nodes, rootNodeIds: roots };
  if (JSON.stringify(design).length > MAX_DESIGN_BYTES) refuse(`The design is too large to save (at most ${MAX_DESIGN_BYTES / 1024} KB). Remove some furniture or floors.`, 'too_large', 413);
  return design;
}

// What the client sends: the editor's scene graph with each item's asset reduced to its id (the server would do the same; this keeps the
// upload small and makes the client's cached copy exactly what the server stores).
export function storedDesign(graph) {
  const nodes = {};
  for (const [id, n] of Object.entries(graph?.nodes ?? {})) nodes[id] = n?.type === 'item' && n.asset ? { ...n, asset: { id: n.asset.id } } : n;
  return { nodes, rootNodeIds: graph?.rootNodeIds ?? [] };
}
