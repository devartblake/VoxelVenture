import { redirect } from 'next/navigation';
import { isPlotId } from '@/lib/game/shareLink';

// The short link to a building: /b/12 opens the city on building 12 (see components/DeepLink.jsx).
export default async function BuildingLink({ params }) {
  const { id } = await params;
  redirect(isPlotId(id) ? `/?plot=${encodeURIComponent(id)}` : '/');
}
