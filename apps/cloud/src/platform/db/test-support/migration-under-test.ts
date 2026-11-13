import type { PGlite } from "@electric-sql/pglite";
import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { inject, onTestFinished } from "vitest";
import { openFreshCluster } from "../../../test-support/test-database-snapshot.js";
import { MIGRATIONS_FOLDER } from "../migrations-folder.js";
import { findMigrationEntry } from "./migration-journal-test-helpers.js";

export type SqlOnlyDatabase = Pick<PGlite, "query" | "exec">;

export interface MigratedDatabase extends SqlOnlyDatabase {
  applyEveryLaterMigration(): Promise<PGlite>;
}

export interface DatabaseBeforeMigration extends SqlOnlyDatabase {
  applyMigration(): Promise<MigratedDatabase>;
}

function sqlOnly(client: PGlite): SqlOnlyDatabase {
  return {
    query: (...args) => client.query(...args),
    exec: (...args) => client.exec(...args),
  };
}

async function applyMigrations(client: PGlite, migrations: MigrationMeta[]): Promise<void> {
  await new PgDialect().migrate(migrations, drizzle(client)._.session, {
    migrationsFolder: MIGRATIONS_FOLDER,
  });
}

export async function databaseBeforeMigration(tagSuffix: string): Promise<DatabaseBeforeMigration> {
  const entry = await findMigrationEntry(
    tagSuffix,
    `test setup: no migration ending in ${tagSuffix} in the journal`,
  );
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const client = await openFreshCluster(inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  await applyMigrations(
    client,
    migrations.filter((migration) => migration.folderMillis < entry.when),
  );

  const migrated: MigratedDatabase = {
    ...sqlOnly(client),
    applyEveryLaterMigration: async () => {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
      return client;
    },
  };
  return {
    ...sqlOnly(client),
    applyMigration: async () => {
      await applyMigrations(
        client,
        migrations.filter((migration) => migration.folderMillis <= entry.when),
      );
      return migrated;
    },
  };
}
