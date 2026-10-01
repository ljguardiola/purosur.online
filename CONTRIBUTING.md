# Contributing

## Getting started

1. Install Node `>=24.7`. The exact version is pinned in `.node-version`, which fnm, nvm, asdf, mise, and volta all pick up automatically.
2. Install pnpm by any method (npm, the standalone install script, or your OS package manager). pnpm self-manages: once invoked in this repository, it reads the `packageManager` field in `package.json` and switches itself to that pinned version.
3. Install Docker or Podman (with the compose plugin): the tests start their own Postgres and browser server in containers.
4. Install dependencies: `pnpm install`.
5. Run the single gate before opening a pull request: `pnpm verify`. It runs every check of CI's `verify`: type checking, the builds of the cloud, the backoffice and the register, the backoffice's download budget, lint, the architecture rules, unused code, the React Compiler check, the tests, the design-system screenshots, and the repository's own automation tests.

## Running it locally

Runs the cloud, its database, and the backoffice on one origin, with no real mail provider and no production or staging credential.

1. `cp .env.example .env`. The defaults need no real credential: `RECOVERY_EMAIL_TRANSPORT=log` writes the recovery link and the first-PIN codes to the cloud's own log instead of sending mail.
2. `pnpm dev:db` — starts Postgres (`docker-compose.yml`) in the background.
3. `pnpm dev:migrate` — builds the cloud and applies its migrations against `DATABASE_URL`.
4. `pnpm dev:create-first-administrator --name "Your Name" --email you@example.com` — creates the first Administrator.
5. `pnpm dev:load-sample-data` — fills the database with realistic, fictional sample data (products, prices, users, alerts, and more). Running it again is a no-op; `pnpm dev:clear-sample-data` removes only what it added, leaving the Administrator from step 4 untouched, and changes nothing while other data still depends on sample data. Neither runs against anything but a local database or, for loading only, staging.
6. `pnpm dev:cloud` — builds and starts the cloud on port 3000.
7. In a second terminal, `pnpm dev:backoffice` — starts the backoffice's Vite dev server. Its dev-server proxy (`apps/backoffice/vite.config.ts`) forwards every cloud API path to the cloud process above, so the browser only ever talks to the Vite origin (`http://localhost:5173`, `.env`'s `BACKOFFICE_ORIGIN`) and the cloud's Origin check applies exactly as it does when deployed.

To register the first Administrator's passkey: open the backoffice, request an account-recovery link for that Administrator's email, and read the link from the cloud process's log (step 6's terminal) instead of an inbox. A real fingerprint reader or phone is not required: Chrome DevTools' WebAuthn panel (More tools → WebAuthn) can add a virtual authenticator that stands in for one.

## Pinned versions

- TypeScript is pinned to exactly `6.0.3`. TypeScript 7 ships no JavaScript API, and dependency-cruiser declares support for `typescript >=2.0.0 <7.0.0`; under TypeScript 7 it would cruise zero modules and exit 0, so the architecture gate would pass without checking anything. Lift this pin once dependency-cruiser supports TypeScript 7.
- `@types/node` stays on the Node major pinned in `.node-version`.
- vite and `@vitejs/plugin-react` stay on their current majors: electron-vite, which builds the register, supports vite only up to 7, and `@vitejs/plugin-react` 6 requires vite 8. Lift this pin once a stable electron-vite supports vite 8.
- pnpm is pinned to an 11.x release in `package.json`'s `packageManager`, never 12. pnpm 12 writes a two-document lockfile that GitHub's dependency graph and Dependabot mis-parse. Lift this pin once that parsing is fixed.
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
- The PR body must close exactly one issue with `Closes #N` (or `Fixes`/`Resolves`). That issue is open and does not carry `invalid-format`.
- Fill in every section of the pull request template. Check at least one Delivery impact box; `None` is never checked together with another.
- Nothing is committed or pushed to `main` directly, and `main` is never force-pushed or deleted. A branch takes `main`'s changes by merging it, never by rebasing once pushed.
- Merges are squash-only. The PR title becomes the commit message on `main`.

## Working on an issue

1. Develop test-first (see "Code style"), running only the test files you touch; the whole suite runs once, at step 4.
2. A change to `packages/domain` or `packages/contracts` runs `pnpm mutation --mutate <each touched source file>` and leaves no surviving mutant in them. CI runs the whole mutation suite weekly, not on pull requests.
3. With every change committed, review the branch with the `review-gate` skill (`.claude/skills/review-gate/`) until it reports `CLEAN`. A review that reports `STOPPED` goes to whoever assigned the issue before anything else happens.
4. Run `pnpm verify` once, in full.
5. Open the pull request. Its "How it was tested" cites the `review-gate` result line and the result of `pnpm verify`.

