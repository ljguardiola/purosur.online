# Contributing

## Getting started

1. Install Node `>=24.2`. The exact version is pinned in `.node-version`, which fnm, nvm, asdf, mise, and volta all pick up automatically.
2. Install pnpm by any method (npm, the standalone install script, or your OS package manager). pnpm self-manages: once invoked in this repository, it reads the `packageManager` field in `package.json` and switches itself to that pinned version.
3. Install dependencies: `pnpm install`.
4. Run the single gate before opening a pull request: `pnpm verify`. It runs the same checks locally and in CI: type checking, lint, tests, and the repository's own automation tests.

## Running it locally

Runs the cloud, its database, and the backoffice on one origin, with no real mail provider and no production or staging credential. Requires Docker or Podman (with the compose plugin) for the database.

1. `cp .env.example .env`. The defaults need no real credential: `RECOVERY_EMAIL_TRANSPORT=log` writes the recovery link to the cloud's own log instead of sending mail.
2. `pnpm dev:db` — starts Postgres (`docker-compose.yml`) in the background.
3. `pnpm dev:migrate` — builds the cloud and applies its migrations against `DATABASE_URL`.
4. `pnpm dev:create-first-administrator --name "Your Name" --email you@example.com` — creates the first Administrator.
5. `pnpm dev:cloud` — builds and starts the cloud on port 3000.
6. In a second terminal, `pnpm dev:backoffice` — starts the backoffice's Vite dev server. Its dev-server proxy (`apps/backoffice/vite.config.ts`) forwards every cloud API path to the cloud process above, so the browser only ever talks to the Vite origin (`http://localhost:5173`, `.env`'s `BACKOFFICE_ORIGIN`) and the cloud's Origin check applies exactly as it does when deployed.

To register the first Administrator's passkey: open the backoffice, request an account-recovery link for that Administrator's email, and read the link from the cloud process's log (step 5's terminal) instead of an inbox. A real fingerprint reader or phone is not required: Chrome DevTools' WebAuthn panel (More tools → WebAuthn) can add a virtual authenticator that stands in for one.

## Pinned versions

- TypeScript is pinned to exactly `6.0.3`. TypeScript 7 ships no JavaScript API, and dependency-cruiser declares support for `typescript >=2.0.0 <7.0.0`; under TypeScript 7 it would cruise zero modules and exit 0, so the architecture gate would pass without checking anything. Lift this pin once dependency-cruiser supports TypeScript 7.
- pnpm is pinned to major version 11, not 12. pnpm 12 writes a two-document lockfile that GitHub's dependency graph and Dependabot mis-parse. Lift this pin once that parsing is fixed.
- Dependency ranges are lowered instead of adding `minimumReleaseAgeExclude` entries. pnpm 11 refuses to resolve a version published less than a day ago (`minimumReleaseAge`, 1440 minutes) and enforces this even under `--frozen-lockfile`, so a range is lowered to the newest already-day-old version instead. After lowering a range, re-resolve with `pnpm clean --lockfile` followed by `pnpm install`.

## Issues

GitHub tells the story of the work: an issue is the *what*, a pull request is the *how*. Blank issues are disabled; every issue is filed from one of these four forms:

- **Feature** — a deliverable, user-visible vertical slice of functionality.
- **Bug** — something behaves differently from what it should.
- **Spike** — a technical question to answer before building. Its outcome is a written answer recorded in the issue; a spike never merges code.
- **Technical** — work with no user-visible change, such as CI, dependencies, or a refactor.

An issue that does not fill in every required section gets the `invalid-format` label and a bot comment listing what is missing. Fix the issue body and the label is removed automatically. Optional sections — a feature's "Out of scope" and a spike's "Result" — are included only when they have relevant content: a feature lists exclusions only when they are not obvious, and a spike records its result when it closes.

