# Getting started

1. Install Node `>=24.7`. The exact version is pinned in `.node-version`, which fnm, nvm, asdf, mise, and volta all pick up automatically.
2. Install pnpm by any method (npm, the standalone install script, or your OS package manager). pnpm self-manages: once invoked in this repository, it reads the `packageManager` field in `package.json` and switches itself to that pinned version.
3. Install Docker or Podman (with the compose plugin): the tests start their own Postgres and browser server in containers.
4. Install dependencies: `pnpm install`.
5. Before opening a pull request, run the checks step 4 of "Working on an issue" in `.claude/rules/workflow.md` names. The whole suite is `pnpm verify`, which CI's `verify` runs on every pull request and which also runs locally when the full run is wanted. It runs every check of CI's `verify`: type checking, the builds of the cloud, the backoffice and the register, the backoffice's download budget, lint, the architecture rules, unused code, the React Compiler check, the tests, the design-system screenshots, and the repository's own automation tests.

# Running it locally

Runs the cloud, its database, and the backoffice on one origin, with no real mail provider and no production or staging credential.

1. `cp .env.example .env`. The defaults need no real credential: `RECOVERY_EMAIL_TRANSPORT=log` writes the recovery link and the first-PIN codes to the cloud's own log instead of sending mail.
2. `pnpm dev:db` — starts Postgres (`docker-compose.yml`) in the background.
3. `pnpm dev:migrate` — builds the cloud and applies its migrations against `DATABASE_URL`.
4. `pnpm dev:create-first-administrator --name "Your Name" --email you@example.com` — creates the first Administrator.
5. `pnpm dev:load-sample-data` — fills the database with realistic, fictional sample data (products, prices, users, alerts, and more). Running it again is a no-op; `pnpm dev:clear-sample-data` removes only what it added, leaving the Administrator from step 4 untouched, and changes nothing while other data still depends on sample data. Neither runs against anything but a local database or, for loading only, staging.
6. `pnpm dev:cloud` — builds and starts the cloud on port 3000.
7. In a second terminal, `pnpm dev:backoffice` — starts the backoffice's Vite dev server. Its dev-server proxy (`apps/backoffice/vite.config.ts`) forwards every cloud API path to the cloud process above, so the browser only ever talks to the Vite origin (`http://localhost:5173`, `.env`'s `BACKOFFICE_ORIGIN`) and the cloud's Origin check applies exactly as it does when deployed.

To register the first Administrator's passkey: open the backoffice, request an account-recovery link for that Administrator's email, and read the link from the cloud process's log (step 6's terminal) instead of an inbox. A real fingerprint reader or phone is not required: Chrome DevTools' WebAuthn panel (More tools → WebAuthn) can add a virtual authenticator that stands in for one.

# Pinned versions

- TypeScript is pinned to exactly `6.0.3`. TypeScript 7 ships no JavaScript API, and dependency-cruiser declares support for `typescript >=2.0.0 <7.0.0`; under TypeScript 7 it would cruise zero modules and exit 0, so the architecture gate would pass without checking anything. Lift this pin once dependency-cruiser supports TypeScript 7.
- `@types/node` stays on the Node major pinned in `.node-version`.
- vite and `@vitejs/plugin-react` stay on their current majors: electron-vite, which builds the register, supports vite only up to 7, and `@vitejs/plugin-react` 6 requires vite 8. Lift this pin once a stable electron-vite supports vite 8.
- pnpm is pinned to an 11.x release in `package.json`'s `packageManager`, never 12. pnpm 12 writes a two-document lockfile that GitHub's dependency graph and Dependabot mis-parse. Lift this pin once that parsing is fixed.
- Dependency ranges are lowered instead of adding `minimumReleaseAgeExclude` entries. pnpm 11 refuses to resolve a version published less than a day ago (`minimumReleaseAge`, 1440 minutes) and enforces this even under `--frozen-lockfile`, so a range is lowered to the newest already-day-old version instead. After lowering a range, re-resolve with `pnpm clean --lockfile` followed by `pnpm install`.
