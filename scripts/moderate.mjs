// The moderator's command line: see what players have reported and decide.
//   API_URL=http://localhost:3002 ADMIN_TOKEN=... npm run moderate                      list the open reports
//   npm run moderate -- resolve feedback 12 dismiss|remove|ban                          decide one (all reports on it close)
//                       (kinds: feedback, plot, ad, business (a profile, by its slug), message (a private message), nearby (a nearby chat line))
//   npm run moderate -- ban 7 "spam"                                                    ban an account by id
//   npm run moderate -- unban 7
//   npm run moderate -- audit [plot 12 | action plot.takeover | account 7]          the audit trail, newest first (docs/authoritative_data.md)
//   npm run moderate -- audit verify                                                check the audit trail's hash chain
//   npm run moderate -- posts [review|queued|posted|failed]                         welcome posts on X (docs/social_posts.md)
//   npm run moderate -- posts approve|reject 4
// With the messaging service (services/messaging), chat reports are its own: set MESSAGING_URL (e.g. http://localhost:3003) and the
// list shows both queues, and `resolve message|nearby ...` goes there.
const base = process.env.API_URL || 'http://localhost:3002';
const messagingBase = process.env.MESSAGING_URL || '';
const CHAT_KINDS = ['message', 'nearby'];
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ADMIN_TOKEN ?? ''}` };
const call = async (method, path, body, at = base) => {
  const res = await fetch(at + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`${res.status}: ${data.error ?? 'failed'}`);
    process.exit(1);
  }
  return data;
};
const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === 'list') {
  const { reports } = await call('GET', '/admin/reports');
  if (messagingBase) reports.push(...(await call('GET', '/admin/reports', null, messagingBase)).reports);
  if (!reports.length) console.log('Nothing to review.');
  for (const r of reports) console.log(`[${r.kind} ${r.id}] ${r.reports} report(s): ${r.reasons.join(', ')}${r.where ? ` (${r.where})` : ''}\n    by ${r.author ?? '?'}: ${r.gone ? '(gone)' : r.text}${r.hidden ? '  [hidden]' : ''}`);
} else if (cmd === 'resolve') {
  const [kind, id, action] = args;
  const at = messagingBase && CHAT_KINDS.includes(kind) ? messagingBase : base;
  const { id: reportId } = await call('GET', `/admin/reports/ids?kind=${kind}&id=${id}`, null, at);
  console.log(JSON.stringify(await call('POST', `/admin/reports/${reportId}/resolve`, { action }, at)));
} else if (cmd === 'ban' || cmd === 'unban') {
  console.log(JSON.stringify(await call('POST', `/admin/accounts/${args[0]}/${cmd}`, { reason: args[1] })));
} else if (cmd === 'audit' && args[0] === 'verify') {
  const v = await call('GET', '/admin/audit/verify');
  console.log(v.ok ? `The audit trail is intact (${v.rows} records).` : `BROKEN at record ${v.brokenAt} (of ${v.rows} checked): it was changed outside the API.`);
  if (!v.ok) process.exit(1);
} else if (cmd === 'audit') {
  const [what, value] = args;
  const q = !what ? '' : what === 'action' ? `?action=${encodeURIComponent(value)}` : what === 'account' ? `?actor=${encodeURIComponent(value)}` : `?target_kind=${encodeURIComponent(what)}${value ? `&target_id=${encodeURIComponent(value)}` : ''}`;
  const { entries } = await call('GET', `/admin/audit${q}${q ? '&' : '?'}limit=50`);
  if (!entries.length) console.log('No records.');
  for (const e of entries) console.log(`${new Date(e.at).toISOString()}  ${e.action.padEnd(24)} ${e.target.kind} ${e.target.id ?? ''}  by ${e.actor.kind === 'account' ? `${e.actor.name ?? '?'} (#${e.actor.id})` : e.actor.kind}${e.detail ? `  ${JSON.stringify(e.detail)}` : ''}`);
} else if (cmd === 'posts' && ['approve', 'reject'].includes(args[0])) {
  const p = await call('POST', `/admin/social/${args[1]}/${args[0]}`);
  console.log(`${args[0] === 'approve' ? 'Approved' : 'Rejected'}: ${p.text}`);
} else if (cmd === 'posts') {
  const { mode, configured, posts } = await call('GET', `/admin/social?status=${encodeURIComponent(args[0] ?? 'review')}`);
  console.log(`Welcome posts: ${mode}${mode !== 'off' && !configured ? ' (the X keys are not set: nothing can be sent)' : ''}`);
  if (!posts.length) console.log('None.');
  for (const p of posts) console.log(`[${p.id}] ${p.status}${p.error ? ` (${p.error})` : ''}${p.url ? ` ${p.url}` : ''}\n    ${p.text}`);
} else {
  console.error('Commands: list | resolve <feedback|plot|ad|business|message|nearby> <id> <dismiss|remove|ban> | ban <account id> [reason] | unban <account id> | audit [verify | <kind> [id] | action <name> | account <id>] | posts [status | approve <id> | reject <id>]');
  process.exit(1);
}
