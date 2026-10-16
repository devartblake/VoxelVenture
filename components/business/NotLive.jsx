// Shown on the owner pages when the site runs without the API server (profiles are kept on the server).
export default function NotLive() {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
      <h2 className="text-lg font-semibold">Profiles need the API server</h2>
      <p className="mt-1 text-sm">This copy of the site runs without one, so profiles cannot be saved. Start it with <code>npm run api</code> and set <code>NEXT_PUBLIC_LIVE_API_URL</code> (see docs/business_funnel.md).</p>
    </div>
  );
}
