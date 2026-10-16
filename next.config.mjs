/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a phone on the same Wi-Fi load the dev server (Next blocks other origins' dev requests otherwise).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*', '100.*.*.*'],
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
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
};

export default nextConfig;
