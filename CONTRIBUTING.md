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
5. `pnpm dev:load-sample-data` — fills the database with realistic, fictional sample data (products, prices, users, alerts, and more). Running it again is a no-op; `pnpm dev:clear-sample-data` removes only what it added, leaving the Administrator from step 4 untouched, and changes nothing while other data still depends on sample data. Neither runs against anything but a local database or, for loading only, staging.
6. `pnpm dev:cloud` — builds and starts the cloud on port 3000.
7. In a second terminal, `pnpm dev:backoffice` — starts the backoffice's Vite dev server. Its dev-server proxy (`apps/backoffice/vite.config.ts`) forwards every cloud API path to the cloud process above, so the browser only ever talks to the Vite origin (`http://localhost:5173`, `.env`'s `BACKOFFICE_ORIGIN`) and the cloud's Origin check applies exactly as it does when deployed.

Sample data can also be loaded on staging on demand, once it already has its own Administrator: `railway ssh --service "Cloud Server" --environment staging -- node dist/load-sample-data.js`. Clearing it back out is local only, since staging's cloud connects as the limited `cloud_app` role, which cannot delete prices, price reviews, audit rows, or products.

To register the first Administrator's passkey: open the backoffice, request an account-recovery link for that Administrator's email, and read the link from the cloud process's log (step 6's terminal) instead of an inbox. A real fingerprint reader or phone is not required: Chrome DevTools' WebAuthn panel (More tools → WebAuthn) can add a virtual authenticator that stands in for one.

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

## Structure

This is the structure the repository is organized into. A part that does not follow it yet is moved to it when it is reorganized, and never serves as a precedent for new code.

- In every layer that covers business concepts — `packages/domain`, the cloud, the backoffice, the register app — the top-level folders are the business concepts it covers, each named like `packages/domain`'s concept of the same name (such as `catalog`, `pricing`, `alerts`, `register`, `fiscal`, `access`, `branch`), so a concept is found under the same name from its rule to its screen. A concept the domain has no rules for yet still gets its own folder under its business name. A concept folder holds everything of that concept in that layer: its screens and their parts, its API client, its routes, its helpers.
- A business rule (money, taxes, rounding, field validation, catalogs, calendar rules) lives in its concept's `model/` in `packages/domain`; a rule more than one concept needs lives in `packages/domain/src/shared/` instead, reached only through its own `index.ts`. The shape of a message or payload exchanged between processes lives in `packages/contracts` instead, in a folder named like the domain concept it belongs to; `packages/contracts` imports a rule from `packages/domain` where a shape needs one, and never defines one itself.
- What belongs to no concept lives beside them under its own name: `shell/` for the application's frame (layout, navigation, session guard), `platform/` for shared infrastructure used across concepts (HTTP helpers, formatting, the database connection and schema, error reporting), and a folder named after any other part of the application, such as the backoffice's `help/`.
- A menu area that groups several concepts does so through its routes, not through a folder.
- Every source file and folder is named in English kebab-case (`products-list-screen.tsx`). Identifiers and URL paths are English too; only user-facing text is Spanish.
- Each file's tests sit beside it. Helpers used only by tests live in a `test-support/` folder inside the folder they serve.

## Code style

- This repository is strict TDD: write a failing test first, then the code that makes it pass. Never write implementation code ahead of its test.
- Code, comments, tests, commit messages, issues, and pull requests are written in English.
- User-facing text is written in Spanish where it is shown; there are no message catalogs. Text built from quantities, amounts or dates goes through `packages/ui`'s formatting functions, fixed to Argentine Spanish (`es-AR`), so a value reads the same on every screen.
- A `packages/ui` component writes the text that reads the same wherever it is used (a modal's close button, a pagination's previous and next); text that depends on the screen comes from the app as a prop, with no default.
- Help and manuals live inside the application they serve: the register's help ships with the register and works offline; the backoffice's help lives in the backoffice.
- Code and tests explain themselves. Names, structure and test cases carry the meaning; a reader should not need a companion document to follow them.
- Write a comment only where something relevant cannot be read from the code — a legal deadline, an external system's constraint, a non-obvious reason for doing it this way. Do not comment what the code already says.
- Tests describe behavior in their own words. They do not reference requirement identifiers or any external document.
- Technical decisions belong in the pull request that introduces them, under "Technical decisions", not in code comments.

## Backoffice screens

