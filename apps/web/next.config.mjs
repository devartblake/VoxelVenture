import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The web app lives in apps/web (Phase C, docs/architecture/adr/0003-apps-and-services.md); the repository root holds what it shares with
// the servers: lib/, packages/, styles/ and the one node_modules. Turbopack and the output tracing work from that root, so the app can
// import lib/ and the workspace packages, and a standalone build would carry them.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The interior props' bucket (NEXT_PUBLIC_PROPS_BASE_URL, lib/content/interiorProps.js): the editor's item panel shows the selected item's
// thumbnail with next/image, so its host is allowed too. An address that cannot be read adds nothing (npm run check:env reports it).
const propsBucket = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_PROPS_BASE_URL);
    return [{ protocol: url.protocol.replace(':', ''), hostname: url.hostname, ...(url.port && { port: url.port }), pathname: `${url.pathname.replace(/\/+$/, '')}/props/**` }];
  } catch {
    return [];
  }
})();

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
  // The Pascal editor shows item thumbnails with next/image: only from the props bucket (and the site itself). Pascal's own storage is
  // never allowed: every catalogue item we offer is served by us (lib/content/catalogCuration.js).
  images: {
    remotePatterns: [...propsBucket],
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
