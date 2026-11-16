"use client";

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { backInstances, backModelItems } from '@/lib/content/backyards';
import { yardPreset } from '@/lib/content/yardModels';
import { BUILD_PIECE_IDS, MAX_PIECES, buildPieces } from '@/lib/content/modularBuild';
import { PROP_CATALOG } from '@/lib/content/propCatalog';
import PropInstances, { usePropsReady } from './PropModels';
import { crownInstances } from '@/lib/content/crowns';
import { modelFor } from '@/lib/content/models';
import { useDraft } from '@/lib/state/draftStore';

// The rooftop features owners chose and what they put behind their buildings (lib/content/backyards.js) (beacon, dish, roof garden, dome, spire), and the one on the building being set up. One instanced mesh per solid shape,
// so any number of crowns costs five draw calls. See lib/content/crowns.js for what each is made of.
const MAX = 1600; // parts of each shape
const SHAPES = {
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  sphere: () => new THREE.SphereGeometry(0.5, 12, 8),
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cone: () => new THREE.ConeGeometry(0.5, 1, 10),
  glow: () => new THREE.SphereGeometry(0.5, 10, 8),
};
const tmp = new THREE.Object3D();
const color = new THREE.Color();

export default function Crowns({ plots }) {
  const draft = useDraft((s) => s.plot);
  const meshes = useRef({});
  const geo = useMemo(() => Object.fromEntries(Object.entries(SHAPES).map(([k, f]) => [k, f()])), []);
  const mat = useMemo(
    () => ({
      solid: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.15 }),
      glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
    }),
    []
  );
  const draftList = useMemo(() => (draft ? [...plots.filter((p) => p.id !== draft.id), draft] : plots), [plots, draft]);
  // the yards made of models: only the models the chosen yards use are loaded, and drawn once they have
  const yardIds = useMemo(() => [...new Set(draftList.filter((p) => p.owner && yardPreset(p.exterior?.back)).flatMap((p) => yardPreset(p.exterior.back).models.map((m) => m.id)))], [draftList]);
  const yardReady = usePropsReady(yardIds);
  // buildings designed from kit pieces (lib/content/modularBuild.js): their pieces are loaded only when a built plot has a design
  const designed = useMemo(() => draftList.filter((p) => p.owner && p.exterior?.build), [draftList]);
  const pieceIds = useMemo(() => (designed.length ? BUILD_PIECE_IDS : []), [designed.length]);
  const piecesReady = usePropsReady(pieceIds);
  const pieceItems = useMemo(() => (piecesReady ? designed.flatMap((p) => buildPieces(p, p.exterior.build, PROP_CATALOG)).slice(0, MAX_PIECES) : []), [piecesReady, designed]);
  const yardItems = useMemo(() => (yardReady ? backModelItems(draftList, plots, PROP_CATALOG) : []), [yardReady, draftList, plots]);
  const instances = useMemo(() => {
    const list = draft ? [...plots.filter((p) => p.id !== draft.id), draft] : plots;
    return [...crownInstances(list, (p) => modelFor(p)?.height ?? p.height ?? 1.2), ...backInstances(list, plots)];
  }, [plots, draft]);

  useLayoutEffect(() => {
    const used = { cyl: 0, sphere: 0, box: 0, cone: 0, glow: 0 };
    for (const c of instances) {
      const cos = Math.cos(c.yaw);
      const sin = Math.sin(c.yaw);
      for (const part of c.parts) {
        const mesh = meshes.current[part.shape];
        if (!mesh || used[part.shape] >= MAX) continue;
        const i = used[part.shape]++;
        const [px, py, pz] = part.pos;
        // the part's place on the roof, turned with the building and scaled with its size
        tmp.position.set(c.x + (px * cos + pz * sin) * c.scale, c.y + py * c.scale, c.z + (-px * sin + pz * cos) * c.scale);
        tmp.rotation.set(0, c.yaw, 0);
        tmp.scale.set(part.scale[0] * c.scale, part.scale[1] * c.scale, part.scale[2] * c.scale);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
        mesh.setColorAt(i, color.set(part.color));
      }
    }
    for (const [shape, mesh] of Object.entries(meshes.current)) {
      if (!mesh) continue;
      mesh.count = used[shape];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }, [instances]);

  return (
    <group name="crowns">
      {yardItems.length > 0 && <PropInstances items={yardItems} />}
      {pieceItems.length > 0 && <PropInstances items={pieceItems} shadows={false} />}
      {Object.keys(SHAPES).map((shape) => (
        <instancedMesh
          key={shape}
          ref={(m) => {
            meshes.current[shape] = m;
          }}
          args={[geo[shape], shape === 'glow' ? mat.glow : mat.solid, MAX]}
          frustumCulled={false}
          castShadow={shape !== 'glow'}
        />
      ))}
    </group>
  );
}
