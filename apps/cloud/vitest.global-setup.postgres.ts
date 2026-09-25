import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import type { TestProject } from "vitest/node";
import { CLOUD_APP_PASSWORD } from "./src/db/cloud-app-password.js";
import { runMigrations } from "./src/migrate.js";

declare module "vitest" {
  export interface ProvidedContext {
    /**
     * Admin connection URL to the one Postgres container started for this run. Each integration
     * test file uses it to create its own database as a copy of `cloudIntegrationTemplateDatabase`
     * (see `recovery-integration-database.ts`); nothing connects to this admin database directly.
     */
    recoveryPostgresAdminUrl: string;
    /**
     * Name of the one database on that container this setup migrates once, so no
     * `*.integration.test.ts` file migrates (and races) its own; `createIntegrationDatabase` copies
     * it with `CREATE DATABASE ... TEMPLATE`.
     */
    cloudIntegrationTemplateDatabase: string;
  }
}

const MIGRATIONS_FOLDER = new URL("./migrations", import.meta.url).pathname;
const TEMPLATE_DATABASE_NAME = "cloud_integration_template";

// Matches the Postgres major version Railway's own template deploys
// (ghcr.io/railwayapp-templates/postgres-ssl:18, see .railway/railway.ts's `postgres(...)`),
// pinned to an explicit tag rather than a moving one.
const POSTGRES_IMAGE = "postgres:18-alpine";

// The integration files run in parallel on this one container, each with its own pool, and together
// they can hold about 300 connections at once: Postgres's default limit of 100 would make whichever
// file loses that race fail with "remaining connection slots are reserved" (53300).
const MAX_CONNECTIONS = 500;

/**
 * Starts one real Postgres container for the whole test run, shared by every
 * `*.integration.test.ts` file under apps/cloud/src, and migrates the one template database those
 * files copy their own database from (see `createAndMigrateTemplateDatabase`), so no file migrates
 * one of its own on the shared cluster. These tests exist because PGlite serves every query on one
 * connection and has no LISTEN/NOTIFY, which the real production wiring (a postgres-js pool,
 * concurrent connections racing an advisory lock, plus graphile-worker's real `run()`) needs;
 * without a working Docker daemon there is no way to prove that wiring, so a missing or unreachable
 * Docker fails this project's run loudly instead of silently skipping it.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer;
  try {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withCommand(["postgres", "-c", `max_connections=${MAX_CONNECTIONS}`])
      .start();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      "apps/cloud integration tests require a working Docker daemon to start a real " +
        `Postgres via Testcontainers (image ${POSTGRES_IMAGE}). Starting the container failed: ` +
        `${reason}. Start Docker and retry; these tests are never skipped.`,
      { cause: error },
    );
  }

  const adminUrl = container.getConnectionUri();
  project.provide("recoveryPostgresAdminUrl", adminUrl);

  await createAndMigrateTemplateDatabase(adminUrl);
  project.provide("cloudIntegrationTemplateDatabase", TEMPLATE_DATABASE_NAME);

  return async () => {
    await container.stop();
  };
}

/**
 * Creates the one database every `*.integration.test.ts` file's own database is later copied from
 * (`CREATE DATABASE ... TEMPLATE`), and migrates it exactly once. Every connection this opens to
 * the template is closed before returning: Postgres refuses `CREATE DATABASE ... TEMPLATE` while
 * anyone is still connected to the template being copied.
 */
async function createAndMigrateTemplateDatabase(adminUrl: string): Promise<void> {
  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${TEMPLATE_DATABASE_NAME}"`);
  } finally {
    await admin.end({ timeout: 1 });
  }

  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DATABASE_NAME}`;
  await runMigrations(templateUrl.toString(), CLOUD_APP_PASSWORD, {
    migrationsFolder: MIGRATIONS_FOLDER,
  });
}
