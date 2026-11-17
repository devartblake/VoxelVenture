// Makes the world gallery: converts the screenshots and diagrams kept while building the world (a folder of PNGs) to WebP in docs/world/gallery/ and writes docs/world/gallery.md, one section for each feature
// with a caption for each picture.
//   node scripts/world/make-gallery.mjs <folder of PNGs>
// Every PNG of the folder must have a caption below (the script stops and names any that has none), so the page never shows a picture without saying what it is.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = process.argv[2];
if (!src) { console.error('Usage: node scripts/world/make-gallery.mjs <folder of PNGs>'); process.exit(1); }
const out = path.join(root, 'docs/world/gallery');

// [section title, what the section is, [[file name without .png, caption], ...]]
const SECTIONS = [
  ['The shape of the world', 'The first sketches of the land: the Jamaica-like mainland, Harbor Isle and the smaller islands, and the game\'s own world-map page ([world_recipe.md](world_recipe.md)).', [
    ['world', 'An early sketch of the two main landmasses and the small island in the sea.'],
    ['world-layout', 'The layout sketch with the two towns and the airstrip marked.'],
    ['island-layout', 'The island layout with the districts of Harbor Isle.'],
    ['jamaica-mainland', 'The mainland drawn after the outline of Jamaica.'],
    ['jamaica-both', 'The mainland and Harbor Isle side by side.'],
    ['cayman-both', 'Harbor Isle and the Lesser Caymans, drawn after Grand Cayman.'],
    ['cayman-harbor', 'Harbor Isle with its town site.'],
    ['world-map', 'The game\'s world-map page: the mainland and Harbor Isle.'],
    ['world-voxel-town', 'The world-map page zoomed to Voxel Town.'],
    ['world-harbor-town', 'The world-map page zoomed to Harbor Town.'],
    ['world-harbor-airstrip', 'The world-map page at the Harbor Isle airstrip.'],
  ]],
  ['Roads', 'The coastal rings, the spurs that bend round mountains and the link roads ([world_recipe.md](world_recipe.md)).', [
    ['roads', 'The first coastal ring road on the mainland.'],
    ['roads2', 'The ring with its spurs to the town.'],
    ['roads3', 'The ring, spurs and links together.'],
    ['mainland_roads', 'The mainland\'s roads as built.'],
    ['town_roads', 'The roads at the first town\'s gates.'],
    ['isle_roads', 'Harbor Isle\'s ring road.'],
    ['isle_town_roads', 'Harbor Isle\'s roads at Harbor Town.'],
  ]],
  ['The streamed world', 'The baked world drawn by the streaming runtime on the development page `/world/stream`, and in the game with `?world=baked` ([streaming_runtime.md](streaming_runtime.md)).', [
    ['dev_world', 'The whole streamed world from the development page.'],
    ['dev_voxel', 'The first town as the development page draws it.'],
    ['dev_harbor', 'Harbor Isle on the development page.'],
    ['stream_town', 'A first look at the town\'s ground in the streamed world.'],
    ['stream_harbor', 'A first look at Harbor Isle in the streamed world.'],
    ['stream_blue', 'The Blue Mountains\' first terrain mesh (the one that "didn\'t look so good").'],
    ['stream_blue2', 'The Blue Mountains after the real elevation data and the ridge correction.'],
    ['game_plain', 'The game as it was, without the baked world.'],
    ['game_baked', 'The game with `?world=baked`: the town inside the streamed world.'],
    ['shore_coast', 'The smooth coast and the sea plane.'],
    ['shore_causeway', 'A causeway leaving the shore.'],
  ]],
  ['The ground texture', 'ambientCG grass and dirt laid over the vertex colours of the baked ground as detail ([streaming_runtime.md](streaming_runtime.md), "Ground texture").', [
    ['ground_meadow_plain', 'A meadow with the vertex colours only.'],
    ['ground_meadow_tex', 'The same meadow with the grain.'],
    ['ground_slope_plain', 'A mountain slope with the vertex colours only.'],
    ['ground_slope_tex', 'The same slope with the grain: grass on the flat, dirt on the steeper ground.'],
  ]],
  ['The voxel speedway', 'The racing circuit on the mainland, built from the shape of the real Dover Raceway ([racing_track.md](racing_track.md)).', [
    ['raceways', 'The circuit outlines taken from OpenStreetMap.'],
    ['track_sites', 'The candidate sites for the circuit; D was chosen.'],
    ['track_plan', 'A plan of the first rectangular layout.'],
    ['track1', 'The first build: asphalt, kerbs and stands.'],
    ['track_top', 'An early view from above.'],
    ['track_all', 'The whole circuit in the streamed world.'],
    ['track_start', 'The start straight with its gantry.'],
    ['track_start2', 'The start straight after the surface was redrawn from the real shape.'],
    ['track_new', 'The redrawn circuit.'],
    ['track_final', 'The circuit with the stands, pits, trees and lamps.'],
    ['corner', 'A corner of the first build, before the surface was drawn as quads along the shape.'],
    ['grid', 'The grid with the race cars and the start gantry.'],
    ['night', 'The circuit at night with the lamps lit.'],
    ['stadium', 'The stadium lights: a wide pool of light under each mast.'],
    ['trk_a', 'The props after the anchor fix: the barriers run the same distance from both edges and the gantry is centred.'],
    ['trk_b', 'The same view a little later, the grid car centred on its lane.'],
    ['trk_c', 'A stadium mast, the barriers and trees beside the road.'],
    ['trk_d', 'A view with nothing in it but grass (a wrong camera), kept for the record.'],
  ]],
  ['Bridges', 'The City Kit bridge, then the two styled bridges ([suspension_bridge.md](suspension_bridge.md), [arch_bridge.md](arch_bridge.md)).', [
    ['bridge_models', 'The City Kit (Roads) bridge models.'],
    ['sus_a', 'The first suspension bridge from the shore.'],
    ['sus_b', 'The main cables and suspenders, with stray pieces under the deck.'],
    ['sus_c', 'A tower, the cables and the kit deck.'],
    ['sus_d', 'The whole bridge from far off.'],
    ['sus_e', 'The deck tinted orange.'],
    ['sus_f', 'The rail on the deck, with the kit deck\'s sockets.'],
    ['sus_g', 'An attempt to cut the sockets out of the deck, which left holes.'],
    ['sus_h', 'The same attempt from above.'],
    ['sus_i', 'The clean girder deck: asphalt, kerbs and a lane line.'],
    ['sus_j', 'The clean deck along its length.'],
    ['sus_k', 'From directly above, with the lamps.'],
    ['sus_l', 'The tower and the station beside the bridge.'],
    ['sus_m', 'The rail laid right, on the deck in its own lane.'],
    ['sus_n', 'A lamp, before the lamp anchor fix.'],
    ['sus_o', 'The deck from above.'],
    ['sus_p', 'The lamps standing on the kerb after the fix.'],
    ['sus_q', 'The suspension bridge at night: the tower beacons and the cable lights.'],
    ['arch_a', 'The arch bridge, first proportions (a flat arch).'],
    ['arch_b', 'The arch\'s pylon and lattice from close.'],
    ['arch_c', 'The arch bridge after the arch was made taller.'],
    ['arch_d', 'The arch bridge at night: the string of lights along the arch.'],
  ]],
  ['The train', 'The rideable train on the first causeway ([train.md](train.md)).', [
    ['train_prev', 'The Train Kit\'s electric bullet train cars and the straight rail.'],
    ['train_st', 'The mainland station on the first run, before the rail was laid right.'],
    ['train_st2', 'The train standing in the mainland station.'],
    ['train_mid', 'The train on the bridge deck.'],
  ]],
  ['The undersea tunnel', 'The evaluation and the spike ([tunnel_evaluation.md](tunnel_evaluation.md)).', [
    ['train_tu1', 'The tube seen through the sea from above, beside the bridge piers.'],
    ['train_tu2', 'A camera that could not leave the horizon (the orbit camera): the reason for the free camera.'],
    ['train_tu3', 'The same camera after the tube was made two-sided.'],
    ['tun_in', 'Inside the tube at the mainland portal, standing on the ramp: the ground covers the road.'],
    ['tun_mid', 'Inside the tube under the sea: walls, a lamp strip, the road and its lane line.'],
    ['tun_shore', 'Inside the tube under the shore.'],
    ['tun_ramp', 'On the ramp: the grass is the ground\'s own surface, over the road.'],
    ['tun_portal', 'The approach road to the portal, from above.'],
    ['tun_out1', 'The portal and the approach road from the mainland side.'],
    ['tun_out2', 'The tunnel\'s road from a higher camera.'],
    ['tun_o3', 'The tunnel\'s road joined to the mainland ring road.'],
    ['tun_o4', 'The tunnel\'s road joined to the Harbor ring road.'],
    ['tun_p3', 'The longer entrance on the mainland (portal 110 units before the causeway).'],
    ['tun_p4', 'The longer exit on Harbor Isle.'],
    ['tunnel_diagram', 'A plan and profile of the tunnel and the causeway. **Out of date:** drawn before the road links and the longer entrance.'],
  ]],
  ['The sea: depth shading', 'The sea coloured by its distance from the coast, with a foam line at the shore ([water.md](water.md)).', [
    ['sea_b', 'The sea before: one flat navy plane (`?seashade=0` shows it).'],
    ['sea_a', 'The first depth shading: turquoise shallows, a muddy grey where the seabed shows through.'],
    ['sea_c', 'A second tuning: more opaque shallows.'],
    ['sea_d', 'From above: depth rings round the coasts, but land that no chunk draws yet showed as pale grey.'],
    ['sea_e', 'The same view with the signed distance: undrawn land is deep water as before, and a foam line follows every coast.'],
    ['sea_f', 'The near coast with the signed distance.'],
    ['sea_g', 'The final shading at the mainland end of the causeway: turquoise shallows, a foam line, deeper water out to sea.'],
    ['sea_h', 'The final shading from above: both causeways, the coasts and the depth rings.'],
    ['sea_i', 'The final shading at night.'],
  ]],
  ['The world datum', 'The named heights, the overlay and the town border ([datum.md](datum.md)).', [
    ['datum_a', 'The datum overlay: a grid at every named height and the legend, at the mainland end of the causeway.'],
    ['datum_b', 'The overlay from a low camera, with the tunnel layers on.'],
    ['join_a', 'The town border as the game had it: a frame of open water round the town\'s land (the sea showing through).'],
    ['join_b', 'The same gap from the east: the roads end short of the town.'],
    ['join_c', 'After the join: ground all round the town, from above.'],
    ['join_d', 'The join from the east, at a grazing angle (stripes are the development page\'s depth precision).'],
    ['join_e', 'The join after the underlay was lowered to 0.08.'],
    ['join_f', 'From directly above: the slab, the joined ground and the spur road meeting the slab\'s edge.'],
  ]],
  ['Owner tools: kit items, yards and the building designer', 'The furniture items from the Food and Industrial kits, the yards behind the buildings and the buildings assembled from kit pieces ([kit_items.md](../product/kit_items.md), [yard_items.md](../product/yard_items.md), [building_designer.md](../product/building_designer.md)).', [
    ['kit_thumbs', 'A sample of the furniture thumbnails made from the Food Kit and the City Kit (Industrial).'],
    ['yards_all', 'The first view of the yards, with the older ones.'],
    ['yards_sheet', 'The five yards of models together.'],
    ['yard_tropical', 'The tropical garden.'],
    ['yard_fenced', 'The fenced garden.'],
    ['yard_market-yard', 'The market yard.'],
    ['yard_depot', 'The depot yard.'],
    ['yard_campfire', 'The campfire grill.'],
    ['bk_prev', 'The Building Kit\'s own previews of a wall, a window, a doorway and a corner.'],
    ['bld_pieces_p', 'The kit pieces side by side, seen from the edge.'],
    ['bld_pieces_q', 'The kit pieces from the front, brightened.'],
    ['bld_starts', 'The first kit-built buildings: pieces inside the box and speckled by shadow.'],
    ['bld_starts_b', 'The four business starts, the pieces dark and the box showing through.'],
    ['bld_starts_c', 'A test with the pieces turned round.'],
    ['bld_starts_close', 'A close view of a front, the walls hidden inside the box.'],
    ['bld_starts_d', 'The same view after trying new normals (no change).'],
    ['bld_starts_e', 'Without shadows: the speckle is gone.'],
    ['bld_fronts', 'The three fronts: shopfront, home front, doorway only.'],
    ['bld_starts_f', 'The buildings with their walls brightened.'],
    ['bld_starts_g', 'The four business starts as finally built: windows, doorways, corners and a roof edge.'],
  ]],
];

