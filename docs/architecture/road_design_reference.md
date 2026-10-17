# Road design reference: New York, San Francisco, Washington DC

Written for: you (the designer of VoxelVenture's roads), as input for what to build next.

Open `/reference` in the running app to see the maps side by side. This file has the same material with more detail.

## Where the maps come from

- The three real maps are road networks from **OpenStreetMap** (© OpenStreetMap contributors, ODbL licence), fetched through the Overpass API on 2026-10-12. Each is about 2.2 km tall; all four maps use the same scale (a 500 m bar is drawn on each).
- Only vehicle roads were kept (motorway down to residential, plus pedestrian streets). Footpaths, service lanes and buildings are left out.
- The files are in `public/reference/`: `nyc.svg`, `sf.svg`, `dc.svg`, and `voxelventure.svg` (this city, drawn the same way at 1 city unit = 7 m, so a 2.8-unit road corridor is about 20 m wide).
- I could not open the SVGs as images while preparing this, so the drawings themselves have not been looked at. They are valid SVG, and the numbers below were computed from the same data.

## What was measured

Direction of each road segment, weighted by length (0° = north). "Share" is the percentage of all road length.

| Area | Road drawn | Main directions (share of road length) |
| :--- | :--- | :--- |
| Midtown Manhattan | 123 km | ~118° (64%), ~28° (25%) |
| Market Street, San Francisco | 136 km | ~83° (29%), ~173° (18%), ~48° (19%), ~138° (9%) |
| Downtown Washington DC | 103 km | ~93° (22%), ~3° (21%), diagonals ~113° (4%) and ~68° (3%) |
| VoxelVenture | 18 roads | 90° and 0° only (100%) |

What this shows:

- **Manhattan** is one grid: two perpendicular directions carry 89% of the road, the whole thing turned about 28° off north. The remaining few percent is Broadway and the other diagonals.
- **San Francisco** is two grids of two perpendicular directions each, turned about 35° from each other. They meet at Market Street.
- **Washington** is an ordinary north-south / east-west grid with diagonal avenues (about 7% of the length) laid over it.
- **VoxelVenture** is a single axis-aligned grid, so it has none of these three things: no diagonal, no second grid angle.

## Background (general knowledge, not measured from the data)

- Manhattan's blocks are long and narrow (roughly 80 m by 270 m): many numbered streets, far fewer avenues. Broadway cuts diagonally across the grid and leaves triangular plazas such as Times Square and Herald Square.
- San Francisco's street grid was laid out in separate pieces facing different ways; Market Street is the boulevard where the two largest pieces meet, which leaves wedge-shaped blocks along it.
- Washington's plan (L'Enfant, 1791) put wide diagonal avenues on top of a street grid, radiating from circles and squares (Dupont Circle, Logan Circle, Thomas Circle) that are landmarks in their own right.

## Ideas for our roads, and what each would take

| Idea | What it adds | What it would take in our code |
| :--- | :--- | :--- |
| **A diagonal avenue** ("Broadway") across the main grid | Wedge-shaped prime plots, plazas where it crosses | Curved roads already support any heading, so it can be drawn and walked today. Cars, pedestrians and junctions only know axis-aligned roads, so a diagonal that crosses other roads needs those generalised first. |
| **Two grids meeting** (San Francisco) | A distinct Old Town grid turned a little, joined by a diagonal boulevard | The Old Town roads would become roads at an angle, plus the same junction work as above. |
| **Real circles** (Washington) | A landmark plaza with prime plots all round it, radial avenues between circles | Today's roundabouts have a 1.1-unit asphalt ring. A circle of radius 6-8 with a park or fountain and plots round it needs a new "circle" feature in the generator; traffic already circulates round a ring, so it only needs a bigger path. |
| **A long park axis** (the National Mall) | A green spine, with prime frontage on both sides | Parks are one block today. A longer park is a bigger version of what exists. |
| **A waterfront road** (San Francisco's Embarcadero) | A curved road round one of the new lakes with lots facing the water | This fits curved roads plus the lakes, and could suit the reserved area. |
| **Wider arterials with a median** | Real boulevards | A wider road cross-section for arterials (asphalt, median, pavements). |

My suggested order: a **waterfront road** or **circles** first (both build on things that already exist and avoid junction work), then the **diagonal** once junctions are generalised.

**Built since** (the table above describes the code as it was): circles and a diagonal avenue, with junctions generalised for diagonal legs ([project_status.md](../roadmap/project_status.md) 5h); straight loop roads round the lakes with lots facing the water, and a riverside drive (5f). The curved waterfront road was tried and replaced. Not built: two grids at an angle, a long park axis, wider arterials with a median.
