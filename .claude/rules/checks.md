# Checks

CI is the only thing that allows a merge: the `pr-contract` and `verify` checks are both required. A workflow step that references a GitHub Action by a moving tag (e.g. `@v4`) instead of a pinned commit SHA does not pass review. `pnpm verify` rejects a workflow job without a `timeout-minutes`.

CI's `verify` skips the parts a pull request cannot affect: a change made only of Markdown files outside `apps/`, `packages/` and `.github/` skips every check but the scope decision, one made only of those files and files under `.claude/` skips the tests, and the design-system screenshots run only when `packages/ui` or one of their inputs changes. The required check still reports its result. A push to `main` always runs the static checks and the tests.

No tool checks that `packages/ui` carries no screens — composed screens live in each app — so every pull request is reviewed for it by hand.

A configuration variable (`vars`) holds only a value that may be public; anything else is a secret. `pnpm verify` rejects a workflow step that writes a configuration variable or a secret directly into its script instead of passing it through the step's `env:`, or that traces the commands it runs.

`pnpm verify` scans every tracked file for secrets, and every line each commit of the change adds since `main`, even one a later commit removes. When it finds one in CI, the secret has already reached GitHub and stays readable in that commit: revoke and rotate it first, then rewrite the pull request's history without it or close the pull request and open a new one from a clean branch.

Follow Verify's duration across runs on main with `pnpm ci:verify-durations` (needs the `gh` CLI signed in). A test is marked slow only against the duration that is slow for its own kind of test, listed at the end of the run; it never fails a run.
