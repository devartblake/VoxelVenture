// The building designer (lib/content/modularBuild.js, docs/product/building_designer.md): a validated design, assembled from kit pieces that stay on the building box.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const m = await imp('content/modularBuild.js');
const { PROP_CATALOG } = await imp('content/propCatalog.js');
const { cleanExterior, applyExterior } = await imp('game/exterior.js');
const { buildingSize } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();

// ---- the options and the check
const ids = (l) => l.map((x) => x.id);
for (const [name, list] of Object.entries({ FRONTS: m.FRONTS, SIDE_STYLES: m.SIDE_STYLES, WINDOWS: m.WINDOWS, CORNERS: m.CORNERS, ROOFS: m.ROOFS })) if (list.length < 2 || new Set(ids(list)).size !== list.length || list.some((o) => !o.label || !o.hint)) bad('every choice has distinct, described options', name);
for (const type of ['shop', 'restaurant', 'office', 'house']) {
  const s = m.startFor(type);
  const c = m.cleanBuild(s, type);
  if (JSON.stringify(c) !== JSON.stringify(s)) bad('a start is a valid design', type);
}
if (m.cleanBuild(null, 'shop') !== null || m.cleanBuild('x', 'shop') !== null || m.cleanBuild([], 'shop') !== null || m.cleanBuild(undefined, 'shop') !== null) bad('no design is null', '');
const junk = m.cleanBuild({ front: 'laser', back: 7, sides: {}, windows: '<b>', corners: null, roof: 'tower', extra: 'x' }, 'restaurant');
if (JSON.stringify(junk) !== JSON.stringify(m.startFor('restaurant'))) bad('anything unknown falls back to the start for the business', JSON.stringify(junk));
if ('extra' in junk) bad('nothing but the six choices is kept', '');
if (m.cleanBuild({ roof: 'high' }, 'shop').roof !== 'high' || m.cleanBuild({ roof: 'high' }, 'shop').front !== 'shopfront') bad('a known choice is kept, the rest start', '');
if (m.startFor('castle').front !== m.startFor('shop').front) bad('an unknown kind of business starts as a shop', '');

// ---- in the exterior
const plot = { id: 1, owner: 'x', x: 10, z: 4, w: 3, d: 3, facing: 1, yaw: 0, height: 2.4, wallColor: '#d6c4a0' };
const ext = cleanExterior({ floors: 2, build: { front: 'homefront' }, model: 'does-not-matter' }, plot, 'shop');
if (ext.build?.front !== 'homefront' || ext.build.roof !== 'border') bad('the exterior keeps a design, filled in', JSON.stringify(ext.build));
if (ext.model !== null) bad('a designed building has no catalogue model', String(ext.model));
if ('build' in cleanExterior({ floors: 2 }, plot, 'shop') || 'build' in cleanExterior({ build: false }, plot, 'shop')) bad('an exterior without a design has no build key at all (stored settings stay as they were)', '');
if (applyExterior(plot, { floors: 2, build: m.startFor('shop') }, 'shop').exterior.build.front !== 'shopfront') bad('applying keeps the design', '');
const twice = cleanExterior(ext, plot, 'shop');
if (JSON.stringify(twice) !== JSON.stringify(ext)) bad('cleaning twice changes nothing', '');

