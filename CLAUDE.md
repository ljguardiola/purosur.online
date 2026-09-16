# CLAUDE.md

The repository contract lives entirely in `CONTRIBUTING.md`. Read it first;
this file only adds what an agent needs operationally and never restates its
rules.

## Running things

- Use the repo's pinned Node: `mise exec node@$(cat .node-version) -- pnpm <script>`
  (any version manager that honors `.node-version` works the same way). pnpm
  itself comes from the `packageManager` pin in `package.json` — don't install
  a different version.
- `pnpm verify` is the merge gate (see "Checks" in `CONTRIBUTING.md`). Run it
  before calling anything done, and report its actual output — pass or fail —
  never assume or claim it passed without running it.

## TDD

See "Code style" in `CONTRIBUTING.md`.

## Issues and pull requests

- All work starts from an issue that follows the contract (see "Issues" in
  `CONTRIBUTING.md`). Use the `start-work` skill to begin from an issue
  number.
- A pull request closes exactly one issue and its body is built from
  `.github/pull_request_template.md` (see "Branches and pull requests"). Use
  the `open-pr` skill to build and open it.
- Use the `check` skill to run `pnpm verify` and report its real result.

## Hard blocks

A Claude Code hook (`.claude/hooks/pretool.mjs`, logic in
`.github/scripts/guard-command.mjs`) denies these before they run: committing
or pushing directly to `main`, `--force`/`-f`/`--force-with-lease`,
`--no-verify`, creating a `cloud-v*`/`pos-v*` tag locally, and a `gh pr`/`gh
issue` `create`/`edit` whose body doesn't pass the same template checks CI
runs. Don't try to work around it — fix the command instead.

## Repository language

See "Code style" in `CONTRIBUTING.md`.

## Business rules

Business rules and product design live outside this repository. If a task
needs one that isn't already written down in an issue, ask the owner instead
of inventing it.
