# CLAUDE.md

The repository contract lives entirely in `.claude/rules/` and loads
automatically; this file only adds what an agent needs operationally and never
restates its rules.

## Running things

- Use the repo's pinned Node: `mise exec node@$(cat .node-version) -- pnpm <script>`
  (any version manager that honors `.node-version` works the same way). pnpm
  itself comes from the `packageManager` pin in `package.json` — don't install
  a different version.
- CI's `verify`, the full `pnpm verify`, is the merge gate (see "Checks" in
  `.claude/rules/checks.md`). Before a pull request, run the checks step 4 of
  "Working on an issue" in `.claude/rules/workflow.md` names, and call nothing
  done until CI's `verify` passes. Report actual output — pass or fail — never
  assume or claim a check passed without running it.

## TDD

See "Code style" in `.claude/rules/code-style.md`.

## Issues and pull requests

- All work starts from an issue that follows the contract (see "Issues" in
  `.claude/rules/workflow.md`). Use the `start-work` skill to begin from an issue
  number.
- A pull request closes exactly one issue and its body is built from
  `.github/pull_request_template.md` (see "Branches and pull requests" in
  `.claude/rules/workflow.md`). Use
  the `open-pr` skill to build and open it.
- Use the `check` skill to run the pre-pull-request checks and report their real
  result.

## Hard blocks

A Claude Code hook (`.claude/hooks/pretool.mjs`, logic in
`.github/scripts/guard-command.mjs`) denies these before they run: committing
or pushing directly to `main`, `--force`/`-f`/`--force-with-lease`,
`--no-verify`, creating a `cloud-v*`/`pos-v*` tag locally, and a `gh pr`/`gh
issue` `create`/`edit` whose body doesn't pass the same template checks CI
runs. Don't try to work around it — fix the command instead.

## Repository language

See "Code style" in `.claude/rules/code-style.md`.

## Business rules

Business rules and product design live outside this repository. If a task
needs one that isn't already written down in an issue, ask the owner instead
of inventing it.
