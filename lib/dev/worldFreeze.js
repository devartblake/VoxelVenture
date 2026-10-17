// The world-expansion freeze (docs/roadmap/world_freeze.md): while the commercial loop is being validated, no new
// world systems are added. Fixes, performance and accessibility work on the existing world are still allowed,
// so only *new* files under the world's folders are flagged; changes to existing files pass.

// Folders that hold the 3D world, its simulation and its asset pipeline.
export const FROZEN_PATHS = [
  'lib/city/',
  'lib/sim/',
  'apps/web/components/city/',
  'scripts/models/',
  'scripts/streets/',
  'scripts/study/',
  'apps/web/public/models/',
];
// Where two of those folders were before Phase C moved the app into apps/web (docs/architecture/adr/0003-apps-and-services.md). A file
// moved from one of them is not new world content.
export const FORMER_FROZEN_PATHS = ['components/city/', 'public/models/'];

// The commit-message trailer that lets one change through, with a reason: `World-freeze-exception: <why>`.
export const EXCEPTION_TRAILER = 'World-freeze-exception';

const norm = (file) => String(file ?? '').replaceAll('\\', '/');
export const isFrozenPath = (file) => FROZEN_PATHS.some((p) => norm(file).startsWith(p));
const wasWorldFile = (file) => isFrozenPath(file) || FORMER_FROZEN_PATHS.some((p) => norm(file).startsWith(p));

// `changes` is a list of { status, file, from } from `git diff --name-status` (status A = added, R = renamed into `file` from
// `from`, C = copied). Returns the added files that fall inside the frozen folders. A file renamed (moved) from a world folder is
// the same world file in a new place, so it is not counted; a copy is new.
export function frozenAdditions(changes) {
  return changes
    .filter((c) => /^[ARC]/.test(c.status) && isFrozenPath(c.file))
    .filter((c) => !(/^R/.test(c.status) && c.from && wasWorldFile(c.from)))
    .map((c) => c.file);
}

// The reason given by an exception trailer in any of the commit messages, or null.
export function exceptionReason(messages) {
  const re = new RegExp(`^${EXCEPTION_TRAILER}:[ \\t]*(\\S.*)$`, 'im');
  for (const m of messages) {
    const hit = re.exec(m ?? '');
    if (hit) return hit[1].trim();
  }
  return null;
}

// Parses `git diff --name-status` output. Renames and copies list the old and new paths; the new one counts, and the old one is `from`.
export function parseNameStatus(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split('\t');
    return { status: parts[0], file: parts[parts.length - 1], ...(parts.length > 2 ? { from: parts[1] } : {}) };
  });
}
