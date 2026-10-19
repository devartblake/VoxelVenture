"use client";

import React, { useMemo } from 'react';
import ModelBuildings, { useModels } from './ModelBuildings';
import { buildingSize } from '@/lib/city/cityGenerator';
import { modelFor } from '@/lib/content/models';
import Label3D from './Label3D';
import StaticBatch from './StaticBatch';

// The airport's flat ground layers, bottom to top. They overlap (taxiways on the apron, the runway over the taxiways' ends, the markings
// on the runway), so each sits a clear step above the one below AND draws with a depth bias (polygonOffset): zoomed out, a gap of a
// thousandth of a unit is below what the depth buffer can tell apart, and the layers flickered through each other.
const LAYER = { apron: 0.03, taxiway: 0.045, runway: 0.06, marking: 0.075 };
const bias = (n) => ({ polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -n });

const HANGAR_HEIGHT = 3.4;

const rectCentre = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
const rectSize = (r) => [r.x1 - r.x0, r.z1 - r.z0];

// A parked airliner (scenery): a long white fuselage with a nose, wings, a tail fin, engines and a row of windows. It points along
// the runway; `alongX` says which world axis that is.
function Airliner({ x, z, alongX, tail }) {
  return (
    <group position={[x, 0.012, z]} rotation={[0, alongX ? Math.PI / 2 : 0, 0]}>
      <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.55, 0.55, 7.2, 12]} /><meshStandardMaterial color="#f8fafc" roughness={0.4} /></mesh>
      <mesh position={[0, 1.15, 3.9]} castShadow><sphereGeometry args={[0.55, 12, 8]} /><meshStandardMaterial color="#f8fafc" roughness={0.4} /></mesh>
      <mesh position={[0, 1.15, -3.7]} rotation={[-Math.PI / 2, 0, 0]} castShadow><coneGeometry args={[0.55, 1.2, 12]} /><meshStandardMaterial color="#f8fafc" roughness={0.4} /></mesh>
      <mesh position={[0, 1.0, 0.3]} castShadow><boxGeometry args={[7.2, 0.1, 1.5]} /><meshStandardMaterial color="#e2e8f0" roughness={0.5} /></mesh>
      {[-1.8, 1.8].map((sx) => (
        <mesh key={sx} position={[sx, 0.75, 0.6]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.28, 0.28, 1.1, 10]} /><meshStandardMaterial color="#94a3b8" roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, 2.1, -3.2]} castShadow><boxGeometry args={[0.1, 1.5, 1.2]} /><meshStandardMaterial color={tail} roughness={0.5} /></mesh>
      <mesh position={[0, 1.55, -3.4]} castShadow><boxGeometry args={[2.6, 0.08, 0.7]} /><meshStandardMaterial color="#e2e8f0" roughness={0.5} /></mesh>
      <mesh position={[0, 1.38, 0]}><boxGeometry args={[1.12, 0.1, 6]} /><meshStandardMaterial color="#38bdf8" roughness={0.2} metalness={0.4} /></mesh>
      <mesh position={[0, 0.66, 0.3]}><boxGeometry args={[1.12, 0.1, 6]} /><meshStandardMaterial color={tail} roughness={0.5} /></mesh>
      {[1.7, -1.9].map((sz) => (
        <mesh key={sz} position={[0, 0.3, sz]}><cylinderGeometry args={[0.08, 0.08, 0.6, 6]} /><meshStandardMaterial color="#475569" /></mesh>
      ))}
    </group>
  );
}

