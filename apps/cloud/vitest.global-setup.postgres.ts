import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /**
     * Admin connection URL to the one Postgres container started for this run. Each integration
     * test file uses it to create and migrate its own database (see
     * `recovery-integration-database.ts`); nothing connects to this admin database directly.
     */
    recoveryPostgresAdminUrl: string;
  }
}

// Matches the Postgres major version Railway's own template deploys
// (ghcr.io/railwayapp-templates/postgres-ssl:18, see .railway/railway.ts's `postgres("postgres", ...)`),
// pinned to an explicit tag rather than a moving one.
const POSTGRES_IMAGE = "postgres:18-alpine";

/**
 * Starts one real Postgres container for the whole test run, shared by every
 * `*.integration.test.ts` file under apps/cloud/src. These tests exist because PGlite serves
 * every query on one connection and has no LISTEN/NOTIFY, which the real production wiring (a
 * postgres-js pool, concurrent connections racing an advisory lock, plus graphile-worker's real
 * `run()`) needs; without a working Docker daemon there is no way to prove that wiring, so a
 * missing or unreachable Docker fails this project's run loudly instead of silently skipping it.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer;
  try {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      "apps/cloud integration tests require a working Docker daemon to start a real " +
        `Postgres via Testcontainers (image ${POSTGRES_IMAGE}). Starting the container failed: ` +
        `${reason}. Start Docker and retry; these tests are never skipped.`,
      { cause: error },
    );
  }

  project.provide("recoveryPostgresAdminUrl", container.getConnectionUri());

  return async () => {
    await container.stop();
  };
}
