import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { inject } from "vitest";
import { CLOUD_APP_PASSWORD } from "../db/cloud-app-password.js";

// Postgres advisory locks are scoped per database, so this key only needs to be stable within the
// shared admin database it's taken in.
const MIGRATION_LOCK_KEY = 875_309;

export interface IntegrationDatabase {
  /** Connects as `cloud_app`, the role the deployed cloud (and so the code under test) uses. */
  databaseUrl: string;
  /** Connects as the admin role that migrated this database; never for exercising the server, its
   * repositories, or graphile-worker. */
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

// Clones the already-migrated template database so each test file gets its own database instead
// of migrating, and racing, one on the shared cluster.
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

// runMigrations ends by writing cloud_app's password to the cluster-wide pg_authid catalog, so
// concurrent runs would race that write.
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
