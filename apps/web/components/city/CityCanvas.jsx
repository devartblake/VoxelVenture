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
import Animals from './Animals';
import GpuGuard, { GpuNotice } from './GpuGuard';
import CameraHeading from './CameraHeading';
import SoundListener from './SoundListener';
import RouteFollower from './RouteFollower';
import MarketStalls from './MarketStalls';
import { plotOfTheDay } from '@/lib/game/daily';
import { useCityStore } from '@/lib/state/store';

export default function CityCanvas() {
  const day = useCityStore((state) => state.day);
  // Touch devices render at a lower pixel ratio and shadow resolution (read after mount, so the server render matches).
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(window.matchMedia('(pointer: coarse)').matches), []);
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
  const potdId = useMemo(() => (day ? plotOfTheDay(plots, layout.seed, day)?.id ?? null : null), [day, plots, layout.seed]);

  return (
    <div className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing">
      <Canvas shadows={touch ? false : "percentage"} dpr={touch ? [1, 1.25] : [1, 1.5]} onPointerMissed={() => clearSelectedPlot()}>
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
        <DayNight touch={touch} />

        {/* City Layout (recentered so the generated city sits around the origin) */}
        <GroundGrid />
        <group position={[-layout.center.x, 0, -layout.center.z]}>
          <Land land={layout.land} urban={layout.urban} lawns={layout.lawns} />
          <GroundPatches patches={layout.landscape.patches} />
          <Hills hills={layout.hills} />
          <Animals layout={layout} />
          <Fields fields={layout.fields} />
          <Woods trees={layout.woods} />
          <Woods trees={layout.landscape.trees} />
          <Shrubs bushes={layout.landscape.bushes} />
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
    </div>
  );
}
