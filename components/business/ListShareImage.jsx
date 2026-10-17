// The share picture of a list page (a category or a district): its name, how many businesses it has, and its colour. Drawn by next/og.
export const SHARE_SIZE = { width: 1200, height: 630 };

export default function ListShareImage({ kicker, title, line, accent = '#8b5cf6' }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg, #15104a 0%, #050816 70%)', color: '#f8fafc', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, color: '#94a3b8' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #8b5cf6, #22d3ee)' }} />
        VoxelVenture · {kicker}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: accent }} />
          <div style={{ fontSize: title.length > 22 ? 80 : 96, fontWeight: 800, lineHeight: 1.05 }}>{title}</div>
        </div>
        <div style={{ marginTop: 24, fontSize: 38, color: '#cbd5e1' }}>{line}</div>
      </div>
      <div style={{ display: 'flex', height: 14, width: 480, borderRadius: 7, background: accent }} />
    </div>
  );
}