## Structure

This is the structure the repository is organized into. A part that does not follow it yet is moved to it when it is reorganized, and never serves as a precedent for new code.

- In every layer that covers business concepts — `packages/domain`, the cloud, the backoffice, the register app — the top-level folders are the business concepts it covers, each named like `packages/domain`'s concept of the same name (such as `catalog`, `pricing`, `alerts`, `register`, `fiscal`, `access`, `branch`), so a concept is found under the same name from its rule to its screen. A concept the domain has no rules for yet still gets its own folder under its business name. A concept folder holds everything of that concept in that layer: its screens and their parts, its API client, its routes, its helpers.
- A business decision is made in `packages/domain`, applied by the register's core or by the cloud; a screen only asks for it and imports nothing from `packages/domain` but types, neither directly nor through what `packages/contracts` re-exports. Parsing and formatting money typed or shown on a screen is presentation and lives in `packages/ui`.
- A business rule (money, taxes, rounding, field validation, catalogs, calendar rules) lives in its concept's `model/` in `packages/domain`; a rule more than one concept needs lives in `packages/domain/src/shared/` instead, reached only through its own `index.ts`. The shape of a message or payload exchanged between processes lives in `packages/contracts` instead, in a folder named like the domain concept it belongs to; `packages/contracts` imports a rule from `packages/domain` where a shape needs one, and never defines one itself. A shape more than one concept in `packages/contracts` needs lives in `packages/contracts/src/shared/` instead, reached only through its own `index.ts`.
- A cloud route reads its request body with a shape from `packages/contracts` and refuses a body that does not match it; the backoffice builds the same request from that shape's type.
- A cloud route builds each success body with a shape from `packages/contracts`, and the backoffice's API client checks each body it reads against that same shape, treating one that does not match as a failed request.
- What belongs to no concept lives beside them under its own name: `shell/` for the application's frame (layout, navigation, session guard), `platform/` for shared infrastructure used across concepts (HTTP helpers, formatting, the database connection and schema, error reporting), and a folder named after any other part of the application, such as the backoffice's `help/`. A part several screens of one concept share stays in that concept's folder.
- A menu area that groups several concepts does so through its routes, not through a folder.
- The register app (`apps/pos/src`) is divided first by process: `core/` (the local database, the domain's use cases and the link to the cloud), `main/` (the Electron shell), `preload/`, `renderer/` (the screens) and `shared/` (code every process uses). `core/` and `renderer/` are divided into concept folders as above; `main/`, `preload/` and `shared/` are not.
- The messages the register's renderer and core exchange are shapes in `packages/contracts`, in the folder of the concept they belong to, and the core checks every message it receives against them.
- A feature's code goes in its concept folders. The files every feature passes through — the register core's composition root (`core/index.ts`) and its renderer-request dispatcher, the renderer's core client, router and `shell/app.tsx`, the backoffice's `shell/app.tsx` and route tree — only gain the lines that wire the feature in, never the feature's own logic.
- A cloud route handler holds no database query. A read route calls a function of its concept folder named for what it reads, which holds the query; a state change goes through its use case (see "Operations").
- Every source file and folder is named in English kebab-case (`products-list-screen.tsx`). Identifiers and URL paths are English too; only user-facing text is Spanish.
- Each file's tests sit beside it. Helpers used only by tests live in a `test-support/` folder inside the folder they serve. A test file that grows too large is divided by aspect into `<name>.<aspect>.test.tsx` files, where `<name>` is the tested file's name without its extension (`products-list-screen.create.test.tsx`), which share their setup through `test-support/<name>.tsx`.

## Operations

An operation that changes state is split in three, each owning one kind of rule:

- **Use case.** One file per operation in its concept's `use-cases/` folder in `packages/domain`, named for what it does (`create-product.ts`). It receives the input the caller already validated for shape, applies the business rules, and returns a union of outcomes naming every way the operation can end; an expected refusal is an outcome, never a thrown error. It reaches the outside world only through ports, and applies the rules of its concept's `model/`. A concept's use cases and ports are reached only through its own `use-cases/index.ts`, exposed as the package subpath `@purosur/domain/<concept>/use-cases`, never through the concept's or the package's `index.ts`.
- **Ports.** Interfaces declared beside the use cases, one per thing the operation needs from outside: storage, the clock, id generation. A port's operations are named for their business meaning (`lockLeafCategory`), not for a table or a query, and no driver detail crosses it: no SQL state, constraint name or ORM type. A failure the use case must react to, such as a write that loses a unique-index race, is an error defined in the domain that the adapter raises. Storage is reached through one transaction per operation, and the order the use case takes its locks in is part of the rule it states.
- **Adapters.** The app provides the implementation behind each port in its own concept folder (the cloud's Drizzle store in `apps/cloud/src/catalog/`). An adapter translates driver errors into the port's errors and owns storage concerns such as a malformed id being "not found". A route handler only translates its transport to and from the use case: it parses the request, calls the use case, and maps each outcome to its response.

Each level's tests own what only that level can prove:

- Use-case tests run against in-memory fakes of the ports, kept in the concept's `use-cases/test-support/`. They prove every rule and every outcome, including the lost race, the rollback of a failed operation, and the order of the locks.
- What only a real database can prove (locks, concurrency, constraints, the result of a query) is owned by the adapter's integration tests and by the route tests against the database.
- A route test proves the wiring: authorization, that the route reaches the use case, and the response of each kind of outcome.

## Code style

- This repository is strict TDD: write a failing test first, then the code that makes it pass. Never write implementation code ahead of its test.
- Code, comments, tests, commit messages, issues, and pull requests are written in English.
- User-facing text is written in Spanish where it is shown; there are no message catalogs. Text built from quantities, amounts or dates goes through `packages/ui`'s formatting functions, fixed to Argentine Spanish (`es-AR`), so a value reads the same on every screen.
- A `packages/ui` component writes the text that reads the same wherever it is used (a modal's close button, a pagination's previous and next); text that depends on the screen comes from the app as a prop, with no default.
- Help and manuals live inside the application they serve: the register's help ships with the register and works offline; the backoffice's help lives in the backoffice.
- Code and tests explain themselves. Names, structure and test cases carry the meaning; a reader should not need a companion document to follow them.
- Write a comment only where something relevant cannot be read from the code — a legal deadline, an external system's constraint, a non-obvious reason for doing it this way. Do not comment what the code already says. This applies equally to tests, scripts and configuration. Comments that break it:
  - restating the next line: `// Sort by name` above a sort by name;
  - recording a technical decision or its alternatives: `// We lock the category before the product to avoid deadlocks; a single lock was considered`, which belongs in the pull request (the lock order itself is a rule the use case and its test state);
  - citing an issue, a pull request or a document: `// See #123`, `// as the design doc requires`;
  - documenting every function or prop with JSDoc that repeats its name and type;
  - narrating a test's setup or what an assertion proves, which belongs in the test's or helper's name.
- Tests describe behavior in their own words. They do not reference requirement identifiers or any external document.
- Technical decisions belong in the pull request that introduces them, under "Technical decisions", not in code comments.
- No comment switches off a check: no `@ts-expect-error`, `@ts-ignore` or `biome-ignore`, tests included. A test that proves a type is refused uses Vitest's `expectTypeOf(...).not.toExtend<...>()`.
- Sample data, fixtures and test data are fictional: no real person, business, tax id (CUIT), certificate or credential, in code, tests, issues or pull requests.

## User-facing text

User-facing text is Spanish (see "Code style"). On every screen of both apps:

- A label read together with its value or options makes one natural sentence (`Motivo: Arrepentimiento`, never `Motivo: Buen estado`); rename the label or the options until it does.
- No line restates what the screen's state already implies, repeats a nearby title or message, or explains what the person already knows. A constraint that explains a locked control goes in a tooltip on it, not in a line under the field.
- No text announces that an action is recorded, logged or audited.
- A table's row actions are icon-only buttons, with the same icon for the same action on every screen; text buttons are for the screen's and the modal's own actions.

## Application stack

The backoffice and the register's renderer are built on one stack:

- Data from outside the screen (the cloud in the backoffice, the core in the register) is read with TanStack Query, never with a hand-written loading hook.
- Forms are built with TanStack Form, validating with the Zod schemas of `packages/contracts` through Standard Schema.
- Lists are built with TanStack Table.
- Navigation uses TanStack Router.
- State only a screen needs (which modal is open, a selection, a draft) is plain React state. No global store library, such as Zustand, is added.

Replacing or dropping a library of this stack is the repository owner's decision, made before the pull request that does it. Code that predates the stack is migrated by its own change; new code follows the stack even beside code that does not yet. Lists are the one exception: until TanStack Table is a dependency, a new list uses `packages/ui`'s `tableRows` like every existing one, so the migration moves all lists at once; never a third way.

## Backoffice screens

- Every backoffice screen is a typed route, declared in its concept's `routes.tsx` under the layout route of the menu area it belongs to (`shell/`'s home, catalog, stock, cash-and-fiscal, settings or help area, or the public route for screens reached without a session). The route tree in `shell/app-router.ts` lists it; links and navigation name it by its typed path, never by a string built by hand.
- A screen route's component is `lazyScreen` (from `shell/`) importing the screen's page module (`<screen>-page.tsx`, which reaches its route through `getRouteApi`), so a screen downloads when it is first opened; the route's path, guard and search validation stay in `routes.tsx`. A screen's services and their defaults, when it has any, live in its own `<screen>-services.ts`, which `shell/app.tsx` composes without importing the screen, so no screen reaches the entry. `pnpm verify` fails when the entry (`index.html` and every file it references) or the whole build exceeds `apps/backoffice/download-budget.json`; a change that grows it on purpose raises the budget in the same pull request.
- Besides its page and services, a screen's code is divided into files of the kinds below, all kept directly in its concept folder with no folder per screen, so a part several screens share stays beside them. The screen (`<screen>-screen.tsx`) keeps the queries it reads, its filters and their URL, its table columns, which modal is open, its screen-wide notices and the rendering of each modal. Each action has its own modal (`<action>-<entity>-modal.tsx`); a modal that needs services exports them as `<Action><Entity>ModalServices`, which each screen that opens it composes in its `<screen>-services.ts`. A form model (`<entity>-form.ts`) holds a form's values, empty values, request builders, field messages and option lists. A single field's message has its own file (`<entity>-<field>-message.ts`) only when that field belongs to no form model. A part of the screen (`<entity>-<part>.tsx`, such as a row, a section, a preview or a set of chips) keeps in the same file any hook only it uses. A pure helper (`<topic>.ts`) is named for what it computes. A concept's query keys under its root key, its query hooks and its invalidation live in `<concept>-queries.ts`.
- Each of those files has its own tests beside it. A helper's and a message's unit tests own what they compute from their inputs, while a business rule they apply stays verified in the package that owns it; a modal's tests render the modal directly and own what happens inside it. The screen's test keeps each section's states, its filters and their URL, its rows, which action opens which modal, the refresh and screen-wide notice after an action succeeds, who sees each action, and accessibility.
- A screen longer than about 350 lines, any other source file longer than about 400, or a test file longer than about 800 is a sign that it should be divided; these sizes are not limits. Dividing a file only moves code, together with the tests of what moved, which go beside the file that now owns it: it changes no behavior, and modals that look alike stay separate.
- A route that needs a permission refuses it in its `beforeLoad`, before the screen renders, with `refuseWithout(session, canSee…)`, which sends the person to Mi cuenta. The session and the services reach a route through the router context, never through module state.
- A list's filters and ordering are a zod schema declared in its route's `validateSearch`, where every field has a default and falls back to it for a value the list does not offer, and the defaults are stripped from the URL. A URL opened with a value the list does not offer, a default, or its values in another order is replaced by that same URL written the list's own way, without adding a history entry. The screen opens on the filters the URL carries and reports every change back, which the route writes into the URL replacing the current history entry. What is open on a screen, such as a modal or a selection, stays in the screen's own state.
- A table's rows are sorted, filtered and paged by TanStack Table (by `packages/ui`'s `tableRows` until TanStack Table is a dependency, see "Application stack"). A list the cloud returns whole hands it the list's search, filters, ordering and page; a list the cloud already sorts, filters or pages hands it only what the cloud leaves to the screen. A screen never sorts or filters a list's rows with code of its own, and orders any other items it shows, such as a filter's options, with `sortedItems` and `textOrder`.
- A screen reads cloud data only through `platform/`'s `useCloudQuery`, built on TanStack Query with no retry and no refetch on focus or reconnect, wrapped in a hook of its concept whose query keys sit under one root key for that concept (`["catalog"]`), and renders from the status it returns, never from state of its own. A screen that reads more than one query combines them with `combineCloudData`. After a change, the screen invalidates its concept's root key so every list of that concept reads again, instead of editing a list by hand. A rate-limited response's retry time is read by `platform/`'s `retryAfterSeconds`, in every API client.
- A form keeps its values, validation, field errors and submitting state only through `platform/`'s `useCloudForm`, rendering each field through the form's bound `packages/ui` fields. It validates with the `packages/contracts` shape its cloud route reads the request with: the form builds the request body from its values, and each problem the shape reports lands on the field declared for that body key. A `validation_failed` field returned by the cloud, read by `platform/`'s `readValidationFailedField` in every API client, lands on its field through that same declaration. A field's message is chosen from its current value and never contradicts it: a rule the form needs comes from the `packages/contracts` shape, never a copy of it.
- A screen shows its data's loading, empty and failed states only with `packages/ui`'s patterns, never with text of its own: a table's `loading`, `empty` and `failure`, and otherwise `LoadingPlaceholder` in the shape of the section, `EmptyState` and `LoadFailure`, whose Reintentar loads the section again starting from its loading placeholder. An action that works on a section's data takes that data's status through `Button`'s `dataStatus` and stays disabled while the data loads and after loading fails, never hidden so the layout does not move, while a refresh of data already shown keeps it `loaded`; an action that does not need the data takes none and stays available in every state.

