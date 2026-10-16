// The moderator's command line: see what players have reported and decide.
//   API_URL=http://localhost:3002 ADMIN_TOKEN=... npm run moderate                      list the open reports
//   npm run moderate -- resolve feedback 12 dismiss|remove|ban                          decide one (all reports on it close)
//                       (kinds: feedback, plot, ad, message (a private message), nearby (a nearby chat line))
//   npm run moderate -- ban 7 "spam"                                                    ban an account by id
//   npm run moderate -- unban 7
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
} else {
  console.error('Commands: list | resolve <feedback|plot|ad|message|nearby> <id> <dismiss|remove|ban> | ban <account id> [reason] | unban <account id>');
  process.exit(1);
}
