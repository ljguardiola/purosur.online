import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { inject } from "vitest";
import { MIGRATIONS_FOLDER, migrateFreshDatabase } from "./test-database-snapshot.js";

export interface TestDatabase {
  client: PGlite;
  db: PgliteDatabase<Record<string, never>>;
  /**
   * Empties every application table and restarts its identities, then restores whatever rows the
   * migrations themselves seeded (e.g. the fixed Administrator role), leaving the database exactly
   * as it was right after migrating. Tables are discovered from the catalog rather than a fixed
   * list, so a table added by a later migration is cleared (and its seed rows, if any, preserved)
   * without this helper needing to change.
   */
  clear: () => Promise<void>;
  close: () => Promise<void>;
}

async function applicationTables(client: PGlite): Promise<string[]> {
  // Drizzle's own bookkeeping lives in a separate "drizzle" schema, so this never touches it.
  const { rows } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  return rows.map(({ tablename }) => tablename);
}

async function seedRowsByTable(
  client: PGlite,
  tables: string[],
): Promise<Map<string, Record<string, unknown>[]>> {
  const seeded = new Map<string, Record<string, unknown>[]>();
  for (const table of tables) {
    const { rows } = await client.query<Record<string, unknown>>(`select * from "${table}"`);
    if (rows.length > 0) {
      seeded.set(table, rows);
    }
  }
  return seeded;
}

async function restoreSeedRows(
  client: PGlite,
  seeded: Map<string, Record<string, unknown>[]>,
): Promise<void> {
  await client.transaction(async (tx) => {
    // Foreign keys are enforced by triggers, which the "replica" role skips: the rows go back in
    // catalog order, not dependency order, and they are an exact copy of an already-consistent
    // snapshot. `set local` confines this to the transaction.
    await tx.query("set local session_replication_role = replica");
    for (const [table, rows] of seeded) {
      for (const row of rows) {
        const columns = Object.keys(row);
        const columnList = columns.map((column) => `"${column}"`).join(", ");
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
        await tx.query(
          `insert into "${table}" (${columnList}) values (${placeholders})`,
          columns.map((column) => row[column]),
        );
      }
    }
  });
}

/**
 * Builds one migrated PGlite database. Meant to be created once per test file (`beforeAll`) and
 * closed once (`afterAll`); call `clear()` in `beforeEach` instead of rebuilding the database, so
 * each test still starts from an empty, freshly-migrated schema without paying the migration cost
 * per test.
 *
 * When the default migrations folder is used and the "node" project's global setup provided a
 * data-dir snapshot of an already-migrated database, this loads that snapshot instead of running
 * the migrations again: `apps/cloud/vitest.global-setup.ts` migrates once per test run rather than
 * once per file. A custom `migrationsFolder` never uses the snapshot, since it only matches the
 * default migrations; it instead migrates a fresh database, starting from the same "node" project's
 * dump of an empty, already-initialized cluster so it never pays for its own initdb. This function
 * only runs within that "node" project, whose global setup always provides that cluster dump.
 */
export async function buildTestDatabase({
  migrationsFolder = MIGRATIONS_FOLDER,
  snapshotPath = migrationsFolder === MIGRATIONS_FOLDER
    ? inject("testDatabaseSnapshotPath")
    : undefined,
  clusterDumpPath = inject("testDatabaseClusterDumpPath"),
}: {
  migrationsFolder?: string;
  snapshotPath?: string;
  clusterDumpPath?: string;
} = {}): Promise<TestDatabase> {
  const usableSnapshotPath = migrationsFolder === MIGRATIONS_FOLDER ? snapshotPath : undefined;
  const client = usableSnapshotPath
    ? new PGlite({ loadDataDir: new Blob([await readFile(usableSnapshotPath)]) })
    : await migrateFreshDatabase(migrationsFolder, clusterDumpPath);
  const db = drizzle(client);
  let migrationSeedRows: Map<string, Record<string, unknown>[]>;
  try {
    // Captured once, right after migrating (or after loading an already-migrated snapshot):
    // whatever a migration itself inserted (e.g. the single seeded Administrator role) rather than
    // anything a test goes on to add.
    migrationSeedRows = await seedRowsByTable(client, await applicationTables(client));
  } catch (error) {
    // A failure to close must not replace the seed-row-capture error, which is the one worth
    // reporting.
    await client.close().catch(() => undefined);
    throw error;
  }

  async function clear(): Promise<void> {
    const tables = await applicationTables(client);
    if (tables.length > 0) {
      const tableList = tables.map((table) => `"${table}"`).join(", ");
      await client.query(`truncate table ${tableList} restart identity cascade`);
    }
    await restoreSeedRows(client, migrationSeedRows);
  }

  return {
    client,
    db,
    clear,
    close: () => client.close(),
  };
}
