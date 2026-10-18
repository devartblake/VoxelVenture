"use client";

import { readFx, saveFx } from '@/lib/state/viewerFx';
import '@/lib/content/pascalBootstrap';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { getLevelElevations } from '@pascal-app/core';
import { applySceneGraphToEditor, useScene } from '@pascal-app/editor';
import { Viewer, WallCutout, useViewer } from '@pascal-app/viewer';
import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { buildInteriorScene, withCatalogAssets } from '@/lib/content/interiorScenes';
import { describeScene, designOnServer, fetchPublished, useDesigns } from '@/lib/state/designStore';
import { hotspotsFor, viewFor } from '@/lib/content/interiorHotspots';
import { focusSection, useInteriorSpots } from '@/lib/state/interiorFocus';
import LookAt from './LookAt';
import RoomWalker, { useRoomWalk, walkTo } from './RoomWalker';
import { businessById, useCityStore } from '@/lib/state/store';

// How the walls are drawn (the viewer's wall mode): "Cut" is the cutaway view, where the walls between the camera and the room are cut away
// so you can see in from above; the others show every wall, lower them to a low rim, or make them see-through.
const WALL_VIEWS = [
  { mode: 'cutaway', label: 'Cut', title: 'Cutaway: walls facing you are cut away' },
  { mode: 'up', label: 'Walls', title: 'All walls full height' },
  { mode: 'down', label: 'Low', title: 'Walls lowered to a rim' },
  { mode: 'translucent', label: 'Glass', title: 'See-through walls' },
];

// What the camera should frame. Kept outside React props on purpose: <Viewer> is created once, so
// changing floors or buildings never re-renders its 3D tree from inside React DOM's commit (which
// trips drei <Html>'s synchronous root unmount: "Attempted to synchronously unmount a root...").
const useRigTarget = create(() => ({ room: null, targetY: 0, plotKey: null, focus: null })); // focus: { eye, look } while a hotspot is shown

// Frames the room at the current floor height; glides when only the floor changes.
function Rig() {
  const { room, targetY, plotKey, focus } = useRigTarget();
  const controls = useRef(null);
  const lastPlot = useRef(null);
  const aspect = useThree((st) => st.size.width / Math.max(1, st.size.height));

  useEffect(() => {
    if (!room || plotKey == null) return;
    const { width, depth } = room;
    const reach = Math.max(width, depth) * 0.9 * Math.max(1, (1.45 / Math.max(0.3, aspect)) ** 0.6); // back off on a narrow (phone) canvas so the room fits
    const animate = lastPlot.current === plotKey; // snap to a new building, glide between its floors
    lastPlot.current = plotKey;
    controls.current?.setLookAt(width / 2 + reach, targetY + reach * 0.85, depth / 2 + reach, width / 2, targetY + 0.4, depth / 2, animate);
  }, [room, targetY, plotKey, aspect]);

  // a hotspot: the camera glides to look at it (choosing "Whole room" clears it, and the effect above frames the room again)
  useEffect(() => {
    if (focus) controls.current?.setLookAt(...focus.eye, ...focus.look, true);
  }, [focus]);

  const reach = room ? Math.max(room.width, room.depth) : 8;
  return <CameraControls ref={controls} makeDefault minDistance={4} maxDistance={reach * 3.5} maxPolarAngle={Math.PI / 2 - 0.05} />;
}

