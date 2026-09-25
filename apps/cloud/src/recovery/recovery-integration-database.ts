import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { inject } from "vitest";
import { CLOUD_APP_PASSWORD } from "../db/cloud-app-password.js";

// An arbitrary, stable key every `withExclusiveMigration` caller agrees on. It cannot collide with
// the application's own advisory locks: those are taken inside each test file's database, never in
// the shared admin database this one is taken in, and advisory locks are scoped per database.
const MIGRATION_LOCK_KEY = 875_309;

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
 * Creates one fresh, isolated database on the single Testcontainers Postgres instance
 * `vitest.global-setup.postgres.ts` starts for the run, as a copy of the template database that
 * global setup migrates (`CREATE DATABASE ... TEMPLATE`), so each `*.integration.test.ts` file
 * gets its own already-migrated database instead of migrating (and racing) its own on the shared
 * cluster.
 *
 * Hands back a `cloud_app` connection URL: every `*.integration.test.ts` file that exercises the
 * server, its repositories, or graphile-worker through this database must run as the same role the
 * deployed cloud connects as, never as the role that applies schema changes.
 */
export async function createIntegrationDatabase(namePrefix: string): Promise<IntegrationDatabase> {
  const adminUrl = inject("recoveryPostgresAdminUrl");
  const template = inject("cloudIntegrationTemplateDatabase");
  if (template === undefined) {
    throw new Error(
      "the cloud integration template database could not be migrated; see the global setup's warning",
    );
  }
  const databaseName = `${namePrefix}_${randomUUID().replaceAll("-", "")}`;

  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${databaseName}" TEMPLATE "${template}"`);
  } finally {
    await admin.end({ timeout: 1 });
  }

  const adminDatabaseUrl = databaseUrlFor(adminUrl, databaseName);

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

/**
 * Serializes a callback that calls `runMigrations` directly against the shared cluster (the few
 * integration tests that must prove `runMigrations` itself works, rather than starting from an
 * already-migrated database via `createIntegrationDatabase`): `runMigrations` ends by writing
 * `cloud_app`'s password to the cluster-wide `pg_authid` catalog (`setCloudAppPassword` in
 * migrate.ts), and two such calls running at once would race that write. Takes the lock on the
 * shared admin database (`recoveryPostgresAdminUrl`'s own database) rather than on a database a
 * caller is about to create: Postgres advisory locks are scoped per database, so a lock taken on a
 * not-yet-created database would not block a caller already holding this same lock elsewhere.
 */
export async function withExclusiveMigration<T>(run: () => Promise<T>): Promise<T> {
  const adminUrl = inject("recoveryPostgresAdminUrl");
  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      return await run();
    } finally {
      await admin`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    await admin.end({ timeout: 1 });
  }
}
