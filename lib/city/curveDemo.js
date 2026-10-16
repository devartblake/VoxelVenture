import { plotsAlong, sampleCurve } from './curves';

// A sample curved road, used by the /curves sandbox page to show what the format can do. A real
// design for the reserved area (layout.reserved) is written exactly like this.
//
// It starts heading east, runs straight, bends right round a 90 degree corner (radius 16), runs on,
// then eases back left through a long gentle curve (radius 24), and ends with a short straight.
export const DEMO_ROAD = {
  id: 'demo-bend',
  name: 'Sample Bend',
  start: { x: 0, z: 0, heading: Math.PI / 2 },
  segments: [
    { line: 10 },
    { arc: { radius: 16, angle: Math.PI / 2 } },
    { line: 6 },
    { arc: { radius: 24, angle: -Math.PI / 3 } },
    { line: 12 },
  ],
};

const TYPES = ['shop', 'restaurant', 'office'];
const COLORS = ['#3b82f6', '#ec4899', '#14b8a6', '#a855f7', '#f59e0b'];

// The plots beside the sample road, as ready-to-draw plot objects: some built, some empty lots.
export function demoPlots(spec = DEMO_ROAD) {
  const curve = sampleCurve(spec);
  const all = [...plotsAlong(curve, { side: 'right' }), ...plotsAlong(curve, { side: 'left' })];
  return all.map((p, i) => {
    const built = i % 3 !== 1;
    const type = TYPES[i % TYPES.length];
    return {
      id: 1000 + i,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      w: 3,
      d: 3,
      facing: 1, // the plot's own +Z is turned to face the road
      gridX: 0,
      gridZ: 0,
      districtId: 'demo',
      district: 'Sample',
      title: built ? `Sample ${type} ${i + 1}` : `Sample lot ${i + 1}`,
      owner: built ? 'Sample' : null,
      buildingType: built ? type : undefined,
      height: built ? 1.4 + (i % 4) * 0.7 : 0.2,
      color: built ? COLORS[i % COLORS.length] : '#475569',
      interiorData: built ? { floors: 1 + (i % 3) } : null,
    };
  });
}
