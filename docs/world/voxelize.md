# Voxelising a model

`scripts/models/voxelize.mjs` turns a `.glb` model into a voxel model: a MagicaVoxel `.vox` file in the format the game already loads (`lib/content/vox.js`), with a small palette, and optionally into same-sized modular tiles. The logic is in `lib/content/voxelize.js` (pure, no file access), tested by `tests/voxelize.test.mjs`.

It writes where you tell it (default `./voxelized/`), never into the game. A model still has to pass the asset checks and get its licence entry in `CREDITS.md` before the city uses it.

```sh
node scripts/models/voxelize.mjs path/to/model.glb --res 48 --colors 12
node scripts/models/voxelize.mjs model.glb --palette-from apps/web/public/models/vox/mall.vox --solid
node scripts/models/voxelize.mjs model.glb --res 64 --tile 8       # also cut into 8-voxel pieces, with tiles.json
```

| Option | What it does |
| :--- | :--- |
| `--res <n>` | Voxels along the longest side (default 48, at most 250). One voxel is the model's longest side divided by this. |
| `--colors <n>` | Palette size by median cut (default 16, at most 255). Edge voxels where two colours meet average to in-between colours, so ask for a few more than the colours you can see. |
| `--palette-from <.vox>` | Snap every colour to an existing model's palette instead, so the result matches the city. |
| `--solid` | Fill the inside too (the nearest surface colour). Not needed to look right (the game draws outside faces only); it makes the model watertight for cutting. |
| `--tile <n>` | Also cut it on a grid of `n` voxels. Every piece is `n`x`n`x`n`, so any piece fits any slot. Identical pieces are written once; `tiles.json` lists the unique pieces and where each goes. |
| `--out`, `--name` | Where the files go, and their name. |

It also writes `<name>-preview.png`: the front, side and top views, one square per voxel, for a quick look.

## What it reads

- `.glb` (binary glTF 2.0) with node transforms; a texture embedded or beside the file (Kenney's `Textures/colormap.png`), vertex colours, or the material's base colour. Textures need `sharp` (it comes with Next.js); without it a textured model falls back to its material colour and says so.
- Not supported, and it says so: Draco or meshopt compression (decompress first: `npx @gltf-transform/cli copy in.glb out.glb`), sparse accessors, and triangle strips or fans.

## Axes

glTF is Y-up. `.vox` is Z-up with the front on the low-y side. A glTF point `(x, y, z)` becomes voxel `(x, -z, y)`, and the floor ends at `z = 0`, as the city expects.

## What it gains, and what it does not (measured on Kenney's commercial buildings)

| Model | `.glb` | triangles | `.vox` at 32 / 48 | game mesh triangles at 32 / 48 |
| :--- | :--- | :--- | :--- | :--- |
| building-a | 106 KB | 1,252 | 20 / 45 KB | 2,842 / 4,558 |
| building-f | 146 KB | 1,794 | 15 / 32 KB | 1,892 / 3,510 |
| building-k | 241 KB | 2,960 | 16 / 37 KB | 2,932 / 4,046 |

- **File size: smaller**, about 3x to 15x here, and the shared 10.7 KB colour texture is no longer needed. Against an AI generator's raw output (typically hundreds of thousands of triangles and a 2k to 4k texture, megabytes) the gain is far larger.
- **Triangles: not fewer than a low-poly model.** `voxelMesh` draws one quad per exposed face, so a stair-stepped surface costs more than Kenney's flat triangles (1.0x to 3.9x). Hand-made voxel buildings are cheap because they are boxes (300 to 4,800 triangles); a scanned or generated shape is not. Merging flat faces of one colour ("greedy meshing") would cut this a lot and is the next step if the numbers matter.
- **Memory and draw calls: better.** No texture to hold (a 2048 x 2048 texture is 16 MB of video memory, about 21 MB with mip levels), vertex colours from a small palette, and one palette across the city lets models share a material and be batched. Tiles repeat, so identical ones can be instanced.
- **The look:** it matches the city's voxel buildings, which a smooth model does not.

## Licence

Voxelising does not change a model's licence. Kenney's are CC0. For an AI generator's output, use what its plan allows commercially (VoxelVenture takes payments) and keep the record: the generator, the plan, the date and its terms, in `CREDITS.md` and next to the file. Do not use a service in a way its terms forbid (scraping, getting around limits, copying its interface).
