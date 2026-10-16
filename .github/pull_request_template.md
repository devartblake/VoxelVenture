## What changed

## Why

## World-expansion freeze ([docs/world_freeze.md](../docs/world_freeze.md))
- [ ] This change does not add world content or simulation systems (roads, vehicles, landmarks, terrain, effects, new assets), **or**
- [ ] It is a fix, performance, accessibility or commercial change to the world, and `npm run check:freeze` passes (with a `World-freeze-exception:` line in a commit message if it adds files to a frozen folder)

## Checks
- [ ] `npm run lint`
- [ ] `npm test` (or the relevant suites: `node tests/run.mjs <name>`)
- [ ] No simulated statistics shown to advertisers as real figures
