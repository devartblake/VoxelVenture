// Checks a branch against the world-expansion freeze (docs/world_freeze.md).
//   npm run check:freeze                     compare with origin/main (committed, staged and untracked files)
//   npm run check:freeze -- --base main      compare with another branch or commit
// Fails when a new file is added under a frozen folder (lib/city, lib/sim, components/city, the model, street and
// study scripts, public/models). Changes to existing files pass. To let a change through, put
//   World-freeze-exception: <why>
// on its own line in one of the branch's commit messages (or set WORLD_FREEZE_EXCEPTION for a local run).
import { execFileSync } from 'node:child_process';
import { root, imp } from './lib-loader.mjs';

const { FROZEN_PATHS, EXCEPTION_TRAILER, frozenAdditions, exceptionReason, parseNameStatus } = await imp('dev/worldFreeze.js');

const args = process.argv.slice(2);
const at = args.indexOf('--base');
const base = at >= 0 ? args[at + 1] : process.env.FREEZE_BASE || 'origin/main';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });

let mergeBase;
try {
  mergeBase = git('merge-base', base, 'HEAD').trim();
} catch {
  console.error(`world freeze: cannot find the base "${base}" (fetch it, or pass --base <ref>)`);
  process.exit(2);
}

// Committed and working-tree changes since the branch left the base, plus untracked files.
const changes = parseNameStatus(git('diff', '--name-status', '-M', mergeBase));
for (const file of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) changes.push({ status: 'A', file });

const added = [...new Set(frozenAdditions(changes))];
if (!added.length) {
  console.log(`world freeze: ok (no new files under ${FROZEN_PATHS.join(', ')})`);
  process.exit(0);
}

const messages = git('log', '--format=%B%x00', `${mergeBase}..HEAD`).split('\0');
const reason = process.env.WORLD_FREEZE_EXCEPTION || exceptionReason(messages);
console.log(`world freeze: ${added.length} new file(s) under frozen folders:`);
for (const f of added) console.log(`  + ${f}`);
if (reason) {
  console.log(`allowed by exception: ${reason}`);
  process.exit(0);
}
console.log(`\nWorld expansion is frozen until the commercial pilot is validated (docs/world_freeze.md).`);
console.log(`Fixes, performance and accessibility work belong in existing files. If this is one of the allowed kinds of work,`);
console.log(`add "${EXCEPTION_TRAILER}: <why>" to a commit message on this branch.`);
process.exit(1);
