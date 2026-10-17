// The moderator's command line: see what players have reported and decide.
//   API_URL=http://localhost:3002 ADMIN_TOKEN=... npm run moderate                      list the open reports
//   npm run moderate -- resolve feedback 12 dismiss|remove|ban                          decide one (all reports on it close)
//                       (kinds: feedback, plot, ad, business (a profile, by its slug), message (a private message), nearby (a nearby chat line))
//   npm run moderate -- ban 7 "spam"                                                    ban an account by id
//   npm run moderate -- unban 7
//   npm run moderate -- audit [plot 12 | action plot.takeover | account 7]          the audit trail, newest first (docs/architecture/authoritative_data.md)
//   npm run moderate -- audit verify                                                check the audit trail's hash chain
//   npm run moderate -- posts [review|queued|posted|failed]                         welcome posts on X (docs/operations/social_posts.md)
//   npm run moderate -- posts approve|reject 4
//   npm run moderate -- orders [pending|paid|refunded|expired|failed]             payments (docs/monetization/billing.md), newest first
//   npm run moderate -- refund 12                                                   refund an order in full and take back what it bought
//   npm run moderate -- grant amys-cafe pro|launch|sponsored [days] [placement] [reason...]   a complimentary week, month or placement
//   npm run moderate -- pilot [weeks]                                               the pilot: each business's weeks, and whether the freeze can lift
//   npm run moderate -- pilot add <slug> [note] | pilot remove <slug> | pilot csv     who takes part, and the figures as a spreadsheet
//   npm run moderate -- renewals                                                    Pro renewals and repeat purchases (docs/monetization/conversions.md)
//   npm run moderate -- reconcile                                                   ask Stripe about pending orders and running Pro plans now
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
} else if (cmd === 'orders') {
  const { orders } = await call('GET', `/admin/billing/orders${args[0] ? `?status=${encodeURIComponent(args[0])}` : ''}`);
  if (!orders.length) console.log('No orders.');
  for (const o of orders) console.log(`[${o.id}] ${new Date(o.createdAt).toISOString().slice(0, 16)}  ${o.status.padEnd(8)} $${(o.cents / 100).toFixed(2).padStart(7)}  ${o.label ?? `${o.product}${o.placement ? ` (${o.placement})` : ''} for ${o.business}`}  account #${o.accountId}${o.note ? `\n    ${o.note}` : ''}`);
} else if (cmd === 'refund') {
  await call('POST', `/admin/billing/orders/${Number(args[0])}/refund`);
  console.log(`Order ${args[0]} is refunded in full, and what it bought is taken back.`);
} else if (cmd === 'grant') {
  const [slug, product, days, placement, ...reason] = args;
  const g = await call('POST', `/admin/billing/grant/${encodeURIComponent(slug ?? '')}`, { product, days: days ? Number(days) : undefined, placement: placement || undefined, reason: reason.join(' ') || undefined });
  console.log(`Granted: order ${g.orderId}, until ${new Date(g.until).toISOString().slice(0, 10)}.`);
} else if (cmd === 'pilot' && args[0] === 'add') {
  const r = await call('POST', '/admin/pilot/members', { slug: args[1], note: args.slice(2).join(' ') || undefined });
  console.log(`${r.slug} is in the pilot`);
} else if (cmd === 'pilot' && args[0] === 'remove') {
  const r = await call('DELETE', `/admin/pilot/members/${args[1]}`);
  console.log(`${r.slug} is out of the pilot (its record is kept)`);
} else if (cmd === 'pilot' && args[0] === 'csv') {
  const res = await fetch(`${base}/admin/pilot.csv${args[1] ? `?weeks=${args[1]}` : ''}`, { headers });
  if (!res.ok) (console.error(`${res.status}: failed`), process.exit(1));
  process.stdout.write(await res.text());
} else if (cmd === 'pilot') {
  const s = await call('GET', `/admin/pilot${args[0] ? `?weeks=${args[0]}` : ''}`);
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(`Pilot, weeks ${s.weeks[0]} to ${s.weeks.at(-1)} (this one so far): ${s.businesses.length} business(es), ${s.totals.activated} activated`);
  for (const b of s.businesses) {
    const weeks = b.weekly.map((w) => (w.member ? (w.ownerActive ? '#' : '.') : ' ')).join('');
    console.log(`  ${b.slug.padEnd(28)} [${weeks}] back ${b.retention.activeWeeks}/${b.retention.completedWeeks}  views ${b.totals.views}  presses ${b.totals.ctaClicks}  leads ${b.totals.leads}  redeemed ${b.totals.redemptions}  bought ${b.totals.purchases}  revenue ${(b.totals.verifiedRevenueCents / 100).toFixed(2)}  paid ${(b.paidCents / 100).toFixed(2)}${b.renewed ? '  renewed' : ''}${b.activated ? '' : '  (not activated)'}`);
  }
  console.log('Criteria (docs/roadmap/world_freeze.md):');
  for (const c of s.verdict.criteria) console.log(`  ${c.met ? 'met ' : 'not '} ${c.label}: ${c.kind === 'share' ? `${pct(c.actual)} (${c.businesses} of ${c.of}), needs ${pct(c.target)}` : c.kind === 'count' ? `${c.actual}, needs ${c.target}` : c.actual ? 'yes' : 'no'}`);
  console.log(s.verdict.lifts ? 'All met: the world-expansion freeze can lift.' : 'Not all met yet: the freeze stays.');
} else if (cmd === 'renewals') {
  const r = await call('GET', '/admin/metrics/renewals');
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(`Pro: ${r.pro.renewed} of ${r.pro.plans} paid plans renewed at least once (${pct(r.pro.rate)})`);
  console.log(`Launch Pack: ${r.launch.again} of ${r.launch.buyers} buyers bought again (${pct(r.launch.rate)})`);
  console.log(`Sponsored placements: ${r.sponsored.again} of ${r.sponsored.buyers} buyers bought again (${pct(r.sponsored.rate)})`);
} else if (cmd === 'reconcile') {
  console.log(JSON.stringify(await call('POST', '/admin/billing/reconcile')));
} else {
  console.error('Commands: list | resolve <feedback|plot|ad|business|message|nearby> <id> <dismiss|remove|ban> | ban <account id> [reason] | unban <account id> | audit [verify | <kind> [id] | action <name> | account <id>] | posts [status | approve <id> | reject <id>] | orders [status] | refund <order id> | grant <slug> <pro|launch|sponsored> [days] [placement] [reason] | pilot [weeks | add <slug> [note] | remove <slug> | csv [weeks]] | renewals | reconcile');
  process.exit(1);
}
