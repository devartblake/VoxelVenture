"use client";

import { useEffect, useState } from 'react';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// The player's character as a model made in Blockbench (apps/web/public/models/avatar/player.glb; the layout it needs is described in
// scripts/models/make-sample-avatar.mjs). Loaded once. useAvatarModel() is null until then, and for good if the file is missing or
// lacks the named limbs, and the box character in Avatar.jsx is drawn instead. `?models=0` leaves the box character on.
export const AVATAR_URL = '/models/avatar/player.glb';
export const LIMBS = ['leg_l', 'leg_r', 'arm_l', 'arm_r'];
let promise = null;

export function loadAvatarModel() {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('models') === '0') return Promise.resolve(null);
  promise ??= new GLTFLoader()
    .loadAsync(AVATAR_URL)
    .then((gltf) => (LIMBS.every((n) => gltf.scene.getObjectByName(n)) ? gltf.scene : null))
    .catch(() => null);
  return promise;
}

export function useAvatarModel() {
  const [model, setModel] = useState(null);
  useEffect(() => {
    let live = true;
    loadAvatarModel().then((m) => live && setModel(m));
    return () => {
      live = false;
    };
  }, []);
  return model;
}

// A copy of the model for one wearer: the shirt and pants colours of the Wardrobe go on the materials named shirt and pants.
export function dressAvatar(model, { shirt, pants }) {
  const clone = model.clone(true);
  const mats = new Map();
  clone.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const base = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mats.has(base.name)) {
      const m = base.clone();
      if (base.name === 'shirt' && shirt) m.color.set(shirt);
      if (base.name === 'pants' && pants) m.color.set(pants);
      mats.set(base.name, m);
    }
    o.material = mats.get(base.name);
  });
  clone.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(clone);
  if (!bounds.isEmpty()) clone.position.y -= bounds.min.y;
  return clone;
}
