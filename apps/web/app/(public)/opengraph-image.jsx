import { ImageResponse } from 'next/og';

// The picture a link to Discover, a category or a district shows when shared (a business page has its own: business/[slug]).
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'VoxelVenture: discover independent businesses';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg, #15104a 0%, #050816 70%)', color: '#f8fafc', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, color: '#cbd5e1' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #8b5cf6, #22d3ee)' }} />
          VoxelVenture
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>Discover businesses</div>
          <div style={{ marginTop: 20, fontSize: 40, color: '#cbd5e1' }}>Independent shops, studios, software and creators, with 3D storefronts.</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {['#3b82f6', '#ec4899', '#a855f7', '#f97316'].map((c) => (
            <div key={c} style={{ width: 120, height: 14, borderRadius: 7, background: c }} />
          ))}
        </div>
      </div>
    ),
    size
  );
}
