"use client";

import { useEditingBusiness } from '@/lib/state/editingBusiness';
import '@/lib/content/pascalBootstrap';
import React, { useEffect, useRef, useState } from 'react';
import { Editor, useScene } from '@pascal-app/editor';
import { Armchair, Building2, Check, Lightbulb, Palette, RotateCcw, Settings } from 'lucide-react';
import ColoursPanel from './editor/ColoursPanel';
import FurniturePanel from './editor/FurniturePanel';
import HelpPanel from './editor/HelpPanel';
import { buildInteriorScene, withCatalogAssets } from '@/lib/content/interiorScenes';
import { designOnServer, discardDraft, exteriorColorOf, fetchPublished, publishDesign, unpublishDesign, useDesigns } from '@/lib/state/designStore';
import { useCityStore } from '@/lib/state/store';

// The Pascal editor on one building's interior, over the whole window: move, add and remove furniture, walls, doors and windows, and
// change the materials and colours of the walls inside. It starts from the player's saved design, or the generated interior. Changes are
// kept per plot (lib/state/designStore.js) while editing, and "Done" returns to the walk-through with them applied. With a game server,
// "Done" and "Original" go to the server, so every visitor sees the result; if it refuses, the reason is shown and the editor stays open.
// The editor's side panels, in the order people need them: a short guide, the furniture (sorted into dropdown groups), colours for the walls
// and floor, then the building's levels and the editor's settings. ('site' and 'settings' are built into the editor; the host only lists them.)
const NOTHING = () => null;
const icon = (Icon) => <Icon className="h-5 w-5" />;
const SIDEBAR_TABS = [
  { id: 'help', label: 'Start', icon: icon(Lightbulb), mobileIcon: icon(Lightbulb), component: HelpPanel },
  { id: 'items', label: 'Furniture', icon: icon(Armchair), mobileIcon: icon(Armchair), component: FurniturePanel },
  { id: 'colours', label: 'Colours', icon: icon(Palette), mobileIcon: icon(Palette), component: ColoursPanel },
  { id: 'site', label: 'Floors', icon: icon(Building2), mobileIcon: icon(Building2), component: NOTHING },
  { id: 'settings', label: 'Settings', icon: icon(Settings), mobileIcon: icon(Settings), component: NOTHING },
];

export default function InteriorEditor({ plot, onClose }) {
  // tell the furniture menu what kind of business this is
  useEffect(() => {
    useEditingBusiness.setState({ type: plot.buildingType ?? plot.interiorData?.theme ?? null, variant: plot.interiorData?.variant ?? null, plotId: plot.id, value: plot.value ?? 0 });
    return () => useEditingBusiness.setState({ type: null, variant: null, plotId: null, value: 0 });
  }, [plot.id, plot.buildingType, plot.interiorData?.theme, plot.interiorData?.variant, plot.value]);
  const startColor = useRef(undefined); // the outside colour the design had when the editor opened, so only a change made here is applied
  const server = designOnServer(plot.id); // with a game server, Done publishes the design there (lib/state/designStore.js)
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState(null); // { message, stale }: the server did not take the save or the reset
  const load = async () => {
    let graph = useDesigns.getState().designs[plot.id]; // the draft: this browser's unsaved changes (or, without a server, the design)
    if (server) {
      const published = await fetchPublished(plot.id).catch(() => useDesigns.getState().published[plot.id]);
      // a draft remembers the revision it started from, so a save after someone else's is refused instead of overwriting it
      if (!graph || useDesigns.getState().bases[plot.id] == null) useDesigns.setState((s) => ({ bases: { ...s.bases, [plot.id]: published?.revision ?? 0 } }));
      graph ??= published?.design ? withCatalogAssets(published.design) : null;
    }
    graph ??= buildInteriorScene(plot);
    startColor.current = exteriorColorOf(graph);
    return graph;
  };
  const refuse = (e) => setRefused({ message: e?.message ?? 'The design could not be saved. Try again in a moment.', stale: e?.code === 'stale_revision' });
  const discard = () => {
    discardDraft(plot.id);
    fetchPublished(plot.id).catch(() => {}); // the walk-through shows the version that was saved elsewhere
    onClose();
  };
  // autosave from the editor must not make the viewer behind it reload the scene (that would replace what is being edited), so it writes the
  // design without bumping the version; Done / Reset do.
  // The outside wall colour set on the walls in the editor is the building's colour in the city.
  const applyOutside = (graph) => {
    const color = exteriorColorOf(graph);
    if (color && color !== startColor.current && useCityStore.getState().plots.find((p) => p.id === plot.id)?.wallColor !== color) useCityStore.getState().setPlotWallColor(plot.id, color);
  };
  const autosave = async (scene) => {
    useDesigns.setState((s) => ({ designs: { ...s.designs, [plot.id]: scene } }));
    applyOutside(scene);
  };
  const done = async () => {
    const { nodes, rootNodeIds } = useScene.getState();
    if (!rootNodeIds?.length) return onClose();
    const graph = JSON.parse(JSON.stringify({ nodes, rootNodeIds }));
    applyOutside(graph);
    if (!server) {
      useDesigns.getState().saveDesign(plot.id, graph);
      return onClose();
    }
    // published for every visitor; if the server refuses, the editor stays open with the reason and the draft is kept
    useDesigns.setState((s) => ({ designs: { ...s.designs, [plot.id]: graph } }));
    setSaving(true);
    setRefused(null);
    try {
      await publishDesign(plot.id, graph);
      onClose();
    } catch (e) {
      refuse(e);
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    if (!window.confirm('Go back to the original interior? Your changes to this building will be lost.')) return;
    if (!server) {
      useDesigns.getState().resetDesign(plot.id);
      return onClose();
    }
    setSaving(true);
    setRefused(null);
    try {
      await unpublishDesign(plot.id);
      onClose();
    } catch (e) {
      refuse(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-sx-page">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-sx-stroke bg-sx-panel px-4">
        <div className="min-w-0">
          <span className="text-sm font-bold text-white">Redesigning {plot.title}</span>
          <span className="ml-2 hidden text-xs text-slate-400 sm:inline">Plot #{plot.id} · Start tab for a quick guide · Furniture to place items · Colours to paint the walls</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={reset} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-sx-stroke px-3 py-1.5 text-xs text-slate-300 hover:bg-sx-alt disabled:opacity-50">
            <RotateCcw className="h-3.5 w-3.5" /> Original
          </button>
          <button onClick={done} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-4 py-1.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-60" data-testid="interior-done">
            <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
      {refused && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-red-900 bg-red-950/80 px-4 py-2 text-xs text-red-100" data-testid="interior-refused">
          <span className="min-w-0 flex-1">Not saved: {refused.message} Your changes are kept in this browser.</span>
          {refused.stale && (
            <button onClick={discard} className="rounded-lg border border-red-700 px-3 py-1 text-red-100 hover:bg-red-900">
              Drop my changes and see the saved version
            </button>
          )}
          <button onClick={() => setRefused(null)} className="rounded-lg px-2 py-1 text-red-300 hover:text-white" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <Editor layoutVersion="v2" projectId={`plot-${plot.id}`} sidebarTabs={SIDEBAR_TABS} onLoad={load} onSave={autosave} />
      </div>
    </div>
  );
}
