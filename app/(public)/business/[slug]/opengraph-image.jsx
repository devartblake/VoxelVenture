import { ImageResponse } from 'next/og';
import { categoryOf, districtOf, isSlug } from '@voxelventure/business-core';
import { getBusiness } from '@/lib/business/source';

// The picture a profile link shows when it is shared on a social site or in a chat. In a paid launch week (the Launch Pack,
// docs/monetization/billing.md) it carries a gold frame and a "New this week" label, so the owner's launch posts stand out.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A business on VoxelVenture';

export default async function Image({ params }) {
  const { slug } = await params;
  const p = isSlug(slug) ? await getBusiness(slug) : null;
  const district = districtOf(p?.district);
  const accent = district?.color ?? '#8b5cf6';
  const launch = Boolean(p?.launch);
  const line = [categoryOf(p?.category)?.label, district?.name].filter(Boolean).join('  ·  ');
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg, #15104a 0%, #050816 70%)', color: '#f8fafc', fontFamily: 'sans-serif', ...(launch ? { border: '12px solid #fbbf24' } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, color: '#94a3b8' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #8b5cf6, #22d3ee)' }} />
            VoxelVenture
          </div>
          {launch && <div style={{ display: 'flex', padding: '10px 26px', borderRadius: 40, background: '#fbbf24', color: '#1c1203', fontSize: 28, fontWeight: 800, letterSpacing: 2 }}>NEW THIS WEEK</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: p && p.name.length > 28 ? 72 : 92, fontWeight: 800, lineHeight: 1.05 }}>{p?.name ?? 'Discover businesses'}</div>
          {p?.tagline && <div style={{ marginTop: 20, fontSize: 38, color: '#cbd5e1' }}>{p.tagline}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, color: '#cbd5e1' }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: accent }} />
          {line || 'A free business page with a 3D storefront'}
        </div>
      </div>
    ),
    size
  );
}