A feature too large for one pull request stays as a parent feature issue holding the overall goal and business rules, split into feature sub-issues (GitHub's native sub-issues) that are each releasable on their own. The parent has no pull request of its own; a pull request must close one of its sub-issues instead. A pull request referencing an issue that has sub-issues is rejected. A parent issue's own open/closed state is kept in sync with its sub-issues automatically: it closes once every sub-issue closes and reopens if a sub-issue reopens or if someone closes it manually while a sub-issue is still open.

## Branches and pull requests

- Keep branches short-lived. One pull request per unit of work.
- Branch names follow `<type>/<N>-<short-slug>`, where `<type>` is the Conventional Commit type below and `<N>` is the issue number (e.g. `feat/123-add-discounts`).
- The PR title must be a [Conventional Commit](https://www.conventionalcommits.org/) whose type matches the linked issue's type: `feat` for a feature, `fix` for a bug, and one of `chore`, `refactor`, `ci`, `build`, `test`, or `perf` for technical work. Spikes do not get a pull request.
- The PR body must close exactly one issue with `Closes #N` (or `Fixes`/`Resolves`).
- Fill in every section of the pull request template, including the Delivery impact checklist.
- Merges are squash-only. The PR title becomes the commit message on `main`.

## Code style

- This repository is strict TDD: write a failing test first, then the code that makes it pass. Never write implementation code ahead of its test.
- Code, comments, tests, commit messages, issues, and pull requests are written in English.
- User-facing text is written in Spanish and lives only in message catalogs, structured for internationalization even though there is a single language. Code references catalog keys and never contains user-facing text as a literal.
- Help and manuals live inside the application they serve: the register's help ships with the register and works offline; the backoffice's help lives in the backoffice.
- Code and tests explain themselves. Names, structure and test cases carry the meaning; a reader should not need a companion document to follow them.
- Write a comment only where something relevant cannot be read from the code — a legal deadline, an external system's constraint, a non-obvious reason for doing it this way. Do not comment what the code already says.
- Tests describe behavior in their own words. They do not reference requirement identifiers or any external document.
- Technical decisions belong in the pull request that introduces them, under "Technical decisions", not in code comments.

## Testing

Every rule is verified once, at the lowest level that can really prove it. Higher levels only verify that the pieces are wired together: a route test shows that the route reaches its validator and its guard, not every case the validator rejects; a screen test shows how the screen presents an outcome, not the rule that produced it. A rule is also defined once, in the package that owns it, and every other level imports it instead of keeping its own copy.

Each risk has one kind of test that owns it:

| Risk | Owning test | Runs |
|---|---|---|
| Domain rules: money, taxes, rounding, pricing, field validation | Unit tests of the domain or `packages/contracts`, with generated cases where a rule must hold for every input | `verify` |
| API behavior: authorization, input validation wiring, response shape, audit rows | Route tests in process against the lightweight database | `verify` |
| Database constraints, row locks and concurrency, background jobs | Integration tests against a real Postgres, used only for these | `verify` |
| Migrations, in the cloud and on the register | Applying each migration to a database that already holds data in the previous schema | `verify` |
| Registers and the cloud running different versions | Recorded events of every `schema_version` still in the field, accepted by the current cloud | `verify` |
| Offline sale and sync | Use-case tests with fakes for duplicated, reordered and interrupted deliveries | `verify` |
| The tax authority's web services | A fake of each web service and responses recorded from its test environment | `verify`; live calls to its test environment run on a schedule |
| Hardware: printer, scanner, scale, cash drawer | A fake behind each device's port, and the printed receipt compared with its expected output | `verify`; the real device by a written manual check before a hardware adapter change ships |
| Design-system components, including accessibility | Component tests in a real browser, in `packages/ui` | `verify` |
| Backoffice screens | Screen tests of how each screen presents its states and outcomes, and its wiring to the cloud | `verify` |
| Register journeys: sell, sell offline and sync, contingency invoicing, void, sign in | A few end-to-end tests of the packaged register app, each showing that the journey is wired end to end, not every case its use cases own | "Package register", on every pull request that changes the register or a package |
| Installing the packaged register and updating it in place | An install and update of the packaged build | Per release |

A test is removed only when the rule it checks is already verified by its owning test and it verifies nothing beyond that rule.

A CI run that fails because of a flaky test unrelated to the change is rerun only after an issue naming the test and its error has been filed. A rerun hides the instability, and it would equally hide a real failure.

## Dependabot

Dependency and GitHub Actions update PRs are opened by Dependabot (`.github/dependabot.yml`), not by a person, so they carry no linked issue and don't fill in the pull request template. The `pr-contract` check recognizes them by author login `dependabot[bot]` and author type `Bot` and skips the issue reference and section requirements for them, but a Dependabot PR title must still be a Conventional Commit of type `chore` or `ci`, and the `verify` check still runs. A human-authored PR whose title or body merely imitates Dependabot's style is not exempt.

## Checks

CI is the only thing that allows a merge: the `pr-contract` and `verify` checks are both required. A workflow step that references a GitHub Action by a moving tag (e.g. `@v4`) instead of a pinned commit SHA does not pass review.

No tool checks that `packages/ui` carries no screens — composed screens live in each app — so every pull request is reviewed for it by hand.

## Releases

The cloud service and the register app are two independently versioned deliverables: `cloud-vX.Y.Z` and `pos-vX.Y.Z`. A merge to `main` deploys staging automatically for both. Production release is a separate, manually triggered workflow per deliverable that promotes the exact artifact already validated in staging; those release workflows are not in this repository yet.

## Repository settings

These settings live in GitHub's UI and are not expressed by `.github/rulesets/main.json`:

- Default squash commit message: use the pull request title.
- Automatically delete head branches after merge.
- First run: apply the repository's labels once with `gh workflow run sync-labels.yml`, so the labels declared in `.github/labels.json` (the four `type:` labels and `invalid-format`) exist before the first issue is filed.
