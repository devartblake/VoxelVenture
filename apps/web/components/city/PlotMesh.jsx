"use client";

import React, { useRef, useState } from 'react';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import { PLOT_TILE, buildingSize } from '@/lib/city/cityGenerator';

const GOLD = '#fbbf24';

// Plots are PLOT_TILE square, except prime plots, which cover several cells (plot.w x plot.d).
// The building fills BUILDING_SCALE of its plot.
function footprint(plot) {
  const w = plot.w ?? PLOT_TILE;
  const d = plot.d ?? PLOT_TILE;
  return { w, d, ...buildingSize(plot) };
}

// Door for every type; awning for restaurants (red) and shops (amber); glass band + rooftop unit for offices.
function BuildingDetails({ plot }) {
  const { bw, bd } = footprint(plot);
  const f = plot.facing ?? 1;
  const type = plot.buildingType;
  const top = plot.height + 0.1;
  const floors = plot.interiorData?.floors ?? 1;
  const front = bd / 2;
  const doorWidth = plot.prime ? 0.55 : 0.32;
  const awningWidth = Math.min(bw * 0.88, plot.prime ? 3.4 : 1.5);
  // a double-deep plot stretches between two avenues, so it gets a door and an awning at each end
  const fronts = plot.primeKind === 'deep' ? [f, -f] : [f];

  return (
    <group>
      {fronts.map((side) => (
        <group key={side}>
          <mesh position={[0, 0.1 + 0.25, side * (front + 0.005)]}>
            <boxGeometry args={[doorWidth, 0.5, 0.02]} />
            <meshStandardMaterial color="#0f172a" roughness={0.6} />
          </mesh>
          {(type === 'restaurant' || type === 'shop') && (
            <mesh position={[0, 0.1 + 0.78, side * (front + 0.17)]} castShadow>
              <boxGeometry args={[awningWidth, 0.06, 0.36]} />
              <meshStandardMaterial color={type === 'restaurant' ? '#dc2626' : '#f59e0b'} roughness={0.7} />
            </mesh>
          )}
        </group>
      ))}
      {/* One dark line per floor boundary, so taller buildings read as multi-storey */}
      {Array.from({ length: floors - 1 }, (_, i) => (
        <mesh key={i} position={[0, 0.1 + ((i + 1) * plot.height) / floors, 0]}>
          <boxGeometry args={[bw + 0.03, 0.03, bd + 0.03]} />
          <meshStandardMaterial color="#0f172a" roughness={0.8} />
        </mesh>
      ))}
      {type === 'office' && (
        <>
          <mesh position={[0, 0.1 + plot.height * 0.6, 0]}>
            <boxGeometry args={[bw + 0.04, plot.height * 0.3, bd + 0.04]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.1} metalness={0.6} />
          </mesh>
          <mesh position={[bw * 0.14, top + 0.1, -bd * 0.12]} castShadow>
            <boxGeometry args={[bw * 0.3, 0.2, bd * 0.3]} />
            <meshStandardMaterial color="#64748b" roughness={0.8} />
          </mesh>
        </>
      )}
      {plot.prime && <Pennant y={top} />}
    </group>
  );
}

// Prime plots fly a gold pennant from the roof.
function Pennant({ y }) {
  const flag = useRef(null);
  useGatedFrame(LOOPS.ornament, ({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.25;
  });
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1, 8]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} metalness={0.5} />
      </mesh>
      <group ref={flag} position={[0, 0.82, 0]}>
        <mesh position={[0.26, 0, 0]} castShadow>
          <boxGeometry args={[0.52, 0.28, 0.03]} />
          <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.5} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

// A slowly spinning gold gem over today's featured business.
function Beacon({ y }) {
  const gem = useRef(null);
  useGatedFrame(LOOPS.ornament, ({ clock }) => {
    if (!gem.current) return;
    gem.current.rotation.y = clock.elapsedTime * 1.6;
    gem.current.position.y = y + Math.sin(clock.elapsedTime * 2) * 0.1;
  });
  return (
    <mesh ref={gem} position={[0, y, 0]}>
      <octahedronGeometry args={[0.28]} />
      <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={1.6} />
    </mesh>
  );
}

export default function PlotMesh({ plot, isSelected, onSelect, isPlotOfTheDay = false }) {
  const [hovered, setHovered] = useState(false);
  const { w, d, bw, bd } = footprint(plot);
  const isClaimed = Boolean(plot.owner);
  const lit = hovered || isSelected;

  return (
    <group position={[plot.x, 0, plot.z]} rotation={[0, plot.yaw ?? 0, 0]}>
      {/* A gold rim around the foundation marks a prime plot */}
      {plot.prime && (
        <mesh position={[0, 0.035, 0]}>
          <boxGeometry args={[w + 0.14, 0.07, d + 0.14]} />
          <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.4} emissive={GOLD} emissiveIntensity={0.25} />
        </mesh>
      )}

      {/* Foundation Tile */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[w, 0.1, d]} />
        <meshStandardMaterial
          color={lit ? '#ffffff' : plot.parkBoost ? '#14532d' : plot.prime ? '#3b2f12' : '#1e293b'}
          roughness={0.7}
        />
      </mesh>

      {isPlotOfTheDay && <Beacon y={plot.height + 1.1} />}

      {/* Exterior cues by building type (no handlers, so clicks pass through to the building) */}
      {isClaimed && <BuildingDetails plot={plot} />}

      {/* Building Structure */}
      {isClaimed ? (
        <mesh
          position={[0, plot.height / 2 + 0.1, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(plot);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[bw, plot.height, bd]} />
          <meshStandardMaterial
            color={isSelected ? '#f59e0b' : plot.color}
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>
      ) : (
        /* Unclaimed Plot Slot */
        <mesh
          position={[0, 0.15, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(plot);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[w * 0.8, 0.05, d * 0.8]} />
          <meshStandardMaterial
            color={hovered ? '#38bdf8' : plot.prime ? GOLD : '#475569'}
            wireframe={!hovered}
          />
        </mesh>
      )}
    </group>
  );
}
