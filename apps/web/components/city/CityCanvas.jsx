"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import GroundGrid from './GroundGrid';
import Plots from './Plots';
import StaticBatch from './StaticBatch';
import Road from './Road';
import Park from './Park';
import IntersectionControl from './IntersectionControl';
import MidBlockCrossing from './MidBlockCrossing';
import Billboard from './Billboard';
import Avatar, { GroundClick } from './Avatar';
import DailyChest from './DailyChest';
import ScavengerStars from './ScavengerStars';
import Airports from './Airports';
import Planes from './Planes';
import Vehicles from './Vehicles';
import Malls from './Malls';
import Crowns from './Crowns';
import AmusementPark from './AmusementPark';
import Piers from './Piers';
import Promenade from './Promenade';
import DayNight from './DayNight';
import DraftBuilding from './DraftBuilding';
import StreamedNetwork from './StreamedNetwork';
import Traffic from './Traffic';
import CurvedRoad from './CurvedRoad';
import ReservedArea from './ReservedArea';
import Lake from './Lake';
import Land from './Land';
import GroundPatches from './GroundPatches';
import River from './River';
import DiagonalRoad from './DiagonalRoad';
import RemotePlayers from './RemotePlayers';
import PerfProbe from './PerfProbe';
import CameraFocus from './CameraFocus';
import FollowCamera from './FollowCamera';
import { PRESETS, useView } from '@/lib/state/viewStore';
import { Fields, Shrubs, Woods } from './Farmland';
import Hills from './Hills';
import Label3D from './Label3D';
import Animals from './Animals';
import GpuGuard, { GpuNotice } from './GpuGuard';
import CameraHeading from './CameraHeading';
import SoundListener from './SoundListener';
import RouteFollower from './RouteFollower';
import MarketStalls from './MarketStalls';
import { plotOfTheDay } from '@/lib/game/daily';
import { useCityStore } from '@/lib/state/store';
import { initQuality, useQuality } from '@/lib/performance/runtime';
import { thinOut } from '@/lib/performance/qualityPolicy';
import QualityBadge from '@/components/ui/QualityBadge';

// The names of the themed districts, floating high over the middle of their plots, in each district's colour: the same districts the world
// map names (components/ui/worldMap/mapData.js), so a visitor knows where they are without opening the map (VV-UX-13).
const SIGNED = ['saas', 'creator', 'bazaar', 'arcade', 'suburb'];
function DistrictSigns({ plots, layout }) {
  const signs = useMemo(() => {
    const by = new Map();
    for (const p of plots) {
      if (!SIGNED.includes(p.districtId) || p.designSite) continue;
      const d = by.get(p.districtId) ?? { x: 0, z: 0, n: 0 };
      d.x += p.x;
      d.z += p.z;
      d.n++;
      by.set(p.districtId, d);
    }
    return (layout.districts ?? []).filter((d) => (by.get(d.id)?.n ?? 0) > 6).map((d) => ({ id: d.id, name: d.name, color: d.color, x: by.get(d.id).x / by.get(d.id).n, z: by.get(d.id).z / by.get(d.id).n }));
  }, [plots, layout]);
  return signs.map((d) => <Label3D key={d.id} text={d.name} position={[d.x, 7.5, d.z]} background="#0b1020" color="#ffffff" border={d.color} height={1.3} />);
}

