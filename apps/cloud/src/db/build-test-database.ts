import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

export interface TestDatabase {
  client: PGlite;
  db: PgliteDatabase<Record<string, never>>;
  /**
   * Empties every application table and restarts its identities, leaving the migrated schema
   * itself in place. Tables are discovered from the catalog rather than a fixed list, so a table
   * added by a later migration is cleared without this helper needing to change.
   */
  clear: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Builds one migrated PGlite database. Meant to be created once per test file (`beforeAll`) and
 * closed once (`afterAll`); call `clear()` in `beforeEach` instead of rebuilding the database, so
 * each test still starts from an empty schema without paying the migration cost per test.
 */
export async function buildTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  async function clear(): Promise<void> {
    // Drizzle's own bookkeeping lives in a separate "drizzle" schema, so this never touches it.
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (rows.length === 0) {
      return;
    }
    const tableList = rows.map(({ tablename }) => `"${tablename}"`).join(", ");
    await client.query(`truncate table ${tableList} restart identity cascade`);
  }

  return {
    client,
    db,
    clear,
    close: () => client.close(),
  };
}
