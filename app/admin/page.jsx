"use client";

import React, { useEffect, useState } from 'react';

// Live view of every connected client and the errors they have reported (server/multiplayer.mjs, /status).
// Development tool for a trusted LAN: the status endpoint has no login.

const ago = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

// "Chrome 126 · Android" from a user-agent string, enough to tell the devices apart.
function shortAgent(ua = '') {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} · ${os}`;
}

export default function AdminPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    const url = process.env.NEXT_PUBLIC_MP_HTTP ?? `${window.location.protocol}//${window.location.hostname}:3001/status`;
    const load = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const json = await res.json();
        if (alive) {
          setData(json);
          setError('');
        }
      } catch {
        if (alive) setError(`Cannot reach the multiplayer server at ${url}. Start it with: npm run mp (or npm run dev:all)`);
      }
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const now = data?.now ?? Date.now();

  return (
    <div className="h-dvh overflow-y-auto bg-[#090d16] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold">Client monitor</h1>
          <a href="/" className="text-sm text-indigo-300 hover:underline">Back to the city</a>
        </div>
        <p className="mt-1 text-xs text-slate-400">Every connected device, its frame rate, and the errors it has reported. Updates every 2 seconds. Errors are also written to <code>server/logs/client-errors.jsonl</code>.</p>

        {error && <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}

        {data && (
          <>
            <p className="mt-4 text-xs text-slate-400">{data.players.length} connected · server up {Math.round(data.uptime / 60)} min · {data.recentErrors.length} recent errors</p>

            <h2 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wider text-slate-400">Clients</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[40rem] text-left text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2" title="A scrambled form of the network address">Network</th>
                    <th className="px-3 py-2">Device</th>
                    <th className="px-3 py-2">Screen</th>
                    <th className="px-3 py-2">FPS</th>
                    <th className="px-3 py-2" title="draw calls / triangles per frame">Draws / tris</th>
                    <th className="px-3 py-2">City</th>
                    <th className="px-3 py-2">Position</th>
                    <th className="px-3 py-2">Errors</th>
                    <th className="px-3 py-2">Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.players.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-4 text-slate-500">Nobody is connected.</td></tr>
                  )}
                  {data.players.map((p) => (
                    <tr key={p.id} className="border-t border-slate-800">
                      <td className="px-3 py-2 font-medium">{p.name} <span className="text-slate-500">#{p.id}</span></td>
                      <td className="px-3 py-2 font-mono" title="A scrambled form of the network address: the address itself is not kept">{p.net}</td>
                      <td className="px-3 py-2" title={p.device?.ua}>{shortAgent(p.device?.ua)}{p.device?.touch ? ' · touch' : ''}</td>
                      <td className="px-3 py-2 font-mono">{p.device?.screen}</td>
                      <td className={`px-3 py-2 font-mono ${p.fps != null && p.fps < 25 ? 'text-amber-300' : ''}`}>{p.fps ?? '–'}</td>
                      <td className="px-3 py-2 font-mono">{p.render ? `${p.render.calls} / ${(p.render.triangles / 1000).toFixed(0)}k` : '–'}</td>
                      <td className="px-3 py-2 font-mono">#{p.room}</td>
                      <td className="px-3 py-2 font-mono">{p.x.toFixed(0)}, {p.z.toFixed(0)}</td>
                      <td className={`px-3 py-2 font-mono ${p.errorCount ? 'text-red-300' : 'text-slate-500'}`}>{p.errorCount}</td>
                      <td className="px-3 py-2 text-slate-400">{ago(now - p.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-slate-400">Recent errors (newest first)</h2>
            {data.recentErrors.length === 0 ? (
              <p className="text-sm text-slate-500">No errors reported.</p>
            ) : (
              <ul className="space-y-2">
                {[...data.recentErrors].reverse().slice(0, 100).map((e, i) => (
                  <li key={`${e.time}-${i}`} className={`rounded-lg border p-3 text-xs ${e.kind === 'injected' ? 'border-slate-800 bg-slate-900/40 opacity-70' : 'border-red-950 bg-red-950/20'}`}>
                    <button className="block w-full text-left" onClick={() => setOpen(open === i ? null : i)}>
                      <span className="text-slate-400">{new Date(e.time).toLocaleTimeString()} · </span>
                      <span className="font-medium">{e.name}</span> <span className="text-slate-500" title="network (scrambled)">({e.net})</span>
                      <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{e.kind === 'injected' ? 'from a browser extension, not the app' : e.kind}</span>
                      {e.count > 1 && <span className="ml-1 text-amber-300">×{e.count}</span>}
                      <span className="mt-1 block break-words font-mono text-red-200">{e.message}</span>
                    </button>
                    {open === i && (
                      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-[11px] text-slate-300">
                        {[e.source && `at ${e.source}`, e.url && `page ${e.url}`, e.stack].filter(Boolean).join('\n')}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
