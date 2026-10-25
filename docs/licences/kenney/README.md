# Kenney kits provenance

**Author:** Kenney (https://www.kenney.nl). **Licence:** Creative Commons Zero (CC0 1.0, public-domain dedication), as each kit's page and its `License.txt` say; the legal text is [`../texts/CC0-1.0.txt`](../texts/CC0-1.0.txt). Credit is not required; it is given in `CREDITS.md` and the in-game credits anyway.

**Recorded on 2026-10-24.** Each kit's page was saved as HTML (`<kit>.html`) and its current download was fetched (the "Continue without donating" link on the page) into a scratch folder outside the repository; only the kit's `License.txt` was kept (`License-<kit>.txt`, its text unchanged; git stores it with LF line endings). Every model and texture we ship from the kit was compared with the download by SHA-256: **all 109 files are byte-identical** with the kit versions below, so those are the versions we ship. The files themselves were first committed on 2026-10-16 (the repository's first commit); the original download date was not recorded.

| Kit | Page (saved) | Version (from its `License.txt`) | Kit created | Page says | Download file | Our folder | Files (identical) |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| City Kit (Commercial) | https://kenney.nl/assets/city-kit-commercial ([html](city-kit-commercial.html)) | 2.1 | 21-07-2025 | Released in 2021; CC0 | `kenney_city-kit-commercial_2.1.zip` | `apps/web/public/models/kenney/commercial/` | 18 |
| City Kit (Suburban) | https://kenney.nl/assets/city-kit-suburban ([html](city-kit-suburban.html)) | 2.0 | 23-04-2025 | Released in 2020; CC0 | `kenney_city-kit-suburban_20.zip` | `apps/web/public/models/kenney/suburban/` | 15 |
| Nature Kit | https://kenney.nl/assets/nature-kit ([html](nature-kit.html)) | 2.1 | 29-04-2020 | Released in 2020; CC0 | `kenney_nature-kit.zip` | `apps/web/public/models/kenney/nature/` | 10 |
| Car Kit | https://kenney.nl/assets/car-kit ([html](car-kit.html)) | 3.1 | 02-04-2026 | Released in 2022; CC0 | `kenney_car-kit.zip` | `apps/web/public/models/kenney/cars/` | 9 |
| Watercraft Kit | https://kenney.nl/assets/watercraft-kit ([html](watercraft-kit.html)) | 2.1 | 19-04-2024 | Released in 2016; CC0 | `kenney_watercraft-pack.zip` | `apps/web/public/models/kenney/watercraft/` | 14 |
| Pirate Kit | https://kenney.nl/assets/pirate-kit ([html](pirate-kit.html)) | 2.1 | 17-02-2026 | Released in 2018; CC0 | `kenney_pirate-kit.zip` | `apps/web/public/models/kenney/pirate/` | 9 |
| Coaster Kit | https://kenney.nl/assets/coaster-kit ([html](coaster-kit.html)) | 1.0 | 13-11-2024 | Released in 2024; CC0 | `kenney_coaster-kit.zip` | `apps/web/public/models/kenney/coaster/` | 34 |

The pages show no version number of their own ("not stated" there); the versions above are the ones each kit's `License.txt` names (for example "Car Kit (3.1)"), and its "Creation date" (day-month-year) is given as "Kit created". The models are the kits' `Models/GLB format/*.glb` (the Nature Kit's `Models/GLTF format/*.glb`) and the kits' shared `Textures/colormap.png`, copied unmodified.

Which kit each placed model comes from: [`apps/web/public/models/CREDITS.md`](../../../apps/web/public/models/CREDITS.md). The register entry is `kenney` in `lib/content/assetSources.js`.

## Not recorded

- The day the kits were first downloaded (before 2026-10-16), and whether the download was scanned. The files match today's downloads exactly, so the versions are known.
- Approval by a code owner (`approvedBy` in the register).
