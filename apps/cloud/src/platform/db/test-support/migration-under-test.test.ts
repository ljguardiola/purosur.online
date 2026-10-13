import type { PGlite } from "@electric-sql/pglite";
import { describe, expect, expectTypeOf, it } from "vitest";
import { readRealJournal } from "./migration-journal-test-helpers.js";
import { databaseBeforeMigration } from "./migration-under-test.js";

async function tableExists(database: Pick<PGlite, "query">, table: string): Promise<boolean> {
  const { rows } = await database.query<{ exists: boolean }>(
    "select to_regclass($1) is not null as exists",
    [table],
  );
  return rows[0]?.exists ?? false;
}

async function appliedMigrationCount(database: Pick<PGlite, "query">): Promise<number> {
  const { rows } = await database.query<{ count: number }>(
    "select count(*)::int as count from drizzle.__drizzle_migrations",
  );
  return rows[0]?.count ?? 0;
}

describe("a database migrated up to the migration under test", { timeout: 30_000 }, () => {
  it("holds every earlier migration but not the one under test", async () => {
    const database = await databaseBeforeMigration("_brands");

    expect(await tableExists(database, "products")).toBe(true);
    expect(await tableExists(database, "brands")).toBe(false);
  });

  it("applies the migration under test over the data seeded before it, and no later one", async () => {
    const database = await databaseBeforeMigration("_brands");
    await database.query("insert into categories (name) values ('Almacén')");

    const migrated = await database.applyMigration();

    expect(await tableExists(migrated, "brands")).toBe(true);
    expect(await tableExists(migrated, "register_installations")).toBe(false);
    const { rows } = await migrated.query("select name from categories");
    expect(rows).toEqual([{ name: "Almacén" }]);
  });

  it("hands out the client current code needs only after every later migration", async () => {
    const { entries } = await readRealJournal();
    const brandsPosition = entries.findIndex((entry) => entry.tag.endsWith("_brands"));
    const database = await databaseBeforeMigration("_brands");
    const migrated = await database.applyMigration();
    expect(await appliedMigrationCount(migrated)).toBe(brandsPosition + 1);

    const client = await migrated.applyEveryLaterMigration();

    expect(await appliedMigrationCount(client)).toBe(entries.length);
  });

  it("refuses a migration the journal does not hold", async () => {
    await expect(databaseBeforeMigration("_no_such_migration")).rejects.toThrow(
      "_no_such_migration",
    );
  });

  it("gives no client current code could run on before every later migration", async () => {
    const database = await databaseBeforeMigration("_brands");
    const migrated = await database.applyMigration();

    expectTypeOf(database).not.toExtend<PGlite>();
    expectTypeOf(migrated).not.toExtend<PGlite>();
    expectTypeOf(await migrated.applyEveryLaterMigration()).toEqualTypeOf<PGlite>();
  });
});
