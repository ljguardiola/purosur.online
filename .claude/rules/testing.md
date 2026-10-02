# Testing

Every rule is verified once, at the lowest level that can really prove it. Higher levels only verify that the pieces are wired together: a route test shows that the route reaches its validator and its guard, not every case the validator rejects; a screen test shows how the screen presents an outcome, not the rule that produced it. A rule is also defined once, in the package that owns it, and every other level that applies it imports it instead of keeping its own copy. A screen reaches a rule only through the `packages/contracts` shape it validates a form with, and asks the core or the cloud for every business decision (see `.claude/rules/boundaries.md`).

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
| Register journeys: sign in, open, lock, resume and close a cash session, sell by scanning a barcode and by searching a product's name | A few end-to-end tests of the packaged register app, each showing that the journey is wired end to end, not every case its use cases own | "Package register", on every pull request that changes the register or a package |
| Installing the packaged register and updating it in place | An install and update of the packaged build | Per release |

A migration already on `main` is never edited or deleted: it has already run on databases in the field, and the deploy compares each shipped migration file against what was applied by hash. A change to an existing migration adds a new migration instead. `pnpm verify` rejects a change that edits or deletes a migration already on `main`.

A new cloud migration must be dated after every migration already on `main`: the migrator applies only migrations dated after the last one it applied, so an earlier-dated one would never run and would block the deploy. This happens when a branch generates its migration before another branch's migration merges; regenerate it on top of the current `main`. `pnpm verify` rejects a new cloud migration that is not dated after every one on `main`. The register's migrations are numbered files, applied in the order of their numbers.

A test's result must not depend on how much real time passes while it runs: it neither waits a fixed real time nor measures real elapsed time to decide its outcome. It controls time with fake timers or an injected clock, or it waits for the condition it actually needs. `pnpm verify` rejects a test that depends on real elapsed time.

A test proves behavior and never repeats a configuration value: a test that depends on configuration runs the tool or the build with it and checks the outcome.

A test is removed only when the rule it checks is already verified by its owning test and it verifies nothing beyond that rule.

An approved screenshot of each Storybook story, committed under `packages/ui/src/__screenshots__`, owns that story's visual appearance; `pnpm verify` renders every story again and fails on any difference. A change that alters how a story looks on purpose is approved with `pnpm catalog:approve`, which overwrites the affected screenshots; review the new images before committing them alongside the change in the same pull request.

A new `packages/ui` component or a new state of an existing one is not complete until it has a story rendering it in the catalog. Browse the catalog with `pnpm catalog`.

A CI run that fails because of a flaky test unrelated to the change is rerun only after an issue naming the test and its error has been filed. A rerun hides the instability, and it would equally hide a real failure.
