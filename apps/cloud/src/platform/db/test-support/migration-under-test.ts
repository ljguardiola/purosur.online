import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { inject, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../../test-support/test-database-snapshot.js";
import { MIGRATIONS_FOLDER } from "../migrations-folder.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  migrationsFolderBefore,
} from "./migration-journal-test-helpers.js";

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

export async function databaseBeforeMigration(tagSuffix: string): Promise<DatabaseBeforeMigration> {
  const entry = await findMigrationEntry(
    tagSuffix,
    `test setup: no migration ending in ${tagSuffix} in the journal`,
  );
  const folder = await mkdtemp(join(tmpdir(), "migration-under-test-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, entry);
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());

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
      await addMigrationEntry(folder, entry);
      await migrate(drizzle(client), { migrationsFolder: folder });
      return migrated;
    },
  };
}