// ---- the pieces
const files = m.BUILD_PIECE_IDS.every((id) => PROP_CATALOG.some((p) => p.id === id) && fs.existsSync(path.join(root, 'apps/web/public/models/kenney/building', `${id.split('/')[1]}.glb`)));
if (!files) bad('every piece is in the prop catalogue and shipped', '');
const mk = (extra = {}, build = m.startFor('shop'), floors = 2) => ({ ...plot, height: floors * 1.2, exterior: { floors, build }, ...extra });
const piecesOf = (p) => m.buildPieces(p, p.exterior.build, PROP_CATALOG);
const kinds = (list) => list.map((i) => i.model.id.replace('building/', ''));
const base = piecesOf(mk());
if (base.length < 30 || base.length > 300) bad('a small building is a few dozen pieces', String(base.length));
if (base.some((i) => !PROP_CATALOG.some((p) => p.id === i.model.id))) bad('every piece drawn is in the catalogue', '');
if (kinds(base).filter((k) => /doorway/.test(k)).length !== 1) bad('one doorway on a ground floor', String(kinds(base).filter((k) => /doorway/.test(k)).length));
// the doorway is on the front, at floor level, in the middle
const door = base.find((i) => /doorway/.test(i.model.id));
const { bw, bd } = buildingSize(plot);
if (Math.abs(door.x - plot.x) > 0.01 || door.z - plot.z < bd / 2 - 0.1 || door.y > 0.11) bad('the doorway is on the front (facing +z), in the middle, on the ground', `${door.x} ${door.z} ${door.y}`);
const backFacing = piecesOf(mk({ facing: -1 })).find((i) => /doorway/.test(i.model.id));
if (backFacing.z - plot.z > -bd / 2 + 0.1) bad('a lot facing -z has its doorway on the -z side', String(backFacing.z - plot.z));
const quarter = piecesOf(mk({ yaw: Math.PI / 2 })).find((i) => /doorway/.test(i.model.id));
if (Math.abs(quarter.z - plot.z) > 0.01 || Math.abs(quarter.x - plot.x) < bd / 2 - 0.1) bad('a lot turned a quarter has its doorway to the side', `${quarter.x} ${quarter.z}`);
// the pieces stand on the box: inside its footprint (plus a hair and a roof lip) and between the ground and the roof
const reach = Math.max(bw, bd) / 2 + 0.15;
for (const i of base) {
  if (Math.hypot(i.x - plot.x, i.z - plot.z) > Math.hypot(bw, bd) / 2 + 0.2) bad('no piece is far from the building', JSON.stringify(i));
  if (Math.abs(i.x - plot.x) > reach || Math.abs(i.z - plot.z) > reach) bad('every piece is on the building', JSON.stringify(i));
  if (i.y < 0.09 || i.y > 0.1 + 2 * 1.2 + 0.01) bad('every piece is between the ground and the roof', String(i.y));
  if (!i.model.scaleV.every((v) => v > 0 && Number.isFinite(v))) bad('every piece has a size', JSON.stringify(i.model.scaleV));
}
// floors multiply the walls; a roof edge only on top
const four = piecesOf(mk({}, m.startFor('shop'), 4));
if (four.length <= base.length * 1.6) bad('more floors, more pieces', `${base.length} ${four.length}`);
if (Math.max(...four.map((i) => i.y)) < 0.1 + 3 * 1.2 - 0.01) bad('the pieces of a taller building reach its roof', '');
// the choices change the pieces
const none = piecesOf(mk({}, { ...m.startFor('shop'), roof: 'none' }));
if (kinds(none).some((k) => /^border/.test(k)) || !kinds(base).some((k) => /^border/.test(k))) bad('a roof edge only with a roof edge', '');
if (!kinds(piecesOf(mk({}, { ...m.startFor('shop'), roof: 'high' }))).some((k) => k.startsWith('border-high'))) bad('a high parapet uses the high pieces', '');
const win = (w) => kinds(piecesOf(mk({}, { ...m.startFor('shop'), windows: w })));
if (!win('round').some((k) => k === 'wall-window-round') || win('round').some((k) => k === 'wall-window-wide-square')) bad('round windows are round', '');
if (!win('wide').some((k) => k === 'wall-window-wide-square')) bad('wide windows use wide pieces', '');
const cor = (c) => kinds(piecesOf(mk({}, { ...m.startFor('shop'), corners: c })));
if (!cor('columns').includes('wall-corner-column') || cor('plain').includes('wall-corner-column') || !cor('round').includes('wall-corner-round')) bad('the corner choice picks the corner piece', '');
const sidesPlain = kinds(piecesOf(mk({}, { ...m.startFor('shop'), sides: 'plain', back: 'plain', front: 'doorway' })));
if (sidesPlain.filter((k) => /window/.test(k)).length) bad('plain walls and a doorway-only front have no windows', '');
if (kinds(piecesOf(mk({}, { ...m.startFor('shop'), front: 'homefront' }))).filter((k) => /window/.test(k)).length === 0) bad('a home front has windows', '');
// a wide lot (a prime plot) has more cells, and never more than the cap
const prime = piecesOf({ ...mk({ w: 6, d: 6 }, m.startFor('office'), 8), prime: true });
if (prime.length <= four.length || prime.length > 800) bad('a big building has more pieces, and a bounded number', String(prime.length));
if (m.buildPieces(mk(), null, PROP_CATALOG).length || m.buildPieces(null, m.startFor('shop'), PROP_CATALOG).length) bad('no design, no pieces', '');
if (m.buildPieces(mk(), m.startFor('shop'), []).length) bad('a piece the catalogue lacks is left out, not drawn wrong', '');
// the wall colour tints the pieces; none still gives a tint
if (!Array.isArray(base[0].tint) || base[0].tint.some((v) => !(v > 0))) bad('a piece has a tint', JSON.stringify(base[0].tint));
console.log(`modular-build: ${base.length} pieces on a two-floor shop, ${four.length} on four floors, ${prime.length} on a prime eight-floor office`);
total();
