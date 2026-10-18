import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiOn, request } from '../data/api';
import { storedDesign } from '../content/interiorDesign';

// The interiors the player has redesigned in the Pascal editor: one scene graph ({ nodes, rootNodeIds, ... }) per plot id. A plot with no
// entry shows the interior generated for its kind of business (lib/content/interiorScenes.js). `version` changes on every save or reset,
// so the viewer knows to load the scene again.
//
// With a game server, a building's design is the one its owner published there (GET /plots/:id/interior, services/api/interiors.mjs), so
// every visitor sees it on any device. `published` caches what the server served, by plot (for this visit only); `designs` is then only the
// owner's draft while editing (kept in the browser, so an unsaved change survives a closed tab or a refused save) and `bases` the revision
// each draft started from (a save from an older one is refused). Without a server (the single-player demo), and for the stores in the
// malls (ids that are not plot numbers), `designs` is the design, as before.
const memory = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const without = (map, key) => {
  const { [key]: _gone, ...rest } = map;
  return rest;
};
const CACHED = 30; // plots whose published design is kept in memory
export const useDesigns = create(
  persist(
    (set) => ({
      designs: {},
      bases: {},
      published: {}, // plotId -> { design (null: the generated interior), revision }
      version: 0,
      saveDesign: (plotId, graph) => set((s) => ({ designs: { ...s.designs, [plotId]: graph }, version: s.version + 1 })),
      resetDesign: (plotId) => set((s) => ({ designs: without(s.designs, plotId), bases: without(s.bases, plotId), version: s.version + 1 })),
    }),
    {
      name: 'voxelventure-designs',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? memory : window.localStorage)),
      partialize: (s) => ({ designs: s.designs, bases: s.bases }),
    }
  )
);

// Whether this plot's design lives on the server: with a game server, for the city's plots (numbered), not the mall stores.
export const designOnServer = (plotId) => apiOn() && /^\d+$/.test(String(plotId));

// Keeps what the server said about a plot; the viewer loads the scene again only when it changed.
function remember(plotId, state) {
  const { design = null, revision = 0 } = state ?? {};
  const s = useDesigns.getState();
  const had = s.published[plotId];
  if (had && had.revision === revision && Boolean(had.design) === Boolean(design)) return;
  const kept = Object.entries(s.published).filter(([id]) => id !== String(plotId)).slice(-(CACHED - 1));
  useDesigns.setState({ published: { ...Object.fromEntries(kept), [plotId]: { design, revision } }, version: s.version + 1 });
}

// The plot's published design from the server (and into the cache). Resolves with { design, revision }; throws an ApiFailure when the
// server cannot be reached (the cache, or the generated interior, is shown meanwhile).
export async function fetchPublished(plotId) {
  const state = await request('GET', `/plots/${plotId}/interior`);
  remember(plotId, state);
  return useDesigns.getState().published[plotId];
}

// The owner publishes the scene from the editor, based on the revision their draft started from. Each item goes up by its catalogue id only
// (lib/content/interiorDesign.js). On success the draft is done with; a refusal (not the owner, a newer revision elsewhere, a design the
// server will not take) throws the server's ApiFailure and keeps the draft.
export async function publishDesign(plotId, graph) {
  const s = useDesigns.getState();
  const revision = s.bases[plotId] ?? s.published[plotId]?.revision ?? 0;
  const state = await request('PUT', `/plots/${plotId}/interior`, { design: storedDesign(graph), revision });
  useDesigns.setState((st) => ({ designs: without(st.designs, plotId), bases: without(st.bases, plotId) }));
  remember(plotId, state);
  return state;
}

// The owner goes back to the generated interior.
export async function unpublishDesign(plotId) {
  const s = useDesigns.getState();
  const revision = s.bases[plotId] ?? s.published[plotId]?.revision ?? 0;
  const state = await request('DELETE', `/plots/${plotId}/interior`, { revision });
  useDesigns.setState((st) => ({ designs: without(st.designs, plotId), bases: without(st.bases, plotId) }));
  remember(plotId, state);
  return state;
}

// Throws away the owner's draft (after a refused save: the published design is what the editor opens next).
export const discardDraft = (plotId) => useDesigns.setState((s) => ({ designs: without(s.designs, plotId), bases: without(s.bases, plotId) }));

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
