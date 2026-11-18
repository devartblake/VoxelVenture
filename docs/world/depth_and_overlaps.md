# Surfaces that fought each other: depth stripes and overlapping roads

Written for: the owner and developers. Made 2026-11-17, after the owner asked to reduce the "massive texture bleeds and overlaps that break the design".

What was seen, and what was done (each is a few lines; tested where a test can see it):

| What it looked like | Cause | Fix |
| :--- | :--- | :--- |
| **Bands of sea colour across the ground** in a high free-camera view of a town (`/world/stream?cam=free`), and flicker at a distance | the dev page's free camera had a fixed near plane of 0.05: a 24-bit depth buffer's grain is distance squared over near, 0.1 of a unit at 300 away, and the ground (0) and the sea's plane (-0.3) are closer than that | the free camera's near plane moves out with its height (`TunnelSpike.jsx` `FreeCam`: 0.05 under the ground, up to 6 high up). The game's own follow camera already did this with its distance |
| **Sea water in the tunnel's portals** | the trench is cut below the sea level and the sea's plane is infinite | the plane has a hole over each portal in its geometry (not in a shader the low quality tier turns off) |
| **Two roads' asphalt and dashes fighting at a junction** (a flicker of orange and white lines where roads cross or meet) | every street was laid at the same height | `ROAD_RANK` in `lib/world/chunkMesh.js`: an arterial lies 0.006 over a local street, Harbor Town's boulevard and crescents 0.012, its roundabout 0.02 (over what they cross), and a link road (the tunnel's approaches) 0.012 over the ring it joins, so the road that goes on wins the junction |
| **The train over the road** at the tunnel's portals | the approach road came from the rail's side and was as wide as the tube | the road lane is on the side the ring roads are on, the road is as wide as the lane, and the rail is on the other side ([tunnel.md](tunnel.md)); a test measures the clearance |

Not done: the pale diagonal bands where the cut ground at a portal slopes (a 4-unit grid cannot make a smooth trench); roads that cross at an angle (the boulevard) still show the lower road's lines under the upper one's asphalt only where they are within the same 0.012. If a particular place still shows a bleed, give its coordinates (`?look=x,z,...` on the dev page) and the camera height.