// Shows `plot`'s interior in a <Viewer> (empty scene when `plot` is null, i.e. modal closed), one
// floor at a time. The viewer stays mounted; the scene store is shared with /editor and /viewer,
// so it is cleared whenever there is nothing to show.
export default function InteriorViewer({ plot }) {
  const [scene, setScene] = useState(null); // { buildingId, levelIds, room, floors }
  const [floor, setFloor] = useState(0);
  const shownCut = useRef(false);
  const [activeSpot, setActiveSpot] = useState('overview');
  const business = useCityStore((st) => (plot ? businessById(st, plot.id) : null)); // the live one: its offers can change while you are inside
  const hotspots = useMemo(() => (scene && business ? hotspotsFor(business, scene.room, scene.doorX) : []), [scene, business]);
  const lookAt = (h) => {
    setActiveSpot(h.id);
    if (!h.pos) {
      useRigTarget.setState({ focus: null, targetY: useRigTarget.getState().targetY + 0.0001 }); // frame the whole room again
      return;
    }
    const { eye, look } = viewFor(h, scene.room, useRigTarget.getState().targetY);
    useRigTarget.setState({ focus: { eye, look } });
    focusSection(h.section);
    if (useRoomWalk.getState().on) walkTo(h.pos[0], h.pos[2]); // the avatar walks over there too
  };
  // the visitor's avatar in the room (RoomWalker): what it walks on, and lighting the "Look at" spot it has walked up to
  const walking = useRoomWalk((s) => s.on);
  const reached = useRoomWalk((s) => s.reached);
  useEffect(() => {
    useRoomWalk.setState({ spots: hotspots });
  }, [hotspots]);
  useEffect(() => {
    if (reached) setActiveSpot(reached);
  }, [reached]);
  // the menu itself is <LookAt>: over the room on wider screens, in the storefront panel on a phone; both read the spots from here
  const lookRef = useRef(lookAt);
  lookRef.current = lookAt;
  useEffect(() => {
    useInteriorSpots.setState({ spots: scene && plot ? hotspots : [], look: scene && plot ? (h) => lookRef.current(h) : null });
  }, [scene, plot, hotspots]);
  useEffect(() => {
    useInteriorSpots.setState({ active: activeSpot });
  }, [activeSpot]);
  useEffect(() => () => useInteriorSpots.setState({ spots: [], active: null, look: null }), []);
  const wallMode = useViewer((s) => s.wallMode);
  const designVersion = useDesigns((s) => s.version); // changes when the player saves or resets a redesign in the editor, or the server's changed
  // Created once (and again only when the player reloads the view or switches the effects), so the element does not change while the room is on screen
  // and React skips re-rendering <Viewer>.
  // `transparent`: the room sits on the app's own dark background. The viewer's heavy post-processing (ambient occlusion and denoising) is OFF unless the
  // player turns "Rich effects" on (or the address has ?fx=1): it speckled the walls and stopped the view rendering on some graphics setups. If the graphics
  // card then drops the view, the effects are switched off again by themselves and the choice is remembered.
  const [viewerKey, setViewerKey] = useState(0);
  const [fx, setFxState] = useState(() => readFx());
  const [lost, setLost] = useState(false);
  const [help, setHelp] = useState(false);
  const viewer = useMemo(
    () => (
      <Viewer key={`${viewerKey}-${fx ? 'fx' : 'plain'}`} selectionManager="custom" transparent disablePostFx={!fx}>
        <Rig />
        <WallCutout />
        <RoomWalker />
      </Viewer>
    ),
    [viewerKey, fx]
  );
  const setFx = (on) => {
    saveFx(on);
    setFxState(on);
    setLost(false);
  };

  // the graphics card taking the 3D view away (a lost WebGL context) is noticed and explained; with the effects on, they are switched off for good
  useEffect(() => {
    if (!plot) return undefined;
    const onLost = () => {
      setLost(true);
      setHelp(true);
      if (fx) setFx(false);
    };
    document.addEventListener('webglcontextlost', onLost, true);
    return () => document.removeEventListener('webglcontextlost', onLost, true);
  }, [plot, fx]);
  const reload = () => {
    setLost(false);
    setHelp(false);
    setViewerKey((k) => k + 1);
  };

  // With a game server, ask it for the building's published design. The scene opens at once with what is cached (or the generated interior);
  // if the server's answer is different, the store bumps `designVersion` and the effect below loads the scene again, on its own deferred tick.
  useEffect(() => {
    if (plot && designOnServer(plot.id)) fetchPublished(plot.id).catch(() => {}); // offline: the cached or the generated interior stays
  }, [plot]);

  // Scene changes unmount Pascal's drei <Html> helpers, which unmount a React root synchronously.
  // Doing that inside an effect (while React DOM is still flushing effects) triggers "Attempted
  // to synchronously unmount a root while React was already rendering", so run them on the next
  // tick. Cleanup cancels a pending load, then queues the clear, so order is always clear -> load.
  useEffect(() => {
    const load = setTimeout(() => {
      if (!plot) {
        useScene.getState().clearScene();
        useRigTarget.setState({ room: null, plotKey: null });
        useRoomWalk.setState({ room: null, levelId: null, request: null, reached: null });
        setScene(null);
        return;
      }
      // the owner's redesign if there is one, otherwise the interior generated for this kind of business. With a game server it is the one
      // published there (cached by the effect below), its furniture filled in from the catalogue by id; without one, the player's own.
      const server = designOnServer(plot.id);
      const stored = server ? useDesigns.getState().published[plot.id]?.design : useDesigns.getState().designs[plot.id];
      const saved = stored && server ? withCatalogAssets(stored) : stored;
      const mine = saved ? describeScene(saved) : null;
      const built = mine ? { ...saved, ...mine } : buildInteriorScene(plot);
      applySceneGraphToEditor(built);
      setFloor(0);
      setActiveSpot('overview');
      useRigTarget.setState({ room: built.room, plotKey: `${plot.id}-${designVersion}`, targetY: 0, focus: null });
      setScene({ buildingId: built.buildingId, levelIds: built.levelIds, room: built.room, floors: built.floors, doorX: built.doorX ?? built.room.width / 2 });
      useRoomWalk.setState({ room: built.room, floors: built.floors, doorX: built.doorX ?? built.room.width / 2, key: `${plot.id}-${designVersion}`, levelId: null, floor: 0, request: null, reached: null });
    }, 0);
    return () => {
      clearTimeout(load);
      setTimeout(() => useScene.getState().clearScene(), 0);
    };
  }, [plot, designVersion]);

  // Show only the chosen floor (solo mode) and aim the camera at it.
  useEffect(() => {
    if (!scene) return undefined;
    const t = setTimeout(() => {
      const levelId = scene.levelIds[floor];
      const viewer = useViewer.getState();
      viewer.setLevelMode('solo');
      if (!shownCut.current) {
        viewer.setWallMode('cutaway'); // a building opens in the cut view; the player can change it
        shownCut.current = true;
      }
      viewer.setSelection({ buildingId: scene.buildingId, levelId });
      const baseY = getLevelElevations(useScene.getState().nodes).get(levelId)?.baseY ?? 0;
      useRigTarget.setState({ targetY: baseY });
      useRoomWalk.setState({ levelId, floor, baseY, request: null }); // the avatar walks on the floor shown
    }, 0);
    return () => clearTimeout(t);
  }, [scene, floor]);

  return (
    <div className="absolute inset-0">
      {viewer}

      {scene && (
        <div className="absolute left-3 top-3 flex items-center gap-0.5 rounded-xl border border-slate-700 bg-slate-900/90 p-1 text-xs text-slate-200 shadow-lg" role="group" aria-label="Wall view">
          {WALL_VIEWS.map((v) => (
            <button
              key={v.mode}
              title={v.title}
              aria-pressed={wallMode === v.mode}
              onClick={() => useViewer.getState().setWallMode(v.mode)}
              className={`rounded-lg px-2.5 py-1 font-medium ${wallMode === v.mode ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
            >
              {v.label}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-slate-700" aria-hidden />
          <button
            type="button"
            title={walking ? 'Your avatar is in the room: tap the floor to walk there. Press to hide it.' : 'Show your avatar in the room, and walk it around'}
            aria-pressed={walking}
            onClick={() => useRoomWalk.setState({ on: !walking })}
            className={`rounded-lg px-2.5 py-1 font-medium ${walking ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
            data-testid="room-walk"
          >
            Walk
          </button>
        </div>
      )}

      {scene && plot && (
        // a phone has the menu in the storefront panel instead (StorefrontPanel), where it does not cover the room
        <div className="absolute left-3 top-14 hidden sm:block">
          <LookAt layout="overlay" />
        </div>
      )}

      <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-1.5">
        {help && (
          <div className="w-72 rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-[11px] leading-snug text-slate-300 shadow-xl" role="dialog" aria-label="If the 3D view is blank" data-testid="viewer-help">
            <p className="mb-1 font-semibold text-white">{lost ? 'The graphics card dropped the 3D view.' : 'If this area is blank'}</p>
            <ul className="mb-2 list-disc space-y-1 pl-4">
              <li>Turn on graphics acceleration: browser Settings, System, &ldquo;Use graphics acceleration when available&rdquo;, then restart the browser.</li>
              <li>In Brave, click the lion icon and switch Shields off for this site.</li>
              <li>Close other tabs that use 3D, which can use up the graphics memory.</li>
            </ul>
            {lost && fx === false && readFx() === false && <p className="mb-2 text-amber-300">Rich effects were switched off, since they use the most graphics memory.</p>}
            <button type="button" onClick={reload} className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500">Reload the 3D view</button>
          </div>
        )}
        <button type="button" onClick={() => setFx(!fx)} aria-pressed={fx} title="Soft shadows and ambient occlusion: prettier, but heavier on the graphics card. Off by default." className={`rounded-full border px-2.5 py-1 text-[10px] ${fx ? 'border-indigo-500 bg-indigo-600/30 text-white' : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:text-white'}`} data-testid="viewer-fx">
          Rich effects: {fx ? 'on' : 'off'}
        </button>
        <button type="button" onClick={() => setHelp((h) => !h)} aria-expanded={help} className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[10px] text-slate-400 hover:text-white" data-testid="viewer-help-button">
          Blank or flickering?
        </button>
      </div>

      {scene && scene.floors > 1 && (
        <div className="absolute right-3 top-3 flex flex-col items-stretch gap-1 rounded-xl border border-slate-700 bg-slate-900/90 p-1.5 text-xs text-slate-200 shadow-lg">
          <button
            onClick={() => setFloor((f) => Math.min(scene.floors - 1, f + 1))}
            disabled={floor === scene.floors - 1}
            className="flex items-center justify-center rounded p-1 hover:bg-slate-800 disabled:opacity-30"
            title="Go up a floor"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          {[...scene.levelIds.keys()].reverse().map((i) => (
            <button
              key={i}
              onClick={() => setFloor(i)}
              className={`rounded px-2.5 py-1 font-mono ${i === floor ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
            >
              {i === 0 ? 'G' : i}
            </button>
          ))}
          <button
            onClick={() => setFloor((f) => Math.max(0, f - 1))}
            disabled={floor === 0}
            className="flex items-center justify-center rounded p-1 hover:bg-slate-800 disabled:opacity-30"
            title="Go down a floor"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
