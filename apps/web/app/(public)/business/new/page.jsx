import NewProfile from '@/components/business/NewProfile';

export const metadata = { title: 'List your business free | VoxelVenture', robots: { index: false, follow: true } };

export default function NewProfilePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold text-white">List your business free</h1>
      <p className="mb-6 mt-2 text-slate-300">A public page with one call to action, a link you can share and verified figures on who visits. No plot or payment needed; you can link a 3D building later.</p>
      <NewProfile />
    </div>
  );
}
