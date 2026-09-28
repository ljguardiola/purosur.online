import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { inject } from "vitest";
import { MIGRATIONS_FOLDER } from "../platform/db/migrations-folder.js";
import { migrateFreshDatabase } from "./test-database-snapshot.js";

export interface TestDatabase {
  client: PGlite;
  db: PgliteDatabase<Record<string, never>>;
  // Restores the rows the migrations themselves seeded; it does not leave every table empty.
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
    // The "replica" role skips FK triggers, so rows can go back in catalog order rather than
    // dependency order; `set local` confines this to the transaction.
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

// A custom `migrationsFolder` migrates fresh from the run's already-initialized cluster dump,
// so it never pays for its own initdb.
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
    // Captured right after migrating, so only what a migration itself inserted counts as seeded,
    // never anything a test goes on to add.
    migrationSeedRows = await seedRowsByTable(client, await applicationTables(client));
  } catch (error) {
    // Swallow a close failure; the capture error above is what's worth reporting.
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
