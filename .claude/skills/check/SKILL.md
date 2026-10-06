---
name: check
description: Run the repository's pre-pull-request checks and report their real result, and read CI's verify of an open pull request. Use before saying a change is done, or whenever asked to verify, check, or run tests.
---

The checks a branch runs before its pull request are step 4 of "Working on an
issue" in `.claude/rules/workflow.md`; the full run of record is CI's `verify`
("Checks" in `.claude/rules/checks.md`).

1. Run them with the repo's pinned Node (or any Node version manager that
   reads `.node-version`, if `mise` isn't available):
   ```
   git fetch origin main
   mise exec node@$(cat .node-version) -- pnpm verify:static
   mise exec node@$(cat .node-version) -- pnpm test --changed origin/main
   mise exec node@$(cat .node-version) -- pnpm test <test files>
   ```
   `--changed` selects only the tests that import a changed file; the last
   command runs, by path, the tests step 4 names that reach a changed file
   another way (reading it from disk, or building or running the compiled
   build of an app built from it, a shared package's change included), and is
   left out when the branch has none.
2. Report the actual outcome of each: the exit code, and if it failed, which
   step stopped it (`tsc --noEmit`, a build, `biome ci`, `depcruise`, `knip`,
   the `node --test` suite — see the `verify:static` script in
   `package.json` for the exact order — or `vitest run`) and the real error
   output.
3. Once the branch has a pull request, read CI's `verify` with
   `gh pr checks <number>` and report its result the same way; the change is
   not done until it passes.
4. Never report success without having just run the command in this turn,
   and never describe a failing or partial run as passing.