- Every backoffice screen is a typed route, declared in its concept's `routes.tsx` under the layout route of the menu area it belongs to (`shell/`'s home, catalog, cash-and-fiscal, settings or help area, or the public route for screens reached without a session). The route tree in `shell/app-router.ts` lists it; links and navigation name it by its typed path, never by a string built by hand.
- A screen route's component is `lazyRouteComponent` importing the screen's page module (`<screen>-page.tsx`, which reaches its route through `getRouteApi`), so a screen downloads when it is first opened; the route's path, guard and search validation stay in `routes.tsx`. A screen's default services live in the screen, never in `shell/app.tsx`, which would pull every screen into the first download. `pnpm verify` fails when the first download or the whole build exceeds `apps/backoffice/download-budget.json`; a change that grows it on purpose raises the budget in the same pull request.
- A route that needs a permission refuses it in its `beforeLoad`, before the screen renders, with `refuseWithout(session, canSee…)`, which sends the person to Mi cuenta. The session and the services reach a route through the router context, never through module state.
- A list's filters and ordering are a zod schema declared in its route's `validateSearch`, where every field has a default and falls back to it for a value the list does not offer, and the defaults are stripped from the URL. A URL opened with a value the list does not offer, a default, or its values in another order is replaced by that same URL written the list's own way, without adding a history entry. The screen opens on the filters the URL carries and reports every change back, which the route writes into the URL replacing the current history entry. What is open on a screen, such as a modal or a selection, stays in the screen's own state.

## Register screens

- The register has no URL: it moves between screens through declared, typed routes kept in memory. Navigating to a route that does not exist, or with a parameter that is missing or mistyped, fails to type-check.
- Every screen is reached through its own route, declared in the renderer's router under the root route and added to its route tree, with the screen as the route's component.
- A screen that must refuse entry before it renders declares that on its own route, as a guard (`beforeLoad`) that redirects instead of letting the screen render.

## React code

The backoffice, the register's renderer and `packages/ui` follow the Rules of React, because the backoffice and the register's renderer are built with the React Compiler, which memoizes every component and hook automatically:

- Rendering is pure: a component neither reads nor writes a ref while rendering, never mutates its props or state, and never reads something that changes outside React, such as the current time or browser storage. A value that changes over time lives in state that the render reads.
- Hooks are called unconditionally, at the top level of a component or another hook.
- A new component or hook does not memoize by hand with `useMemo`, `useCallback` or `memo`: the compiler already does.
- A component receives a ref as an ordinary prop, not through `forwardRef`.

`pnpm verify` fails on a component or hook the React Compiler cannot compile, and on every React-specific mistake the linter detects, such as a hook called conditionally, a missing effect dependency, a list item without a key, a `&&` condition that can render a stray value, `forwardRef`, a hard-coded element id, or a component declared inside another. A render that reads the clock or another outside value is not detected: review catches it.

## Testing

Every rule is verified once, at the lowest level that can really prove it. Higher levels only verify that the pieces are wired together: a route test shows that the route reaches its validator and its guard, not every case the validator rejects; a screen test shows how the screen presents an outcome, not the rule that produced it. A rule is also defined once, in the package that owns it, and every other level imports it instead of keeping its own copy.

Each risk has one kind of test that owns it:

| Risk | Owning test | Runs |
|---|---|---|
| Domain rules: money, taxes, rounding, pricing, field validation | Unit tests of `packages/domain`, with generated cases where a rule must hold for every input | `verify` |
| API behavior: authorization, input validation wiring, response shape, audit rows | Route tests in process against the lightweight database | `verify` |
| Database constraints, row locks and concurrency, background jobs | Integration tests against a real Postgres, used only for these | `verify` |
| Migrations, in the cloud and on the register | Applying each migration to a database that already holds data in the previous schema | `verify` |
| Registers and the cloud running different versions | Recorded events of every `schema_version` still in the field, accepted by the current cloud | `verify` |
| Offline sale and sync | Use-case tests with fakes for duplicated, reordered and interrupted deliveries | `verify` |
| The tax authority's web services | A fake of each web service and responses recorded from its test environment | `verify`; live calls to its test environment run on a schedule |
| Hardware: printer, scanner, scale, cash drawer | A fake behind each device's port, and the printed receipt compared with its expected output | `verify`; the real device by a written manual check before a hardware adapter change ships |
| Design-system components, including accessibility | Component tests in a real browser, in `packages/ui` | `verify` |
| Design-system components' visual appearance | Each Storybook story's approved screenshot, in `packages/ui` | `verify` |
| Backoffice screens | Screen tests of how each screen presents its states and outcomes, and its wiring to the cloud | `verify` |
| Register journeys: sell, sell offline and sync, contingency invoicing, void, sign in | A few end-to-end tests of the packaged register app, each showing that the journey is wired end to end, not every case its use cases own | "Package register", on every pull request that changes the register or a package |
| Installing the packaged register and updating it in place | An install and update of the packaged build | Per release |

