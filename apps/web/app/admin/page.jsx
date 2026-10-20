"use client";

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Clock, Gauge, Map as MapIcon, MonitorSmartphone, Users } from 'lucide-react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Alert, Badge, Button, DataTable, PageHeader, Section, StatCard, cx } from '@/components/admin/ui';

// Live view of every connected client and the errors they have reported (services/multiplayer/server.mjs, /status). The presence server's
// /status is not public: this page reads it through the API (GET /admin/presence), signed in (components/admin/AdminShell.jsx).

const ago = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const uptime = (s) => (s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

// "Chrome 126 · Android" from a user-agent string, enough to tell the devices apart.
function shortAgent(ua = '') {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} · ${os}`;
}

const HISTORY = 30; // samples kept for the trend lines (a minute at one every 2 seconds)
const average = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

const COLUMNS = [
  { key: 'name', header: 'Name', render: (p) => <span className="whitespace-nowrap font-medium text-white">{p.name} <span className="font-normal text-sx-muted">#{p.id}</span></span> },
  { key: 'net', header: 'Network', title: 'A scrambled form of the network address: the address itself is not kept', className: 'font-mono text-xs text-slate-300', render: (p) => <span title="A scrambled form of the network address: the address itself is not kept">{p.net}</span> },
  { key: 'device', header: 'Device', className: 'whitespace-nowrap', render: (p) => <span title={p.device?.ua}>{shortAgent(p.device?.ua)}{p.device?.touch ? ' · touch' : ''}</span> },
  { key: 'screen', header: 'Screen', className: 'font-mono text-xs', render: (p) => p.device?.screen },
  { key: 'fps', header: 'FPS', align: 'right', render: (p) => <span className={cx('font-mono', p.fps != null && p.fps < 25 ? 'font-semibold text-amber-300' : 'text-emerald-300')}>{p.fps ?? '–'}</span> },
  { key: 'render', header: 'Draws / tris', title: 'draw calls / triangles per frame', align: 'right', className: 'font-mono whitespace-nowrap', render: (p) => (p.render ? `${p.render.calls} / ${(p.render.triangles / 1000).toFixed(0)}k` : '–') },
  { key: 'quality', header: 'Quality', title: 'the quality tier the game draws at, and why (docs/architecture/performance_policy.md)', className: 'whitespace-nowrap', render: (p) => (p.quality ? <span title={p.quality.reasons ?? ''}><Badge tone="purple">{p.quality.tier}</Badge>{p.quality.frameP95 ? <span className="ml-1.5 font-mono text-xs text-sx-muted">p95 {p.quality.frameP95} ms</span> : null}</span> : '–') },
  { key: 'room', header: 'City', align: 'right', className: 'font-mono', render: (p) => `#${p.room}` },
  { key: 'pos', header: 'Position', align: 'right', className: 'font-mono whitespace-nowrap', render: (p) => `${p.x.toFixed(0)}, ${p.z.toFixed(0)}` },
  { key: 'errors', header: 'Errors', align: 'right', render: (p) => (p.errorCount ? <Badge tone="red">{p.errorCount}</Badge> : <span className="font-mono text-sx-muted">0</span>) },
];

