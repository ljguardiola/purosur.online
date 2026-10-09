# Issues

GitHub tells the story of the work: an issue is the *what*, a pull request is the *how*. Blank issues are disabled; every issue is filed from one of these four forms:

- **Feature** — a deliverable, user-visible vertical slice of functionality.
- **Bug** — something behaves differently from what it should.
- **Spike** — a technical question to answer before building. Its outcome is a written answer recorded in the issue; a spike never merges code.
- **Technical** — work with no user-visible change, such as CI, dependencies, or a refactor. The one exception is a change that only aligns a screen with `packages/ui`'s pieces: it may change how the screen looks when its pull request declares each visible difference.

An issue that does not fill in every required section gets the `invalid-format` label and a bot comment listing what is missing. Fix the issue body and the label is removed automatically. Optional sections — a feature's "Out of scope" and a spike's "Result" — are included only when they have relevant content: a feature lists exclusions only when they are not obvious, and a spike records its result when it closes.

A feature too large for one pull request stays as a parent feature issue holding the overall goal and business rules, split into feature sub-issues (GitHub's native sub-issues) that are each releasable on their own. The parent has no pull request of its own; a pull request must close one of its sub-issues instead. A pull request referencing an issue that has sub-issues is rejected. A parent issue's own open/closed state is kept in sync with its sub-issues automatically: it closes once every sub-issue closes and reopens if a sub-issue reopens or if someone closes it manually while a sub-issue is still open.

# Branches and pull requests

- Keep branches short-lived. One pull request per unit of work.
- Branch names follow `<type>/<N>-<short-slug>`, where `<type>` is the Conventional Commit type below and `<N>` is the issue number (e.g. `feat/123-add-discounts`).
- The PR title must be a [Conventional Commit](https://www.conventionalcommits.org/) whose type matches the linked issue's type: `feat` for a feature, `fix` for a bug, and one of `chore`, `refactor`, `ci`, `build`, `test`, or `perf` for technical work. Spikes do not get a pull request.
- The PR body must close exactly one issue with `Closes #N` (or `Fixes`/`Resolves`). That issue is open and does not carry `invalid-format`.
- Fill in every section of the pull request template. Check at least one Delivery impact box; `None` is never checked together with another.
- Nothing is committed or pushed to `main` directly, and `main` is never force-pushed or deleted. A branch takes `main`'s changes by merging it, never by rebasing once pushed.
- Merges are squash-only. The PR title becomes the commit message on `main`.

# Working on an issue

1. Develop test-first (see `.claude/rules/code-style.md`), running only the test files you touch; the whole suite runs in CI's `verify`.
2. A change to `packages/domain` or `packages/contracts` runs `pnpm mutation --mutate <each touched source file>` and leaves no surviving mutant in them. CI runs the whole mutation suite weekly, not on pull requests.
3. With every change committed, review the branch with the `review-gate` skill (`.claude/skills/review-gate/`) until it reports `CLEAN`. A review that reports `STOPPED` goes to whoever assigned the issue before anything else happens.
4. Run the static checks, `pnpm verify:static`, and the tests of the files the branch changed. `pnpm test:changed`, after `git fetch origin main`, runs, one file at a time so each test runs as it does alone, the test files named after each file changed since `origin/main`, in its folder and, for a file in a `test-support/` folder, in the folder it serves, and, when a cloud or register migration changed, the tests of that app that apply every migration or read the whole migrated schema, so they fail when a migration adds something they do not cover: `apps/cloud/src/platform/db/schema.test.ts`, `apps/cloud/src/platform/db/migrate-cloud-app-role.integration.test.ts` and `apps/cloud/src/test-support/build-test-database.test.ts` for a cloud migration, `apps/pos/src/core/platform/local-migrations.test.ts` for a register migration. Every other test that reaches a changed file, by import or otherwise, is left to CI's `verify`, except these, added to the same command by path, `pnpm test:changed <test files>`:
   - a test that reads a changed file from disk, or lists the folder a file was added to or removed from: the story test (`*.visual.tsx`) of an approved screenshot, a test that parses `packages/ui`'s stylesheet, and a structure test of a folder layout;
   - a test that builds an app or runs its compiled build, for every app built from a changed file, whether the file is the app's own source or in a package the app imports: the backoffice and the register bundle `packages/ui`, `packages/contracts` and `packages/domain`, and the cloud compiles `packages/contracts` and `packages/domain`. These tests are `apps/backoffice/*.test.ts` and `apps/cloud/*.test.ts` for the backoffice, `apps/pos/*.test.ts` and `apps/pos/src/build-output.test.ts` for the register, and the cloud tests that read `cloudBuildDir` for the cloud.

   The whole suite runs in CI's `verify`, which is the full run of record; the full `pnpm verify` is not run locally before a pull request.
5. Open the pull request. Its "How it was tested" cites the `review-gate` result line and the result of step 4, and gains CI's `verify` result once that run finishes. A pull request is not done until CI's `verify` passes.

# Dependabot

Dependency and GitHub Actions update PRs are opened by Dependabot (`.github/dependabot.yml`), not by a person, so they carry no linked issue and don't fill in the pull request template. The `pr-contract` check recognizes them by author login `dependabot[bot]` and author type `Bot` and skips the issue reference and section requirements for them, but a Dependabot PR title must still be a Conventional Commit of type `chore` or `ci`, and the `verify` check still runs. A human-authored PR whose title or body merely imitates Dependabot's style is not exempt.