A migration already on `main` is never edited or deleted: it has already run on databases in the field, and the deploy compares each shipped migration file against what was applied by hash. A change to an existing migration adds a new migration instead. `pnpm verify` rejects a change that edits or deletes a migration already on `main`.

A new migration must be dated after every migration already on `main`: the migrator applies only migrations dated after the last one it applied, so an earlier-dated one would never run and would block the deploy. This happens when a branch generates its migration before another branch's migration merges; regenerate it on top of the current `main`. `pnpm verify` rejects a new migration that is not dated after every one on `main`.

A test's result must not depend on how much real time passes while it runs: it neither waits a fixed real time nor measures real elapsed time to decide its outcome. It controls time with fake timers or an injected clock, or it waits for the condition it actually needs. `pnpm verify` rejects a test that depends on real elapsed time.

A test is removed only when the rule it checks is already verified by its owning test and it verifies nothing beyond that rule.

An approved screenshot of each Storybook story, committed under `packages/ui/src/__screenshots__`, owns that story's visual appearance; `pnpm verify` renders every story again and fails on any difference. A change that alters how a story looks on purpose is approved with `pnpm catalog:approve`, which overwrites the affected screenshots; review the new images before committing them alongside the change in the same pull request.

A new `packages/ui` component or a new state of an existing one is not complete until it has a story rendering it in the catalog. Browse the catalog with `pnpm catalog`.

A CI run that fails because of a flaky test unrelated to the change is rerun only after an issue naming the test and its error has been filed. A rerun hides the instability, and it would equally hide a real failure.

## Dependabot

Dependency and GitHub Actions update PRs are opened by Dependabot (`.github/dependabot.yml`), not by a person, so they carry no linked issue and don't fill in the pull request template. The `pr-contract` check recognizes them by author login `dependabot[bot]` and author type `Bot` and skips the issue reference and section requirements for them, but a Dependabot PR title must still be a Conventional Commit of type `chore` or `ci`, and the `verify` check still runs. A human-authored PR whose title or body merely imitates Dependabot's style is not exempt.

## Checks

CI is the only thing that allows a merge: the `pr-contract` and `verify` checks are both required. A workflow step that references a GitHub Action by a moving tag (e.g. `@v4`) instead of a pinned commit SHA does not pass review.

No tool checks that `packages/ui` carries no screens — composed screens live in each app — so every pull request is reviewed for it by hand.

A configuration variable (`vars`) holds only a value that may be public; anything else is a secret. `pnpm verify` rejects a workflow step that writes a configuration variable or a secret directly into its script instead of passing it through the step's `env:`, or that traces the commands it runs.

`pnpm verify` scans every tracked file for secrets, and every line each commit of the change adds since `main`, even one a later commit removes. When it finds one in CI, the secret has already reached GitHub and stays readable in that commit: revoke and rotate it first, then rewrite the pull request's history without it or close the pull request and open a new one from a clean branch.

Follow Verify's duration across runs on main with `pnpm ci:verify-durations` (needs the `gh` CLI signed in). A test is marked slow only against the duration that is slow for its own kind of test, listed at the end of the run; it never fails a run.

## Releases

The cloud service and the register app are two independently versioned deliverables: `cloud-vX.Y.Z` and `pos-vX.Y.Z`. A merge to `main` deploys staging automatically for both. Production release is a separate, manually triggered workflow per deliverable that promotes the exact artifact already validated in staging; those release workflows are not in this repository yet.

## Repository settings

These settings live in GitHub's UI and are not expressed by `.github/rulesets/main.json`:

- Default squash commit message: use the pull request title.
- Automatically delete head branches after merge.
- First run: apply the repository's labels once with `gh workflow run sync-labels.yml`, so the labels declared in `.github/labels.json` (the four `type:` labels and `invalid-format`) exist before the first issue is filed.
