"use client";

import React, { useEffect, useState } from 'react';
import { perfStats } from '@/lib/dev/perfStats';
import { useQuality } from '@/lib/performance/runtime';
import { lodLive, useLod } from '@/lib/performance/lodRuntime';

// The capability policy's diagnostics, on screen (only with ?diag=1 in the address): the quality tier in force and why, the
// measured frame rate, the renderer's counters, the GPU, and what is pausing the animation. "Measure" runs the fixed-spot
// measurement of scripts/perf-measure.mjs on this device (a phone has no console) and "Copy" copies its result as JSON.
// See docs/architecture/performance_policy.md, "Measuring on a real device".
export default function QualityBadge() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false); // one line until tapped
  const [counters, setCounters] = useState(null);
  const [measure, setMeasure] = useState({ running: false, spot: null, result: null, copied: false });
  const q = useQuality();
  const lod = useLod();

  useEffect(() => setOn(new URLSearchParams(window.location.search).has('diag')), []);
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setCounters({ ...perfStats, zoom: lodLive.zoom, culled: lodLive.culled }), 1000);
    return () => clearInterval(t);
  }, [on]);
  if (!on) return null;

  const run = async () => {
    if (!window.__vvMeasure) return;
    setMeasure({ running: true, spot: null, result: null, copied: false });
    try {
      const result = await window.__vvMeasure({ seconds: 5, onSpot: (s) => setMeasure((m) => ({ ...m, spot: s.id })) });
      setMeasure({ running: false, spot: null, result, copied: false });
    } catch (e) {
      setMeasure({ running: false, spot: null, result: { error: String(e?.message ?? e) }, copied: false });
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ url: window.location.href, ...measure.result }, null, 2));
      setMeasure((m) => ({ ...m, copied: true }));
    } catch {
      /* no clipboard (an http page): the table is on screen */
    }
  };

  const fps = q.fps;
  return (
    <div data-testid="quality-badge" data-tier={q.tier} data-lod={lod.level} className="pointer-events-auto fixed left-2 top-24 z-[60] max-w-[min(92vw,360px)] rounded-lg border border-sx-stroke bg-sx-panel/90 px-2.5 py-1.5 font-mono text-[10px] leading-snug text-slate-200 shadow-lg backdrop-blur">
      <button type="button" onClick={() => setOpen(!open)} className="font-bold text-cyan-300" aria-expanded={open}>
        Quality: {q.tier} ({q.source}{q.source === 'auto' ? `, up to ${q.ceiling}` : ''}) · LOD {lod.level}
      </button>
      {open && (
        <>
          <p data-testid="quality-reasons">why: {q.reasons.join(', ') || '-'}</p>
          <p>
            {fps ? `${fps.fps} fps · p50 ${fps.p50} ms · p95 ${fps.p95} ms` : 'measuring the frame rate…'}
            {counters ? ` · ${counters.calls} calls · ${Math.round(counters.triangles / 1000)}k tris · ${counters.geometries} geo · ${counters.textures} tex` : ''}
          </p>
          <p>
            dpr {q.settings.dpr.join('–')} · shadows {q.load.shadows && q.settings.shadows ? 'on' : 'off'} · animation {q.animation}
            {q.visibility.length ? ` (${q.visibility.join(', ')})` : ''}
          </p>
          <p data-testid="lod-line">
            lod: {lod.level} ({lod.override === 'auto' ? lod.reason : `lod=${lod.override}`}
            {counters?.zoom != null ? `, zoom ${counters.zoom}` : ''})
            {lod.counts.standIns ? ` · ${lod.counts.standIns} stand-ins in ${lod.counts.standInCalls} calls` : ''}
            {lod.hidden.length ? ` · hiding ${lod.hidden.map((c) => `${c} ${lod.counts[`class:${c}`] ?? 0}`).join(', ')}` : ''}
            {lod.cull ? ` · ${counters?.culled ?? 0} instances off screen not drawn` : ''}
          </p>
          <p className="truncate" title={q.profile?.webgl?.renderer ?? ''}>gpu: {q.profile?.webgl?.renderer || 'unknown'}</p>
          {q.changes.length > 0 && <p>changes: {q.changes.map((c) => `${c.from}→${c.to} (${c.reason})`).join(', ')}</p>}
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={run} disabled={measure.running} className="rounded bg-sx-alt px-2 py-0.5 text-white disabled:opacity-60" data-testid="quality-measure">
              {measure.running ? `Measuring ${measure.spot ?? ''}…` : 'Measure'}
            </button>
            {measure.result && !measure.result.error && (
              <button type="button" onClick={copy} className="rounded bg-sx-alt px-2 py-0.5 text-white">
                {measure.copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          {measure.result?.error && <p className="text-amber-300">{measure.result.error}</p>}
          {measure.result?.spots && (
            <table className="mt-1">
              <tbody>
                {measure.result.spots.map((s) => (
                  <tr key={s.id}>
                    <td className="pr-2">{s.id}</td>
                    <td className="pr-2">p50 {s.frameTime.p50}</td>
                    <td className="pr-2">p95 {s.frameTime.p95}</td>
                    <td className="pr-2">{s.drawCalls.mean} calls</td>
                    <td>LOD {s.lod?.level ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
