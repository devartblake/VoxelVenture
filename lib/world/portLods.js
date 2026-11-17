// The mid tier of the ports' models (docs/world/ports_models.md): the share of each model's triangles kept in its simplified copy (scripts/world/make-lods.mjs makes the files in public/world/lod), and where the
// game finds them. A phone draws these in place of boxes (`detail: 'mid'`); a desktop draws the full models. Pure.
export const PORT_LOD_RATIO = {
  'ctr-a': 0.1, 'ctr-b': 0.1, 'ctr-c': 0.1, // a container is a box with ribs: the ribs go, the colour map stays
  tank: 0.12,
  'boat-row': 0.3, 'boat-row-l': 0.3, 'boat-fish': 0.22, 'boat-sail': 0.18, 'boat-speed': 0.3, 'boat-tug': 0.12,
  buoy: 0.3, ramp: 0.3, barrel: 0.3, crate: 0.5, palm: 0.35,
};
export const PORT_LOD_DIR = 'lod'; // under the baked world's folder: `${base}/lod/<name>.glb`
