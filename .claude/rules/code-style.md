# Code style

- This repository is strict TDD: write a failing test first, then the code that makes it pass. Never write implementation code ahead of its test.
- The order is visible in the branch's history: each behavior's failing test is committed first, in a commit that holds only tests and what only tests use (test helpers and setups, fixtures, stories and their approved screenshots), and the code that makes it pass follows in a later commit. A commit changes behavior when some input gets a different outcome after it, a type that now accepts or refuses other values included. A behavior whose test was committed with its code or after it is closed by proving that test fails without that code, adding the test in a later commit when the branch has none; history is never rewritten. A commit that changes no behavior — moving or renaming code together with its tests, removing code nothing reads, configuration, documentation, comments — needs no test commit before it.
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
- A tax identity (CUIT, legal name, Ingresos Brutos registration) in a test, fixture or sample data is one of those in `packages/domain/src/fiscal/test-support/fictional-tax-identities.ts`, imported as `@purosur/domain/fiscal/test-support`; no other may be used. `pnpm verify` rejects a tracked file holding a CUIT with a valid check digit that is not one of them.
