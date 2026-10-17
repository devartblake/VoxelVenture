"use client";

import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { create } from 'zustand';

// The graphics card can take the page's WebGL context away (it ran out of memory, the driver reset, the machine is short of RAM, or too many tabs and canvases
// are open). three.js then logs "THREE.WebGLRenderer: Context Lost" and the city goes blank until the context is back. This listens for it:
// it lets the browser restore the context (preventDefault), tells the player what is happening, and reloads the page once if it does not come back.
export const useGpu = create(() => ({ lost: false, restored: false }));
const RELOADED = 'voxelventure-gpu-reload';

// Inside the <Canvas>: watches its renderer.
export default function GpuGuard() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    let timer = null;
    const lost = (e) => {
      e.preventDefault(); // without this the browser never restores it
      useGpu.setState({ lost: true, restored: false });
      timer = setTimeout(() => {
        try {
          if (!sessionStorage.getItem(RELOADED)) {
            sessionStorage.setItem(RELOADED, '1');
            window.location.reload();
          }
        } catch {
          /* the player can press Reload */
        }
      }, 6000);
    };
    const restored = () => {
      clearTimeout(timer);
      useGpu.setState({ lost: false, restored: true });
      try {
        sessionStorage.removeItem(RELOADED);
      } catch {
        /* nothing to clear */
      }
      setTimeout(() => useGpu.setState({ restored: false }), 3000);
    };
    el.addEventListener('webglcontextlost', lost, false);
    el.addEventListener('webglcontextrestored', restored, false);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('webglcontextlost', lost, false);
      el.removeEventListener('webglcontextrestored', restored, false);
    };
  }, [gl]);
  return null;
}

// Outside the canvas: the message.
export function GpuNotice() {
  const { lost, restored } = useGpu();
  if (!lost && !restored) return null;
  return (
    <div role="alert" className="pointer-events-auto fixed left-1/2 top-20 z-[70] w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-amber-500/50 bg-sx-panel/95 p-3 text-xs text-slate-200 shadow-xl backdrop-blur">
      {lost ? (
        <>
          <p className="font-bold text-amber-300">The graphics card reset</p>
          <p className="mt-1 text-slate-300">The browser lost the 3D view, usually because the computer is short of memory. It is trying to bring it back; the page will reload by itself if it cannot.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-2 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 font-bold text-white">
            Reload now
          </button>
        </>
      ) : (
        <p className="font-bold text-emerald-300">The 3D view is back.</p>
      )}
    </div>
  );
}
