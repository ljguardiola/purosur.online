---
name: check
description: Run the repository's single verification gate and report its real result. Use before saying a change is done, or whenever asked to verify, check, or run tests.
---

`pnpm verify` is the one gate described in `CONTRIBUTING.md` ("Getting
started" and "Checks"): the same command runs locally and in CI.

1. Run it with the repo's pinned Node:
   `mise exec node@$(cat .node-version) -- pnpm verify`
   (or any Node version manager that reads `.node-version`, if `mise` isn't
   available).
2. Report the actual outcome: the exit code, and if it failed, which step
   stopped it (`tsc --noEmit`, `biome ci`, `vitest run`, or the
   `.github/scripts/*.test.mjs` suite — see the `verify` script in
   `package.json` for the exact order) and the real error output.
3. Never report success without having just run this command in this turn,
   and never describe a failing or partial run as passing.