## Register screens

- The register has no URL: it moves between screens through declared, typed TanStack Router routes kept in a memory history. Navigating to a route that does not exist, or with a parameter that is missing or mistyped, fails to type-check.
- Every screen is reached through its own route, declared in the renderer's router (`shell/router.tsx`) under the root route or a layout route of it and added to its route tree, with the screen as the route's component. A route that takes a flag declares it in `validateSearch`. Links between screens use `shell/`'s `ScreenLink`, and an action that moves to another screen calls `navigate` with a typed `to`.
- A screen that must refuse entry before it renders declares that on its own route, as a guard (`beforeLoad`) that redirects instead of letting the screen render.
- A screen (`<screen>-screen.tsx`) lives in its concept folder of `renderer/`, or in `shell/` when it belongs to the register's frame, with its parts (`<entity>-<part>.tsx`), its modals (`<action>-<entity>-modal.tsx`, opened by state the screen owns) and its hooks beside it. A screen never calls the core client itself: what it asks the core for reaches it from its route.
- A screen reads the core's data with TanStack Query, whose query function asks the core over its port, with no retry and no refetch on focus; a change notice from the core updates or invalidates the queries it affects. The sale in progress is read from the core the same way, and the screen keeps no second copy of it.
- A form is built with TanStack Form, validating with the `packages/contracts` schema the core reads the request with.
- A screen uses `packages/ui`'s pieces, never a hand-written button or control where `packages/ui` has one, and shows its data's loading, empty and failed states only with `packages/ui`'s patterns, as in "Backoffice screens"; Reintentar loads the section again starting from its loading placeholder. Amounts, quantities and dates are shown, and typed amounts read, with `packages/ui`'s functions.

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
| Operation rules: what an operation refuses, in which order, and what it leaves behind when it fails | Use-case tests of `packages/domain` against in-memory fakes of its ports | `verify` |
| API behavior: authorization, input validation wiring, response shape, audit rows | Route tests in process against the lightweight database | `verify` |
| Database constraints, row locks and concurrency, background jobs | Integration tests against a real Postgres, used only for these | `verify` |
| Migrations, in the cloud and on the register | Applying each migration to a database that already holds data in the previous schema | `verify` |
| Registers and the cloud running different versions | Recorded events of every `schema_version` still in the field, accepted by the current cloud | `verify` |
| Offline sale and sync | Use-case tests with fakes for duplicated, reordered and interrupted deliveries | `verify` |
| The tax authority's web services | A fake of each web service and responses recorded from its test environment | `verify`; live calls to its test environment run on a schedule |
| Hardware: printer, scanner, scale, cash drawer | A fake behind each device's port, and the printed receipt compared with its expected output | `verify`; the real device by a written manual check before a hardware adapter change ships |
| Design-system components, including accessibility | Component tests in a real browser, in `packages/ui` | `verify` |
| Design-system components' visual appearance | Each Storybook story's approved screenshot, in `packages/ui` | `verify` |
| Backoffice screens | Screen tests of how each screen presents its states and outcomes, and its wiring to the cloud and to its modals; the tests beside each modal, part, form model and helper for what happens inside it | `verify` |
| Register journeys: sell, sell offline and sync, contingency invoicing, void, sign in | A few end-to-end tests of the packaged register app, each showing that the journey is wired end to end, not every case its use cases own | "Package register", on every pull request that changes the register or a package |
| Installing the packaged register and updating it in place | An install and update of the packaged build | Per release |

