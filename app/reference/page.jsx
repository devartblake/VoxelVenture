// Road-design reference: real street networks next to this city, at the same scale.
// The three real maps are drawn from OpenStreetMap data (see public/reference/*.svg and
// docs/road_design_reference.md for how they were made and what was measured).

const MAPS = [
  {
    id: 'nyc',
    title: 'Midtown Manhattan',
    src: '/reference/nyc.svg',
    measured: '123 km of road · two directions carry 89% of it (64% + 25%), at right angles, the whole grid tilted ~28° off north',
    ideas: [
      'A strict grid of long, narrow blocks: many cross streets, far fewer avenues.',
      'Broadway is the one diagonal. Where it crosses the grid it leaves triangular blocks and small plazas (the "bow-tie" squares).',
      'For us: one diagonal avenue would make wedge-shaped prime plots and a plaza at each crossing.',
    ],
  },
  {
    id: 'sf',
    title: 'Market Street, San Francisco',
    src: '/reference/sf.svg',
    measured: '136 km of road · four main directions: ~83° and ~173° north of Market, ~48° and ~138° south of it (the two grids sit ~35° apart)',
    ideas: [
      'Two separate grids, each at its own angle, meeting along one diagonal boulevard (Market Street).',
      'Where they meet, blocks are wedges and the streets jog or dead-end against the boulevard.',
      'For us: Old Town could be its own grid, turned a little, joined to the main grid by a diagonal avenue.',
    ],
  },
  {
    id: 'dc',
    title: 'Downtown Washington, DC',
    src: '/reference/dc.svg',
    measured: '103 km of road · a plain north-south / east-west grid (22% + 21%) with diagonal avenues (~7%) cutting across it at ~22° to the grid',
    ideas: [
      "L'Enfant's plan: wide diagonal avenues radiate from circles and squares laid over an ordinary grid.",
      'Each circle is a landmark: a roundabout round a monument or fountain, with prime frontage all round it.',
      'For us: grow a few of the small roundabouts into real circles (radius 6-8) with a plaza, and run diagonals between them.',
    ],
  },
  {
    id: 'voxelventure',
    title: 'VoxelVenture today',
    src: '/reference/voxelventure.svg',
    measured: '38 roads, all axis-aligned, each starting and ending at a junction (no loose ends) · a downtown grid, four ring roads, Old Town, a county road, a river with bridges, three rectangular lakes · about 1.7 x 1.4 km at 7 m per unit',
    ideas: [
      'Like a SimCity map: a dense, tall downtown on a grid; lower buildings and Old Town houses towards the edge; then farmland, woods, a river and lakes.',
      'Borrowed so far: the road hierarchy (arterials / locals), a closed ring, and a riverside drive along the water like the Embarcadero or the West Side.',
      'Also borrowed: a short diagonal avenue joining big circles with monuments (Broadway / DC), and compact circles in place of small roundabouts. Still missing: a second grid at a different angle (San Francisco), and a diagonal long enough to feel like a boulevard.',
    ],
  },
];

export const metadata = { title: 'Road design reference' };

export default function ReferencePage() {
  return (
    <div className="h-screen overflow-y-auto bg-[#090d16] text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-2xl font-bold">Road design reference</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Three real street networks, drawn from OpenStreetMap data at one scale (500 m scale bar on each), next to this city drawn the same way.
          What each one does well, and what we could borrow. Full notes: <code className="text-slate-300">docs/road_design_reference.md</code>.
        </p>

        <div className="mt-8 space-y-10">
          {MAPS.map((m) => (
            <section key={m.id}>
              <h2 className="text-lg font-semibold">{m.title}</h2>
              <p className="mb-3 mt-1 text-xs text-slate-500">Measured: {m.measured}</p>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <img src={m.src} alt={`Road map of ${m.title}`} className="w-full rounded-lg border border-slate-800" />
                <ul className="space-y-2 text-sm text-slate-300">
                  {m.ideas.map((idea) => (
                    <li key={idea} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">{idea}</li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-slate-800 pt-4 text-xs text-slate-500">
          Road data © OpenStreetMap contributors, available under the Open Database Licence (ODbL). Fetched through the Overpass API on 2026-10-12.
        </p>
      </div>
    </div>
  );
}
