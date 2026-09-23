import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

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
  for (const [table, rows] of seeded) {
    for (const row of rows) {
      const columns = Object.keys(row);
      const columnList = columns.map((column) => `"${column}"`).join(", ");
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      await client.query(
        `insert into "${table}" (${columnList}) values (${placeholders})`,
        columns.map((column) => row[column]),
      );
    }
  }
}

/**
 * Builds one migrated PGlite database. Meant to be created once per test file (`beforeAll`) and
 * closed once (`afterAll`); call `clear()` in `beforeEach` instead of rebuilding the database, so
 * each test still starts from an empty, freshly-migrated schema without paying the migration cost
 * per test.
 */
export async function buildTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  // Captured once, right after migrating: whatever a migration itself inserted (e.g. the single
  // seeded Administrator role) rather than anything a test goes on to add.
  const migrationSeedRows = await seedRowsByTable(client, await applicationTables(client));

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
