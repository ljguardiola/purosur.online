import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { inject } from "vitest";
import { MIGRATIONS_FOLDER } from "../platform/db/migrations-folder.js";
import { migrateFreshDatabase } from "./test-database-snapshot.js";

// The deployed cloud runs as `cloud_app`, which some migrations deny statements on append-only
// tables; connecting as it makes a statement the cloud may not run fail here instead of only once
// deployed. Only migrations and the tooling that runs as the database's owner ask for "migrator".
export type TestDatabaseRole = "cloud_app" | "migrator";

export interface TestDatabase {
  client: PGlite;
  db: PgliteDatabase<Record<string, never>>;
  // Restores the rows the migrations themselves seeded; it does not leave every table empty.
  clear: () => Promise<void>;
  // For arranging what cloud_app may not do itself, such as a trigger, a sequence's value or a row
  // of an append-only table; the code under test never runs inside it.
  asMigrator: <T>(arrange: () => Promise<T>) => Promise<T>;
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

// `restart identity` rewinds every serial column to 1, while the seeded rows keep the numbers they
// were given, so each sequence is moved past the highest number a restored row holds.
async function advanceSequencesPastRestoredRows(client: PGlite): Promise<void> {
  const { rows } = await client.query<{ sequence: string; table: string; column: string }>(
    `select s.relname as sequence, t.relname as table, a.attname as column
     from pg_class s
     join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
     join pg_class t on t.oid = d.refobjid
     join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
     where s.relkind = 'S' and t.relnamespace = 'public'::regnamespace`,
  );
  for (const { sequence, table, column } of rows) {
    await client.query(
      `select setval('"${sequence}"', coalesce((select max("${column}") from "${table}"), 0) + 1, false)`,
    );
  }
}

async function takeRole(client: PGlite, role: TestDatabaseRole): Promise<void> {
  if (role === "cloud_app") {
    await client.query("set role cloud_app");
  }
}

// A custom `migrationsFolder` migrates fresh from the run's already-initialized cluster dump,
// so it never pays for its own initdb.
export async function buildTestDatabase({
  migrationsFolder = MIGRATIONS_FOLDER,
  snapshotPath = migrationsFolder === MIGRATIONS_FOLDER
    ? inject("testDatabaseSnapshotPath")
    : undefined,
  clusterDumpPath = inject("testDatabaseClusterDumpPath"),
  connectAs = "cloud_app",
}: {
  migrationsFolder?: string;
  snapshotPath?: string;
  clusterDumpPath?: string;
  connectAs?: TestDatabaseRole;
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
    await takeRole(client, connectAs);
  } catch (error) {
    // Swallow a close failure; the error above is what's worth reporting.
    await client.close().catch(() => undefined);
    throw error;
  }

  async function asMigrator<T>(arrange: () => Promise<T>): Promise<T> {
    await client.query("reset role");
    try {
      return await arrange();
    } finally {
      await takeRole(client, connectAs);
    }
  }

  async function clear(): Promise<void> {
    await asMigrator(async () => {
      const tables = await applicationTables(client);
      if (tables.length > 0) {
        const tableList = tables.map((table) => `"${table}"`).join(", ");
        await client.query(`truncate table ${tableList} restart identity cascade`);
      }
      await restoreSeedRows(client, migrationSeedRows);
      await advanceSequencesPastRestoredRows(client);
    });
  }

  return {
    client,
    db,
    clear,
    asMigrator,
    close: () => client.close(),
  };
}