// The terminal as Kenney building models that fill its whole footprint: a long terminal is a row of joined wings, each about square, so
// no model is stretched out of shape. The box terminal (`fallback`) is drawn until the models have loaded, or if they cannot.
function TerminalModels({ terminal, height, airportName, fallback }) {
  const wings = useMemo(() => {
    const margin = -buildingSize({ w: 0, d: 0 }).bw / 2; // the gap a plot leaves round its building: the wings have none
    const alongX = terminal.w >= terminal.d;
    const n = Math.max(1, Math.round(Math.max(terminal.w, terminal.d) / Math.min(terminal.w, terminal.d)));
    const ww = alongX ? terminal.w / n : terminal.w;
    const wd = alongX ? terminal.d : terminal.d / n;
    const id = 9000 + [...airportName].reduce((h, c) => h + c.charCodeAt(0), 0); // the same name always gets the same building
    const plots = Array.from({ length: n }, (_, k) => ({
      id: id + k * 100000, // (distinct picking ids; the model choice below uses the first wing's, so every wing matches)
      owner: 'airport',
      height,
      w: ww + 2 * margin,
      d: wd + 2 * margin,
      grand: true,
      facing: 1,
      yaw: 0,
      color: '#ffffff',
      x: terminal.x + (alongX ? (k - (n - 1) / 2) * ww : 0),
      z: terminal.z + (alongX ? 0 : (k - (n - 1) / 2) * wd),
    }));
    return plots;
  }, [terminal, height, airportName]);
  const assignments = useMemo(() => {
    const first = modelFor(wings[0]);
    return new Map(wings.map((p) => [p.id, first && { ...first }]).filter(([, m]) => m));
  }, [wings]);
  const geometries = useModels((s) => s.geometries);
  const ready = assignments.size === wings.length && [...assignments.values()].every((m) => geometries[m.id]);
  const noop = () => {};
  return (
    <>
      {ready && (
        <mesh position={[terminal.x, 0.05, terminal.z]} receiveShadow>
          <boxGeometry args={[terminal.w, 0.1, terminal.d]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.9} />
        </mesh>
      )}
      <ModelBuildings plots={wings} assignments={assignments} selectedId={null} hoveredId={null} onSelect={noop} onHover={noop} />
      {!ready && fallback}
    </>
  );
}

