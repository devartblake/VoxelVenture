# The pilot tour

A guided demo of Voxel Venture for prospective pilot businesses. The owner can run it live in a meeting or record it for sales material. It is the "Deterministic demos" row of the [adoption plan](../architecture/external_voxel_repositories_adoption_plan.md) (section 17).

The tour flies the camera through ten stops in about two and a half minutes. At each stop a caption card explains what the business owner is looking at, in their own terms. It uses the default city (seed 20260101) and its own businesses, so it shows the same buildings, prices and figures every time. It works with the API and without it (demo mode).

**A tour only looks.** While it runs, the tab is read-only: nothing is claimed, bought, counted or saved. See [What the tour never changes](#what-the-tour-never-changes).

## Running it live

Open the city with `?tour=pilot`:

- locally: `http://localhost:3000/?tour=pilot`;
- on the live site: `https://voxelventure.app/?tour=pilot`.

The tour starts by itself once the city has drawn. Each stop stays for its time (14 to 16 seconds), then the tour moves on. It stops at the last stop.

| Control | Keyboard | Button |
| --- | --- | --- |
| Next stop | → or Page Down | **Next** (**Finish** on the last stop) |
| Previous stop | ← or Page Up | **‹** |
| Pause or play | Space | **❙❙** / **▶** |
| Leave the tour | Esc | **×** |

- **Presentation clickers** send Page Up and Page Down, so they work.
- **Keys inside a page** the tour opened (the business page, Discover) still drive the tour.
- **On a phone or tablet**, the buttons are finger-sized (44 px or more). The caption card sits at the bottom of the screen.
- **Reduced motion:** with the system's reduce-motion setting on, the camera cuts to each stop instead of flying.
- **Leaving the tour** reloads the page as an ordinary visit, with the visitor's own saved game.

Options in the address:

| Option | What it does |
| --- | --- |
| `tourStop=5` | Starts at stop 5 |
| `tourSpeed=4` | Runs four times faster (1 to 20). The recorder and the tests use it |
| `time=dusk` | Shows another time of day. A tour is in daylight by default, the same on every run |

**Before a meeting:** open the tour once on the machine you will present from, so the city's models are cached. Close other tabs. On a laptop without a good graphics card, the overview stops are the slowest.

## The stops

The default tour is "Pilot walk-through" (`pilot`, in [`lib/tour/tours.js`](../../lib/tour/tours.js)). It shows Combo Cafe, a diner on Arcade Alley (plot 83), and the empty lot next door (plot 84).

| # | Caption | What the stop shows | Time |
| --- | --- | --- | --- |
| 1 | **A city of real businesses.** Voxel Venture is a 3D city that people explore like a game. Every building is a business, and every visit is counted for its owner. | The city from high up | 15 s |
| 2 | **Your storefront on Arcade Alley.** This is Combo Cafe, a diner near the middle of the city. Your business stands on a street like this, with your name, colours and logo. | Combo Cafe from the street | 14 s |
| 3 | **Your building card.** Click a building and its card opens: what you do, a link to your site, and how many people have visited. | The building card | 14 s |
| 4 | **Visitors walk in.** Visitors step inside your 3D storefront, look around and press your button. A coupon or a visit reward gives them a reason to come in. | The room inside | 15 s |
| 5 | **Your business page.** You also get a plain, fast page for search and social links. It has one call to action: order, book or visit your website. | `/business/combo-cafe-83` | 15 s |
| 6 | **Your verified figures.** Your dashboard shows what the city brought you: visits, store entries, button presses and sales. Only verified visitors count: no bots and none of your own visits. | The owner's dashboard (preview) | 16 s |
| 7 | **Claim a lot of your own.** The lot next door is free. Lease it for 7, 14 or 30 days and set up your building as you like. Pro members pay 15% less. | The claim form's prices (preview) | 16 s |
| 8 | **Grow with Pro.** Put the lease, Pro and a sponsored week in one cart and pay once. Pro adds where your visitors came from, campaign results and 15% off leases. | The cart (preview) | 15 s |
| 9 | **Be found on Discover.** Discover lists every business by category and district. A sponsored week puts yours at the top, clearly labelled. | `/discover`, at its Sponsored row | 15 s |
| 10 | **Join the pilot.** The pilot runs for four weeks with a small group of businesses. Your page is free; each week you see your verified figures and tell us what is missing. | The city from high up | 14 s |

### The previews

The owner's dashboard, the claim form and the cart need a signed-in owner, and they buy things. So the tour shows previews of them instead ([`apps/web/components/tour/Previews.jsx`](../../apps/web/components/tour/Previews.jsx)). Each one is labelled as a preview, and its buttons are disabled.

- **The dashboard** uses the owner page's own funnel and results ([`ManageProfiles.jsx`](../../apps/web/components/business/ManageProfiles.jsx)). It shows sample figures for a pilot business's first 30 days. The figures come from the seed, so they are the same every run, and they have the shape of the owner's real figures (the `business.owner-figures` contract).
- **The claim form** has the 7, 14 and 30-day prices of plot 84, with and without Pro. They come from the same price function the claim form and the server use (`lib/game/claimPrice.js`).
- **The cart** has a 30-day lease of plot 84 at the Pro price, Pro, and a sponsored week on Discover. They are priced as the server's cart prices them.

### With the API and without it

- **Without the API (demo mode)**, the business page and Discover show the city's own sample businesses, as they always do.
- **With the API**, the live site has no profile for Combo Cafe. With `?tour=` in its address, the business page shows the city's sample profile instead, marked "A sample business of the guided tour".
- **Discover's Sponsored row** shows Combo Cafe as a sample when nobody is sponsored yet. It is titled "Sponsored (a sample for the tour)".
- **A sample business has no real website.** On a tour, its call to action is an example one ("Order online", to an `example.com` address).

## What the tour never changes

While a tour runs (`?tour=` in the address, or the tab's session storage, which the pages it opens share):

- **Requests:** [`lib/data/api.js`](../../lib/data/api.js) refuses every request that is not a GET before it is sent. No claim, purchase, vote, coupon, visit, button press, plot intent or hold goes out.
- **Presence:** no ping is sent, so the tour is not counted as a visitor, and no presence connection is opened.
- **The saved game:** the game neither loads nor saves the player's own game. The tour always sees the seeded city, and a returning player's game is left as it was.
- **The room:** stepping inside is not counted as a visit.

Leaving the tour reloads the page without `?tour=`, as an ordinary visit.

## Recording it

```sh
npm run build                          # once (or pass --url to record a running site)
node scripts/tour-record.mjs           # the pilot tour, 1600×900
```

The recorder opens the tour in headless Edge or Chrome. For each stop it:

1. waits for the camera to arrive and for what the stop opens to load;
2. takes a screenshot;
3. presses → for the next stop.

It writes `artifacts/tour/<time>/`:

- `01-city.png` to `10-pilot.png`: one screenshot per stop;
- `storyboard.md`: the captions beside the pictures, with each stop's camera and what it opens;
- `console.txt`: the page's console;
- `frames/` (with `--frames`): a numbered frame sequence of the whole run.

To make a video from the frames: `ffmpeg -framerate 4 -i frames/%05d.jpg -pix_fmt yuv420p tour.mp4`.

| Option | Default | What it does |
| --- | --- | --- |
| `--url <address>` | a local production build | Records a running site (a dev server, staging). The tour is read-only, so recording changes nothing there |
| `--tour <id>` | `pilot` | Which tour |
| `--width`, `--height` | 1600, 900 | The window size |
| `--phone` | | A 412×915 touch phone |
| `--gpu` | | Draws with this machine's graphics card. Without it, the recorder uses the software renderer the tests use, which is slower but the same on every machine |
| `--frames`, `--fps <n>` | 4 fps | Also records a frame sequence |
| `--settle <ms>` | 3500 | How long each stop is left to load before its screenshot |
| `--out <dir>` | `artifacts/tour/<time>` | Where to write |

The exit code is 1 if a stop was not reached. `artifacts/` is not committed.

## Editing a tour or adding one

A tour is data, not code. It is checked against the `demo.tour` contract in [`packages/shared-types`](../../packages/shared-types/src/contracts/demo-tour.js), which sits next to the journeys' `test.scenario` contract.

```js
{
  id: 'storefront',                                   // kebab-case, unique in the tour
  title: 'Your storefront on Arcade Alley',           // up to 60 characters
  text: 'This is Combo Cafe, ...',                    // one or two sentences, up to 240 characters
  target: { plot: 83 },                               // or { district: 'arcade' }, { place: 'center' }, { place: 'mall-1' }, { x, z }
  camera: { view: 'diablo', distance: 22, pitch: 0.75, heading: 35 },
  action: { kind: 'card', plot: 83 },                 // optional
  durationMs: 14000,                                  // 3 to 60 seconds
}
```

**The camera:**

- `view` is a follow preset: `diablo`, `third`, `tactical`, `overview` or `top`.
- `distance` is in world units, from 6 to 180.
- `pitch` is how far above the ground the camera looks from, from 0.25 (low) to 1.52 (straight down).
- `heading` is the compass direction the camera looks towards, in degrees (0 is north). `'front'` looks at the target plot's door.

**The actions** only show things:

| Action | What it opens |
| --- | --- |
| `card` (`plot`) | The building's card |
| `interior` (`plot`) | The room inside |
| `page` (`path`) | A public page in a frame: `/discover`, `/business/<slug>`, `/category/<id>` or `/district/<id>`, optionally with a `#section`. Never an outside link, the owner's pages or the cart |
| `dashboard` (`plot`) | The owner's dashboard preview for that business |
| `claim` (`plot`) | The claim form's prices for that empty lot |
| `cart` (`plot`, `claimPlot`) | The cart preview: Pro and a sponsored week for `plot`'s business, a lease of `claimPlot` |

**To change the pilot tour:**

1. Edit `PILOT_TOUR` in [`lib/tour/tours.js`](../../lib/tour/tours.js).
2. Write captions as the business owner would say it: "your storefront", "your figures". Keep them short; the card has room for two lines on a computer.
3. Run `node tests/run.mjs tour` to check the contract, the targets and the timing (the pilot tour must stay between 8 and 10 stops and between two and three minutes).
4. Run `node tests/journeys/pilot-tour.test.mjs` to run it end to end.
5. Record it again for the sales material.

**To add another tour** (for example, one for a market-stall trader), add it to `TOURS` in the same file with its own `id`, and open `/?tour=<id>`.

**Plot ids depend on the city.** The tour names plots of seed 20260101, and the world is frozen ([world_freeze.md](../roadmap/world_freeze.md)). If the city generator changes, `tests/tour.test.mjs` says which stop no longer fits.

## Tests

| Test | What it checks |
| --- | --- |
| [`tests/tour.test.mjs`](../../tests/tour.test.mjs) | Each tour fits `demo.tour`, and the contract refuses outside links, the owner's pages, actions that buy, and code. Each target and action is in the seeded city, and the business and lot are what the captions say. The pilot tour has 8 to 10 stops in two to three minutes, in the right order. It also checks the camera maths, that the previews' prices are the server's and their figures are the same every run, and that the API refuses writes during a tour |
| [`tests/journeys/pilot-tour.test.mjs`](../../tests/journeys/pilot-tour.test.mjs) | The tour end to end against the API on a computer. Every stop is reached in order, with its caption and what it opens. It checks the buttons, the keys (Page Down included) and the timing, and that reduced motion cuts. No request that changes anything leaves the browser, and no presence connection opens. A saved game is untouched. Esc leaves |
| [`tests/browser.test.mjs`](../../tests/browser.test.mjs) | The tour in demo mode on a phone, tapped through with Next. The buttons are finger-sized, nothing scrolls sideways, there are no console errors, and nothing is saved |

## Where the code is

| What | Where |
| --- | --- |
| The contract | [`packages/shared-types/src/contracts/demo-tour.js`](../../packages/shared-types/src/contracts/demo-tour.js) (`DEMO_TOUR`) |
| The tours | [`lib/tour/tours.js`](../../lib/tour/tours.js) |
| The camera targets and the timing | [`lib/tour/plan.js`](../../lib/tour/plan.js) |
| The previews' prices and figures | [`lib/tour/previews.js`](../../lib/tour/previews.js) |
| Read-only mode | [`lib/tour/mode.js`](../../lib/tour/mode.js), and the guard in [`lib/data/api.js`](../../lib/data/api.js) |
| The player and the caption card | [`apps/web/components/tour/TourPlayer.jsx`](../../apps/web/components/tour/TourPlayer.jsx) |
| The recorder | [`scripts/tour-record.mjs`](../../scripts/tour-record.mjs) |

The player moves the existing follow camera (`lib/state/viewStore.js`) and opens the existing card, room and pages. It adds no component to the city.
