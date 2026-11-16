"use client";

import React from 'react';
import { VEHICLES } from '@/lib/sim/vehicles';
import { gaugeMax, gearOf, needleAngle, revsOf, speedKmh, ticks } from '@/lib/sim/gauges';

// The race car's dashboard (the numbers are in lib/sim/gauges.js): an analogue speedometer with a needle, a digital readout, the gear, and a rev bar that turns red near the top of each gear.
// `speed` is the car's speed in map units a second (signed: negative is reversing).
const R = 70;
const pt = (angle, r) => [100 + r * Math.sin((angle * Math.PI) / 180), 100 - r * Math.cos((angle * Math.PI) / 180)];

export default function Gauges({ speed }) {
  const spec = VEHICLES.racecar;
  const max = gaugeMax(spec);
  const kmh = speedKmh(speed);
  const angle = needleAngle(kmh, max);
  const gear = gearOf(speed, spec);
  const revs = revsOf(speed, spec);
  const marks = ticks(max);
  const [nx, ny] = pt(angle, R - 8);
  const arc = (from, to, r) => { const [x0, y0] = pt(from, r), [x1, y1] = pt(to, r); return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  return (
    <div className="pointer-events-none flex flex-col items-center" data-testid="speed-gauge" role="img" aria-label={`Speed ${kmh} kilometres an hour, gear ${gear}`}>
      <svg viewBox="0 0 200 170" width="190" height="162" className="drop-shadow-lg">
        <circle cx="100" cy="100" r="92" fill="#0b1220" fillOpacity="0.88" stroke="#334155" strokeWidth="3" />
        {/* the redline: the last stretch of the dial */}
        <path d={arc(needleAngle(max * 0.85, max), needleAngle(max, max), R + 12)} stroke="#ef4444" strokeWidth="5" fill="none" strokeLinecap="round" />
        {marks.map((m) => {
          const [x0, y0] = pt(m.angle, R + 6), [x1, y1] = pt(m.angle, m.major ? R - 6 : R);
          const [lx, ly] = pt(m.angle, R - 20);
          return (
            <g key={m.value}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={m.value > max * 0.85 ? '#f87171' : '#cbd5e1'} strokeWidth={m.major ? 2.5 : 1.2} />
              {m.major && <text x={lx} y={ly + 3.5} textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="ui-monospace, monospace">{m.value}</text>}
            </g>
          );
        })}
        <line x1="100" y1="100" x2={nx} y2={ny} stroke="#fbbf24" strokeWidth="3.5" strokeLinecap="round" style={{ transition: 'all 0.08s linear' }} />
        <circle cx="100" cy="100" r="7" fill="#fbbf24" />
        <text x="100" y="138" textAnchor="middle" fontSize="26" fontWeight="700" fill="#f8fafc" fontFamily="ui-monospace, monospace">{kmh}</text>
        <text x="100" y="152" textAnchor="middle" fontSize="9" fill="#94a3b8">km/h</text>
        <rect x="150" y="116" width="30" height="30" rx="5" fill="#111c30" stroke="#475569" />
        <text x="165" y="138" textAnchor="middle" fontSize="20" fontWeight="700" fill={gear === 'R' ? '#f87171' : '#fbbf24'} fontFamily="ui-monospace, monospace">{gear}</text>
      </svg>
      <div className="-mt-3 h-2 w-40 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${Math.round(revs * 100)}%`, background: revs > 0.9 ? '#ef4444' : revs > 0.7 ? '#f59e0b' : '#22c55e', transition: 'width 0.06s linear' }} />
      </div>
    </div>
  );
}
