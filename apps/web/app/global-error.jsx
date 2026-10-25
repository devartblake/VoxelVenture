'use client';

// The last resort, when the root layout itself fails: it replaces the whole document, without the site's stylesheet, so it is styled
// inline in the site's dark colours.
export default function GlobalError({ retry }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b1020', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', padding: 16 }}>
        <title>Something went wrong · VoxelVenture</title>
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, color: '#fff' }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8' }}>VoxelVenture could not start this page. Please try again.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 12, border: 0, background: '#22d3ee', color: '#020617', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