const names = new Set(fs.readdirSync(src).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')));
const captioned = new Set(SECTIONS.flatMap((s) => s[2].map((p) => p[0])));
const uncaptioned = [...names].filter((n) => !captioned.has(n) && !/^contact\d*$/.test(n));
if (uncaptioned.length) { console.error('no caption for:', uncaptioned.join(', ')); process.exit(1); }
const missing = [...captioned].filter((n) => !names.has(n));
if (missing.length) console.warn('captions with no picture:', missing.join(', '));

fs.mkdirSync(out, { recursive: true });
let bytes = 0, count = 0;
const md = [];
md.push('# The world gallery', '', 'Written for: the owner and developers. Made 2026-11-16 from the screenshots and diagrams kept while the world was built (`node scripts/world/make-gallery.mjs <folder of PNGs>` rebuilds this page and the pictures). The pictures are WebP, 1400 pixels wide at most.', '');
md.push('These are working pictures, taken on the development page (`/world/stream`) and in the game with `?world=baked` while each feature was built: many show an earlier stage, and the caption says so where it is known. For what each feature is now, follow the link under its heading.', '');
for (const [title, intro, items] of SECTIONS) {
  md.push(`## ${title}`, '', intro, '');
  for (const [name, caption] of items) {
    if (!names.has(name)) continue;
    const file = `gallery/${name}.webp`;
    const info = await sharp(path.join(src, `${name}.png`)).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(root, 'docs/world', file));
    bytes += info.size; count++;
    md.push(`### ${name}`, '', `![${caption.replace(/[[\]]/g, '')}](${file})`, '', caption, '');
  }
}
fs.writeFileSync(path.join(root, 'docs/world/gallery.md'), md.join('\n'));
console.log(`${count} pictures, ${(bytes / 1048576).toFixed(1)} MB, docs/world/gallery.md`);
