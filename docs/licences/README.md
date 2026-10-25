# Licence evidence

The stored licence texts and provenance evidence for everything VoxelVenture uses that it did not make. The rules for adding to it are in [asset_admission.md](../operations/asset_admission.md); the register that points here is `lib/content/assetSources.js`, and `npm run check:assets` (also run by `npm test`) checks that every file it names exists.

| Folder | What it holds |
| --- | --- |
| [`texts/`](texts/) | Licence texts shared by several sources, named by SPDX identifier (`CC0-1.0.txt`) |
| [`music/`](music/README.md) | The eight recorded-music releases: each creator's saved OpenGameArt page (`<release id>.html`, captured 2026-10-16) and the CC0 legal text |
| [`pascal-editor/`](pascal-editor/README.md) | The Pascal Editor's MIT licence file and what was copied from it |
| [`kenney/`](kenney/README.md) | The seven Kenney kits: each kit's saved page (`<kit>.html`) and `License.txt` (`License-<kit>.txt`), with versions, recorded 2026-10-24 |
| [`polyhaven/`](polyhaven/README.md) | Poly Haven's "Venice Sunset" (the interior sky): the saved asset and licence pages, its API record, and how our file was matched |

## Layout for a new source

One folder per source, named by its id in the register (`docs/licences/<source id>/`):

- the licence as it read when the asset was downloaded (`LICENSE`, `License.txt`, or the saved licence page), or a pointer to the shared copy in `texts/`;
- the page the asset was downloaded from, saved as HTML or PDF on the day (sites close and terms change);
- a `README.md` with the source address, the author, the version or release, the download date, the files it covers, and anything not known.

## Known gaps

- **OpenStreetMap:** the ODbL 1.0 text is not stored (`texts/ODbL-1.0.txt` to add).
- **Pascal Editor:** see [its README](pascal-editor/README.md#not-recorded).
