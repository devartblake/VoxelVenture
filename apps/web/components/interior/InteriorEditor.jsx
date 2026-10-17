"use client";

import { useEditingBusiness } from '@/lib/state/editingBusiness';
import '@/lib/content/pascalBootstrap';
import React, { useEffect, useRef } from 'react';
import { Editor, useScene } from '@pascal-app/editor';
import { Armchair, Building2, Check, Lightbulb, Palette, RotateCcw, Settings } from 'lucide-react';
import ColoursPanel from './editor/ColoursPanel';
import FurniturePanel from './editor/FurniturePanel';
import HelpPanel from './editor/HelpPanel';
import { buildInteriorScene } from '@/lib/content/interiorScenes';
import { exteriorColorOf, useDesigns } from '@/lib/state/designStore';
import { useCityStore } from '@/lib/state/store';

// The Pascal editor on one building's interior, over the whole window: move, add and remove furniture, walls, doors and windows, and
// change the materials and colours of the walls inside. It starts from the player's saved design, or the generated interior. Changes are
// kept per plot (lib/state/designStore.js) while editing, and "Done" returns to the walk-through with them applied.
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
  const load = async () => {
    const graph = useDesigns.getState().designs[plot.id] ?? buildInteriorScene(plot);
    startColor.current = exteriorColorOf(graph);
    return graph;
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
  const done = () => {
    const { nodes, rootNodeIds } = useScene.getState();
    if (rootNodeIds?.length) {
      const graph = JSON.parse(JSON.stringify({ nodes, rootNodeIds }));
      useDesigns.getState().saveDesign(plot.id, graph);
      applyOutside(graph);
    }
    onClose();
  };
  const reset = () => {
    if (!window.confirm('Go back to the original interior? Your changes to this building will be lost.')) return;
    useDesigns.getState().resetDesign(plot.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-sx-page">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-sx-stroke bg-sx-panel px-4">
        <div className="min-w-0">
          <span className="text-sm font-bold text-white">Redesigning {plot.title}</span>
          <span className="ml-2 hidden text-xs text-slate-400 sm:inline">Plot #{plot.id} · Start tab for a quick guide · Furniture to place items · Colours to paint the walls</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-sx-stroke px-3 py-1.5 text-xs text-slate-300 hover:bg-sx-alt">
            <RotateCcw className="h-3.5 w-3.5" /> Original
          </button>
          <button onClick={done} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-4 py-1.5 text-xs font-bold text-white hover:brightness-110">
            <Check className="h-4 w-4" /> Done
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <Editor layoutVersion="v2" projectId={`plot-${plot.id}`} sidebarTabs={SIDEBAR_TABS} onLoad={load} onSave={autosave} />
      </div>
    </div>
  );
}