// One airport (see planAirports in lib/city/cityGenerator.js): apron, taxiways, runway with its markings, terminal,
// control tower, hangars and a windsock (the international airport is bigger, with airliners parked on its apron).
// All of it is static, so it is baked into a few merged meshes.
function Airport({ airport }) {
  const { runway, apron, terminal, tower, hangars, parking, windsock, axis, frame } = airport;
  const TERMINAL_HEIGHT = airport.international ? 3.6 : 2.4;
  const TOWER_HEIGHT = airport.international ? 7.5 : 4.4;
  const alongX = axis === 'x';
  const [rcx, rcz] = rectCentre(runway);
  const [rw, rd] = rectSize(runway);
  const [ax, az] = rectCentre(apron);
  const [aw, ad] = rectSize(apron);

  // dashes down the middle of the runway and a set of bars across each end
  const dashes = [];
  for (let u = -runway.length / 2 + 6; u <= runway.length / 2 - 6; u += 3.6) dashes.push(u);
  const bars = [-1, 1].flatMap((end) => [-1.5, -0.75, 0, 0.75, 1.5].map((v) => ({ end, v })));
  const at = (u, v) => (alongX ? [rcx + u, rcz + v] : [rcx + v, rcz + u]);
  const size = (len, wid) => (alongX ? [len, wid] : [wid, len]);

  return (
    <group>
      {/* apron and taxiways from each parking spot to the runway */}
      <mesh position={[ax, LAYER.apron, az]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[aw, ad]} />
        <meshStandardMaterial color="#a3a3a3" roughness={1} {...bias(1)} />
      </mesh>
      {parking.map((p, i) => {
        const toRunway = alongX ? [0, rcz - p.z] : [rcx - p.x, 0];
        const len = Math.hypot(toRunway[0], toRunway[1]);
        const mid = [p.x + toRunway[0] / 2, p.z + toRunway[1] / 2];
        return (
          <group key={i}>
            <mesh position={[mid[0], LAYER.taxiway, mid[1]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={alongX ? [2.6, len] : [len, 2.6]} />
              <meshStandardMaterial color="#a3a3a3" roughness={1} {...bias(2)} />
            </mesh>
            {/* the parking spot: a yellow square */}
            <mesh position={[p.x, LAYER.marking, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.9, 1.05, 4, 1, Math.PI / 4]} />
              <meshBasicMaterial color="#facc15" {...bias(4)} />
            </mesh>
          </group>
        );
      })}

      {/* runway */}
      <mesh position={[rcx, LAYER.runway, rcz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[rw, rd]} />
        <meshStandardMaterial color="#27272a" roughness={0.95} {...bias(3)} />
      </mesh>
      {[-1, 1].map((side) => {
        const [x, z] = at(0, side * (runway.width / 2 - 0.2));
        const [w, d] = size(runway.length - 1, 0.12);
        return (
          <mesh key={side} position={[x, LAYER.marking, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w, d]} />
            <meshBasicMaterial color="#e5e7eb" {...bias(4)} />
          </mesh>
        );
      })}
      {dashes.map((u) => {
        const [x, z] = at(u, 0);
        const [w, d] = size(1.8, 0.22);
        return (
          <mesh key={u} position={[x, LAYER.marking, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w, d]} />
            <meshBasicMaterial color="#f8fafc" {...bias(4)} />
          </mesh>
        );
      })}
      {bars.map(({ end, v }) => {
        const [x, z] = at(end * (runway.length / 2 - 1.6), v);
        const [w, d] = size(2, 0.3);
        return (
          <mesh key={`${end}-${v}`} position={[x, LAYER.marking, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w, d]} />
            <meshBasicMaterial color="#f8fafc" {...bias(4)} />
          </mesh>
        );
      })}

      {/* terminal: a low building with a glass band and a flat roof */}
      <TerminalModels
        terminal={terminal}
        height={TERMINAL_HEIGHT}
        airportName={airport.name}
        fallback={
          <group position={[terminal.x, 0, terminal.z]}>
        <mesh position={[0, TERMINAL_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[terminal.w, TERMINAL_HEIGHT, terminal.d]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.6} />
        </mesh>
        <mesh position={[0, TERMINAL_HEIGHT * 0.55, 0]}>
          <boxGeometry args={[terminal.w + 0.04, TERMINAL_HEIGHT * 0.34, terminal.d + 0.04]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.1} metalness={0.5} />
        </mesh>
        <mesh position={[0, TERMINAL_HEIGHT + 0.08, 0]} castShadow>
          <boxGeometry args={[terminal.w + 0.5, 0.16, terminal.d + 0.5]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>
          </group>
        }
      />

      {/* control tower */}
      <group position={[tower.x, 0, tower.z]}>
        <mesh position={[0, TOWER_HEIGHT / 2, 0]} castShadow>
          <cylinderGeometry args={[0.5, 0.62, TOWER_HEIGHT, 12]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
        </mesh>
        <mesh position={[0, TOWER_HEIGHT + 0.5, 0]} castShadow>
          <boxGeometry args={[1.7, 1, 1.7]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.1} metalness={0.5} />
        </mesh>
        <mesh position={[0, TOWER_HEIGHT + 1.1, 0]} castShadow>
          <boxGeometry args={[2, 0.2, 2]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>
        <mesh position={[0, TOWER_HEIGHT + 1.45, 0]}>
          <sphereGeometry args={[0.14, 8, 8]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} />
        </mesh>
      </group>

      {/* hangars, their doors facing the runway */}
      {hangars.map((h, i) => (
        <group key={i} position={[h.x, 0, h.z]}>
          <mesh position={[0, HANGAR_HEIGHT / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[h.w, HANGAR_HEIGHT, h.d]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.7} />
          </mesh>
          <mesh position={[0, HANGAR_HEIGHT + 0.12, 0]} castShadow>
            <boxGeometry args={[h.w + 0.3, 0.24, h.d + 0.3]} />
            <meshStandardMaterial color="#64748b" roughness={0.8} />
          </mesh>
          <mesh position={[frame.n[0] * (h.w * Math.abs(frame.n[0]) + h.d * Math.abs(frame.n[1])) * 0.5, 1.4, frame.n[1] * (h.w * Math.abs(frame.n[0]) + h.d * Math.abs(frame.n[1])) * 0.5]}>
            <boxGeometry args={alongX ? [h.w * 0.7, 2.6, 0.1] : [0.1, 2.6, h.d * 0.7]} />
            <meshStandardMaterial color="#1e293b" roughness={0.8} />
          </mesh>
        </group>
      ))}

      {(airport.airliners ?? []).map((a, i) => (
        <Airliner key={i} x={a.x} z={a.z} alongX={alongX} tail={i % 2 ? '#2563eb' : '#dc2626'} />
      ))}

      {/* windsock */}
      <group position={[windsock.x, 0, windsock.z]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 1.8, 6]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <mesh position={[0.4, 1.7, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.22, 0.8, 8]} />
          <meshStandardMaterial color="#f97316" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

// Every airport (layout.airports). `seed` remounts the baked batch when the city is regenerated.

export default function Airports({ airports, seed }) {
  return (airports ?? []).map((airport) => (
    <group key={`${seed}-${airport.id}`}>
      <StaticBatch name={`airport-${airport.id}`}>
        <Airport airport={airport} />
      </StaticBatch>
      <Label3D text={airport.name} position={[airport.terminal.x, airport.international ? 5 : 3.4, airport.terminal.z]} background={airport.international ? '#f59e0b' : '#0ea5e9'} color={airport.international ? '#451a03' : '#082f49'} />
    </group>
  ));
}
