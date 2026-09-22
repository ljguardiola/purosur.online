import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { inject } from "vitest";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

export interface IntegrationDatabase {
  databaseUrl: string;
  close(): Promise<void>;
}

function databaseUrlFor(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/**
 * Creates and migrates one fresh, isolated database on the single Testcontainers Postgres
 * instance `vitest.global-setup.postgres.ts` starts for the run, so each `*.integration.test.ts`
 * file gets its own database instead of sharing state with the others.
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

  const databaseUrl = databaseUrlFor(adminUrl, databaseName);
  const migrationClient = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await migrationClient.end({ timeout: 1 });
  }

  return {
    databaseUrl,
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
