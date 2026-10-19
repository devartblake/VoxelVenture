// The policies (lib/legal/policies.js, /legal): every number they state matches the code, every browser-storage key the code uses is
// disclosed, the pages and links exist, and approved policies have no [placeholder] or review note left.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const { RETENTION, LIMITS, MONEY, BROWSER_STORAGE } = await imp('legal/facts.js');
const { POLICY_STATUS, policies } = await imp('legal/policies.js');
const { operator } = await imp('legal/operator.js');
import { ATTRIBUTION_DAYS } from '@voxelventure/analytics';
import { PRODUCTS, PLACEMENTS } from '@voxelventure/business-core';

// ---- the numbers the policies quote are the code's
const has = (file, re) => re.test(read(file));
check('a sign-in lasts as long as the policy says', has('services/api/core.mjs', new RegExp(`now\\(\\) \\+ ${RETENTION.sessionDays} \\* DAY`)));
check('request details are wiped after the stated days', has('services/api/conversions.mjs', new RegExp(`export const INQUIRY_DAYS = ${RETENTION.inquiryDays};`)));
const { settingsFrom } = await import(new URL('../services/api/messaging.mjs', import.meta.url).href);
const chat = settingsFrom({});
check('chat retention (nearby, inbox, report evidence) is as stated', chat.nearbyDays === RETENTION.nearbyDays && chat.inboxDays === RETENTION.inboxDays && chat.reportDays === RETENTION.reportEvidenceDays && RETENTION.nearbyDeleteDays === RETENTION.nearbyDays + 30, JSON.stringify(chat));
check('the Python messaging service keeps the same periods', has('services/messaging/app/config.py', new RegExp(`MESSAGING_NEARBY_DAYS', ${RETENTION.nearbyDays}\\)`)) && has('services/messaging/app/config.py', new RegExp(`MESSAGING_INBOX_DAYS', ${RETENTION.inboxDays}\\)`)));
check('the plot economy\'s data is kept as stated', has('services/api/economy.mjs', new RegExp(`export const INTENT_DAYS = ${RETENTION.intentDays};`)) && has('services/api/economy.mjs', new RegExp(`export const TRAFFIC_SEEN_DAYS = ${RETENTION.trafficSeenDays};`)) && has('lib/game/claimHold.js', new RegExp(`HOLD_SECONDS = ${RETENTION.holdMinutes * 60};`)));
check('who is online is kept a day', RETENTION.presenceDays === 1 && has('services/api/stats.mjs', /DELETE FROM presence WHERE last_at < \?'\)\.run\(now - DAY\)/));
check('the referral code is kept the stated days', has('lib/business/referral.js', new RegExp(`KEEP_MS = ${RETENTION.referralDays} \\* 86400000`)));
check('backups are kept the stated days', has('deploy/backup.sh', new RegExp(`BACKUP_KEEP:-${RETENTION.backupDays}\\}`)));
check('the presence server keeps network addresses only scrambled, as the privacy policy says (gap 1)', has('services/multiplayer/server.mjs', /const netOf = /) && !has('services/multiplayer/server.mjs', /ip: p\.ip|^\s+ip,\r?$|`\$\{ip\} \(|from \$\{ip\}|\$\{id\}, \$\{ip\}/m));
check('take-over emails call the payout game value, as the terms say (gap 3)', has('services/api/engage.mjs', /no real money is paid/) && !has('services/api/engage.mjs', /paid out \$/));
check('the error log is cut at the stated size', has('services/multiplayer/server.mjs', /MP_LOG_MAX_BYTES \|\| 2_000_000/) && RETENTION.errorLogBytes === 2_000_000);
check('the attribution window is the code\'s', RETENTION.attributionDays === ATTRIBUTION_DAYS);
check('the limits are the code\'s', has('services/api/business.mjs', new RegExp(`MAX_PROFILES = ${LIMITS.profilesPerAccount};`)) && has('services/api/market.mjs', new RegExp(`MAX_ACTIVE_PER_WEEK = ${MONEY.stallsPerWeek};`)) && has('services/api/billing.mjs', new RegExp(`HOLD_MS = ${MONEY.checkoutHoldMinutes} \\* 60000`)) && has('services/api/social.mjs', new RegExp(`default ${LIMITS.socialPostsPerDay}\\)`)));
check('the prices are the catalogue\'s', MONEY.launch.price === `$${PRODUCTS.launch.cents / 100}` && MONEY.pro.price === `$${PRODUCTS.pro.cents / 100}` && MONEY.placements.length === Object.keys(PLACEMENTS).length);

// ---- every browser-storage key the code uses is in the privacy policy
const keysInCode = new Set();
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel);
    else if (/\.(js|jsx|mjs)$/.test(e.name)) for (const m of read(rel).matchAll(/'(voxelventure-[a-z-]+)'/g)) keysInCode.add(m[1]);
  }
};
for (const d of ['lib', 'apps/web/components', 'apps/web/app']) walk(d);
const disclosed = new Set(BROWSER_STORAGE.flatMap((s) => s.keys));
const missing = [...keysInCode].filter((k) => !disclosed.has(k));
check('every key the code keeps in the browser is disclosed', missing.length === 0, missing.join(', '));
check('and no key is disclosed that the code does not use', [...disclosed].every((k) => keysInCode.has(k)), [...disclosed].filter((k) => !keysInCode.has(k)).join(', '));

// ---- the policies, their pages and links
const list = policies(operator({}));
const slugs = list.map((p) => p.slug);
check('the six policies exist', ['terms', 'privacy', 'refunds', 'advertising', 'retention', 'merchants'].every((s) => slugs.includes(s)), slugs.join());
check('each has a title, a summary and sections with unique ids', list.every((p) => p.title && p.summary && p.sections.length && new Set(p.sections.map((s) => s.id)).size === p.sections.length));
check('the pages exist', fs.existsSync(path.join(root, 'apps/web/app/(public)/legal/page.jsx')) && fs.existsSync(path.join(root, 'apps/web/app/(public)/legal/[slug]/page.jsx')));
const layout = read('apps/web/app/(public)/layout.jsx');
check('the public footer links every policy', slugs.every((s) => layout.includes(`'${s}'`)));
check('signing up links the terms and privacy policy', /\/legal\/terms/.test(read('apps/web/components/ui/AuthDialog.jsx')) && /\/legal\/privacy/.test(read('apps/web/components/ui/AuthDialog.jsx')));
const placeholders = [...new Set(JSON.stringify(list).match(/\[[^\]"]+\]/g) ?? [])];
const reviews = JSON.stringify(list).match(/"review":/g)?.length ?? 0;
console.log(`     ${placeholders.length} placeholders and ${reviews} review notes left: ${placeholders.join(' ')}`);
if (POLICY_STATUS.status === 'approved') {
  check('approved policies have an effective date', Boolean(POLICY_STATUS.effective));
  check('approved policies have no placeholder left (with the operator set)', !placeholders.length);
  check('approved policies have no review note left', reviews === 0);
} else {
  check('drafts say so: a draft status and no effective date', POLICY_STATUS.status === 'draft' && POLICY_STATUS.effective === null);
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('ALL OK');
