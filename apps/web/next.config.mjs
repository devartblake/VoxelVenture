import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The web app lives in apps/web (Phase C, docs/architecture/adr/0003-apps-and-services.md); the repository root holds what it shares with
// the servers: lib/, packages/, styles/ and the one node_modules. Turbopack and the output tracing work from that root, so the app can
// import lib/ and the workspace packages, and a standalone build would carry them.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a phone on the same Wi-Fi load the dev server (Next blocks other origins' dev requests otherwise).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*', '100.*.*.*'],
  outputFileTracingRoot: repoRoot,
  transpilePackages: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@pascal-app/core',
    '@pascal-app/viewer',
    '@pascal-app/editor',
    '@pascal-app/nodes',
  ],
  // The Pascal editor's furniture catalogue shows its thumbnails with next/image, from the one host its catalogue uses.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'byrpxoiotywskoojsrzd.supabase.co', pathname: '/storage/v1/object/public/items/**' }],
  },
  turbopack: {
    root: repoRoot,
    // one copy of each, from the root node_modules (the Pascal packages bring their own otherwise)
    resolveAlias: {
      react: '../../node_modules/react',
      three: '../../node_modules/three',
      '@react-three/fiber': '../../node_modules/@react-three/fiber',
      '@react-three/drei': '../../node_modules/@react-three/drei',
    },
  },
};

export default nextConfig;
