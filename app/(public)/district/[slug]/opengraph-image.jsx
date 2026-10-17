import { ImageResponse } from 'next/og';
import { districtOf } from '@voxelventure/business-core';
import { listBusinesses } from '@/lib/business/source';
import ListShareImage, { SHARE_SIZE } from '@/components/business/ListShareImage';

// The picture a link to a district page shows when shared: its name, colour and how many businesses it lists.
export const size = SHARE_SIZE;
export const contentType = 'image/png';
export const alt = 'A district on VoxelVenture';

export default async function Image({ params }) {
  const c = districtOf((await params).slug);
  if (!c) return new ImageResponse(<ListShareImage kicker="Discover" title="Discover businesses" line="Independent businesses with 3D storefronts" />, size);
  const { total } = await listBusinesses({ district: c.id, limit: 1 }).catch(() => ({ total: 0 }));
  const count = `${total} ${total === 1 ? 'business' : 'businesses'}`;
  return new ImageResponse(<ListShareImage kicker="District" title={c.name} accent={c.color} line={`${count}: in this district of the 3D city`} />, size);
}