export default function CityCanvas() {
  const day = useCityStore((state) => state.day);
  // How much is drawn comes from the capability policy (lib/performance/; docs/architecture/performance_policy.md): the pixel-ratio
  // range follows the tier in force; the shadow map and the decoration density follow the settings the city was set up with.
  // The device is read after mount (so the server render matches); until then this draws as a desktop always did.
  useEffect(() => initQuality(), []);
  const dpr = useQuality((s) => s.settings.dpr);
  const load = useQuality((s) => s.load);
  const { plots, billboards, layout, selectedPlot, selectedPark, selectedBillboardId, setSelectedPlot, setSelectedPark, setSelectedBillboard, clearSelectedPlot } = useCityStore();

  // The merged road meshes are baked once, so they are rebuilt whenever the roads are not the ones that were baked:
  // a new seed, but also the same seed from different generator code (a hot reload) or a changed road.
  const batchKey = useMemo(() => {
    let h = 0;
    for (const r of layout.roads) h = (h * 31 + Math.round((r.center * 7 + r.from * 3 + r.to) * 10)) | 0;
    return `${layout.seed}-${layout.roads.length}-${layout.intersections.length}-${h}`;
  }, [layout]);
  // PROTOTYPE: ?stream=<chunk size> mounts only the road network near you (see StreamedNetwork.jsx)
  const [stream] = useState(() => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search);
    return q.has('stream') ? { size: Number(q.get('stream')) || 64, radius: Number(q.get('radius')) || 2 } : null;
  });
  const view = useView((s) => (PRESETS[s.view].iso ? 'iso' : 'follow'));
  // the lower tiers draw a fixed share of the countryside's trees and shrubs (decoration only: nothing collides with them)
  const density = load.decorationDensity;
  const woods = useMemo(() => thinOut(layout.woods, density), [layout.woods, density]);
  const landscapeTrees = useMemo(() => thinOut(layout.landscape.trees, density), [layout.landscape.trees, density]);
  const bushes = useMemo(() => thinOut(layout.landscape.bushes, density), [layout.landscape.bushes, density]);
  const potdId = useMemo(() => (day ? plotOfTheDay(plots, layout.seed, day)?.id ?? null : null), [day, plots, layout.seed]);

  return (
    <div className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing">
      <Canvas shadows={load.shadows ? "percentage" : false} dpr={dpr} onPointerMissed={() => clearSelectedPlot()}>
        <GpuGuard />
        <CameraHeading />
        <SoundListener />
        {/* The camera: the original isometric map (pan and zoom), or a perspective camera that follows the avatar */}
        {view === 'iso' ? (
          <>
            <OrthographicCamera makeDefault zoom={13} position={[30, 30, 30]} near={-100} far={300} />
            <MapControls
              makeDefault
              enableRotate={false}
              enableDamping={true}
              dampingFactor={0.08}
              minZoom={5}
              maxZoom={90}
              screenSpacePanning={true}
              touches={{ ONE: 1, TWO: 2 }}
            />
          </>
        ) : (
          <FollowCamera />
        )}

        <PerfProbe />
        <CameraFocus />

        {/* Lights */}
        <DayNight shadowMapSize={load.shadowMapSize} />

        {/* City Layout (recentered so the generated city sits around the origin) */}
        <GroundGrid />
        <group name="city" position={[-layout.center.x, 0, -layout.center.z]}>
          <Land land={layout.land} urban={layout.urban} lawns={layout.lawns} />
          <GroundPatches patches={layout.landscape.patches} />
          <Hills hills={layout.hills} />
          <Animals layout={layout} />
          <Fields fields={layout.fields} />
          <Woods trees={woods} />
          <Woods trees={landscapeTrees} />
          <Shrubs bushes={bushes} />
          {layout.rivers.map((river) => (
            <River key={river.id} river={river} bridges={layout.bridges.filter((b) => b.riverId === river.id)} />
          ))}
          <GroundClick center={layout.center} />
          {layout.reserved.map((area) => (
            <ReservedArea key={area.id} area={area} />
          ))}
          <MarketStalls />
          <RouteFollower />
          {layout.lakes.map((lake) => (
            <Lake key={lake.id} lake={lake} />
          ))}
          {layout.curvedRoads.map((spec) => (
            <CurvedRoad key={spec.id} spec={spec} />
          ))}
          {layout.diagonals.map((d, i) => (
            <DiagonalRoad
              key={d.id}
              road={d}
              from={layout.intersections.find((x) => x.id === d.from).circle}
              to={layout.intersections.find((x) => x.id === d.to).circle}
              showLabel={i === 0}
            />
          ))}
          {stream ? (
            <StreamedNetwork layout={layout} batchKey={batchKey} size={stream.size} radius={stream.radius} />
          ) : (
            <StaticBatch key={`roads-${batchKey}`} name="roads">
              {layout.roads.map((road) => (
                <Road key={road.id} road={road} />
              ))}
            </StaticBatch>
          )}
          <group name="parks">
          {layout.parks.map((park) => (
            <Park key={park.id} park={park} isSelected={selectedPark?.id === park.id} onSelect={setSelectedPark} />
          ))}
          </group>
          {!stream && (
            <StaticBatch key={`junctions-${batchKey}`} name="junctions">
              {layout.intersections.map((intersection) => (
                <IntersectionControl key={intersection.id} intersection={intersection} />
              ))}
            </StaticBatch>
          )}
          <DailyChest />
          <ScavengerStars />
          <group name="traffic">
            <Traffic layout={layout} />
          </group>
          <Airports airports={layout.airports} seed={layout.seed} />
          <Planes />
          <Malls />
          <DistrictSigns plots={plots} layout={layout} />
          <Promenade promenades={layout.promenades} />
          <Piers piers={layout.piers} />
          <Vehicles />
          <Avatar />
          <RemotePlayers />
          <group name="billboards">
          {billboards.filter((b) => b.kind !== 'banner').map((billboard) => (
            <Billboard key={billboard.id} billboard={billboard} isSelected={selectedBillboardId === billboard.id} onSelect={setSelectedBillboard} />
          ))}
          </group>
          {!stream && (
            <StaticBatch key={`midblock-${batchKey}`} name="midblock">
              {layout.crossings.map((crossing) => (
                <MidBlockCrossing key={crossing.id} crossing={crossing} />
              ))}
            </StaticBatch>
          )}
          <Plots plots={plots} selectedId={selectedPlot?.id ?? null} potdId={potdId} onSelect={setSelectedPlot} />
          <Crowns plots={plots} />
          {layout.amusement && <AmusementPark site={layout.amusement} />}
          <DraftBuilding />
        </group>
      </Canvas>
      <GpuNotice />
      <QualityBadge />
    </div>
  );
}