export default function AdminPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [history, setHistory] = useState([]);
  const { call, setLive } = useAdmin();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const json = await call('/admin/presence');
        if (alive) {
          setData(json);
          setError('');
          const fps = json.players.map((p) => p.fps).filter((f) => f != null);
          setHistory((h) => [...h, { players: json.players.length, fps: average(fps) ?? 0 }].slice(-HISTORY));
          setLive({ tone: 'green', pulse: true, label: `Live · ${json.players.length} connected`, short: String(json.players.length) });
        }
      } catch (e) {
        if (alive) {
          setError(e.code === 'presence_unavailable' ? `${e.message} Start it with: npm run mp (or npm run dev:all). The API finds it at MP_STATUS_URL, or beside MP_NOTIFY_URL.` : e.message);
          setLive({ tone: 'red', pulse: false, label: 'Presence server unreachable', short: '!' });
        }
      }
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [call, setLive]);

  const now = data?.now ?? Date.now();
  const fpsNow = data ? average(data.players.map((p) => p.fps).filter((f) => f != null)) : null;
  const slow = data ? data.players.filter((p) => p.fps != null && p.fps < 25).length : 0;
  const realErrors = data ? data.recentErrors.filter((e) => e.kind !== 'injected').length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live"
        title="Client monitor"
        description={<>Every connected device, its frame rate, and the errors it has reported. Updates every 2 seconds. Errors are also written to <code className="rounded bg-sx-alt px-1 py-0.5 text-xs text-slate-200">server/logs/client-errors.jsonl</code>.</>}
        actions={<Button href="/" external icon={MapIcon}>Back to the city</Button>}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {data && (
        <>
          <p className="sr-only" aria-live="polite">{data.players.length} connected · server up {Math.round(data.uptime / 60)} min · {data.recentErrors.length} recent errors</p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Connected" value={data.players.length} icon={Users} tone="cyan" trend={history.map((h) => h.players)} hint={`${data.players.filter((p) => p.device?.touch).length} on touch`} />
            <StatCard label="Average FPS" value={fpsNow ?? '–'} icon={Gauge} tone={fpsNow != null && fpsNow < 25 ? 'amber' : 'green'} trend={history.map((h) => h.fps)} hint={slow ? `${slow} below 25` : 'all smooth'} />
            <StatCard label="Recent errors" value={data.recentErrors.length} icon={AlertTriangle} tone={realErrors ? 'red' : 'purple'} hint={`${realErrors} from the app`} />
            <StatCard label="Server up" value={uptime(data.uptime)} icon={Clock} tone="gold" hint="the presence server" />
          </div>

          <Section title="Clients" icon={MonitorSmartphone} description="Who is in the city now, on what, and how well it runs." bodyClassName="p-3 sm:p-4">
            <DataTable
              caption="Connected clients"
              columns={[...COLUMNS, { key: 'seen', header: 'Seen', align: 'right', className: 'whitespace-nowrap text-sx-muted', render: (p) => ago(now - p.lastSeen) }]}
              rows={data.players}
              rowKey={(p) => p.id}
              empty="Nobody is connected."
              minWidth="56rem"
            />
          </Section>

          <Section title="Recent errors (newest first)" icon={AlertTriangle} description="Press one for where it happened and its stack." bodyClassName="p-3 sm:p-4">
            {data.recentErrors.length === 0 ? (
              <p className="py-6 text-center text-sm text-sx-muted">No errors reported.</p>
            ) : (
              <ul className="space-y-2">
                {[...data.recentErrors].reverse().slice(0, 100).map((e, i) => (
                  <li key={`${e.time}-${i}`} className={cx('rounded-xl border text-sm', e.kind === 'injected' ? 'border-sx-stroke bg-sx-alt/30 opacity-80' : 'border-red-400/25 bg-red-500/[0.06]')}>
                    <button type="button" aria-expanded={open === i} className="flex min-h-11 w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-sx-alt/40" onClick={() => setOpen(open === i ? null : i)}>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="font-mono text-sx-muted">{new Date(e.time).toLocaleTimeString()}</span>
                          <span className="font-semibold text-white">{e.name}</span>
                          <span className="text-sx-muted" title="network (scrambled)">({e.net})</span>
                          <Badge tone={e.kind === 'injected' ? 'neutral' : 'red'}>{e.kind === 'injected' ? 'from a browser extension, not the app' : e.kind}</Badge>
                          {e.count > 1 && <Badge tone="amber">×{e.count}</Badge>}
                        </span>
                        <span className="mt-1.5 block break-words font-mono text-xs text-red-200">{e.message}</span>
                      </span>
                      <ChevronDown aria-hidden="true" className={cx('mt-0.5 h-4 w-4 shrink-0 text-sx-muted transition-transform motion-reduce:transition-none', open === i && 'rotate-180')} />
                    </button>
                    {open === i && (
                      <pre className="mx-3 mb-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-sx-stroke bg-black/40 p-3 font-mono text-[11px] text-slate-300">
                        {[e.source && `at ${e.source}`, e.url && `page ${e.url}`, e.stack].filter(Boolean).join('\n')}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
