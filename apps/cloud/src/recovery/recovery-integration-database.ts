import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { inject } from "vitest";
import { runMigrations } from "../migrate.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

// `cloud_app` is one cluster-wide role shared by every database this run creates, so every file
// that migrates one (this helper, and `migrate-cloud-app-role.integration.test.ts` directly) must
// set it to this exact same password: two files running at once each set this same role's login
// password as part of their own migration, and whichever write loses that race would otherwise
// leave every other file's already-open assumption about that password wrong.
export const CLOUD_APP_PASSWORD = "cloud-app-integration-test-password";

export interface IntegrationDatabase {
  /** Connects as `cloud_app`, the role the code under test must use, same as the deployed cloud. */
  databaseUrl: string;
  /**
   * Connects as the admin role that migrated this database. Only for test-only administrative
   * needs that are not part of what the code under test does (e.g. holding a lock that only the
   * schema's owner can take, to force a race deterministically); never for exercising the server,
   * its repositories, or graphile-worker, which must always run as `cloud_app`.
   */
  adminDatabaseUrl: string;
  close(): Promise<void>;
}

function databaseUrlFor(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function asCloudApp(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = "cloud_app";
  url.password = CLOUD_APP_PASSWORD;
  return url.toString();
}

/**
 * Creates and migrates one fresh, isolated database on the single Testcontainers Postgres
 * instance `vitest.global-setup.postgres.ts` starts for the run, so each `*.integration.test.ts`
 * file gets its own database instead of sharing state with the others.
 *
 * Migrates as the admin role (`runMigrations`, the same production wiring `dist/migrate.js`
 * runs), but hands back a `cloud_app` connection URL: every `*.integration.test.ts` file that
 * exercises the server, its repositories, or graphile-worker through this database must run as
 * the same role the deployed cloud connects as, never as the role that applies schema changes.
 */
export async function createIntegrationDatabase(namePrefix: string): Promise<IntegrationDatabase> {
  const adminUrl = inject("recoveryPostgresAdminUrl");
  const databaseName = `${namePrefix}_${randomUUID().replaceAll("-", "")}`;

  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 1 });
  }

  const adminDatabaseUrl = databaseUrlFor(adminUrl, databaseName);
  await runMigrations(adminDatabaseUrl, CLOUD_APP_PASSWORD, {
    migrationsFolder: MIGRATIONS_FOLDER,
  });

  return {
    databaseUrl: asCloudApp(adminDatabaseUrl),
    adminDatabaseUrl,
    async close() {
      const cleanup = postgres(adminUrl, { max: 1 });
      try {
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await cleanup.end({ timeout: 1 });
      }
    },
  };
}
