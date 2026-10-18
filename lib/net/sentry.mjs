// Error reporting to Sentry (deploy/MONITORING.md) without its SDK: one small POST of Sentry's envelope format per error, so the API,
// the presence server and the web server share it and none of them gains a dependency. Off unless SENTRY_DSN is set.
//
//   const report = createReporter({ dsn: env.SENTRY_DSN, service: 'api', environment: env.SENTRY_ENVIRONMENT });
//   report.capture(error, { tags: { route: 'POST /claim' } });   // never throws; resolves when sent (or dropped)
//
// What is sent: the error's type, message and stack, the service, the release and the tags given. Never a player's name, address,
// email or network: Sentry's own "send default PII" stays off, and callers pass only paths, kinds and counts.
// https://<public key>@<host>/<project id>  ->  where to post and the key to sign with; null if it is not a DSN
export function parseDsn(dsn) {
  try {
    const u = new URL(String(dsn ?? '').trim());
    const project = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!/^https?:$/.test(u.protocol) || !u.username || !/^\d+$/.test(project)) return null;
    return { key: u.username, url: `${u.protocol}//${u.host}/api/${project}/envelope/`, dsn: `${u.protocol}//${u.username}@${u.host}/${project}` };
  } catch {
    return null;
  }
}

// A V8 stack ("    at fn (file:line:col)") as Sentry frames, oldest call first as Sentry expects.
export function stackFrames(stack) {
  const frames = [];
  for (const line of String(stack ?? '').split('\n')) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const file = m[2].replace(/^file:\/\//, '');
    frames.push({ function: m[1] || '?', filename: file, lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules|^node:/.test(file) });
  }
  return frames.reverse().slice(-50);
}

export function buildEvent(error, { service, environment, release, platform = 'node', tags = {}, extra } = {}) {
  const err = error instanceof Error || typeof error?.message === 'string' ? error : { name: 'Error', message: typeof error === 'string' ? error : JSON.stringify(error) ?? String(error) };
  const frames = stackFrames(err.stack);
  return {
    event_id: globalThis.crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform,
    level: 'error',
    logger: service,
    environment: environment || 'production',
    ...(release ? { release } : {}),
    tags: { service, ...tags },
    ...(extra ? { extra } : {}),
    exception: { values: [{ type: String(err.name || 'Error').slice(0, 100), value: String(err.message ?? '').slice(0, 2000), ...(frames.length ? { stacktrace: { frames } } : {}) }] },
  };
}

export function createReporter({ dsn, service, environment, release, platform = 'node', maxPerMinute = 30, fetchImpl = globalThis.fetch, onSent } = {}) {
  const target = parseDsn(dsn);
  if (!target) return { enabled: false, capture: async () => false };
  let windowStart = 0;
  let sentInWindow = 0;
  const lastSeen = new Map(); // the same error again within a minute is one report: a loop throwing on every frame is not 10,000 events
  return {
    enabled: true,
    async capture(error, options = {}) {
      try {
        const event = buildEvent(error, { service, environment, release, platform, ...options });
        const now = Date.now();
        const key = `${event.exception.values[0].type}|${event.exception.values[0].value}|${options.tags?.kind ?? ''}`;
        if (now - (lastSeen.get(key) ?? -Infinity) < 60000) return false;
        lastSeen.set(key, now);
        if (lastSeen.size > 500) lastSeen.delete(lastSeen.keys().next().value);
        if (now - windowStart > 60000) (windowStart = now), (sentInWindow = 0);
        if (++sentInWindow > maxPerMinute) return false;
        const body = [JSON.stringify({ event_id: event.event_id, sent_at: new Date(now).toISOString(), dsn: target.dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
        const res = await fetchImpl(target.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=voxelventure/1` },
          body,
          signal: AbortSignal.timeout(5000),
        });
        onSent?.(event, res);
        return res.ok;
      } catch {
        return false; // reporting must never take the service down with it
      }
    },
  };
}
