"use client";

import '@/lib/content/pascalBootstrap';
import { Viewer, WallCutout } from '@pascal-app/viewer';
import { CameraControls } from '@react-three/drei';

export default function ViewerPage() {
  return (
    <div className="relative h-screen w-screen">
      <Viewer selectionManager="custom">
        <CameraControls makeDefault />
        <WallCutout />
      </Viewer>
    </div>
  );
}
