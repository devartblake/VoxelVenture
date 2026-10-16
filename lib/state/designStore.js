import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// The interiors the player has redesigned in the Pascal editor: one scene graph ({ nodes, rootNodeIds, ... }) per plot id. A plot with no
// entry shows the interior generated for its kind of business (lib/content/interiorScenes.js). `version` changes on every save or reset,
// so the viewer knows to load the scene again.
const memory = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
export const useDesigns = create(
  persist(
    (set) => ({
      designs: {},
      version: 0,
      saveDesign: (plotId, graph) => set((s) => ({ designs: { ...s.designs, [plotId]: graph }, version: s.version + 1 })),
      resetDesign: (plotId) =>
        set((s) => {
          const { [plotId]: _gone, ...rest } = s.designs;
          return { designs: rest, version: s.version + 1 };
        }),
    }),
    {
      name: 'voxelventure-designs',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? memory : window.localStorage)),
      partialize: (s) => ({ designs: s.designs }),
    }
  )
);

// What the viewer needs to frame a saved scene: { buildingId, levelIds, room: { width, depth }, floors } (null if it has no building).
export function describeScene(graph) {
  const nodes = graph?.nodes ?? {};
  const building = (graph?.rootNodeIds ?? []).map((id) => nodes[id]).find((n) => n?.type === 'building');
  if (!building) return null;
  const levels = (building.children ?? []).map((id) => nodes[id]).filter((n) => n?.type === 'level').sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  if (!levels.length) return null;
  let width = 0;
  let depth = 0;
  for (const n of Object.values(nodes)) {
    if (n?.type === 'slab' || n?.type === 'zone') for (const [x, z] of n.polygon ?? []) { width = Math.max(width, x); depth = Math.max(depth, z); }
    if (n?.type === 'wall') for (const [x, z] of [n.start, n.end]) { width = Math.max(width, x); depth = Math.max(depth, z); }
  }
  return { buildingId: building.id, levelIds: levels.map((l) => l.id), room: { width: width || 8, depth: depth || 6 }, floors: levels.length };
}

// The colour the player gave the outside of the building in the editor: the most common colour among the exterior sides of the ground
// floor's walls (a wall's exterior material, or its general material). null while no wall has a plain colour.
const HEX = /^#[0-9a-f]{6}$/i;
export function exteriorColorOf(graph) {
  const nodes = graph?.nodes ?? {};
  const building = (graph?.rootNodeIds ?? []).map((id) => nodes[id]).find((n) => n?.type === 'building');
  const ground = (building?.children ?? []).map((id) => nodes[id]).filter((n) => n?.type === 'level').sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0];
  const count = new Map();
  for (const id of ground?.children ?? []) {
    const wall = nodes[id];
    if (wall?.type !== 'wall') continue;
    const c = wall.exteriorMaterial?.properties?.color ?? wall.material?.properties?.color;
    if (typeof c === 'string' && HEX.test(c)) count.set(c.toLowerCase(), (count.get(c.toLowerCase()) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