A migration already on `main` is never edited or deleted: it has already run on databases in the field, and the deploy compares each shipped migration file against what was applied by hash. A change to an existing migration adds a new migration instead. `pnpm verify` rejects a change that edits or deletes a migration already on `main`.

A new cloud migration must be dated after every migration already on `main`: the migrator applies only migrations dated after the last one it applied, so an earlier-dated one would never run and would block the deploy. This happens when a branch generates its migration before another branch's migration merges; regenerate it on top of the current `main`. `pnpm verify` rejects a new cloud migration that is not dated after every one on `main`. The register's migrations are numbered files, applied in the order of their numbers.

A test's result must not depend on how much real time passes while it runs: it neither waits a fixed real time nor measures real elapsed time to decide its outcome. It controls time with fake timers or an injected clock, or it waits for the condition it actually needs. `pnpm verify` rejects a test that depends on real elapsed time.

A test proves behavior and never repeats a configuration value: a test that depends on configuration runs the tool or the build with it and checks the outcome.

A test is removed only when the rule it checks is already verified by its owning test and it verifies nothing beyond that rule.

An approved screenshot of each Storybook story, committed under `packages/ui/src/__screenshots__`, owns that story's visual appearance; `pnpm verify` renders every story again and fails on any difference. A change that alters how a story looks on purpose is approved with `pnpm catalog:approve`, which overwrites the affected screenshots; review the new images before committing them alongside the change in the same pull request.

