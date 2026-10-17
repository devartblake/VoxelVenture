import { ImageResponse } from 'next/og';
import { categoryOf } from '@voxelventure/business-core';
import { listBusinesses } from '@/lib/business/source';
import ListShareImage, { SHARE_SIZE } from '@/components/business/ListShareImage';

// The picture a link to a category page shows when shared: its name, colour and how many businesses it lists.
export const size = SHARE_SIZE;
export const contentType = 'image/png';
export const alt = 'A category on VoxelVenture';

export default async function Image({ params }) {
  const c = categoryOf((await params).slug);
  if (!c) return new ImageResponse(<ListShareImage kicker="Discover" title="Discover businesses" line="Independent businesses with 3D storefronts" />, size);
  const { total } = await listBusinesses({ category: c.id, limit: 1 }).catch(() => ({ total: 0 }));
  const count = `${total} ${total === 1 ? 'business' : 'businesses'}`;
  return new ImageResponse(<ListShareImage kicker="Category" title={c.label} accent={'#22d3ee'} line={`${count}: free pages and 3D storefronts`} />, size);
}