A new `packages/ui` component or a new state of an existing one is not complete until it has a story rendering it in the catalog. Browse the catalog with `pnpm catalog`.

A CI run that fails because of a flaky test unrelated to the change is rerun only after an issue naming the test and its error has been filed. A rerun hides the instability, and it would equally hide a real failure.

## Dependabot

Dependency and GitHub Actions update PRs are opened by Dependabot (`.github/dependabot.yml`), not by a person, so they carry no linked issue and don't fill in the pull request template. The `pr-contract` check recognizes them by author login `dependabot[bot]` and author type `Bot` and skips the issue reference and section requirements for them, but a Dependabot PR title must still be a Conventional Commit of type `chore` or `ci`, and the `verify` check still runs. A human-authored PR whose title or body merely imitates Dependabot's style is not exempt.

## Checks

CI is the only thing that allows a merge: the `pr-contract` and `verify` checks are both required. A workflow step that references a GitHub Action by a moving tag (e.g. `@v4`) instead of a pinned commit SHA does not pass review. `pnpm verify` rejects a workflow job without a `timeout-minutes`.

CI's `verify` skips the parts a pull request cannot affect: a change made only of Markdown files outside `apps/`, `packages/` and `.github/` skips every check but the scope decision, one made only of those files and files under `.claude/` skips the tests, and the design-system screenshots run only when `packages/ui` or one of their inputs changes. The required check still reports its result. A push to `main` always runs the static checks and the tests.

No tool checks that `packages/ui` carries no screens — composed screens live in each app — so every pull request is reviewed for it by hand.

A configuration variable (`vars`) holds only a value that may be public; anything else is a secret. `pnpm verify` rejects a workflow step that writes a configuration variable or a secret directly into its script instead of passing it through the step's `env:`, or that traces the commands it runs.

`pnpm verify` scans every tracked file for secrets, and every line each commit of the change adds since `main`, even one a later commit removes. When it finds one in CI, the secret has already reached GitHub and stays readable in that commit: revoke and rotate it first, then rewrite the pull request's history without it or close the pull request and open a new one from a clean branch.

Follow Verify's duration across runs on main with `pnpm ci:verify-durations` (needs the `gh` CLI signed in). A test is marked slow only against the duration that is slow for its own kind of test, listed at the end of the run; it never fails a run.

## Releases

The cloud service and the register app are two independently versioned deliverables: `cloud-vX.Y.Z` and `pos-vX.Y.Z`. A merge to `main` that changes the cloud deploys it to staging automatically once its Verify run passes; one that changes the register or a package it uses builds the register's staging installer, kept as an artifact of that run. Production release is a separate, manually triggered workflow per deliverable that promotes the exact artifact already validated in staging; those release workflows are not in this repository yet.
